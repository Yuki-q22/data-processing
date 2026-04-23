import ExcelJS from 'exceljs'
import type { RemarkTypeRule } from '../stores/ruleCenterStore'

export type RemarkTypeExtractRow = {
  rowId: string
  备注: string
  招生类型: string
  需要核查: string
}

export type RemarkTypeExtractResult = {
  rows: RemarkTypeExtractRow[]
  summary: {
    total: number
    extracted: number
    needReview: number
  }
}

function toText(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function sortRules(rules: RemarkTypeRule[]) {
  return [...rules].sort((a, b) => a.priority - b.priority)
}

function extractRecruitmentType(remark: string, rules: RemarkTypeRule[]) {
  if (!remark.trim()) return ''
  const sorted = sortRules(rules)
  for (const rule of sorted) {
    if (rule.keyword && remark.includes(rule.keyword)) {
      return rule.outputType
    }
  }
  return ''
}

function remarkNeedsReview(remark: string, keywords: string[]) {
  if (!remark.trim()) return '否'
  return keywords.some((word) => remark.includes(word)) ? '是' : '否'
}

export function processRemarkTypeExtract(params: {
  rows: Record<string, unknown>[]
  remarkColumn: string
  rules: RemarkTypeRule[]
  exclusionKeywords: string[]
}): RemarkTypeExtractResult {
  const { rows, remarkColumn, rules, exclusionKeywords } = params

  if (!rows.length) {
    throw new Error('文件中没有可处理的数据')
  }

  if (!(remarkColumn in rows[0])) {
    throw new Error(`备注字段 ${remarkColumn} 不存在于文件中`)
  }

  const resultRows: RemarkTypeExtractRow[] = rows.map((row, index) => {
    const remark = toText(row[remarkColumn])
    const type = extractRecruitmentType(remark, rules)
    const review = remarkNeedsReview(remark, exclusionKeywords)

    return {
      rowId: String(index + 1),
      备注: remark,
      招生类型: type,
      需要核查: review,
    }
  })

  return {
    rows: resultRows,
    summary: {
      total: resultRows.length,
      extracted: resultRows.filter((r) => r.招生类型 !== '').length,
      needReview: resultRows.filter((r) => r.需要核查 === '是').length,
    },
  }
}

export async function exportRemarkTypeExtractWorkbook(result: RemarkTypeExtractResult) {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Sheet1')

  const headers = ['备注', '招生类型', '需要核查']
  headers.forEach((header, index) => {
    worksheet.getCell(1, index + 1).value = header
  })

  result.rows.forEach((row, rowIndex) => {
    worksheet.getCell(rowIndex + 2, 1).value = row.备注
    worksheet.getCell(rowIndex + 2, 2).value = row.招生类型
    worksheet.getCell(rowIndex + 2, 3).value = row.需要核查
  })

  ;[1, 2, 3].forEach((col) => {
    for (let r = 2; r < result.rows.length + 2; r += 1) {
      const cell = worksheet.getCell(r, col)
      if (cell.value !== null && cell.value !== undefined && String(cell.value).trim() !== '') {
        cell.numFmt = '@'
      }
    }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}