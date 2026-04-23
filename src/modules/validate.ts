import type { ProcessedRecord, ValidationIssue } from '../types/record'

function isValidDataSource(value?: string) {
  const allowed = [
    '官方考试院',
    '大红本数据',
    '学校官网',
    '销售',
    '抓取',
    '圣达信',
    '优志愿',
    '学业桥',
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
      issues.push({
        code: 'matched_multiple',
        level: 'warning',
        message: '匹配到多条招生计划，请人工指定',
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
        level: 'error',
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
        level: 'error',
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
        level: 'error',
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

    if (result.year && result.province && result.batch) {
      const validBatches =
        provinceCurrentBatchDictByYear[result.year]?.[result.province] || []

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