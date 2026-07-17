import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  REMARK_RULE_SHEET_NAME,
  buildRemarkRuleFileName,
  buildRemarkRuleWorkbook,
} from './remarkRuleWorkbook'

describe('remark rule workbook export', () => {
  it('exports import-compatible headers and rule rows', () => {
    const workbook = buildRemarkRuleWorkbook([
      {
        keyword: '国家专项',
        outputType: '国家专项计划',
        priority: 2,
      },
      {
        keyword: '地方专项',
        outputType: '地方专项计划',
        priority: 1,
      },
    ])
    const worksheet = workbook.Sheets[REMARK_RULE_SHEET_NAME]
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: true,
    })

    expect(rows).toEqual([
      ['备注查找字段', '输出招生类型', '优先级'],
      ['国家专项', '国家专项计划', 2],
      ['地方专项', '地方专项计划', 1],
    ])
    expect(worksheet['!autofilter']).toEqual({ ref: 'A1:C3' })
  })

  it('rejects an empty rule list', () => {
    expect(() => buildRemarkRuleWorkbook([])).toThrow(
      '当前没有可导出的备注招生类型规则'
    )
  })

  it('uses a stable date-based file name', () => {
    expect(buildRemarkRuleFileName(new Date(2026, 6, 17))).toBe(
      '备注招生类型规则_2026-07-17.xlsx'
    )
  })
})
