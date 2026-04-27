import { create } from 'zustand'
import * as XLSX from 'xlsx'
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
import { auth, db } from '../lib/firebase'
import {
  DEFAULT_EXCLUSION_KEYWORDS,
  DEFAULT_REMARK_TYPE_RULES,
} from '../constants/remarkTypeRules'

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

  clearSchoolRules: () => Promise<void>
  clearMajorRules: () => Promise<void>

  addRemarkTypeRule: (rule?: AddRemarkTypeRuleInput) => Promise<void>
  updateRemarkTypeRule: (
    id: string,
    patch: Partial<RemarkTypeRule>
  ) => Promise<void>
  removeRemarkTypeRule: (id: string) => Promise<void>
  resetRemarkTypeRules: () => Promise<void>

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

  sortRules(rules).forEach((rule) => {
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

function clearDataUnsubscribers() {
  dataUnsubscribers.forEach((fn) => fn())
  dataUnsubscribers = []
}

async function updateMetaVersion() {
  await dbUpdate(ref(db, 'rule_center/meta'), {
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

  currentUserEmail: undefined,
  currentUid: undefined,
  isAdminUser: false,
  authReady: false,
  syncing: false,
  authError: undefined,

  bootstrap: () => {
    if (hasBootstrapped) return
    hasBootstrapped = true

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

        const adminRef = ref(db, `admins/${user.uid}`)
        const schoolRef = ref(db, 'rule_center/school_name')
        const majorRef = ref(db, 'rule_center/major_combo')
        const remarkRef = ref(db, 'rule_center/remark_enrollment_type')
        const exclusionRef = ref(db, 'rule_center/exclusion_keywords')

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

        dataUnsubscribers = [
          offAdmin,
          offSchool,
          offMajor,
          offRemark,
          offExclusion,
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
    await signInWithEmailAndPassword(auth, email.trim(), password)
  },

  loginWithGoogle: async () => {
    const provider = new GoogleAuthProvider()

    provider.setCustomParameters({
      prompt: 'select_account',
    })

    await signInWithPopup(auth, provider)
  },

  logout: async () => {
    await signOut(auth)
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
      ref(db, 'rule_center/school_name'),
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

    if (!('招生专业' in firstRow)) {
      throw new Error('专业规则文件缺少“招生专业”列')
    }

    const values = Array.from(
      new Set(
        rows
          .map((row) => String(row['招生专业'] ?? '').trim())
          .filter(Boolean)
      )
    )

    if (!values.length) {
      throw new Error('专业规则文件中没有有效招生专业')
    }

    await dbSet(
      ref(db, 'rule_center/major_combo'),
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
      .map((row) => {
        const keyword = String(row['备注查找字段'] ?? '').trim()
        const outputType = String(row['输出招生类型'] ?? '').trim()
        const priorityRaw = String(row['优先级'] ?? '').trim()
        const priority = Number(priorityRaw)

        if (!keyword || !outputType) return null

        return {
          id: createRuleId(),
          keyword,
          outputType,
          priority: Number.isNaN(priority) ? 9999 : priority,
        }
      })
      .filter(Boolean) as RemarkTypeRule[]

    if (!rules.length) {
      throw new Error('备注招生类型规则文件中没有有效规则')
    }

    await dbSet(
      ref(db, 'rule_center/remark_enrollment_type'),
      toCloudPayloadFromRemarkRules(rules, currentUid!)
    )

    await updateMetaVersion()
  },

  clearSchoolRules: async () => {
    const { currentUid, isAdminUser } = getState()
    await ensureAdmin(currentUid, isAdminUser)

    await dbRemove(ref(db, 'rule_center/school_name'))
    await updateMetaVersion()
  },

  clearMajorRules: async () => {
    const { currentUid, isAdminUser } = getState()
    await ensureAdmin(currentUid, isAdminUser)

    await dbRemove(ref(db, 'rule_center/major_combo'))
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

    await dbSet(ref(db, `rule_center/remark_enrollment_type/${newId}`), {
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
      await dbUpdate(ref(db, `rule_center/remark_enrollment_type/${id}`), {
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
      await dbRemove(ref(db, `rule_center/remark_enrollment_type/${id}`))
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
      ref(db, 'rule_center/remark_enrollment_type'),
      toCloudPayloadFromRemarkRules(defaultRules, currentUid!)
    )

    await updateMetaVersion()
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

    await dbSet(ref(db, 'rule_center/exclusion_keywords'), cleaned)
    await updateMetaVersion()
  },
}))

useRuleCenterStore.getState().bootstrap()