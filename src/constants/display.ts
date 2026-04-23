export const UI_FONT_SIZE = 14
export const UI_TAG_FONT_SIZE = 13
export const UI_TITLE_FONT_SIZE = 15

export const MATCH_STATUS_LABEL_MAP: Record<string, string> = {
  matched_exact: '精确匹配',
  matched_without_batch: '忽略批次匹配',
  matched_cleaned: '清洗后匹配',
  matched_manual: '人工指定匹配',
  matched_multiple: '匹配到多条',
  unmatched: '未匹配',
}

export const MATCH_STATUS_COLOR_MAP: Record<string, string> = {
  matched_exact: 'green',
  matched_without_batch: 'cyan',
  matched_cleaned: 'orange',
  matched_manual: 'blue',
  matched_multiple: 'gold',
  unmatched: 'red',
}

export const ISSUE_LEVEL_LABEL_MAP: Record<string, string> = {
  warning: '警告',
  error: '错误',
}

export const ISSUE_LEVEL_COLOR_MAP: Record<string, string> = {
  warning: 'orange',
  error: 'red',
}

export const ISSUE_CODE_LABEL_MAP: Record<string, string> = {
  plan_unmatched: '未匹配招生计划',
  matched_multiple: '匹配到多条招生计划',
  subject_category_ambiguous: '原始科类待确认',
  lowest_score_required: '最低分缺失',
  score_order_invalid: '分数顺序异常',
  data_source_invalid: '数据来源异常',
  first_subject_required: '首选科目待确认',
  batch_not_in_current_rules: '批次规则待确认',
}

export function getMatchStatusLabel(status?: string) {
  if (!status) return '-'
  return MATCH_STATUS_LABEL_MAP[status] || status
}

export function getIssueLevelLabel(level?: string) {
  if (!level) return '-'
  return ISSUE_LEVEL_LABEL_MAP[level] || level
}

export function getIssueCodeLabel(code?: string) {
  if (!code) return '-'
  return ISSUE_CODE_LABEL_MAP[code] || code
}