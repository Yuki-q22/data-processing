export type RuleCenterValidationParams = {
  validSchoolNames?: string[]
  validMajorCombos?: string[]
  schoolName?: unknown
  majorName?: unknown
  level?: unknown
}

export function toRuleText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

export function normalizeRuleText(value: unknown): string {
  return toRuleText(value)
    .replace(/\s+/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[［\[【]/g, '(')
    .replace(/[］\]】]/g, ')')
}

export function normalizeSchoolNameForRuleCenter(value: unknown): string {
  return normalizeRuleText(value)
}

export function normalizeMajorComboForRuleCenter(value: unknown): string {
  return normalizeRuleText(value)
}

export function buildMajorComboForRuleCenter(majorName: unknown, level: unknown): string {
  const major = toRuleText(majorName)
  const levelText = toRuleText(level).replace(/（/g, '(').replace(/）/g, ')')

  if (!major && !levelText) return ''
  return `${major}${levelText}`
}

export function validateSchoolAndMajorCombo(params: RuleCenterValidationParams): string[] {
  const {
    validSchoolNames = [],
    validMajorCombos = [],
    schoolName,
    majorName,
    level,
  } = params

  const issues: string[] = []

  const schoolRules = validSchoolNames
    .map(normalizeSchoolNameForRuleCenter)
    .filter(Boolean)
  const schoolSet = new Set(schoolRules)
  const school = normalizeSchoolNameForRuleCenter(schoolName)

  if (schoolSet.size > 0) {
    if (!school) {
      issues.push('学校名称为空，无法匹配规则中心')
    } else if (!schoolSet.has(school)) {
      issues.push(`学校名称未匹配规则中心：${toRuleText(schoolName)}`)
    }
  }

  const majorRules = validMajorCombos
    .map(normalizeMajorComboForRuleCenter)
    .filter(Boolean)
  const majorSet = new Set(majorRules)

  if (majorSet.size > 0) {
    const comboRaw = buildMajorComboForRuleCenter(majorName, level)
    const combo = normalizeMajorComboForRuleCenter(comboRaw)

    if (!toRuleText(majorName) || !toRuleText(level)) {
      issues.push(
        `招生专业组合信息不完整，需按“专业名称+层次”校验：专业=${toRuleText(majorName) || '空'}，层次=${toRuleText(level) || '空'}`
      )
    } else if (!majorSet.has(combo)) {
      issues.push(`招生专业组合未匹配规则中心：${comboRaw}`)
    }
  }

  return Array.from(new Set(issues))
}
