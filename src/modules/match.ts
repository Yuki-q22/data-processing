/**
 * 文件名称：专业分模板智能填充匹配逻辑
 *
 * 文件作用：
 * - 将原始专业分数据与招生计划数据进行匹配
 * - 根据年份、省份、学校、科类、批次、专业、层次、专业组代码等字段生成匹配结果
 *
 * 常改位置：
 * - 匹配键
 * - 匹配优先级
 * - 学校名称匹配
 * - 专业名称匹配
 * - 批次匹配
 * - 科类匹配
 * - 匹配失败原因
 *
 * 注意：
 * - 如果专业分模板智能填充匹配不到招生计划，优先检查本文件
 */

import type {
  FieldSourceMap,
  MatchStatus,
  PlanRecord,
  ProcessedRecord,
  ScoreRecord,
} from '../types/record'
import { deriveSubjectRequirementFields, normalizeAdmissionYearKey } from './standardize'

function normalizeText(value?: string) {
  return (value || '').replace(/\s/g, '').replace(/[（）()]/g, '').trim()
}

function isEqualOrIgnored(a?: string, b?: string) {
  if (!a || !b) return true
  return a === b
}

function makeCoreMatchKey(record: Pick<ScoreRecord | PlanRecord, 'schoolName' | 'province' | 'subjectCategory' | 'majorName'>) {
  return [
    normalizeText(record.schoolName),
    normalizeText(record.province),
    normalizeText(record.subjectCategory),
    normalizeText(record.majorName),
  ].join('||')
}

function countByCoreMatchKey(records: Array<ScoreRecord | PlanRecord>) {
  const map = new Map<string, number>()

  records.forEach((record) => {
    const key = makeCoreMatchKey(record)
    if (key.replace(/\|/g, '')) {
      map.set(key, (map.get(key) || 0) + 1)
    }
  })

  return map
}

function isBatchInProvinceRules(
  score: ScoreRecord,
  provinceCurrentBatchDictByYear: Record<string, Record<string, string[]>>
) {
  if (!score.batch) return true

  const year = normalizeAdmissionYearKey(score.year) || ''
  const province = score.province || ''
  const currentBatches = provinceCurrentBatchDictByYear[year]?.[province] || []

  if (!currentBatches.length) return true
  return currentBatches.includes(score.batch)
}

function getCorePlanCandidates(score: ScoreRecord, plans: PlanRecord[]) {
  const scoreKey = makeCoreMatchKey(score)
  if (!scoreKey.replace(/\|/g, '')) return []

  return plans.filter((plan) => makeCoreMatchKey(plan) === scoreKey)
}

function planCandidatesHaveSameFields(
  candidates: PlanRecord[],
  fields: Array<keyof Pick<PlanRecord, 'batch' | 'level1' | 'enrollmentType' | 'groupCode'>>
) {
  if (candidates.length <= 1) return false

  return fields.every((field) => {
    const values = candidates.map((candidate) => normalizeText(candidate[field]))
    return new Set(values).size <= 1
  })
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

  const year = normalizeAdmissionYearKey(score.year) || ''
  const province = score.province || ''
  const currentBatches = provinceCurrentBatchDictByYear[year]?.[province] || []

  if (plan.batch && currentBatches.includes(plan.batch)) {
    scoreValue += 3
  }

  if (score.level1 === '专科(高职)' && plan.batch?.includes('专科')) {
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
  duplicateInfo: {
    scoreCoreKeyCounts: Map<string, number>
    planCoreKeyCounts: Map<string, number>
  },
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

  const scoreCoreKey = makeCoreMatchKey(score)
  const scoreCoreDuplicated = (duplicateInfo.scoreCoreKeyCounts.get(scoreCoreKey) || 0) > 1
  const planCoreDuplicated = (duplicateInfo.planCoreKeyCounts.get(scoreCoreKey) || 0) > 1

  /**
   * 核心规则：
   * 原始专业分或招生计划中，只要“学校 + 省份 + 科类 + 专业”组合键重复，
   * 就不能继续用批次、层次、招生类型等字段自动消歧。
   * 否则同一专业下的不同批次/方向/代码可能被系统自动选中，导致误匹配。
   */
  if (scoreCoreDuplicated || planCoreDuplicated) {
    const candidates = getCorePlanCandidates(score, plans)
    if (
      planCandidatesHaveSameFields(candidates, [
        'batch',
        'level1',
        'enrollmentType',
        'groupCode',
      ])
    ) {
      return {
        matchedPlan: candidates[0],
        matchStatus: 'matched_without_batch',
        candidatesOut: candidates,
      }
    }

    return {
      matchedPlan: undefined,
      matchStatus: candidates.length > 0 ? 'matched_multiple' : 'unmatched',
      candidatesOut: candidates,
    }
  }

  const scoreBatchValid = isBatchInProvinceRules(score, provinceCurrentBatchDictByYear)

  const strategies = [
    ...(scoreBatchValid
      ? [{ useBatch: true, useLevel: true, useType: true, useCategory: true, cleaned: false, status: 'matched_exact' as MatchStatus }]
      : []),
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

function deriveFirstSubjectByPlanCategory(subjectCategory?: string): string | undefined {
  if (subjectCategory === '物理类') return '物'
  if (subjectCategory === '历史类') return '历'
  return undefined
}

function buildFieldSources(
  score: ScoreRecord,
  matchedPlan: PlanRecord | undefined,
  scoreBatchValid: boolean
): FieldSourceMap {
  return {
    batch: score.batch
      ? scoreBatchValid
        ? '原始数据'
        : matchedPlan?.batch
          ? '原始批次不在规则中，改用招生计划批次'
          : '原始数据（不在批次规则中）'
      : matchedPlan?.batch
        ? '招生计划匹配补全'
        : '无',

    enrollmentType: matchedPlan ? '招生计划' : '无',

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
  const duplicateInfo = {
    scoreCoreKeyCounts: countByCoreMatchKey(scoreRecords),
    planCoreKeyCounts: countByCoreMatchKey(planRecords),
  }

  return scoreRecords.map((score) => {
    const { matchedPlan, matchStatus, candidatesOut } = pickMatch(
      score,
      planRecords,
      provinceCurrentBatchDictByYear,
      duplicateInfo,
      manualMatchSelections
    )

    const requirement = deriveRequirementFromPlan(matchedPlan)
    const scoreBatchValid = isBatchInProvinceRules(score, provinceCurrentBatchDictByYear)
    const shouldUsePlanCategory = !!score.subjectCategoryNeedsReview && !!matchedPlan?.subjectCategory
    const finalSubjectCategory = shouldUsePlanCategory
      ? matchedPlan?.subjectCategory
      : score.subjectCategory || matchedPlan?.subjectCategory
    const finalFirstSubject = shouldUsePlanCategory
      ? deriveFirstSubjectByPlanCategory(matchedPlan?.subjectCategory)
      : score.firstSubject

    const result: ScoreRecord = {
      ...score,
      subjectCategory: finalSubjectCategory,
      firstSubject: finalFirstSubject,
      batch: scoreBatchValid ? score.batch || matchedPlan?.batch : matchedPlan?.batch || score.batch,
      level1: score.level1 || matchedPlan?.level1,
      // 招生类型始终使用匹配到的招生计划原值；计划为空时结果也保持为空。
      enrollmentType: matchedPlan?.enrollmentType,
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
      fieldSources: buildFieldSources(score, matchedPlan, scoreBatchValid),
    }
  })
}
