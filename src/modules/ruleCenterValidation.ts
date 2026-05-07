export type RuleCenterMajorMatchMode = 'combo' | 'majorOnly'

export type RuleCenterValidationParams = {
  validSchoolNames?: string[]
  validMajorCombos?: string[]
  schoolName?: unknown
  majorName?: unknown
  level?: unknown
  majorMatchMode?: RuleCenterMajorMatchMode
}

export type RuleCenterValidationDetail = {
  schoolResult: string
  majorResult: string
  issues: string[]
}

const KNOWN_LEVEL_SUFFIXES = ['本科(普通)', '本科(职业)', '专科(高职)']

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

export function stripKnownLevelSuffixForRuleCenter(value: unknown): string {
  let text = normalizeMajorComboForRuleCenter(value)
  const suffixes = KNOWN_LEVEL_SUFFIXES.map(normalizeMajorComboForRuleCenter)

  for (const suffix of suffixes) {
    if (text.endsWith(suffix)) {
      text = text.slice(0, -suffix.length)
      break
    }
  }

  return text
}

export function normalizeMajorForRuleCenter(value: unknown): string {
  return stripKnownLevelSuffixForRuleCenter(value)
}

export function buildMajorComboForRuleCenter(majorName: unknown, level: unknown): string {
  const major = toRuleText(majorName)
  const levelText = toRuleText(level).replace(/（/g, '(').replace(/）/g, ')')

  if (!major && !levelText) return ''
  return `${major}${levelText}`
}

function getMajorCompareText(params: RuleCenterValidationParams): string {
  if (params.majorMatchMode === 'majorOnly') {
    return toRuleText(params.majorName)
  }
  return buildMajorComboForRuleCenter(params.majorName, params.level)
}

function normalizeMajorRuleByMode(
  value: unknown,
  majorMatchMode: RuleCenterMajorMatchMode
): string {
  if (majorMatchMode === 'majorOnly') {
    return normalizeMajorForRuleCenter(value)
  }
  return normalizeMajorComboForRuleCenter(value)
}

function normalizeMajorInputByMode(
  params: RuleCenterValidationParams,
  majorMatchMode: RuleCenterMajorMatchMode
): string {
  if (majorMatchMode === 'majorOnly') {
    return normalizeMajorForRuleCenter(params.majorName)
  }
  return normalizeMajorComboForRuleCenter(buildMajorComboForRuleCenter(params.majorName, params.level))
}

export function validateSchoolAndMajorComboDetailed(
  params: RuleCenterValidationParams
): RuleCenterValidationDetail {
  const {
    validSchoolNames = [],
    validMajorCombos = [],
    schoolName,
    majorName,
    level,
    majorMatchMode = 'combo',
  } = params

  const issues: string[] = []

  const schoolRules = validSchoolNames
    .map(normalizeSchoolNameForRuleCenter)
    .filter(Boolean)
  const schoolSet = new Set(schoolRules)
  const school = normalizeSchoolNameForRuleCenter(schoolName)

  let schoolResult = '未启用学校规则'
  if (schoolSet.size > 0) {
    if (!school) {
      schoolResult = '未匹配'
      issues.push('学校名称为空，无法匹配规则中心')
    } else if (!schoolSet.has(school)) {
      schoolResult = '未匹配'
      issues.push(`学校名称未匹配规则中心：${toRuleText(schoolName)}`)
    } else {
      schoolResult = '匹配'
    }
  }

  const majorRules = validMajorCombos
    .map((item) => normalizeMajorRuleByMode(item, majorMatchMode))
    .filter(Boolean)
  const majorSet = new Set(majorRules)

  let majorResult = '未启用专业规则'
  if (majorSet.size > 0) {
    const major = toRuleText(majorName)
    const levelText = toRuleText(level)
    const compareText = getMajorCompareText(params)
    const normalizedCompareText = normalizeMajorInputByMode(params, majorMatchMode)

    if (!major) {
      majorResult = '未匹配'
      issues.push('招生专业为空，无法匹配规则中心')
    } else if (majorMatchMode === 'combo' && !levelText) {
      majorResult = '未匹配'
      issues.push(
        `招生专业组合信息不完整，需按“专业名称+层次”校验：专业=${major || '空'}，层次=空`
      )
    } else if (!majorSet.has(normalizedCompareText)) {
      majorResult = '未匹配'
      if (majorMatchMode === 'majorOnly') {
        issues.push(`招生专业未匹配规则中心：${compareText}`)
      } else {
        issues.push(`招生专业组合未匹配规则中心：${compareText}`)
      }
    } else {
      majorResult = '匹配'
    }
  }

  return {
    schoolResult,
    majorResult,
    issues: Array.from(new Set(issues)),
  }
}

export function validateSchoolAndMajorCombo(params: RuleCenterValidationParams): string[] {
  return validateSchoolAndMajorComboDetailed(params).issues
}
