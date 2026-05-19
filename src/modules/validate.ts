import type { ProcessedRecord, ValidationIssue } from '../types/record'
import { normalizeAdmissionYearKey } from './standardize'

function isValidDataSource(value?: string) {
  const allowed = [
    '官方考试院',
    '大红本数据',
    '学校官网',
    '销售',
    '学业桥',
    '学业桥非普通',
  ]

  return !value || allowed.includes(value)
}

function needsFirstSubject(subjectCategory?: string) {
  return subjectCategory === '物理类' || subjectCategory === '历史类'
}

export function attachValidationIssues(
  processedRecords: ProcessedRecord[],
  provinceCurrentBatchDictByYear: Record<string, Record<string, string[]>>
): ProcessedRecord[] {
  return processedRecords.map((item) => {
    const issues: ValidationIssue[] = [...(item.issues || [])]
    const result = item.result

    if (item.matchStatus === 'unmatched') {
      issues.push({
        code: 'plan_unmatched',
        level: 'warning',
        message: '未匹配到招生计划',
      })
    }

    if (item.matchStatus === 'matched_multiple' && !item.matchedPlan) {
      const candidateCount = item.matchCandidates?.length || 0
      issues.push({
        code: 'matched_multiple',
        level: 'warning',
        message:
          candidateCount > 1
            ? '匹配到多条招生计划，请人工指定'
            : '原始专业分或招生计划中“学校-省份-科类-专业”存在重复值，请人工指定匹配关系',
      })
    }

    if (item.source.subjectCategoryNeedsReview) {
      issues.push({
        code: 'subject_category_ambiguous',
        level: 'warning',
        message:
          item.source.subjectCategoryReviewReason ||
          `原始科类“${item.source.rawSubjectCategory || ''}”包含多个候选值，请人工确认招生科类与首选科目`,
      })
    }

    if (result.lowestScore === null || result.lowestScore === undefined) {
      issues.push({
        code: 'lowest_score_required',
        level: 'error',
        message: '最低分为必填项',
      })
    }

    if (
      result.highestScore !== null &&
      result.highestScore !== undefined &&
      result.lowestScore !== null &&
      result.lowestScore !== undefined &&
      result.highestScore < result.lowestScore
    ) {
      issues.push({
        code: 'score_order_invalid',
        level: 'warning',
        message: `最高分(${result.highestScore}) < 最低分(${result.lowestScore})`,
      })
    }

    if (
      result.averageScore !== null &&
      result.averageScore !== undefined &&
      result.lowestScore !== null &&
      result.lowestScore !== undefined &&
      result.averageScore < result.lowestScore
    ) {
      issues.push({
        code: 'score_order_invalid',
        level: 'warning',
        message: `平均分(${result.averageScore}) < 最低分(${result.lowestScore})`,
      })
    }

    if (
      result.averageScore !== null &&
      result.averageScore !== undefined &&
      result.highestScore !== null &&
      result.highestScore !== undefined &&
      result.highestScore < result.averageScore
    ) {
      issues.push({
        code: 'score_order_invalid',
        level: 'warning',
        message: `最高分(${result.highestScore}) < 平均分(${result.averageScore})`,
      })
    }

    if (!isValidDataSource(result.dataSource)) {
      issues.push({
        code: 'data_source_invalid',
        level: 'error',
        message: `数据来源“${result.dataSource || ''}”不在允许范围内`,
      })
    }

    if (needsFirstSubject(result.subjectCategory) && !result.firstSubject) {
      issues.push({
        code: 'first_subject_required',
        level: 'warning',
        message: `招生科类为“${result.subjectCategory}”时，首选科目建议人工确认`,
      })
    }

    /**
     * 注意：
     * 规则中心的“学校名称校验”和“专业名称+层次校验”不在异常处理阶段执行。
     *
     * 原因：
     * - 这里生成的问题会进入“异常处理”列表，干扰人工匹配流程。
     * - 专业名称+层次应在人工匹配完成后、导出阶段最后校验。
     *
     * 因此：
     * - 匹配异常、科类异常、分数异常、批次异常仍在这里处理。
     * - 规则中心校验结果只在导出文件最后两列展示。
     */

    if (result.year && result.province && result.batch) {
      const normalizedYear = normalizeAdmissionYearKey(result.year)
      const validBatches = normalizedYear
        ? provinceCurrentBatchDictByYear[normalizedYear]?.[result.province] || []
        : []

      if (validBatches.length > 0 && !validBatches.includes(result.batch)) {
        issues.push({
          code: 'batch_not_in_current_rules',
          level: 'warning',
          message: `批次“${result.batch}”不在 ${result.year} 年 ${result.province} 的批次规则中`,
        })
      }
    }

    return {
      ...item,
      issues,
    }
  })
}