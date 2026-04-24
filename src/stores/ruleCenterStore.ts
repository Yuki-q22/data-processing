import { create } from 'zustand'
import * as XLSX from 'xlsx'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import {
  onValue,
  ref,
  push,
  remove as dbRemove,
  set as dbSet,
  update as dbUpdate,
} from 'firebase/database'
import { auth, db } from '../lib/firebase'

export type RemarkTypeRule = {
  id: string
  keyword: string
  outputType: string
  priority: number
}

type CloudRuleItem = {
  rule_name: string
  source_text: string
  target_text: string
  enabled: boolean
  sort_order: number
  updated_at: number
  updated_by: string
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
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>

  importSchoolRuleFile: (file: File) => Promise<void>
  importMajorRuleFile: (file: File) => Promise<void>
  importRemarkRuleFile: (file: File) => Promise<void>

  clearSchoolRules: () => Promise<void>
  clearMajorRules: () => Promise<void>

  addRemarkTypeRule: () => Promise<void>
  updateRemarkTypeRule: (id: string, patch: Partial<RemarkTypeRule>) => Promise<void>
  removeRemarkTypeRule: (id: string) => Promise<void>
  resetRemarkTypeRules: () => Promise<void>

  setExclusionKeywords: (items: string[]) => Promise<void>
}

const DEFAULT_REMARK_TYPE_RULES: RemarkTypeRule[] = [
  { id: 'r1', keyword: '中外合作', outputType: '中外合作', priority: 1 },
  { id: 'r2', keyword: '中外高水平大学生交流计划', outputType: '中外高水平大学生交流计划', priority: 2 },
  { id: 'r3', keyword: '学分互认联合培养项目', outputType: '学分互认联合培养项目', priority: 3 },
  { id: 'r4', keyword: '地方专项', outputType: '地方专项', priority: 4 },
  { id: 'r5', keyword: '国家专项', outputType: '国家专项', priority: 5 },
  { id: 'r6', keyword: '高校专项', outputType: '高校专项', priority: 6 },
  { id: 'r7', keyword: '艺术类', outputType: '艺术类', priority: 7 },
  { id: 'r8', keyword: '闽台合作', outputType: '闽台合作', priority: 8 },
  { id: 'r9', keyword: '预科', outputType: '预科', priority: 9 },
  { id: 'r10', keyword: '定向', outputType: '定向', priority: 10 },
  { id: 'r11', keyword: '护理类', outputType: '护理类', priority: 11 },
  { id: 'r12', keyword: '民族班', outputType: '民族班', priority: 12 },
  { id: 'r13', keyword: '联合办学', outputType: '联合办学', priority: 13 },
  { id: 'r14', keyword: '联办', outputType: '联办', priority: 14 },
  { id: 'r15', keyword: '建档立卡专项', outputType: '建档立卡专项', priority: 15 },
  { id: 'r16', keyword: '藏区专项', outputType: '藏区专项', priority: 16 },
  { id: 'r17', keyword: '少数民族紧缺人才培养专项', outputType: '少数民族紧缺人才培养专项', priority: 17 },
  { id: 'r18', keyword: '民语类及对等培养', outputType: '民语类及对等培养', priority: 18 },
  { id: 'r19', keyword: '优师计划', outputType: '优师计划', priority: 19 },
  { id: 'r20', keyword: '国家优师专项', outputType: '国家优师专项', priority: 20 },
  { id: 'r21', keyword: '优师专项', outputType: '优师专项', priority: 21 },
  { id: 'r22', keyword: '国家公费师范生', outputType: '国家公费师范生', priority: 22 },
  { id: 'r23', keyword: '公费师范', outputType: '公费师范生', priority: 23 },
  { id: 'r24', keyword: '中美121', outputType: '中美121项目', priority: 24 },
  { id: 'r25', keyword: '中俄实验班', outputType: '中俄实验班', priority: 25 },
  { id: 'r26', keyword: '校企合作', outputType: '校企合作', priority: 26 },
  { id: 'r27', keyword: '订单培养', outputType: '订单培养', priority: 27 },
  { id: 'r28', keyword: '订单班', outputType: '订单班', priority: 28 },
]

const DEFAULT_EXCLUSION_KEYWORDS = ['除了', '不含', '除外', '没有', '除']
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
  return [...rules].sort((a, b) => a.priority - b.priority)
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
    payload[createRuleId()] = {
      rule_name: value,
      source_text: value,
      target_text: value,
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
    payload[rule.id || createRuleId()] = {
      rule_name: `${rule.keyword} → ${rule.outputType}`,
      source_text: rule.keyword,
      target_text: rule.outputType,
      enabled: true,
      sort_order: rule.priority,
      updated_at: now,
      updated_by: uid,
    }
  })

  return payload
}

function mapCloudRemarkRules(value: Record<string, CloudRuleItem> | null | undefined): RemarkTypeRule[] {
  if (!value || typeof value !== 'object') {
    return DEFAULT_REMARK_TYPE_RULES
  }

  const rules = Object.entries(value).map(([id, item]) => ({
    id,
    keyword: String(item?.source_text ?? '').trim(),
    outputType: String(item?.target_text ?? '').trim(),
    priority: Number(item?.sort_order ?? 9999),
  }))

  return rules.length ? sortRules(rules) : DEFAULT_REMARK_TYPE_RULES
}

function mapCloudSimpleValues(value: Record<string, CloudRuleItem> | null | undefined): string[] {
  if (!value || typeof value !== 'object') return []

  const values = Object.values(value)
    .filter((item) => item?.enabled !== false)
    .map((item) => String(item?.target_text ?? item?.source_text ?? '').trim())
    .filter(Boolean)

  return Array.from(new Set(values))
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

  remarkTypeRules: DEFAULT_REMARK_TYPE_RULES,
  remarkRuleFileName: '内置默认规则',
  exclusionKeywords: DEFAULT_EXCLUSION_KEYWORDS,

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
            remarkTypeRules: DEFAULT_REMARK_TYPE_RULES,
            remarkRuleFileName: '内置默认规则',
            exclusionKeywords: DEFAULT_EXCLUSION_KEYWORDS,
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

        const offAdmin = onValue(adminRef, (snapshot) => {
          setState({ isAdminUser: snapshot.val() === true })
        })

        const offSchool = onValue(schoolRef, (snapshot) => {
          const validSchoolNames = mapCloudSimpleValues(snapshot.val())
          setState({
            validSchoolNames,
            schoolRuleFileName: validSchoolNames.length ? CLOUD_RULE_FILE_NAME : undefined,
            syncing: false,
          })
        })

        const offMajor = onValue(majorRef, (snapshot) => {
          const validMajorCombos = mapCloudSimpleValues(snapshot.val())
          setState({
            validMajorCombos,
            majorRuleFileName: validMajorCombos.length ? CLOUD_RULE_FILE_NAME : undefined,
            syncing: false,
          })
        })

        const offRemark = onValue(remarkRef, (snapshot) => {
          const remarkTypeRules = mapCloudRemarkRules(snapshot.val())
          setState({
            remarkTypeRules,
            remarkRuleFileName: remarkTypeRules.length ? CLOUD_RULE_FILE_NAME : '内置默认规则',
            syncing: false,
          })
        })

        const offExclusion = onValue(exclusionRef, (snapshot) => {
          const raw = snapshot.val()
          if (raw == null) {
            setState({
              exclusionKeywords: DEFAULT_EXCLUSION_KEYWORDS,
              syncing: false,
            })
            return
          }

          const exclusionKeywords = Array.isArray(raw)
            ? raw.map((item) => String(item).trim()).filter(Boolean)
            : Object.values(raw).map((item) => String(item).trim()).filter(Boolean)

          setState({
            exclusionKeywords,
            syncing: false,
          })
        })

        dataUnsubscribers = [offAdmin, offSchool, offMajor, offRemark, offExclusion]
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

  register: async (email, password) => {
    await createUserWithEmailAndPassword(auth, email.trim(), password)
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

    await dbSet(ref(db, 'rule_center/school_name'), toCloudPayloadFromSimpleValues(values, currentUid!))
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

    await dbSet(ref(db, 'rule_center/major_combo'), toCloudPayloadFromSimpleValues(values, currentUid!))
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

    await dbSet(ref(db, 'rule_center/remark_enrollment_type'), toCloudPayloadFromRemarkRules(rules, currentUid!))
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

  addRemarkTypeRule: async () => {
  const { currentUid, isAdminUser, remarkTypeRules } = getState()
  await ensureAdmin(currentUid, isAdminUser)

  const nextPriority =
    remarkTypeRules.length > 0
      ? Math.max(...remarkTypeRules.map((rule) => rule.priority || 0)) + 1
      : 1

  const parentRef = ref(db, 'rule_center/remark_enrollment_type')
  const newRef = push(parentRef)
  const newId = newRef.key

  if (!newId) {
    throw new Error('新增规则失败：无法生成云端规则ID')
  }

  const newRule: RemarkTypeRule = {
    id: newId,
    keyword: '',
    outputType: '',
    priority: nextPriority,
  }

  await dbSet(newRef, {
    rule_name: '新规则',
    source_text: '',
    target_text: '',
    enabled: true,
    sort_order: nextPriority,
    updated_at: Date.now(),
    updated_by: currentUid!,
  })

  await updateMetaVersion()

  setState({
    remarkTypeRules: sortRules([...remarkTypeRules, newRule]),
    remarkRuleFileName: CLOUD_RULE_FILE_NAME,
  })
},

  updateRemarkTypeRule: async (id, patch) => {
    const { currentUid, isAdminUser, remarkTypeRules } = getState()
    await ensureAdmin(currentUid, isAdminUser)

    const current = remarkTypeRules.find((rule) => rule.id === id)
    if (!current) {
      throw new Error('未找到要更新的备注规则')
    }

    const nextKeyword = patch.keyword ?? current.keyword
    const nextOutputType = patch.outputType ?? current.outputType
    const nextPriority = patch.priority ?? current.priority

    setState({
      remarkTypeRules: sortRules(
        remarkTypeRules.map((rule) =>
          rule.id === id
            ? {
                ...rule,
                keyword: nextKeyword,
                outputType: nextOutputType,
                priority: nextPriority,
              }
            : rule
        )
      ),
    })

    await dbUpdate(ref(db, `rule_center/remark_enrollment_type/${id}`), {
      rule_name: `${nextKeyword} → ${nextOutputType}`,
      source_text: nextKeyword,
      target_text: nextOutputType,
      sort_order: nextPriority,
      updated_at: Date.now(),
      updated_by: currentUid!,
    })
    await updateMetaVersion()
  },

  removeRemarkTypeRule: async (id) => {
    const { currentUid, isAdminUser, remarkTypeRules } = getState()
    await ensureAdmin(currentUid, isAdminUser)

    const previousRules = remarkTypeRules
    setState({
      remarkTypeRules: remarkTypeRules.filter((rule) => rule.id !== id),
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

    setState({
      remarkTypeRules: sortRules(DEFAULT_REMARK_TYPE_RULES),
      remarkRuleFileName: CLOUD_RULE_FILE_NAME,
    })

    await dbSet(
      ref(db, 'rule_center/remark_enrollment_type'),
      toCloudPayloadFromRemarkRules(DEFAULT_REMARK_TYPE_RULES, currentUid!)
    )
    await updateMetaVersion()
  },

  setExclusionKeywords: async (items) => {
    const { currentUid, isAdminUser } = getState()
    await ensureAdmin(currentUid, isAdminUser)

    const cleaned = items.map((x) => x.trim()).filter(Boolean)
    setState({
      exclusionKeywords: cleaned,
    })

    await dbSet(ref(db, 'rule_center/exclusion_keywords'), cleaned)
    await updateMetaVersion()
  },
}))

useRuleCenterStore.getState().bootstrap()