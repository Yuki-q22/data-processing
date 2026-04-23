export type MatchStatus =
  | 'matched_exact'
  | 'matched_without_batch'
  | 'matched_cleaned'
  | 'matched_manual'
  | 'matched_multiple'
  | 'unmatched'

export type ValidationIssue = {
  code: string
  level: 'error' | 'warning'
  message: string
}

export type FieldSourceMap = {
  batch?: string
  enrollmentType?: string
  subjectRequirementMode?: string
  majorRemark?: string
  firstSubject?: string
  secondSubject?: string
  level1?: string
  groupCode?: string
  rawSubjectCategory?: string
  subjectCategory?: string
}

export type ScoreRecord = {
  rowId: string
  year?: string
  schoolName?: string
  province?: string

  subjectCategory?: string
  rawSubjectCategory?: string
  subjectCategoryNeedsReview?: boolean
  subjectCategoryReviewReason?: string

  batch?: string
  majorName?: string
  majorDirection?: string
  majorRemark?: string
  level1?: string
  enrollmentType?: string

  enrollmentPlan?: number | null
  admittedCount?: number | null
  highestScore?: number | null
  lowestScore?: number | null
  averageScore?: number | null
  lowestRank?: number | null

  dataSource?: string
  groupCode?: string

  subjectRequirementMode?: string
  firstSubject?: string
  secondSubject?: string

  majorCode?: string
  enrollmentCode?: string

  scoreRangeLow?: number | null
  scoreRangeHigh?: number | null
  scoreRangeRankLow?: number | null
  scoreRangeRankHigh?: number | null
}

export type PlanRecord = {
  rowId: string
  year?: string
  schoolName?: string
  province?: string
  subjectCategory?: string
  batch?: string
  majorName?: string
  majorDirection?: string
  majorRemark?: string
  level1?: string
  enrollmentType?: string
  enrollmentPlan?: number | null
  groupCode?: string
  groupSubjectRequirement?: string
  majorSubjectRequirement?: string
  dataSource?: string
}

export type ProcessedRecord = {
  rowId: string
  source: ScoreRecord
  matchedPlan?: PlanRecord
  matchCandidates?: PlanRecord[]
  result: ScoreRecord
  matchStatus: MatchStatus
  issues: ValidationIssue[]
  fieldSources: FieldSourceMap
}