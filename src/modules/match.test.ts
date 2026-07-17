import { describe, expect, it } from 'vitest'
import { buildProcessedRecords } from './match'
import type { PlanRecord, ScoreRecord } from '../types/record'

function makeScore(patch: Partial<ScoreRecord> = {}): ScoreRecord {
  return {
    rowId: 'score-1',
    year: '2025',
    schoolName: '测试大学',
    province: '河北',
    subjectCategory: '物理类',
    batch: '本科批',
    majorName: '计算机科学与技术',
    level1: '本科',
    ...patch,
  }
}

function makePlan(patch: Partial<PlanRecord> = {}): PlanRecord {
  return {
    rowId: 'plan-1',
    year: '2025',
    schoolName: '测试大学',
    province: '河北',
    subjectCategory: '物理类',
    batch: '本科批',
    majorName: '计算机科学与技术',
    level1: '本科',
    enrollmentType: '普通类',
    ...patch,
  }
}

describe('buildProcessedRecords', () => {
  it('保持精确匹配结果不变', () => {
    const result = buildProcessedRecords(
      [makeScore()],
      [makePlan()],
      { '2025': { 河北: ['本科批'] } },
    )

    expect(result[0].matchStatus).toBe('matched_exact')
    expect(result[0].matchedPlan?.rowId).toBe('plan-1')
    expect(result[0].result.enrollmentType).toBe('普通类')
  })

  it('通过清洗索引匹配含格式差异的数据', () => {
    const result = buildProcessedRecords(
      [makeScore({ schoolName: '测试 大学', majorName: '计算机（实验班）' })],
      [makePlan({ majorName: '计算机实验班' })],
      {},
    )

    expect(result[0].matchStatus).toBe('matched_cleaned')
    expect(result[0].matchedPlan?.rowId).toBe('plan-1')
  })

  it('大量无关计划不会影响目标匹配', () => {
    const unrelated = Array.from({ length: 20_000 }, (_, index) => makePlan({
      rowId: `unrelated-${index}`,
      schoolName: `无关大学${index}`,
    }))
    const result = buildProcessedRecords(
      [makeScore()],
      [...unrelated, makePlan()],
      { '2025': { 河北: ['本科批'] } },
    )

    expect(result[0].matchedPlan?.rowId).toBe('plan-1')
  })

  it('重复核心键保持人工确认，不自动误选', () => {
    const plans = [
      makePlan({ rowId: 'plan-a', batch: '本科批', groupCode: 'A' }),
      makePlan({ rowId: 'plan-b', batch: '提前批', groupCode: 'B' }),
    ]

    const ambiguous = buildProcessedRecords([makeScore()], plans, {})
    expect(ambiguous[0].matchStatus).toBe('matched_multiple')
    expect(ambiguous[0].matchedPlan).toBeUndefined()
    expect(ambiguous[0].matchCandidates).toHaveLength(2)

    const manual = buildProcessedRecords(
      [makeScore()],
      plans,
      {},
      { 'score-1': 'plan-b' },
    )
    expect(manual[0].matchStatus).toBe('matched_manual')
    expect(manual[0].matchedPlan?.rowId).toBe('plan-b')
  })

  it('空专业分输入返回空结果', () => {
    expect(buildProcessedRecords([], [makePlan()], {})).toEqual([])
  })
})
