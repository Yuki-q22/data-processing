import type { FieldMappingItem } from '../types/mapping'
import type { PlanRecord, ScoreRecord } from '../types/record'
import {
  deriveFieldsFromRawSubjectCategory,
  extractEnrollmentTypeFromRemark,
  getCategoryTypeByYearProvince,
  mergeSubjectRequirements,
  normalizeBatch,
  normalizeLevel1,
  normalizeProvince,
  normalizeSubjectCategoryByRaw,
  sanitizeText,
  splitMajorNameAndRemark,
} from './standardize'

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(String(value).replace(/,/g, '').trim())
  return Number.isNaN(n) ? null : n
}

function toText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const text = String(value).trim()
  return text === '' ? undefined : text
}

function mapRowByMappings(
  row: Record<string, unknown>,
  mappings: FieldMappingItem[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  mappings.forEach((mapping) => {
    if (!mapping.targetField) return
    result[mapping.targetField] = row[mapping.sourceField]
  })

  return result
}

type StandardizeOptions = {
  provinceRules: Record<string, string>
  categoryRules: Record<string, string>
  batchRules: Record<string, string>
  provinceYearCategoryType: Record<string, Record<string, string>>
  remarkTypeRules: Array<{ keyword: string; output: string; priority: number }>
  manualSchoolName?: string
}

export function buildScoreRecords(
  rows: Record<string, unknown>[],
  mappings: FieldMappingItem[],
  defaultYear: string,
  defaultDataSource: string,
  options: StandardizeOptions
): ScoreRecord[] {
  return rows.map((row, index) => {
    const mapped = mapRowByMappings(row, mappings)

    const year = toText(mapped['招生年份']) || defaultYear
    const province = normalizeProvince(toText(mapped['省份']), options.provinceRules)
    const rawCategory = toText(mapped['招生科类'])

    const categoryType = getCategoryTypeByYearProvince(
      year,
      province,
      options.provinceYearCategoryType
    )

    const splitMajor = splitMajorNameAndRemark(toText(mapped['招生专业']))
    const explicitRemark = sanitizeText(toText(mapped['专业备注']))
    const finalRemark = explicitRemark || splitMajor.majorRemark
    const extractedType = extractEnrollmentTypeFromRemark(finalRemark, options.remarkTypeRules)

    const schoolName =
      sanitizeText(toText(mapped['学校名称'])) || sanitizeText(options.manualSchoolName)

    const derivedFromRaw = deriveFieldsFromRawSubjectCategory(rawCategory, province)

    return {
      rowId: String(index + 1),
      year,
      schoolName,
      province,
      subjectCategory:
        derivedFromRaw.subjectCategory ||
        normalizeSubjectCategoryByRaw(rawCategory, categoryType),
      batch: normalizeBatch(toText(mapped['招生批次']), options.batchRules),
      majorName: sanitizeText(splitMajor.majorName),
      majorDirection: sanitizeText(toText(mapped['专业方向'])),
      majorRemark: finalRemark,
      level1: normalizeLevel1(toText(mapped['一级层次'])),
      enrollmentType: sanitizeText(toText(mapped['招生类型'])) || extractedType,
      enrollmentPlan: toNumber(mapped['招生人数']),
      admittedCount: toNumber(mapped['录取人数']),
      highestScore: toNumber(mapped['最高分']),
      lowestScore: toNumber(mapped['最低分']),
      averageScore: toNumber(mapped['平均分']),
      lowestRank: toNumber(mapped['最低分位次']),
      dataSource: defaultDataSource,
      groupCode: sanitizeText(toText(mapped['专业组代码'])),
      subjectRequirementMode: sanitizeText(toText(mapped['选科要求'])),
      firstSubject: derivedFromRaw.firstSubject,
      secondSubject: sanitizeText(toText(mapped['再选科目'])),
      majorCode: sanitizeText(toText(mapped['专业代码'])),
      enrollmentCode: sanitizeText(toText(mapped['招生代码'])),
      scoreRangeLow: toNumber(mapped['最低分数区间低']),
      scoreRangeHigh: toNumber(mapped['最低分数区间高']),
      scoreRangeRankLow: toNumber(mapped['最低分数区间位次低']),
      scoreRangeRankHigh: toNumber(mapped['最低分数区间位次高']),

      rawSubjectCategory: derivedFromRaw.rawSubjectCategory || rawCategory,
      subjectCategoryNeedsReview: !!derivedFromRaw.needsReview,
      subjectCategoryReviewReason: derivedFromRaw.reviewReason,
    }
  })
}

export function buildPlanRecords(
  rows: Record<string, unknown>[],
  mappings: FieldMappingItem[],
  defaultYear: string,
  defaultDataSource: string,
  options: StandardizeOptions
): PlanRecord[] {
  return rows.map((row, index) => {
    const mapped = mapRowByMappings(row, mappings)

    const year = toText(mapped['招生年份']) || defaultYear
    const province = normalizeProvince(toText(mapped['省份']), options.provinceRules)
    const rawCategory = toText(mapped['招生科类'])
    const categoryType = getCategoryTypeByYearProvince(
      year,
      province,
      options.provinceYearCategoryType
    )

    const mergedRequirement = mergeSubjectRequirements(
      toText(mapped['专业组选科要求']),
      toText(mapped['专业选科要求'])
    )

    const splitMajor = splitMajorNameAndRemark(toText(mapped['招生专业']))
    const explicitRemark = sanitizeText(toText(mapped['专业备注']))
    const finalRemark = explicitRemark || splitMajor.majorRemark
    const extractedType = extractEnrollmentTypeFromRemark(finalRemark, options.remarkTypeRules)

    const schoolName =
      sanitizeText(toText(mapped['学校名称'])) || sanitizeText(options.manualSchoolName)

    return {
      rowId: String(index + 1),
      year,
      schoolName,
      province,
      subjectCategory: normalizeSubjectCategoryByRaw(rawCategory, categoryType),
      batch: sanitizeText(toText(mapped['招生批次'])),
      majorName: sanitizeText(splitMajor.majorName),
      majorDirection: sanitizeText(toText(mapped['专业方向'])),
      majorRemark: finalRemark,
      level1: normalizeLevel1(toText(mapped['一级层次'])),
      enrollmentType: sanitizeText(toText(mapped['招生类型'])) || extractedType,
      enrollmentPlan: toNumber(mapped['招生人数']),
      groupCode: sanitizeText(toText(mapped['专业组代码'])),
      groupSubjectRequirement: mergedRequirement,
      majorSubjectRequirement: mergedRequirement,
      dataSource: defaultDataSource,
    }
  })
}