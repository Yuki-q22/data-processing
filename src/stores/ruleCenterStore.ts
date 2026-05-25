/**
 * 文件名称：规则中心本地状态管理
 *
 * 文件作用：
 * - 保存规则中心中的各类规则
 * - 控制规则新增、删除、更新
 * - 控制规则本地持久化
 *
 * 常改位置：
 * - addRemarkTypeRule
 * - addSchoolNameRule
 * - addMajorComboRule
 * - 删除规则方法
 * - localStorage 持久化
 * - reorderRemarkTypeRules：备注招生类型规则拖拽排序
 *
 * 注意：
 * - 如果本地规则无法新增、刷新丢失，优先检查本文件
 */

import { create } from 'zustand'
import * as XLSX from 'xlsx'
import { arrayMove } from '@dnd-kit/sortable'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import {
  onValue,
  ref,
  remove as dbRemove,
  set as dbSet,
  update as dbUpdate,
} from 'firebase/database'
import { auth, db, firebaseConfigErrorMessage } from '../lib/firebase'
import {
  DEFAULT_EXCLUSION_KEYWORDS,
  DEFAULT_REMARK_TYPE_RULES,
} from '../constants/remarkTypeRules'
import { buildMajorComboForRuleCenter } from '../modules/ruleCenterValidation'
import {
  DEFAULT_CONTROL_LINE_RULES,
  DEFAULT_PROVINCE_CATEGORY_BATCH_RULES,
  buildProvinceCurrentBatchDictByYear,
  buildProvinceYearCategoryType,
  type ControlLineRule,
  type ProvinceCategoryBatchRule,
} from '../constants/provinceRuleData'

export type { ControlLineRule, ProvinceCategoryBatchRule }

export type RemarkTypeRule = {
  id: string
  keyword: string
  outputType: string
  priority: number
}

type AddRemarkTypeRuleInput = {
  keyword?: string
  outputType?: string
  priority?: number
}

type CloudRuleItem = {
  rule_name?: string
  source_text?: string
  target_text?: string
  year?: string
  province?: string
  category_type?: string
  category_text?: string
  batch_text?: string
  categories?: string[]
  batches?: string[]
  enabled?: boolean
  sort_order?: number
  updated_at?: number
  updated_by?: string
}

type RuleCenterStore = {
  validSchoolNames: string[]
  validMajorCombos: string[]
  schoolRuleFileName?: string
  majorRuleFileName?: string

  remarkTypeRules: RemarkTypeRule[]
  remarkRuleFileName?: string
  exclusionKeywords: string[]

  provinceCategoryBatchRules: ProvinceCategoryBatchRule[]
  provinceCategoryBatchRuleFileName?: string
  controlLineRules: ControlLineRule[]
  controlLineRuleFileName?: string
  provinceYearCategoryType: Record<string, Record<string, string>>
  provinceCurrentBatchDictByYear: Record<string, Record<string, string[]>>

  currentUserEmail?: string
  currentUid?: string
  isAdminUser: boolean
  authReady: boolean
  syncing: boolean
  authError?: string

  bootstrap: () => void

  login: (email: string, password: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>

  importSchoolRuleFile: (file: File) => Promise<void>
  importMajorRuleFile: (file: File) => Promise<void>
  importRemarkRuleFile: (file: File) => Promise<void>
  importProvinceCategoryBatchRuleFile: (file: File) => Promise<void>
  importControlLineRuleFile: (file: File) => Promise<void>

  clearSchoolRules: () => Promise<void>
  clearMajorRules: () => Promise<void>
  resetProvinceCategoryBatchRules: () => Promise<void>
  resetControlLineRules: () => Promise<void>

  addRemarkTypeRule: (rule?: AddRemarkTypeRuleInput) => Promise<void>
  updateRemarkTypeRule: (
    id: string,
    patch: Partial<RemarkTypeRule>
  ) => Promise<void>
  removeRemarkTypeRule: (id: string) => Promise<void>
  resetRemarkTypeRules: () => Promise<void>
  reorderRemarkTypeRules: (activeId: string, overId: string) => Promise<void>

  setExclusionKeywords: (items: string[]) => Promise<void>
}

const CLOUD_RULE_FILE_NAME = '云端实时规则'

let hasBootstrapped = false
let dataUnsubscribers: Array<() => void> = []

function createRuleId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function sortRules(rules: RemarkTypeRule[]) {
  return [...rules].sort((a, b) => {
    const priorityA = Number.isFinite(a.priority) ? a.priority : 9999
    const priorityB = Number.isFinite(b.priority) ? b.priority : 9999

    if (priorityA !== priorityB) {
      return priorityA - priorityB
    }

    return a.keyword.localeCompare(b.keyword, 'zh-CN')
  })
}

function normalizeRuleOrder(rules: RemarkTypeRule[]) {
  return rules.map((rule, index) => ({
    ...rule,
    priority: index + 1,
  }))
}

function getDefaultRemarkTypeRules(): RemarkTypeRule[] {
  return sortRules(
    DEFAULT_REMARK_TYPE_RULES.map((rule) => ({
      id: rule.id,
      keyword: String(rule.keyword ?? '').trim(),
      outputType: String(rule.outputType ?? '').trim(),
      priority: Number(rule.priority ?? 9999),
    })).filter((rule) => rule.keyword && rule.outputType)
  )
}

function getDefaultExclusionKeywords(): string[] {
  return Array.from(
    new Set(
      DEFAULT_EXCLUSION_KEYWORDS.map((item) => String(item).trim()).filter(
        Boolean
      )
    )
  )
}

async function readWorkbook(file: File) {
  const buffer = await file.arrayBuffer()
  return XLSX.read(buffer, { type: 'array' })
}

function getFirstSheetRows(workbook: XLSX.WorkBook): Record<string, unknown>[] {
  const firstSheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[firstSheetName]

  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  })
}

function toCloudPayloadFromSimpleValues(values: string[], uid: string) {
  const now = Date.now()
  const payload: Record<string, CloudRuleItem> = {}

  values.forEach((value, index) => {
    const cleanValue = String(value).trim()
    if (!cleanValue) return

    payload[createRuleId()] = {
      rule_name: cleanValue,
      source_text: cleanValue,
      target_text: cleanValue,
      enabled: true,
      sort_order: index + 1,
      updated_at: now,
      updated_by: uid,
    }
  })

  return payload
}

function toCloudPayloadFromRemarkRules(rules: RemarkTypeRule[], uid: string) {
  const now = Date.now()
  const payload: Record<string, CloudRuleItem> = {}

  normalizeRuleOrder(sortRules(rules)).forEach((rule) => {
    const keyword = String(rule.keyword ?? '').trim()
    const outputType = String(rule.outputType ?? '').trim()
    const priority = Number(rule.priority ?? 9999)

    if (!keyword || !outputType) return

    payload[rule.id || createRuleId()] = {
      rule_name: `${keyword} → ${outputType}`,
      source_text: keyword,
      target_text: outputType,
      enabled: true,
      sort_order: Number.isNaN(priority) ? 9999 : priority,
      updated_at: now,
      updated_by: uid,
    }
  })

  return payload
}

function mapCloudRemarkRules(
  value: Record<string, CloudRuleItem> | null | undefined
): RemarkTypeRule[] {
  if (!value || typeof value !== 'object') {
    return getDefaultRemarkTypeRules()
  }

  const rules = Object.entries(value)
    .filter(([, item]) => item?.enabled !== false)
    .map(([id, item]) => {
      const keyword = String(item?.source_text ?? '').trim()
      const outputType = String(item?.target_text ?? '').trim()
      const priority = Number(item?.sort_order ?? 9999)

      return {
        id,
        keyword,
        outputType,
        priority: Number.isNaN(priority) ? 9999 : priority,
      }
    })
    .filter((rule) => rule.keyword && rule.outputType)

  return rules.length ? sortRules(rules) : getDefaultRemarkTypeRules()
}

function mapCloudSimpleValues(
  value: Record<string, CloudRuleItem> | null | undefined
): string[] {
  if (!value || typeof value !== 'object') return []

  const values = Object.values(value)
    .filter((item) => item?.enabled !== false)
    .map((item) => String(item?.target_text ?? item?.source_text ?? '').trim())
    .filter(Boolean)

  return Array.from(new Set(values))
}

function mapCloudExclusionKeywords(raw: unknown): string[] {
  if (raw == null) {
    return getDefaultExclusionKeywords()
  }

  if (Array.isArray(raw)) {
    return Array.from(
      new Set(raw.map((item) => String(item).trim()).filter(Boolean))
    )
  }

  if (typeof raw === 'object') {
    return Array.from(
      new Set(
        Object.values(raw)
          .map((item) => String(item).trim())
          .filter(Boolean)
      )
    )
  }

  return getDefaultExclusionKeywords()
}


function splitRuleList(value: unknown): string[] {
  return Array.from(
    new Set(
      String(value ?? '')
        .split(/[/／]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )
}

function inferCategoryType(value: unknown): string {
  const text = String(value ?? '').trim()

  if (text.includes('物理类') && text.includes('历史类')) {
    return '物理类/历史类'
  }

  if (text.includes('理科') && text.includes('文科')) {
    return '文科/理科'
  }

  if (text.includes('综合')) {
    return '综合'
  }

  return text
}

function getRowValue(row: Record<string, unknown>, names: string[]): string {
  for (const name of names) {
    const value = row[name]
    const text = String(value ?? '').trim()
    if (text) return text
  }

  return ''
}

function mapCloudProvinceCategoryBatchRules(
  value: Record<string, CloudRuleItem> | null | undefined,
): ProvinceCategoryBatchRule[] {
  if (!value || typeof value !== 'object') return DEFAULT_PROVINCE_CATEGORY_BATCH_RULES

  const rules = Object.values(value)
    .filter((item) => item?.enabled !== false)
    .map((item) => {
      const year = String(item?.year ?? '').trim()
      const province = String(item?.province ?? '').trim()
      const categoryType = String(item?.category_type ?? '').trim()
      const categories = Array.isArray(item?.categories)
        ? item.categories.map((x) => String(x).trim()).filter(Boolean)
        : splitRuleList(item?.category_text)
      const batches = Array.isArray(item?.batches)
        ? item.batches.map((x) => String(x).trim()).filter(Boolean)
        : splitRuleList(item?.batch_text)

      return {
        year,
        province,
        categoryType: categoryType || inferCategoryType(categories.join('/')),
        categories,
        batches,
      }
    })
    .filter((rule) => rule.year && rule.province && rule.categoryType && rule.batches.length)

  return rules.length
    ? mergeProvinceCategoryBatchRules(DEFAULT_PROVINCE_CATEGORY_BATCH_RULES, rules)
    : DEFAULT_PROVINCE_CATEGORY_BATCH_RULES
}

function mapCloudControlLineRules(
  value: Record<string, CloudRuleItem> | null | undefined,
): ControlLineRule[] {
  if (!value || typeof value !== 'object') return DEFAULT_CONTROL_LINE_RULES

  const rules = Object.values(value)
    .filter((item) => item?.enabled !== false)
    .map((item) => {
      const year = String(item?.year ?? '').trim()
      const province = String(item?.province ?? '').trim()
      const categories = Array.isArray(item?.categories)
        ? item.categories.map((x) => String(x).trim()).filter(Boolean)
        : splitRuleList(item?.category_text)
      const batches = Array.isArray(item?.batches)
        ? item.batches.map((x) => String(x).trim()).filter(Boolean)
        : splitRuleList(item?.batch_text)

      return {
        year,
        province,
        categories,
        batches,
      }
    })
    .filter((rule) => rule.year && rule.province && rule.categories.length && rule.batches.length)

  return rules.length
    ? mergeControlLineRules(DEFAULT_CONTROL_LINE_RULES, rules)
    : DEFAULT_CONTROL_LINE_RULES
}

function toCloudPayloadFromProvinceCategoryBatchRules(
  rules: ProvinceCategoryBatchRule[],
  uid: string,
) {
  const now = Date.now()
  const payload: Record<string, CloudRuleItem> = {}

  rules.forEach((rule, index) => {
    const year = String(rule.year ?? '').trim()
    const province = String(rule.province ?? '').trim()
    const categoryType = String(rule.categoryType ?? '').trim()
    const categories = Array.from(new Set((rule.categories || []).map((x) => String(x).trim()).filter(Boolean)))
    const batches = Array.from(new Set((rule.batches || []).map((x) => String(x).trim()).filter(Boolean)))

    if (!year || !province || !categoryType || !batches.length) return

    payload[createRuleId()] = {
      rule_name: `${year}-${province}-${categoryType}`,
      year,
      province,
      category_type: categoryType,
      category_text: categories.join('/'),
      batch_text: batches.join('/'),
      categories,
      batches,
      enabled: true,
      sort_order: index + 1,
      updated_at: now,
      updated_by: uid,
    } as CloudRuleItem
  })

  return payload
}

function toCloudPayloadFromControlLineRules(rules: ControlLineRule[], uid: string) {
  const now = Date.now()
  const payload: Record<string, CloudRuleItem> = {}

  rules.forEach((rule, index) => {
    const year = String(rule.year ?? '').trim()
    const province = String(rule.province ?? '').trim()
    const categories = Array.from(new Set((rule.categories || []).map((x) => String(x).trim()).filter(Boolean)))
    const batches = Array.from(new Set((rule.batches || []).map((x) => String(x).trim()).filter(Boolean)))

    if (!year || !province || !categories.length || !batches.length) return

    payload[createRuleId()] = {
      rule_name: `${year}-${province}-省控线`,
      year,
      province,
      category_text: categories.join('/'),
      batch_text: batches.join('/'),
      categories,
      batches,
      enabled: true,
      sort_order: index + 1,
      updated_at: now,
      updated_by: uid,
    } as CloudRuleItem
  })

  return payload
}


function mergeProvinceCategoryBatchRules(
  baseRules: ProvinceCategoryBatchRule[],
  overrideRules: ProvinceCategoryBatchRule[],
): ProvinceCategoryBatchRule[] {
  const merged = new Map<string, ProvinceCategoryBatchRule>()

  baseRules.forEach((rule) => {
    merged.set(`${rule.year}__${rule.province}`, rule)
  })

  overrideRules.forEach((rule) => {
    merged.set(`${rule.year}__${rule.province}`, rule)
  })

  return Array.from(merged.values()).sort((a, b) => {
    const yearDiff = Number(a.year) - Number(b.year)
    if (yearDiff !== 0) return yearDiff
    return a.province.localeCompare(b.province, 'zh-CN')
  })
}

function mergeControlLineRules(
  baseRules: ControlLineRule[],
  overrideRules: ControlLineRule[],
): ControlLineRule[] {
  const merged = new Map<string, ControlLineRule>()

  baseRules.forEach((rule) => {
    merged.set(`${rule.year}__${rule.province}`, rule)
  })

  overrideRules.forEach((rule) => {
    merged.set(`${rule.year}__${rule.province}`, rule)
  })

  return Array.from(merged.values()).sort((a, b) => {
    const yearDiff = Number(a.year) - Number(b.year)
    if (yearDiff !== 0) return yearDiff
    return a.province.localeCompare(b.province, 'zh-CN')
  })
}

function deriveProvinceRuleMaps(rules: ProvinceCategoryBatchRule[]) {
  return {
    provinceYearCategoryType: buildProvinceYearCategoryType(rules),
    provinceCurrentBatchDictByYear: buildProvinceCurrentBatchDictByYear(rules),
  }
}

function clearDataUnsubscribers() {
  dataUnsubscribers.forEach((fn) => fn())
  dataUnsubscribers = []
}

function getFirebaseAuth() {
  if (!auth) {
    throw new Error(firebaseConfigErrorMessage || 'Firebase 未初始化，请检查环境变量配置')
  }

  return auth
}

function getFirebaseDb() {
  if (!db) {
    throw new Error(firebaseConfigErrorMessage || 'Firebase 未初始化，请检查环境变量配置')
  }

  return db
}

async function updateMetaVersion() {
  await dbUpdate(ref(getFirebaseDb(), 'rule_center/meta'), {
    version: Date.now(),
    updatedAt: Date.now(),
  })
}

async function ensureAdmin(uid?: string, isAdminUser?: boolean) {
  if (!uid) {
    throw new Error('请先登录')
  }

  if (!isAdminUser) {
    throw new Error('当前账号没有规则编辑权限')
  }
}

export const useRuleCenterStore = create<RuleCenterStore>((setState, getState) => ({
  validSchoolNames: [],
  validMajorCombos: [],
  schoolRuleFileName: undefined,
  majorRuleFileName: undefined,

  remarkTypeRules: getDefaultRemarkTypeRules(),
  remarkRuleFileName: '内置默认规则',
  exclusionKeywords: getDefaultExclusionKeywords(),

  provinceCategoryBatchRules: DEFAULT_PROVINCE_CATEGORY_BATCH_RULES,
  provinceCategoryBatchRuleFileName: '内置默认规则',
  controlLineRules: DEFAULT_CONTROL_LINE_RULES,
  controlLineRuleFileName: '内置默认规则',
  ...deriveProvinceRuleMaps(DEFAULT_PROVINCE_CATEGORY_BATCH_RULES),

  currentUserEmail: undefined,
  currentUid: undefined,
  isAdminUser: false,
  authReady: false,
  syncing: false,
  authError: undefined,

  bootstrap: () => {
    if (hasBootstrapped) return
    hasBootstrapped = true

    if (!auth || !db) {
      setState({
        authReady: true,
        syncing: false,
        authError: firebaseConfigErrorMessage || 'Firebase 未初始化，请检查环境变量配置',
        currentUserEmail: undefined,
        currentUid: undefined,
        isAdminUser: false,
      })
      return
    }

    onAuthStateChanged(
      auth,
      async (user) => {
        clearDataUnsubscribers()

        if (!user) {
          setState({
            currentUserEmail: undefined,
            currentUid: undefined,
            isAdminUser: false,
            authReady: true,
            syncing: false,
            authError: undefined,
            validSchoolNames: [],
            validMajorCombos: [],
            schoolRuleFileName: undefined,
            majorRuleFileName: undefined,
            remarkTypeRules: getDefaultRemarkTypeRules(),
            remarkRuleFileName: '内置默认规则',
            exclusionKeywords: getDefaultExclusionKeywords(),
            provinceCategoryBatchRules: DEFAULT_PROVINCE_CATEGORY_BATCH_RULES,
            provinceCategoryBatchRuleFileName: '内置默认规则',
            controlLineRules: DEFAULT_CONTROL_LINE_RULES,
            controlLineRuleFileName: '内置默认规则',
            ...deriveProvinceRuleMaps(DEFAULT_PROVINCE_CATEGORY_BATCH_RULES),
          })

          return
        }

        setState({
          currentUserEmail: user.email ?? undefined,
          currentUid: user.uid,
          isAdminUser: false,
          authReady: true,
          syncing: true,
          authError: undefined,
        })

        const adminRef = ref(getFirebaseDb(), `admins/${user.uid}`)
        const schoolRef = ref(getFirebaseDb(), 'rule_center/school_name')
        const majorRef = ref(getFirebaseDb(), 'rule_center/major_combo')
        const remarkRef = ref(getFirebaseDb(), 'rule_center/remark_enrollment_type')
        const exclusionRef = ref(getFirebaseDb(), 'rule_center/exclusion_keywords')
        const provinceCategoryBatchRef = ref(getFirebaseDb(), 'rule_center/province_category_batch')
        const controlLineRef = ref(getFirebaseDb(), 'rule_center/control_line')

        const offAdmin = onValue(
          adminRef,
          (snapshot) => {
            setState({
              isAdminUser: snapshot.val() === true,
            })
          },
          (error) => {
            setState({
              authError: error.message,
              syncing: false,
            })
          }
        )

        const offSchool = onValue(
          schoolRef,
          (snapshot) => {
            const validSchoolNames = mapCloudSimpleValues(snapshot.val())

            setState({
              validSchoolNames,
              schoolRuleFileName: validSchoolNames.length
                ? CLOUD_RULE_FILE_NAME
                : undefined,
              syncing: false,
            })
          },
          (error) => {
            setState({
              authError: error.message,
              syncing: false,
            })
          }
        )

        const offMajor = onValue(
          majorRef,
          (snapshot) => {
            const validMajorCombos = mapCloudSimpleValues(snapshot.val())

            setState({
              validMajorCombos,
              majorRuleFileName: validMajorCombos.length
                ? CLOUD_RULE_FILE_NAME
                : undefined,
              syncing: false,
            })
          },
          (error) => {
            setState({
              authError: error.message,
              syncing: false,
            })
          }
        )

        const offRemark = onValue(
          remarkRef,
          (snapshot) => {
            const remarkTypeRules = mapCloudRemarkRules(snapshot.val())

            setState({
              remarkTypeRules,
              remarkRuleFileName: remarkTypeRules.length
                ? CLOUD_RULE_FILE_NAME
                : '内置默认规则',
              syncing: false,
            })
          },
          (error) => {
            setState({
              authError: error.message,
              syncing: false,
            })
          }
        )

        const offExclusion = onValue(
          exclusionRef,
          (snapshot) => {
            setState({
              exclusionKeywords: mapCloudExclusionKeywords(snapshot.val()),
              syncing: false,
            })
          },
          (error) => {
            setState({
              authError: error.message,
              syncing: false,
            })
          }
        )


        const offProvinceCategoryBatch = onValue(
          provinceCategoryBatchRef,
          (snapshot) => {
            const provinceCategoryBatchRules = mapCloudProvinceCategoryBatchRules(snapshot.val())

            setState({
              provinceCategoryBatchRules,
              provinceCategoryBatchRuleFileName: provinceCategoryBatchRules.length
                ? CLOUD_RULE_FILE_NAME
                : '内置默认规则',
              ...deriveProvinceRuleMaps(provinceCategoryBatchRules),
              syncing: false,
            })
          },
          (error) => {
            setState({
              authError: error.message,
              syncing: false,
            })
          }
        )

        const offControlLine = onValue(
          controlLineRef,
          (snapshot) => {
            const controlLineRules = mapCloudControlLineRules(snapshot.val())

            setState({
              controlLineRules,
              controlLineRuleFileName: controlLineRules.length
                ? CLOUD_RULE_FILE_NAME
                : '内置默认规则',
              syncing: false,
            })
          },
          (error) => {
            setState({
              authError: error.message,
              syncing: false,
            })
          }
        )

        dataUnsubscribers = [
          offAdmin,
          offSchool,
          offMajor,
          offRemark,
          offExclusion,
          offProvinceCategoryBatch,
          offControlLine,
        ]
      },
      (error) => {
        setState({
          authReady: true,
          syncing: false,
          authError: error.message,
        })
      }
    )
  },

  login: async (email, password) => {
    await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password)
  },

  loginWithGoogle: async () => {
    const provider = new GoogleAuthProvider()

    provider.setCustomParameters({
      prompt: 'select_account',
    })

    await signInWithPopup(getFirebaseAuth(), provider)
  },

  logout: async () => {
    await signOut(getFirebaseAuth())
  },

  importSchoolRuleFile: async (file: File) => {
    const { currentUid, isAdminUser } = getState()
    await ensureAdmin(currentUid, isAdminUser)

    const workbook = await readWorkbook(file)
    const rows = getFirstSheetRows(workbook)

    if (!rows.length) {
      throw new Error('学校规则文件为空')
    }

    const firstRow = rows[0]

    if (!('学校名称' in firstRow)) {
      throw new Error('学校规则文件缺少“学校名称”列')
    }

    const values = Array.from(
      new Set(
        rows
          .map((row) => String(row['学校名称'] ?? '').trim())
          .filter(Boolean)
      )
    )

    if (!values.length) {
      throw new Error('学校规则文件中没有有效学校名称')
    }

    await dbSet(
      ref(getFirebaseDb(), 'rule_center/school_name'),
      toCloudPayloadFromSimpleValues(values, currentUid!)
    )

    await updateMetaVersion()
  },

  importMajorRuleFile: async (file: File) => {
    const { currentUid, isAdminUser } = getState()
    await ensureAdmin(currentUid, isAdminUser)

    const workbook = await readWorkbook(file)
    const rows = getFirstSheetRows(workbook)

    if (!rows.length) {
      throw new Error('专业规则文件为空')
    }

    const firstRow = rows[0]
    const hasDirectCombo = '招生专业组合' in firstRow
    const hasMajor = '招生专业' in firstRow || '专业名称' in firstRow || '专业' in firstRow
    const hasLevel = '一级层次' in firstRow || '层次' in firstRow || '专业层次' in firstRow

    if (!hasDirectCombo && !(hasMajor && hasLevel)) {
      throw new Error('专业规则文件缺少“招生专业组合”列，或缺少可组合的“招生专业/专业名称/专业” + “一级层次/层次/专业层次”列')
    }

    const values = Array.from(
      new Set(
        rows
          .map((row) => {
            const directCombo = String(row['招生专业组合'] ?? '').trim()
            if (directCombo) return directCombo

            const major = String(
              row['招生专业'] ?? row['专业名称'] ?? row['专业'] ?? ''
            ).trim()
            const level = String(
              row['一级层次'] ?? row['层次'] ?? row['专业层次'] ?? ''
            ).trim()

            return buildMajorComboForRuleCenter(major, level)
          })
          .filter(Boolean)
      )
    )

    if (!values.length) {
      throw new Error('专业规则文件中没有有效招生专业组合')
    }

    await dbSet(
      ref(getFirebaseDb(), 'rule_center/major_combo'),
      toCloudPayloadFromSimpleValues(values, currentUid!)
    )

    await updateMetaVersion()
  },

  importRemarkRuleFile: async (file: File) => {
    const { currentUid, isAdminUser } = getState()
    await ensureAdmin(currentUid, isAdminUser)

    const workbook = await readWorkbook(file)
    const rows = getFirstSheetRows(workbook)

    if (!rows.length) {
      throw new Error('备注招生类型规则文件为空')
    }

    const firstRow = rows[0]

    if (!('备注查找字段' in firstRow) || !('输出招生类型' in firstRow)) {
      throw new Error('备注招生类型规则文件缺少“备注查找字段”或“输出招生类型”列')
    }

    const rules: RemarkTypeRule[] = rows
      .map((row, index) => {
        const keyword = String(row['备注查找字段'] ?? '').trim()
        const outputType = String(row['输出招生类型'] ?? '').trim()
        const priorityRaw = String(row['优先级'] ?? '').trim()
        const priority = Number(priorityRaw)

        if (!keyword || !outputType) return null

        return {
          id: createRuleId(),
          keyword,
          outputType,
          priority: Number.isNaN(priority) ? index + 1 : priority,
        }
      })
      .filter(Boolean) as RemarkTypeRule[]

    if (!rules.length) {
      throw new Error('备注招生类型规则文件中没有有效规则')
    }

    await dbSet(
      ref(getFirebaseDb(), 'rule_center/remark_enrollment_type'),
      toCloudPayloadFromRemarkRules(rules, currentUid!)
    )

    await updateMetaVersion()
  },


  importProvinceCategoryBatchRuleFile: async (file: File) => {
    const { currentUid, isAdminUser } = getState()
    await ensureAdmin(currentUid, isAdminUser)

    const workbook = await readWorkbook(file)
    const rows = getFirstSheetRows(workbook)

    if (!rows.length) {
      throw new Error('省份科类批次规则文件为空')
    }

    const firstRow = rows[0]
    const hasProvince = '省份' in firstRow
    const hasCategory = '招生科类' in firstRow || '科类' in firstRow
    const hasBatch = '招生批次' in firstRow || '批次' in firstRow

    if (!hasProvince || !hasCategory || !hasBatch) {
      throw new Error('省份科类批次规则文件缺少“省份/招生科类/招生批次”列')
    }

    const yearFromFileName = file.name.match(/20\d{2}/)?.[0]

    const rules: ProvinceCategoryBatchRule[] = rows
      .map((row) => {
        const year = getRowValue(row, ['年份', 'year']) || yearFromFileName || ''
        const province = getRowValue(row, ['省份'])
        const categoryText = getRowValue(row, ['招生科类', '科类'])
        const batchText = getRowValue(row, ['招生批次', '批次'])
        const categories = splitRuleList(categoryText)
        const batches = splitRuleList(batchText)

        if (!year || !province || !categoryText || !batches.length) return null

        return {
          year,
          province,
          categoryType: inferCategoryType(categoryText),
          categories,
          batches,
        }
      })
      .filter(Boolean) as ProvinceCategoryBatchRule[]

    if (!rules.length) {
      throw new Error('省份科类批次规则文件中没有有效规则')
    }

    const mergedRules = mergeProvinceCategoryBatchRules(
      getState().provinceCategoryBatchRules.length
        ? getState().provinceCategoryBatchRules
        : DEFAULT_PROVINCE_CATEGORY_BATCH_RULES,
      rules,
    )

    await dbSet(
      ref(getFirebaseDb(), 'rule_center/province_category_batch'),
      toCloudPayloadFromProvinceCategoryBatchRules(mergedRules, currentUid!),
    )

    setState({
      provinceCategoryBatchRules: mergedRules,
      provinceCategoryBatchRuleFileName: CLOUD_RULE_FILE_NAME,
      ...deriveProvinceRuleMaps(mergedRules),
    })

    await updateMetaVersion()
  },

  importControlLineRuleFile: async (file: File) => {
    const { currentUid, isAdminUser } = getState()
    await ensureAdmin(currentUid, isAdminUser)

    const workbook = await readWorkbook(file)
    const rows = getFirstSheetRows(workbook)

    if (!rows.length) {
      throw new Error('省控线科类批次规则文件为空')
    }

    const firstRow = rows[0]
    const hasProvince = '省份' in firstRow
    const hasCategory = '招生科类' in firstRow || '科类' in firstRow
    const hasBatch = '招生批次' in firstRow || '批次' in firstRow

    if (!hasProvince || !hasCategory || !hasBatch) {
      throw new Error('省控线科类批次规则文件缺少“省份/科类/批次”列')
    }

    const yearFromFileName = file.name.match(/20\d{2}/)?.[0]

    const rules: ControlLineRule[] = rows
      .map((row) => {
        const year = getRowValue(row, ['年份', 'year']) || yearFromFileName || ''
        const province = getRowValue(row, ['省份'])
        const categoryText = getRowValue(row, ['招生科类', '科类'])
        const batchText = getRowValue(row, ['招生批次', '批次'])
        const categories = splitRuleList(categoryText)
        const batches = splitRuleList(batchText)

        if (!year || !province || !categories.length || !batches.length) return null

        return {
          year,
          province,
          categories,
          batches,
        }
      })
      .filter(Boolean) as ControlLineRule[]

    if (!rules.length) {
      throw new Error('省控线科类批次规则文件中没有有效规则')
    }

    const mergedRules = mergeControlLineRules(
      getState().controlLineRules.length
        ? getState().controlLineRules
        : DEFAULT_CONTROL_LINE_RULES,
      rules,
    )

    await dbSet(
      ref(getFirebaseDb(), 'rule_center/control_line'),
      toCloudPayloadFromControlLineRules(mergedRules, currentUid!),
    )

    setState({
      controlLineRules: mergedRules,
      controlLineRuleFileName: CLOUD_RULE_FILE_NAME,
    })

    await updateMetaVersion()
  },

  clearSchoolRules: async () => {
    const { currentUid, isAdminUser } = getState()
    await ensureAdmin(currentUid, isAdminUser)

    await dbRemove(ref(getFirebaseDb(), 'rule_center/school_name'))
    await updateMetaVersion()
  },

  clearMajorRules: async () => {
    const { currentUid, isAdminUser } = getState()
    await ensureAdmin(currentUid, isAdminUser)

    await dbRemove(ref(getFirebaseDb(), 'rule_center/major_combo'))
    await updateMetaVersion()
  },


  resetProvinceCategoryBatchRules: async () => {
    const { currentUid, isAdminUser } = getState()
    await ensureAdmin(currentUid, isAdminUser)

    await dbSet(
      ref(getFirebaseDb(), 'rule_center/province_category_batch'),
      toCloudPayloadFromProvinceCategoryBatchRules(
        DEFAULT_PROVINCE_CATEGORY_BATCH_RULES,
        currentUid!,
      ),
    )

    setState({
      provinceCategoryBatchRules: DEFAULT_PROVINCE_CATEGORY_BATCH_RULES,
      provinceCategoryBatchRuleFileName: CLOUD_RULE_FILE_NAME,
      ...deriveProvinceRuleMaps(DEFAULT_PROVINCE_CATEGORY_BATCH_RULES),
    })

    await updateMetaVersion()
  },

  resetControlLineRules: async () => {
    const { currentUid, isAdminUser } = getState()
    await ensureAdmin(currentUid, isAdminUser)

    await dbSet(
      ref(getFirebaseDb(), 'rule_center/control_line'),
      toCloudPayloadFromControlLineRules(DEFAULT_CONTROL_LINE_RULES, currentUid!),
    )

    setState({
      controlLineRules: DEFAULT_CONTROL_LINE_RULES,
      controlLineRuleFileName: CLOUD_RULE_FILE_NAME,
    })

    await updateMetaVersion()
  },

  addRemarkTypeRule: async (rule = {}) => {
    const { currentUid, isAdminUser, remarkTypeRules } = getState()
    await ensureAdmin(currentUid, isAdminUser)

    const keyword = String(rule.keyword || '').trim()
    const outputType = String(rule.outputType || '').trim()

    if (!keyword) {
      throw new Error('备注查找字段不能为空')
    }

    if (!outputType) {
      throw new Error('输出招生类型不能为空')
    }

    const nextPriority =
      typeof rule.priority === 'number' && !Number.isNaN(rule.priority)
        ? rule.priority
        : remarkTypeRules.length > 0
          ? Math.max(...remarkTypeRules.map((item) => item.priority || 0)) + 1
          : 1

    const newId = createRuleId()

    const newRule: RemarkTypeRule = {
      id: newId,
      keyword,
      outputType,
      priority: nextPriority,
    }

    await dbSet(ref(getFirebaseDb(), `rule_center/remark_enrollment_type/${newId}`), {
      rule_name: `${keyword} → ${outputType}`,
      source_text: keyword,
      target_text: outputType,
      enabled: true,
      sort_order: nextPriority,
      updated_at: Date.now(),
      updated_by: currentUid!,
    })

    setState({
      remarkTypeRules: sortRules([...remarkTypeRules, newRule]),
      remarkRuleFileName: CLOUD_RULE_FILE_NAME,
    })

    await updateMetaVersion()
  },

  updateRemarkTypeRule: async (id, patch) => {
    const { currentUid, isAdminUser, remarkTypeRules } = getState()
    await ensureAdmin(currentUid, isAdminUser)

    const current = remarkTypeRules.find((rule) => rule.id === id)

    if (!current) {
      throw new Error('未找到要更新的备注规则')
    }

    const previousRules = remarkTypeRules

    const nextKeyword = String(patch.keyword ?? current.keyword).trim()
    const nextOutputType = String(patch.outputType ?? current.outputType).trim()
    const nextPriority = Number(patch.priority ?? current.priority)

    if (!nextKeyword) {
      throw new Error('备注查找字段不能为空')
    }

    if (!nextOutputType) {
      throw new Error('输出招生类型不能为空')
    }

    const safePriority = Number.isNaN(nextPriority) ? 9999 : nextPriority

    const nextRules = sortRules(
      remarkTypeRules.map((rule) =>
        rule.id === id
          ? {
              ...rule,
              keyword: nextKeyword,
              outputType: nextOutputType,
              priority: safePriority,
            }
          : rule
      )
    )

    setState({
      remarkTypeRules: nextRules,
      remarkRuleFileName: CLOUD_RULE_FILE_NAME,
    })

    try {
      await dbUpdate(ref(getFirebaseDb(), `rule_center/remark_enrollment_type/${id}`), {
        rule_name: `${nextKeyword} → ${nextOutputType}`,
        source_text: nextKeyword,
        target_text: nextOutputType,
        sort_order: safePriority,
        enabled: true,
        updated_at: Date.now(),
        updated_by: currentUid!,
      })

      await updateMetaVersion()
    } catch (error) {
      setState({
        remarkTypeRules: previousRules,
      })

      throw error
    }
  },

  removeRemarkTypeRule: async (id) => {
    const { currentUid, isAdminUser, remarkTypeRules } = getState()
    await ensureAdmin(currentUid, isAdminUser)

    const previousRules = remarkTypeRules

    setState({
      remarkTypeRules: remarkTypeRules.filter((rule) => rule.id !== id),
      remarkRuleFileName: CLOUD_RULE_FILE_NAME,
    })

    try {
      await dbRemove(ref(getFirebaseDb(), `rule_center/remark_enrollment_type/${id}`))
      await updateMetaVersion()
    } catch (error) {
      setState({
        remarkTypeRules: previousRules,
      })

      throw error
    }
  },

  resetRemarkTypeRules: async () => {
    const { currentUid, isAdminUser } = getState()
    await ensureAdmin(currentUid, isAdminUser)

    const defaultRules = getDefaultRemarkTypeRules()

    setState({
      remarkTypeRules: defaultRules,
      remarkRuleFileName: CLOUD_RULE_FILE_NAME,
    })

    await dbSet(
      ref(getFirebaseDb(), 'rule_center/remark_enrollment_type'),
      toCloudPayloadFromRemarkRules(defaultRules, currentUid!)
    )

    await updateMetaVersion()
  },

  reorderRemarkTypeRules: async (activeId, overId) => {
    const { currentUid, isAdminUser, remarkTypeRules } = getState()
    await ensureAdmin(currentUid, isAdminUser)

    const sortedRules = sortRules(remarkTypeRules)
    const oldIndex = sortedRules.findIndex((rule) => rule.id === activeId)
    const newIndex = sortedRules.findIndex((rule) => rule.id === overId)

    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return

    const previousRules = remarkTypeRules
    const nextRules = normalizeRuleOrder(arrayMove(sortedRules, oldIndex, newIndex))
    const now = Date.now()

    setState({
      remarkTypeRules: nextRules,
      remarkRuleFileName: CLOUD_RULE_FILE_NAME,
    })

    try {
      const updates: Record<string, unknown> = {}

      nextRules.forEach((rule, index) => {
        const nextPriority = index + 1

        updates[`rule_center/remark_enrollment_type/${rule.id}/sort_order`] =
          nextPriority
        updates[`rule_center/remark_enrollment_type/${rule.id}/updated_at`] =
          now
        updates[`rule_center/remark_enrollment_type/${rule.id}/updated_by`] =
          currentUid!
      })

      updates['rule_center/meta/version'] = now
      updates['rule_center/meta/updatedAt'] = now

      await dbUpdate(ref(getFirebaseDb()), updates)
    } catch (error) {
      setState({
        remarkTypeRules: previousRules,
      })

      throw error
    }
  },

  setExclusionKeywords: async (items) => {
    const { currentUid, isAdminUser } = getState()
    await ensureAdmin(currentUid, isAdminUser)

    const cleaned = Array.from(
      new Set(items.map((x) => String(x).trim()).filter(Boolean))
    )

    setState({
      exclusionKeywords: cleaned,
    })

    await dbSet(ref(getFirebaseDb(), 'rule_center/exclusion_keywords'), cleaned)
    await updateMetaVersion()
  },
}))

useRuleCenterStore.getState().bootstrap()
