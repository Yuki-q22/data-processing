import type {
  FieldSourceMap,
  MatchStatus,
  PlanRecord,
  ProcessedRecord,
  ScoreRecord,
} from '../types/record'
import { deriveSubjectRequirementFields } from './standardize'

function normalizeText(value?: string) {
  return (value || '').replace(/\s/g, '').replace(/[（）()]/g, '').trim()
}

function isEqualOrIgnored(a?: string, b?: string) {
  if (!a || !b) return true
  return a === b
}

function filterCandidates(
  score: ScoreRecord,
  plans: PlanRecord[],
  options: {
    useBatch: boolean
    useLevel: boolean
    useType: boolean
    useCategory: boolean
    cleaned?: boolean
  }
) {
  return plans.filter((plan) => {
    const schoolOk = options.cleaned
      ? normalizeText(plan.schoolName) === normalizeText(score.schoolName)
      : (plan.schoolName || '') === (score.schoolName || '')

    const provinceOk = options.cleaned
      ? normalizeText(plan.province) === normalizeText(score.province)
      : (plan.province || '') === (score.province || '')

    const majorOk = options.cleaned
      ? normalizeText(plan.majorName) === normalizeText(score.majorName)
      : (plan.majorName || '') === (score.majorName || '')

    const categoryOk = options.useCategory
      ? options.cleaned
        ? isEqualOrIgnored(normalizeText(score.subjectCategory), normalizeText(plan.subjectCategory))
        : isEqualOrIgnored(score.subjectCategory, plan.subjectCategory)
      : true

    const levelOk = options.useLevel
      ? options.cleaned
        ? isEqualOrIgnored(normalizeText(score.level1), normalizeText(plan.level1))
        : isEqualOrIgnored(score.level1, plan.level1)
      : true

    const typeOk = options.useType
      ? options.cleaned
        ? isEqualOrIgnored(normalizeText(score.enrollmentType), normalizeText(plan.enrollmentType))
        : isEqualOrIgnored(score.enrollmentType, plan.enrollmentType)
      : true

    const batchOk = options.useBatch
      ? options.cleaned
        ? isEqualOrIgnored(normalizeText(score.batch), normalizeText(plan.batch))
        : isEqualOrIgnored(score.batch, plan.batch)
      : true

    return schoolOk && provinceOk && majorOk && categoryOk && levelOk && typeOk && batchOk
  })
}

function scorePlanCandidate(
  score: ScoreRecord,
  plan: PlanRecord,
  provinceCurrentBatchDictByYear: Record<string, Record<string, string[]>>
) {
  let scoreValue = 0

  if (score.level1 && plan.level1 && score.level1 === plan.level1) scoreValue += 3
  if (score.subjectCategory && plan.subjectCategory && score.subjectCategory === plan.subjectCategory) scoreValue += 3
  if (score.enrollmentType && plan.enrollmentType && score.enrollmentType === plan.enrollmentType) scoreValue += 2

  const year = score.year || ''
  const province = score.province || ''
  const currentBatches = provinceCurrentBatchDictByYear[year]?.[province] || []

  if (plan.batch && currentBatches.includes(plan.batch)) {
    scoreValue += 3
  }

  if (score.level1 === '专科（高职）' && plan.batch?.includes('专科')) {
    scoreValue += 2
  }

  if (score.level1 === '本科' && (plan.batch?.includes('本科') || plan.batch?.includes('普通类'))) {
    scoreValue += 2
  }

  return scoreValue
}

function pickBestByProvinceBatchDict(
  score: ScoreRecord,
  candidates: PlanRecord[],
  provinceCurrentBatchDictByYear: Record<string, Record<string, string[]>>
): { matchedPlan?: PlanRecord; matchStatus: MatchStatus; candidatesOut?: PlanRecord[] } {
  if (candidates.length === 0) {
    return { matchedPlan: undefined, matchStatus: 'unmatched', candidatesOut: [] }
  }

  const scored = candidates.map((item) => ({
    item,
    score: scorePlanCandidate(score, item, provinceCurrentBatchDictByYear),
  }))

  scored.sort((a, b) => b.score - a.score)

  if (scored.length === 1) {
    return {
      matchedPlan: scored[0].item,
      matchStatus: 'matched_without_batch',
      candidatesOut: [scored[0].item],
    }
  }

  if (scored[0].score > scored[1].score) {
    return {
      matchedPlan: scored[0].item,
      matchStatus: 'matched_without_batch',
      candidatesOut: scored.map((x) => x.item),
    }
  }

  return {
    matchedPlan: undefined,
    matchStatus: 'matched_multiple',
    candidatesOut: scored.map((x) => x.item),
  }
}

function pickMatch(
  score: ScoreRecord,
  plans: PlanRecord[],
  provinceCurrentBatchDictByYear: Record<string, Record<string, string[]>>,
  manualMatchSelections?: Record<string, string>
): { matchedPlan?: PlanRecord; matchStatus: MatchStatus; candidatesOut?: PlanRecord[] } {
  const manualPlanId = manualMatchSelections?.[score.rowId]
  if (manualPlanId) {
    const manualPlan = plans.find((p) => p.rowId === manualPlanId)
    if (manualPlan) {
      return {
        matchedPlan: manualPlan,
        matchStatus: 'matched_manual',
        candidatesOut: [manualPlan],
      }
    }
  }

  const strategies = [
    { useBatch: true, useLevel: true, useType: true, useCategory: true, cleaned: false, status: 'matched_exact' as MatchStatus },
    { useBatch: false, useLevel: true, useType: true, useCategory: true, cleaned: false, status: 'matched_without_batch' as MatchStatus },
    { useBatch: false, useLevel: false, useType: true, useCategory: true, cleaned: false, status: 'matched_without_batch' as MatchStatus },
    { useBatch: false, useLevel: false, useType: false, useCategory: true, cleaned: false, status: 'matched_without_batch' as MatchStatus },
    { useBatch: false, useLevel: false, useType: false, useCategory: false, cleaned: false, status: 'matched_without_batch' as MatchStatus },
    { useBatch: false, useLevel: false, useType: false, useCategory: false, cleaned: true, status: 'matched_cleaned' as MatchStatus },
  ]

  for (const strategy of strategies) {
    const candidates = filterCandidates(score, plans, strategy)

    if (strategy.useBatch) {
      if (candidates.length === 1) {
        return {
          matchedPlan: candidates[0],
          matchStatus: strategy.status,
          candidatesOut: [candidates[0]],
        }
      }
      if (candidates.length > 1) {
        return {
          matchedPlan: undefined,
          matchStatus: 'matched_multiple',
          candidatesOut: candidates,
        }
      }
      continue
    }

    if (candidates.length >= 1) {
      const best = pickBestByProvinceBatchDict(score, candidates, provinceCurrentBatchDictByYear)
      if (best.matchedPlan || best.matchStatus === 'matched_multiple') {
        return best
      }
    }
  }

  return {
    matchedPlan: undefined,
    matchStatus: 'unmatched',
    candidatesOut: [],
  }
}

function buildFieldSources(score: ScoreRecord, matchedPlan?: PlanRecord): FieldSourceMap {
  return {
    batch: score.batch
      ? '原始数据'
      : matchedPlan?.batch
        ? '招生计划匹配补全'
        : '无',

    enrollmentType: score.enrollmentType
      ? (score.majorRemark ? '原始数据 / 备注提取结果' : '原始数据或备注提取')
      : matchedPlan?.enrollmentType
        ? '招生计划补全'
        : '无',

    subjectRequirementMode: score.subjectRequirementMode
      ? '原始数据'
      : matchedPlan?.majorSubjectRequirement
        ? '招生计划规则转换'
        : '无',

    majorRemark: score.majorRemark
      ? '原字段或专业名称括号拆分'
      : '无',

    firstSubject: score.firstSubject
      ? '原始科类推导'
      : '无',

    secondSubject: score.secondSubject
      ? '原始数据'
      : matchedPlan?.majorSubjectRequirement
        ? '招生计划规则转换'
        : '无',

    level1: score.level1
      ? '原始数据或标准化'
      : matchedPlan?.level1
        ? '招生计划补全'
        : '无',

    groupCode: score.groupCode
      ? '原始数据'
      : matchedPlan?.groupCode
        ? '招生计划补全'
        : '无',
  }
}

function deriveRequirementFromPlan(
  matchedPlan?: PlanRecord
): {
  subjectRequirementMode?: string
  secondSubject?: string
} {
  if (!matchedPlan?.majorSubjectRequirement) {
    return {
      subjectRequirementMode: undefined,
      secondSubject: undefined,
    }
  }

  return deriveSubjectRequirementFields(matchedPlan.majorSubjectRequirement)
}

export function buildProcessedRecords(
  scoreRecords: ScoreRecord[],
  planRecords: PlanRecord[],
  provinceCurrentBatchDictByYear: Record<string, Record<string, string[]>>,
  manualMatchSelections?: Record<string, string>
): ProcessedRecord[] {
  return scoreRecords.map((score) => {
    const { matchedPlan, matchStatus, candidatesOut } = pickMatch(
      score,
      planRecords,
      provinceCurrentBatchDictByYear,
      manualMatchSelections
    )

    const requirement = deriveRequirementFromPlan(matchedPlan)

    const result: ScoreRecord = {
      ...score,
      batch: score.batch || matchedPlan?.batch,
      level1: score.level1 || matchedPlan?.level1,
      enrollmentType: score.enrollmentType || matchedPlan?.enrollmentType,
      enrollmentPlan: score.enrollmentPlan ?? matchedPlan?.enrollmentPlan ?? null,
      groupCode: score.groupCode || matchedPlan?.groupCode,
      // 统一由匹配逻辑填入
      subjectRequirementMode: requirement.subjectRequirementMode,
      secondSubject: requirement.secondSubject,
      dataSource: score.dataSource,
    }

    return {
      rowId: score.rowId,
      source: score,
      matchedPlan,
      matchCandidates: candidatesOut,
      result,
      matchStatus,
      issues: [],
      fieldSources: buildFieldSources(score, matchedPlan),
    }
  })
}