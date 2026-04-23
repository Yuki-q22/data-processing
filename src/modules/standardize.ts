const PROVINCE_KEYWORDS = [
  '北京', '天津', '上海', '重庆', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江',
  '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东',
  '广西', '海南', '四川', '贵州', '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆',
]

const SUBJECT_SHORT_MAP: Record<string, string> = {
  物理: '物',
  化学: '化',
  生物: '生',
  历史: '历',
  地理: '地',
  政治: '政',
  技术: '技',
  物: '物',
  化: '化',
  生: '生',
  历: '历',
  地: '地',
  政: '政',
  技: '技',
}

const COMPREHENSIVE_PROVINCES = new Set(['北京', '天津', '上海', '浙江', '山东', '海南'])
const LIBERAL_SCIENCE_PROVINCES = new Set(['新疆', '西藏'])

export function normalizeProvince(
  province: string | undefined,
  provinceRules: Record<string, string>
): string | undefined {
  if (!province) return undefined
  const raw = province.trim()
  if (!raw) return undefined
  if (provinceRules[raw]) return provinceRules[raw]

  const cleaned = raw
    .replace(/\s/g, '')
    .replace(/录取分数线/g, '')
    .replace(/分数线/g, '')
    .replace(/录取线/g, '')
    .replace(/普通类/g, '')
    .replace(/本科批/g, '')
    .replace(/专科批/g, '')
    .replace(/省控线/g, '')
    .replace(/投档线/g, '')
    .replace(/最低分/g, '')
    .replace(/高考/g, '')
    .replace(/省$/, '')
    .replace(/市$/, '')
    .replace(/自治区$/, '')
    .replace(/壮族自治区$/, '')
    .replace(/回族自治区$/, '')
    .replace(/维吾尔自治区$/, '')
    .replace(/特别行政区$/, '')

  if (provinceRules[cleaned]) return provinceRules[cleaned]

  for (const keyword of PROVINCE_KEYWORDS) {
    if (cleaned.includes(keyword)) return keyword
  }

  return cleaned || undefined
}

export function getCategoryTypeByYearProvince(
  year: string | undefined,
  province: string | undefined,
  provinceYearCategoryType: Record<string, Record<string, string>>
): string | undefined {
  if (!year || !province) return undefined
  return provinceYearCategoryType[year]?.[province]
}

function normalizeRawCategoryToken(rawCategory: string | undefined): string {
  return (rawCategory || '').replace(/\s/g, '').trim()
}

export function normalizeSubjectCategoryByRaw(
  rawCategory: string | undefined,
  categoryType: string | undefined
): string | undefined {
  const raw = normalizeRawCategoryToken(rawCategory)

  if (!categoryType) return undefined

  if (categoryType === '综合') {
    if (raw.includes('艺术')) return '艺术类'
    if (raw.includes('体育')) return '体育类'
    return '综合'
  }

  if (categoryType === '物理类/历史类') {
    if (raw.includes('物理') || raw === '物') return '物理类'
    if (raw.includes('历史') || raw === '历' || raw === '史') return '历史类'
    return undefined
  }

  if (categoryType === '文科/理科') {
    if (raw === '理科') return '理科'
    if (raw === '文科') return '文科'
    return undefined
  }

  return undefined
}

export function sanitizeText(value?: string): string | undefined {
  const raw = (value || '').trim()
  if (!raw) return undefined
  return raw.replace(/\^/g, '').trim() || undefined
}

export function mergeSubjectRequirements(
  groupRequirement?: string,
  majorRequirement?: string
): string | undefined {
  const a = sanitizeText(groupRequirement)
  const b = sanitizeText(majorRequirement)

  if (a && b) return `${a}${b}`
  if (a) return a
  if (b) return b
  return undefined
}

export function normalizeLevel1(level1?: string): string | undefined {
  const raw = (level1 || '').trim()
  if (!raw) return undefined
  if (raw === '专科') return '专科（高职）'
  return raw
}

export function normalizeBatch(
  batch: string | undefined,
  batchRules: Record<string, string>
): string | undefined {
  const raw = (batch || '').trim()
  if (!raw) return undefined
  if (batchRules[raw]) return batchRules[raw]
  return raw
}

export function splitMajorNameAndRemark(majorName?: string): {
  majorName?: string
  majorRemark?: string
} {
  const raw = (majorName || '').trim()
  if (!raw) {
    return { majorName: undefined, majorRemark: undefined }
  }

  const normalized = raw.replace(/\(/g, '（').replace(/\)/g, '）')
  const matches = normalized.match(/（[^（）]*）/g) || []

  if (!matches.length) {
    return {
      majorName: normalized,
      majorRemark: undefined,
    }
  }

  const cleanedMajorName = normalized.replace(/（[^（）]*）/g, '').trim()
  const mergedRemark = matches.join('')

  return {
    majorName: cleanedMajorName || normalized,
    majorRemark: mergedRemark || undefined,
  }
}

export function extractEnrollmentTypeFromRemark(
  remark: string | undefined,
  remarkTypeRules: Array<{ keyword: string; output: string; priority: number }>
): string | undefined {
  const text = sanitizeText(remark)
  if (!text) return undefined

  const matched = [...remarkTypeRules]
    .sort((a, b) => a.priority - b.priority)
    .find((item) => text.includes(item.keyword))

  return matched?.output
}

function subjectLongToShort(text: string): string {
  let remaining = text
  const result: string[] = []

  const ordered = Object.keys(SUBJECT_SHORT_MAP).sort((a, b) => b.length - a.length)
  ordered.forEach((key) => {
    if (remaining.includes(key)) {
      const short = SUBJECT_SHORT_MAP[key]
      if (!result.includes(short)) {
        result.push(short)
      }
      remaining = remaining.replaceAll(key, '')
    }
  })

  return result.join('')
}

export function deriveSubjectRequirementFields(requirement?: string): {
  subjectRequirementMode?: string
  secondSubject?: string
} {
  const raw = sanitizeText(requirement)
  if (!raw) {
    return { subjectRequirementMode: undefined, secondSubject: undefined }
  }

  const text = raw
    .replace(/首选物理\/历史/g, '')
    .replace(/首选物理/g, '')
    .replace(/首选历史/g, '')
    .replace(/首选物理或历史/g, '')
    .replace(/首选历史或物理/g, '')
    .trim()

  if (text.includes('再选不限') || text.includes('不限')) {
    return {
      subjectRequirementMode: '不限科目专业组',
      secondSubject: undefined,
    }
  }

  let core = text
  if (core.includes('再选')) {
    const idx = core.indexOf('再选')
    core = core.slice(idx + 2)
  }

  core = core
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/必选/g, '')
    .replace(/科/g, '')
    .replace(/\d选1/g, '选1')
    .trim()

  const hasChoice = core.includes('/') || /选1/.test(core)
  const secondSubject = subjectLongToShort(core)

  if (!secondSubject) {
    return {
      subjectRequirementMode: undefined,
      secondSubject: undefined,
    }
  }

  if (hasChoice) {
    return {
      subjectRequirementMode: '多门选考',
      secondSubject,
    }
  }

  return {
    subjectRequirementMode: '单科、多科均需选考',
    secondSubject,
  }
}

function normalizeRawCategoryForReview(rawCategory: string | undefined): string {
  return (rawCategory || '')
    .replace(/\s/g, '')
    .replace(/／/g, '/')
    .replace(/\|/g, '/')
    .trim()
}

function hasAny(text: string, keywords: string[]) {
  return keywords.some((k) => text.includes(k))
}

function detectCategoryFamilies(text: string) {
  const physics = hasAny(text, ['物理类', '物理'])
  const history = hasAny(text, ['历史类', '历史'])
  const science = hasAny(text, ['理科'])
  const liberal = hasAny(text, ['文科'])
  const comprehensive = hasAny(text, ['综合'])
  const art = hasAny(text, ['艺术类', '艺术文', '艺术理', '艺术'])
  const sport = hasAny(text, ['体育类', '体育文', '体育理', '体育'])

  return {
    physics,
    history,
    science,
    liberal,
    comprehensive,
    art,
    sport,
  }
}

function isAmbiguousSubjectCategoryText(text: string) {
  if (!text) return false

  if (text.includes('/') || text.includes('或')) {
    return true
  }

  const families = detectCategoryFamilies(text)
  const count = [
    families.physics || families.science,
    families.history || families.liberal,
    families.comprehensive,
    families.art,
    families.sport,
  ].filter(Boolean).length

  return count > 1
}

/**
 * 原始科类只负责：
 * - 招生科类
 * - 首选科目
 *
 * 多候选值：
 * - 不强行归类
 * - 标记需要人工核查
 */
export function deriveFieldsFromRawSubjectCategory(
  rawCategory: string | undefined,
  province: string | undefined
): {
  rawSubjectCategory?: string
  subjectCategory?: string
  firstSubject?: string
  needsReview?: boolean
  reviewReason?: string
} {
  const raw = normalizeRawCategoryForReview(rawCategory)
  const p = province || ''

  if (!raw || !p) {
    return {}
  }

  if (isAmbiguousSubjectCategoryText(raw)) {
    return {
      rawSubjectCategory: raw,
      subjectCategory: raw,
      firstSubject: undefined,
      needsReview: true,
      reviewReason: `原始科类“${raw}”包含多个候选值，请人工确认招生科类与首选科目`,
    }
  }

  if (COMPREHENSIVE_PROVINCES.has(p)) {
    if (raw.includes('艺术')) {
      return {
        rawSubjectCategory: raw,
        subjectCategory: '艺术类',
      }
    }
    if (raw.includes('体育')) {
      return {
        rawSubjectCategory: raw,
        subjectCategory: '体育类',
      }
    }
    return {
      rawSubjectCategory: raw,
      subjectCategory: '综合',
    }
  }

  if (LIBERAL_SCIENCE_PROVINCES.has(p)) {
    if (raw.includes('理')) {
      return {
        rawSubjectCategory: raw,
        subjectCategory: '理科',
      }
    }
    if (raw.includes('文')) {
      return {
        rawSubjectCategory: raw,
        subjectCategory: '文科',
      }
    }
    return {
      rawSubjectCategory: raw,
    }
  }

  const normalized = raw
    .replace(/物理类/g, '物')
    .replace(/物理/g, '物')
    .replace(/历史类/g, '历')
    .replace(/历史/g, '历')
    .replace(/史/g, '历')

  if (normalized.includes('物')) {
    return {
      rawSubjectCategory: raw,
      subjectCategory: '物理类',
      firstSubject: '物',
    }
  }

  if (normalized.includes('历')) {
    return {
      rawSubjectCategory: raw,
      subjectCategory: '历史类',
      firstSubject: '历',
    }
  }

  if (normalized === '理科') {
    return {
      rawSubjectCategory: raw,
      subjectCategory: '理科',
    }
  }

  if (normalized === '文科') {
    return {
      rawSubjectCategory: raw,
      subjectCategory: '文科',
    }
  }

  return {
    rawSubjectCategory: raw,
    subjectCategory: raw,
    needsReview: true,
    reviewReason: `原始科类“${raw}”未能自动识别，请人工确认`,
  }
}