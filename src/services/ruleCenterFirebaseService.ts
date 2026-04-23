import {
  ref,
  set,
  update,
  remove,
  onValue,
  push,
  get,
} from 'firebase/database'
import { db } from '../lib/firebase'

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

export function subscribeRulesByType(
  ruleType: RuleType,
  callback: (rules: RuleItem[]) => void
) {
  const rulesRef = ref(db, rulesPath(ruleType))

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
  const parentRef = ref(db, rulesPath(ruleType))
  const newRef = push(parentRef)

  await set(newRef, {
    ...payload,
    updated_at: Date.now(),
    updated_by: uid,
  })

  await update(ref(db, 'rule_center/meta'), {
    version: Date.now(),
    updatedAt: Date.now(),
  })
}

export async function updateRuleItem(
  ruleType: RuleType,
  id: string,
  patch: Partial<Omit<RuleItem, 'id'>>,
  uid: string
) {
  const itemRef = ref(db, `${rulesPath(ruleType)}/${id}`)
  await update(itemRef, {
    ...patch,
    updated_at: Date.now(),
    updated_by: uid,
  })

  await update(ref(db, 'rule_center/meta'), {
    version: Date.now(),
    updatedAt: Date.now(),
  })
}

export async function deleteRuleItem(ruleType: RuleType, id: string) {
  const itemRef = ref(db, `${rulesPath(ruleType)}/${id}`)
  await remove(itemRef)

  await update(ref(db, 'rule_center/meta'), {
    version: Date.now(),
    updatedAt: Date.now(),
  })
}

export async function isAdmin(uid: string) {
  const adminRef = ref(db, `admins/${uid}`)
  const snapshot = await get(adminRef)
  return snapshot.val() === true
}