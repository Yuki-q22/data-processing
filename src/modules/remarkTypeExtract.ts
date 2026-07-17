/**
 * 文件名称：备注招生类型提取核心逻辑
 *
 * 文件作用：
 * - 根据备注内容提取招生类型
 * - 应用备注招生类型规则
 * - 处理空备注、空行、尾部空白行等情况
 * - 生成提取结果
 *
 * 常改位置：
 * - 招生类型识别规则
 * - 备注为空时是否保留
 * - Excel 空行处理
 * - 导出结果字段
 *
 * 注意：
 * - 中间空备注行需要保留
 * - 文件末尾真正无内容的空白行不应作为有效备注行处理
 */

import ExcelJS from 'exceljs'
import { writeXlsxBufferWithUniformFormatting } from '../utils/excelExport'
import type { RemarkTypeRule } from '../stores/ruleCenterStore'

export type RemarkTypeExtractRow = {
  rowId: string
  备注: string
  招生类型: string
  需要核查: string
  命中核查关键词: string
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

function normalizeKeywords(keywords: string[]) {
  return keywords.map((word) => word.trim()).filter(Boolean)
}

function isReviewContextDelimiter(char: string) {
  return /\s/.test(char) || '，,。；;、：:（）()【】[]{}<>《》“”"\'/\\|'.includes(char)
}

function getReviewContext(remark: string, start: number, end: number) {
  let contextStart = start
  let contextEnd = end

  while (contextStart > 0 && !isReviewContextDelimiter(remark[contextStart - 1])) {
    contextStart -= 1
  }

  while (contextEnd < remark.length && !isReviewContextDelimiter(remark[contextEnd])) {
    contextEnd += 1
  }

  return remark.slice(contextStart, contextEnd)
}

function isBlockedByReviewKeyword(
  remark: string,
  keywordStart: number,
  keyword: string,
  reviewKeywords: string[],
) {
  const keywordEnd = keywordStart + keyword.length
  const context = getReviewContext(remark, keywordStart, keywordEnd)

  return reviewKeywords.some((word) => {
    const beforeStart = keywordStart - word.length
    const isBefore = beforeStart >= 0 && remark.slice(beforeStart, keywordStart) === word
    const isAfter = remark.slice(keywordEnd, keywordEnd + word.length) === word

    return isBefore || isAfter || context.includes(word)
  })
}

function hasUnblockedRuleKeyword(remark: string, keyword: string, reviewKeywords: string[]) {
  let startAt = 0

  while (startAt < remark.length) {
    const index = remark.indexOf(keyword, startAt)
    if (index === -1) return false
    if (!isBlockedByReviewKeyword(remark, index, keyword, reviewKeywords)) return true
    startAt = index + 1
  }

  return false
}

function extractRecruitmentType(
  remark: string,
  rules: RemarkTypeRule[],
  reviewKeywords: string[] = [],
) {
  if (!remark.trim()) return ''
  const sorted = sortRules(rules)
  const normalizedReviewKeywords = normalizeKeywords(reviewKeywords)

  for (const rule of sorted) {
    if (rule.keyword && hasUnblockedRuleKeyword(remark, rule.keyword, normalizedReviewKeywords)) {
      return rule.outputType
    }
  }
  return ''
}

function getMatchedReviewKeywords(remark: string, keywords: string[]) {
  if (!remark.trim()) return ''

  const matched = normalizeKeywords(keywords)
    .filter((word) => remark.includes(word))

  return Array.from(new Set(matched)).join('、')
}

function remarkNeedsReview(remark: string, matchedKeywords: string) {
  if (!remark.trim()) return ''
  return matchedKeywords ? '是' : '否'
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

  if (!remark) {
    return {
      rowId: String(index + 1),
      备注: '',
      招生类型: '',
      需要核查: '',
      命中核查关键词: '',
    }
  }

  const matchedReviewKeywords = getMatchedReviewKeywords(remark, exclusionKeywords)
const review = remarkNeedsReview(remark, matchedReviewKeywords)

// Suppress a type only when a review keyword is in the same undelimited phrase.
const type = extractRecruitmentType(remark, rules, exclusionKeywords)

return {
  rowId: String(index + 1),
  备注: remark,
  招生类型: type,
  需要核查: review,
  命中核查关键词: matchedReviewKeywords,
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

  const headers = ['备注', '招生类型', '需要核查', '命中核查关键词']
  headers.forEach((header, index) => {
    worksheet.getCell(1, index + 1).value = header
  })

  result.rows.forEach((row, rowIndex) => {
  worksheet.getCell(rowIndex + 2, 1).value = row.备注
  worksheet.getCell(rowIndex + 2, 2).value = row.招生类型
  worksheet.getCell(rowIndex + 2, 3).value = row.需要核查
  worksheet.getCell(rowIndex + 2, 4).value = row.命中核查关键词
})

  ;[1, 2, 3, 4].forEach((col) => {
    for (let r = 2; r < result.rows.length + 2; r += 1) {
      const cell = worksheet.getCell(r, col)
      if (cell.value !== null && cell.value !== undefined && String(cell.value).trim() !== '') {
        cell.numFmt = '@'
      }
    }
  })

  const buffer = await writeXlsxBufferWithUniformFormatting(workbook)
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
