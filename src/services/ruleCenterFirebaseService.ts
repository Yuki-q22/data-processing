import {
  ref,
  update,
  onValue,
  push,
  get,
  serverTimestamp,
} from 'firebase/database'
import { db, firebaseConfigErrorMessage } from '../lib/firebase'


function getFirebaseDb() {
  if (!db) {
    throw new Error(firebaseConfigErrorMessage || 'Firebase 未初始化，请检查环境变量配置')
  }

  return db
}

export type RuleType = 'school_name' | 'major_combo' | 'remark_enrollment_type'

export type RuleItem = {
  id: string
  rule_name: string
  source_text: string
  target_text: string
  enabled: boolean
  sort_order: number
  updated_at: number
  updated_by: string
}

function rulesPath(ruleType: RuleType) {
  return `rule_center/${ruleType}`
}

async function updateRuleCenterAtomically(updates: Record<string, unknown>) {
  const timestamp = serverTimestamp()
  await update(ref(getFirebaseDb()), {
    ...updates,
    'rule_center/meta/version': timestamp,
    'rule_center/meta/updatedAt': timestamp,
  })
}

export function subscribeRulesByType(
  ruleType: RuleType,
  callback: (rules: RuleItem[]) => void
) {
  const rulesRef = ref(getFirebaseDb(), rulesPath(ruleType))

  return onValue(rulesRef, (snapshot) => {
    const value = snapshot.val() || {}
    const rules = Object.entries(value).map(([id, item]) => ({
      id,
      ...(item as Omit<RuleItem, 'id'>),
    }))

    rules.sort((a, b) => {
      const sortDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0)
      if (sortDiff !== 0) return sortDiff
      return a.rule_name.localeCompare(b.rule_name)
    })

    callback(rules)
  })
}

export async function createRule(
  ruleType: RuleType,
  payload: Omit<RuleItem, 'id' | 'updated_at'>,
  uid: string
) {
  const parentRef = ref(getFirebaseDb(), rulesPath(ruleType))
  const newRef = push(parentRef)
  if (!newRef.key) throw new Error('无法生成规则 ID')

  await updateRuleCenterAtomically({
    [`${rulesPath(ruleType)}/${newRef.key}`]: {
      ...payload,
      updated_at: serverTimestamp(),
      updated_by: uid,
    },
  })
}

export async function updateRuleItem(
  ruleType: RuleType,
  id: string,
  patch: Partial<Omit<RuleItem, 'id'>>,
  uid: string
) {
  const itemPath = `${rulesPath(ruleType)}/${id}`
  const nextPatch: Record<string, unknown> = {
    ...patch,
    updated_at: serverTimestamp(),
    updated_by: uid,
  }
  await updateRuleCenterAtomically(
    Object.fromEntries(
      Object.entries(nextPatch).map(([key, value]) => [`${itemPath}/${key}`, value]),
    ),
  )
}

export async function deleteRuleItem(ruleType: RuleType, id: string) {
  await updateRuleCenterAtomically({
    [`${rulesPath(ruleType)}/${id}`]: null,
  })
}

export async function isAdmin(uid: string) {
  const adminRef = ref(getFirebaseDb(), `admins/${uid}`)
  const snapshot = await get(adminRef)
  return snapshot.val() === true
}
