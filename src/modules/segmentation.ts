import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import * as pdfjsLib from 'pdfjs-dist'
import { writeXlsxBufferWithUniformFormatting } from '../utils/excelExport'
import { parseSegmentationTableRows, parseSegmentationText as parseSegmentationPlainText, type SegmentationParsedRow } from './segmentationParsers'
import { validateUploadFile } from './uploadValidation'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc

export type SegmentationMeta = {
  year?: string
  province?: string
  category?: string
  firstSubject?: string
  level?: string
}

type SegmentationProcessResult = {
  blob: Blob
  summary: {
    yearCheck: string
    insertedGapRows: number
    autoFilledCountRows: number
    extractedRows: number
    sourceType: 'excel' | 'pdf' | 'paste'
    detectedFormat?: string
  }
}

type LoadedSegmentationWorkbook = {
  workbook: ExcelJS.Workbook
  detectedFormat: string
  extractedRows: number
}

type PdfDocumentProxy = {
  numPages: number
  getPage(pageNumber: number): Promise<PdfPageProxy>
}

type PdfPageProxy = {
  getTextContent(): Promise<{ items: unknown[] }>
}

type PdfTextItem = {
  str?: string
  transform?: number[]
  width?: number
  height?: number
}

type PdfRow = {
  pageIndex: number
  y: number
  text: string
  cells: Array<{ x: number; text: string }>
}

type ScoreCumulativeRow = {
  score: number
  scoreLabel?: string
  cumulative: number
}

type ScoreSegmentRow = {
  score: number
  scoreLabel?: string
  segment: number
  cumulative: number
}

type NumberCell = {
  x: number
  text: string
  value: number
  numbers: number[]
}

type JilinHeaderOffset = {
  x: number
  offset: number
}

type PdfLikeRowsOptions = {
  includeDirect?: boolean
  includeTable?: boolean
  detectedFormatPrefix?: string
}

const REQUIRED_YEAR = '2026'
const TEMPLATE_NOTE = '注：1、分数必须最高三位数，数据必须为非负数 2、多分一段填写是，单分可不填写 3、层次只能选择本科、高职（专科）、不分层次'

function getPlainCellValue(value: unknown) {
  if (value && typeof value === 'object') {
    if ('result' in value) return (value as { result?: unknown }).result
    if ('text' in value) return (value as { text?: unknown }).text
    if ('richText' in value) {
      const richText = (value as { richText?: Array<{ text?: unknown }> }).richText
      return Array.isArray(richText) ? richText.map((item) => String(item.text ?? '')).join('') : value
    }
  }
  return value
}

function parseScoreNumber(value: unknown) {
  const plainValue = getPlainCellValue(value)
  if (plainValue === null || plainValue === undefined || plainValue === '') return null

  const text = String(plainValue).trim()
  const match = text.match(/\d+(?:\.\d+)?/)
  if (!match) return null

  const n = Number(match[0])
  return Number.isNaN(n) ? null : n
}

function parseScoreSpan(value: unknown) {
  const text = normalizeText(getPlainCellValue(value)).replace(/\s+/g, '')
  const lowerBoundMatch = text.includes('以上') ? null : text.match(/^(\d{1,4})(?:分)?(?:及)?以下/)
  if (lowerBoundMatch) {
    const high = Number(lowerBoundMatch[1]) - (text.includes('及以下') ? 0 : 1)
    if (Number.isFinite(high) && high >= 0 && high <= 1000) {
      return {
        low: 0,
        high,
        isRange: true,
        label: `0-${high}`,
      }
    }
  }

  const rangeMatch = text.match(/^(\d{1,4})(?:分)?(?:→|->|-|－|—|–|~|～|至|到)(\d{1,4})(?:分)?$/)
  if (rangeMatch) {
    const first = Number(rangeMatch[1])
    const second = Number(rangeMatch[2])
    if (Number.isFinite(first) && Number.isFinite(second) && first >= 0 && second >= 0 && first <= 1000 && second <= 1000 && first !== second) {
      const low = Math.min(first, second)
      const high = Math.max(first, second)
      return {
        low,
        high,
        isRange: true,
        label: `${low}-${high}`,
      }
    }
  }

  const score = parseScoreNumber(value)
  return score === null ? null : {
    low: score,
    high: score,
    isRange: false,
    label: String(score),
  }
}

function parseNumber(value: unknown) {
  const plainValue = getPlainCellValue(value)
  if (plainValue === null || plainValue === undefined || String(plainValue).trim() === '') {
    return null
  }
  const n = Number(String(plainValue).replace(/[,，]/g, '').trim())
  return Number.isNaN(n) ? null : n
}

function isEmpty(value: unknown) {
  const plainValue = getPlainCellValue(value)
  return plainValue === null || plainValue === undefined || String(plainValue).trim() === ''
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeMetaValue(value?: string) {
  return normalizeText(value)
}

function getWantedSubject(meta?: SegmentationMeta) {
  const text = `${normalizeMetaValue(meta?.category)} ${normalizeMetaValue(meta?.firstSubject)}`
  if (/物理/.test(text)) return '物理'
  if (/历史/.test(text)) return '历史'
  return ''
}

function filterRowsBySubject<T>(rows: T[], meta: SegmentationMeta | undefined, getText: (row: T) => string) {
  const wantedSubject = getWantedSubject(meta)
  if (!wantedSubject) return rows

  let hasSubjectMarker = false
  let shouldInclude = false
  const filtered: T[] = []

  rows.forEach((row) => {
    const text = getText(row).replace(/\s+/g, '')
    const hasPhysical = /物理/.test(text)
    const hasHistory = /历史/.test(text)

    if (hasPhysical || hasHistory) {
      hasSubjectMarker = true
      shouldInclude = wantedSubject === '物理' ? hasPhysical : hasHistory
    }

    if (shouldInclude) {
      filtered.push(row)
    }
  })

  return hasSubjectMarker && filtered.length ? filtered : rows
}

function setGapRowFill(worksheet: ExcelJS.Worksheet, row: number, fill: ExcelJS.Fill) {
  ;['A', 'B', 'C', 'E', 'F'].forEach((col) => {
    worksheet.getCell(`${col}${row}`).fill = fill
  })
}

function getFullScoreByProvince(province: string, level?: string) {
  if (province.includes('上海')) return /专科|高职/.test(level ?? '') ? 450 : 660
  if (province.includes('海南')) return 900
  return 750
}

function formatTopScoreRange(score: number, fullScore: number) {
  return `${score}-${fullScore}`
}

function extractIntegers(text: string) {
  return Array.from(String(text).matchAll(/\d[\d,，]*(?:\.\d+)?/g))
    .map((match) => match[0])
    .filter((raw) => !raw.includes('.'))
    .map((raw) => Number(raw.replace(/[\s,，]/g, '')))
    .filter((n) => Number.isFinite(n))
}

function getRowNumberItems(row: PdfRow): NumberCell[] {
  return row.cells
    .map((cell) => {
      const numbers = extractIntegers(cell.text)
      return {
        x: cell.x,
        text: cell.text,
        value: numbers[0],
        numbers,
      }
    })
    .filter((item): item is NumberCell => item.numbers.length > 0 && Number.isFinite(item.value))
}

function isScoreInFullRange(value: number, fullScore: number) {
  return value >= 0 && value <= fullScore
}

function isMostlyDescending(values: number[]) {
  if (values.length <= 1) return true
  const descendingCount = values.slice(0, -1).filter((value, index) => value >= values[index + 1]).length
  return descendingCount >= Math.max(1, values.length - 2)
}

function findNearestByX<T extends { x: number }>(items: T[], x: number, maxDistance = 28): T | null {
  let best: { item: T; distance: number } | null = null

  for (const item of items) {
    const distance = Math.abs(item.x - x)
    if (!best || distance < best.distance) {
      best = { item, distance }
    }
  }

  if (!best || best.distance > maxDistance) return null
  return best.item
}

function filterRowsByFullScore(rows: ScoreCumulativeRow[], fullScore: number) {
  return dedupeAndSortScoreRows(rows.filter((row) => row.score >= 0 && row.score <= fullScore))
}

function inferProvinceFromRows(rows: PdfRow[]) {
  const text = rows.slice(0, 30).map((row) => row.text).join(' ')
  if (text.includes('宁夏')) return '宁夏'
  if (text.includes('吉林')) return '吉林'
  if (text.includes('贵州')) return '贵州'
  if (text.includes('福建')) return '福建'
  if (text.includes('上海')) return '上海'
  if (text.includes('海南')) return '海南'
  return ''
}

function withFileInferredMeta(file: File, meta?: SegmentationMeta) {
  if (normalizeMetaValue(meta?.province) || !file.name.includes('福建')) return meta
  return {
    ...meta,
    province: '福建',
  }
}

function applyTemplateHeaders(worksheet: ExcelJS.Worksheet) {
  worksheet.getCell('A1').value = TEMPLATE_NOTE
  worksheet.getCell('A2').value = '年份'
  worksheet.getCell('A3').value = '省份'
  worksheet.getCell('A4').value = '科类'
  worksheet.getCell('A5').value = '首选科目'
  worksheet.getCell('A6').value = '层次'
  worksheet.getCell('A7').value = '分数'
  worksheet.getCell('B7').value = '人数'
  worksheet.getCell('C7').value = '累计人数'
  worksheet.getCell('D7').value = '是否多分一段'
  worksheet.getCell('E7').value = '累计人数校验结果'
  worksheet.getCell('F7').value = '分数校验结果'
  worksheet.getCell('F2').value = '年份校验'
}

function applyMetaToWorksheet(worksheet: ExcelJS.Worksheet, meta?: SegmentationMeta) {
  const year = normalizeMetaValue(meta?.year)
  const province = normalizeMetaValue(meta?.province)
  const category = normalizeMetaValue(meta?.category)
  const firstSubject = normalizeMetaValue(meta?.firstSubject)
  const level = normalizeMetaValue(meta?.level)

  if (year) worksheet.getCell('B2').value = year
  if (province) worksheet.getCell('B3').value = province
  if (category) worksheet.getCell('B4').value = category
  if (firstSubject) worksheet.getCell('B5').value = firstSubject
  if (level) worksheet.getCell('B6').value = level
}

function applyExactMetaToWorksheet(worksheet: ExcelJS.Worksheet, meta?: SegmentationMeta) {
  const fields: Array<[string, string]> = [
    ['B2', normalizeMetaValue(meta?.year)],
    ['B3', normalizeMetaValue(meta?.province)],
    ['B4', normalizeMetaValue(meta?.category)],
    ['B5', normalizeMetaValue(meta?.firstSubject)],
    ['B6', normalizeMetaValue(meta?.level)],
  ]

  fields.forEach(([cellAddress, value]) => {
    worksheet.getCell(cellAddress).value = value || null
  })
}

async function readPdfRowsFromBuffer(buffer: ArrayBuffer): Promise<PdfRow[]> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
  const pdf = (await loadingTask.promise) as PdfDocumentProxy
  const rows: PdfRow[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const textContent = await page.getTextContent()
    const itemRows = new Map<number, Array<{ x: number; text: string }>>()

    textContent.items.forEach((rawItem) => {
      const item = rawItem as PdfTextItem
      const text = normalizeText(item.str)
      const transform = item.transform
      if (!text || !Array.isArray(transform) || transform.length < 6) return

      const x = Number(transform[4])
      const y = Number(transform[5])
      if (!Number.isFinite(x) || !Number.isFinite(y)) return

      const yKey = Math.round(y / 3) * 3
      const current = itemRows.get(yKey) || []
      current.push({ x, text })
      itemRows.set(yKey, current)
    })

    Array.from(itemRows.entries())
      .sort((a, b) => b[0] - a[0])
      .forEach(([y, cells]) => {
        const sortedCells = cells.sort((a, b) => a.x - b.x)
        rows.push({
          pageIndex: pageNumber - 1,
          y,
          cells: sortedCells,
          text: sortedCells.map((cell) => cell.text).join(' ').replace(/\s+/g, ' ').trim(),
        })
      })
  }

  return rows
}

function extractJilinHeaderOffsets(row: PdfRow): JilinHeaderOffset[] {
  const offsets: JilinHeaderOffset[] = []

  row.cells.forEach((cell) => {
    const text = normalizeText(cell.text).replace(/\s+/g, '')
    const match = text.match(/^([+＋-])(\d+)$/)
    if (!match) return

    const sign = match[1]
    const value = Number(match[2])
    if (!Number.isFinite(value)) return

    offsets.push({
      x: cell.x,
      offset: sign === '-' ? -value : value,
    })
  })

  return offsets.sort((a, b) => a.x - b.x)
}

function parseJilinFromRows(rows: PdfRow[], fullScore: number) {
  const result: ScoreCumulativeRow[] = []
  let headerOffsets: JilinHeaderOffset[] = []

  rows.forEach((row) => {
    const offsets = extractJilinHeaderOffsets(row)
    if (offsets.length >= 5) {
      headerOffsets = offsets
      return
    }

    const items = getRowNumberItems(row)
    if (!items.length) return

    if (!headerOffsets.length && items.length >= 6) {
      const possibleOffsets = items.slice(1).map((item) => item.value)
      const isOffsetLike = possibleOffsets.every((value, index) => value <= 20 && (value === index || value === index + 1 || value === 9 - index))
      if (isOffsetLike) {
        headerOffsets = items.slice(1).map((item) => ({ x: item.x, offset: item.value }))
        return
      }
    }

    if (!headerOffsets.length) return

    const firstHeaderX = headerOffsets[0]?.x ?? 0
    const baseCandidates = items
      .filter((item) => isScoreInFullRange(item.value, fullScore) && item.x < firstHeaderX - 6)
      .sort((a, b) => b.x - a.x)
    const baseItem = baseCandidates[0]
    if (!baseItem) return

    items
      .filter((item) => item.x > baseItem.x + 6)
      .forEach((item) => {
        const matchedHeader = findNearestByX(headerOffsets, item.x, 36)
        if (!matchedHeader) return
        result.push({
          score: baseItem.value + matchedHeader.offset,
          cumulative: item.value,
        })
      })
  })

  return dedupeAndSortScoreRows(result)
}

function getGuizhouScoreItems(row: PdfRow, fullScore: number): NumberCell[] {
  const hasScoreLabel = /分\s*数|成绩/.test(row.text)
  const isTitleLike = /统计表|一分一段|普通类|普通高校|高考/.test(row.text) && !hasScoreLabel
  if (isTitleLike) return []

  // 贵州 PDF 的低分段会出现 99、98、...、0。原来按 >=100 判断会在 100 分后截断。
  // 这里改为：只要该行明确是“分数”行，就按 0~满分识别分数。
  // 非“分数”行不参与识别，避免把“本段人数”里的小人数误判为分数。
  if (!hasScoreLabel) return []

  const items = getRowNumberItems(row)
    .filter((item) => isScoreInFullRange(item.value, fullScore))
    .sort((a, b) => a.x - b.x)

  if (items.length < 2) return []

  const values = items.map((item) => item.value)
  if (!isMostlyDescending(values)) return []

  return items
}

function readGuizhouCandidateValues(row: PdfRow, scoreItems: NumberCell[]) {
  const numberItems = getRowNumberItems(row)
  if (!numberItems.length) return []

  return scoreItems.map((scoreItem) => {
    const matched = findNearestByX(numberItems, scoreItem.x, 34)
    if (!matched) return null

    // 贵州横向表如果一个单元格里含“本段人数\n累计人数\n累计比例”，第二个整数才是累计人数。
    if (matched.numbers.length >= 2) return matched.numbers[1]
    return matched.value
  })
}

function scoreGuizhouCandidateRow(row: PdfRow, values: Array<number | null>) {
  const validValues = values.filter((value): value is number => value !== null && Number.isFinite(value))
  if (validValues.length < 3) return -Infinity

  let score = 0
  const text = row.text

  if (/累计人数|累计人|累计/.test(text)) score += 100
  if (/本段人数|本段|段人数/.test(text)) score -= 20
  if (/比例|占比|率|%|％/.test(text)) score -= 35
  if (/分数|成绩/.test(text)) score -= 80

  const ascendingCount = validValues.slice(0, -1).filter((value, index) => value <= validValues[index + 1]).length
  if (ascendingCount >= Math.max(1, validValues.length - 2)) score += 12

  const positiveCount = validValues.filter((value) => value >= 0).length
  score += positiveCount

  return score
}

function findBestGuizhouCumulativeRow(scoreItems: NumberCell[], candidateRows: PdfRow[]) {
  let best: { values: number[]; score: number } | null = null

  for (let index = 0; index < candidateRows.length; index += 1) {
    const row = candidateRows[index]
    const values = readGuizhouCandidateValues(row, scoreItems)
    const score = scoreGuizhouCandidateRow(row, values) - index * 0.2
    if (!Number.isFinite(score)) continue

    const normalizedValues = values.map((value) => (value === null ? NaN : value))
    if (!best || score > best.score) {
      best = { values: normalizedValues, score }
    }
  }

  if (!best || best.score < 0) return null
  return best.values
}

function parseGuizhouFromRows(rows: PdfRow[], fullScore: number) {
  const result: ScoreCumulativeRow[] = []

  rows.forEach((row, rowIndex) => {
    const scoreItems = getGuizhouScoreItems(row, fullScore)
    if (!scoreItems.length) return

    const candidateRows: PdfRow[] = []
    for (let i = rowIndex + 1; i < rows.length && i <= rowIndex + 6; i += 1) {
      const candidate = rows[i]
      if (candidate.pageIndex !== row.pageIndex) break
      if (getGuizhouScoreItems(candidate, fullScore).length) break
      candidateRows.push(candidate)
    }

    const cumulativeValues = findBestGuizhouCumulativeRow(scoreItems, candidateRows)
    if (!cumulativeValues) return

    scoreItems.forEach((scoreItem, index) => {
      const cumulative = cumulativeValues[index]
      if (!Number.isFinite(cumulative) || cumulative < 0) return
      result.push({
        score: scoreItem.value,
        cumulative,
      })
    })
  })

  return dedupeAndSortScoreRows(result)
}

function parseDirectFromRows(rows: PdfRow[]) {
  const result: ScoreCumulativeRow[] = []

  rows.forEach((row) => {
    const numberItems = getRowNumberItems(row)
    const numbers = numberItems.map((item) => item.value)
    if (numbers.length < 2) return

    const firstScoreSpan = parseScoreSpan(numberItems[0]?.text)
    const score = firstScoreSpan?.low ?? numbers[0]
    const cumulative = numbers[1]
    if (score >= 0 && score <= 1000 && cumulative >= 0) {
      result.push({
        score,
        scoreLabel: firstScoreSpan?.isRange ? firstScoreSpan.label : undefined,
        cumulative,
      })
    }
  })

  return dedupeAndSortScoreRows(result)
}

function parseNingxiaFromRows(rows: PdfRow[], fullScore: number) {
  const result: ScoreCumulativeRow[] = []

  rows.forEach((row) => {
    if (!/分以上|分及以上/.test(row.text)) return

    const items = getRowNumberItems(row).sort((a, b) => a.x - b.x)
    if (items.length < 4) return

    for (let index = 0; index + 1 < items.length; index += 2) {
      const score = items[index].value
      const cumulative = items[index + 1].value

      if (!isScoreInFullRange(score, fullScore) || !Number.isFinite(cumulative) || cumulative < 0) continue

      result.push({ score, cumulative })
    }
  })

  return dedupeAndSortScoreRows(result)
}

function dedupeAndSortScoreRows(rows: ScoreCumulativeRow[]) {
  const seen = new Set<number>()
  const unique: ScoreCumulativeRow[] = []

  rows
    .filter((row) => Number.isFinite(row.score) && Number.isFinite(row.cumulative))
    .sort((a, b) => b.score - a.score)
    .forEach((row) => {
      if (seen.has(row.score)) return
      seen.add(row.score)
      unique.push(row)
    })

  return unique
}

function calculateSegmentCounts(data: ScoreCumulativeRow[]): ScoreSegmentRow[] {
  return data.map((row, index) => {
    const previous = index > 0 ? data[index - 1].cumulative : 0
    const segment = index === 0 ? row.cumulative : Math.max(0, row.cumulative - previous)
    return {
      score: row.score,
      scoreLabel: row.scoreLabel,
      segment,
      cumulative: row.cumulative,
    }
  })
}

function buildWorkbookFromPdfLikeRows(
  rows: PdfRow[],
  meta?: SegmentationMeta,
  options: PdfLikeRowsOptions = {},
): LoadedSegmentationWorkbook | null {
  const scopedRows = filterRowsBySubject(rows, meta, (row) => row.text)
  const inputProvince = normalizeMetaValue(meta?.province)
  const inferredProvince = inferProvinceFromRows(rows)
  const province = inputProvince || inferredProvince
  const fullScore = getFullScoreByProvince(province, meta?.level)

  const tableParsed = options.includeTable === false
    ? { rows: [], detectedFormat: 'table-disabled' }
    : parseSegmentationTableRows(scopedRows.map((row) => row.cells.map((cell) => cell.text)), { level: meta?.level, province })
  const shouldTryNingxia = province === '宁夏' || !province
  const ningxiaRows = shouldTryNingxia ? filterRowsByFullScore(parseNingxiaFromRows(scopedRows, fullScore), fullScore) : []
  const jilinRows = province === '贵州' ? [] : filterRowsByFullScore(parseJilinFromRows(scopedRows, fullScore), fullScore)
  const guizhouRows = province === '吉林' ? [] : filterRowsByFullScore(parseGuizhouFromRows(scopedRows, fullScore), fullScore)
  const directRows = options.includeDirect && !province ? filterRowsByFullScore(parseDirectFromRows(scopedRows), fullScore) : []

  const candidates = [
    {
      format: `table-${tableParsed.detectedFormat}`,
      rowCount: tableParsed.rows.length,
      priority: 1500,
      build: () => ({
        workbook: buildWorkbookFromParsedRows(tableParsed.rows, meta),
        extractedRows: tableParsed.rows.length,
      }),
    },
    {
      format: 'ningxia-two-column-groups',
      rowCount: ningxiaRows.length,
      priority: province === '宁夏' ? 10000 : 2000,
      build: () => buildWorkbookFromCumulativeRows(ningxiaRows, meta),
    },
    {
      format: 'jilin',
      rowCount: jilinRows.length,
      priority: province === '吉林' ? 10000 : inferredProvince === '吉林' ? 5000 : 0,
      build: () => buildWorkbookFromCumulativeRows(jilinRows, meta),
    },
    {
      format: 'horizontal_multiline',
      rowCount: guizhouRows.length,
      priority: province === '贵州' ? 10000 : inferredProvince === '贵州' ? 5000 : 0,
      build: () => buildWorkbookFromCumulativeRows(guizhouRows, meta),
    },
    {
      format: 'direct',
      rowCount: directRows.length,
      priority: -1000,
      build: () => buildWorkbookFromCumulativeRows(directRows, meta),
    },
  ].filter((item) => item.rowCount)

  if (!candidates.length) {
    return null
  }

  const selected = candidates.sort((a, b) => (b.priority + b.rowCount) - (a.priority + a.rowCount))[0]
  const built = selected.build()

  if (!inputProvince && inferredProvince) {
    built.workbook.worksheets[0].getCell('B3').value = inferredProvince
  }

  return {
    workbook: built.workbook,
    detectedFormat: `${options.detectedFormatPrefix ?? ''}${selected.format}`,
    extractedRows: built.extractedRows,
  }
}

async function buildWorkbookFromPdf(buffer: ArrayBuffer, meta?: SegmentationMeta) {
  const rows = await readPdfRowsFromBuffer(buffer)
  const built = buildWorkbookFromPdfLikeRows(rows, meta, { includeDirect: true })
  if (!built) {
    throw new Error('PDF 未识别到有效的一分一段数据。当前仅保留原有文本型 PDF 识别能力；图片型 PDF、扫描件或复杂表格请先用外部 OCR 识别为表格文本，再粘贴到本页面处理。')
  }
  return built
}

function isPdfBuffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer.slice(0, 5))
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d
}

function isZipBuffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer.slice(0, 4))
  return bytes[0] === 0x50 && bytes[1] === 0x4b
}

function isOleExcelBuffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer.slice(0, 8))
  return (
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 &&
    bytes[5] === 0xb1 &&
    bytes[6] === 0x1a &&
    bytes[7] === 0xe1
  )
}

function shouldTreatAsPdf(file: File, buffer: ArrayBuffer) {
  return isPdfBuffer(buffer) || file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

function sheetJsCellToExcelJsValue(value: unknown): ExcelJS.CellValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value
  return String(value)
}

async function loadWorkbookByExcelJs(buffer: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  return workbook
}

function loadWorkbookBySheetJs(buffer: ArrayBuffer) {
  const sourceWorkbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: false,
    raw: true,
  })

  const firstSheetName = sourceWorkbook.SheetNames[0]
  if (!firstSheetName) {
    throw new Error('Excel 文件中未识别到工作表')
  }

  const sourceSheet = sourceWorkbook.Sheets[firstSheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sourceSheet, {
    header: 1,
    raw: true,
    blankrows: true,
  })

  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(firstSheetName || '一分一段')

  rows.forEach((rowValues, rowIndex) => {
    if (!Array.isArray(rowValues)) return
    rowValues.forEach((value, colIndex) => {
      worksheet.getCell(rowIndex + 1, colIndex + 1).value = sheetJsCellToExcelJsValue(value)
    })
  })

  return workbook
}


function worksheetToGrid(worksheet: ExcelJS.Worksheet) {
  const rows: unknown[][] = []
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values: unknown[] = []
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      values[colNumber - 1] = getPlainCellValue(cell.value)
    })
    rows[rowNumber - 1] = values
  })
  return rows
}

function worksheetToPdfLikeRows(worksheet: ExcelJS.Worksheet) {
  const rows: PdfRow[] = []
  const columnWidth = 48

  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: Array<{ x: number; text: string }> = []

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const text = normalizeText(getPlainCellValue(cell.value))
      if (!text) return
      cells.push({
        x: (colNumber - 1) * columnWidth,
        text,
      })
    })

    if (!cells.length) return
    rows.push({
      pageIndex: 0,
      y: -rowNumber,
      cells,
      text: cells.map((cell) => cell.text).join(' ').replace(/\s+/g, ' ').trim(),
    })
  })

  return rows
}

function isTemplateLikeWorksheet(worksheet: ExcelJS.Worksheet) {
  const scoreHeader = normalizeText(getPlainCellValue(worksheet.getCell('A7').value)).replace(/\s+/g, '')
  const countHeader = normalizeText(getPlainCellValue(worksheet.getCell('B7').value)).replace(/\s+/g, '')
  const cumulativeHeader = normalizeText(getPlainCellValue(worksheet.getCell('C7').value)).replace(/\s+/g, '')

  return /分数|总分|成绩/.test(scoreHeader) && /人数/.test(countHeader) && /累计/.test(cumulativeHeader)
}

function buildWorkbookFromParsedRows(rows: SegmentationParsedRow[], meta?: SegmentationMeta, sheetName = '一分一段') {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(sheetName)

  applyTemplateHeaders(worksheet)
  applyMetaToWorksheet(worksheet, meta)

  rows.forEach((item, index) => {
    const row = index + 8
    worksheet.getCell(`A${row}`).value = item.scoreLabel ?? item.score
    if (item.count !== null && item.count !== undefined) {
      worksheet.getCell(`B${row}`).value = item.count
    }
    worksheet.getCell(`C${row}`).value = item.cumulative
  })

  return workbook
}

function buildWorkbookFromCumulativeRows(rows: ScoreCumulativeRow[], meta?: SegmentationMeta, sheetName = '一分一段') {
  const convertedRows = calculateSegmentCounts(rows)
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(sheetName)

  applyTemplateHeaders(worksheet)
  applyMetaToWorksheet(worksheet, meta)

  convertedRows.forEach((item, index) => {
    const row = index + 8
    worksheet.getCell(`A${row}`).value = item.scoreLabel ?? item.score
    worksheet.getCell(`B${row}`).value = item.segment
    worksheet.getCell(`C${row}`).value = item.cumulative
  })

  return { workbook, extractedRows: convertedRows.length }
}

function normalizeRangeScoreRows(worksheet: ExcelJS.Worksheet, startRow = 8) {
  for (let row = startRow; row <= worksheet.rowCount; row += 1) {
    const scoreCell = worksheet.getCell(`A${row}`)
    const span = parseScoreSpan(scoreCell.value)
    if (!span?.isRange) continue

    scoreCell.value = span.label
    worksheet.getCell(`D${row}`).value = '是'
  }
}

function removePdfRowsAfterCumulativeReset(worksheet: ExcelJS.Worksheet, startRow = 8) {
  let row = startRow

  while (row < worksheet.rowCount) {
    const currScore = parseScoreSpan(worksheet.getCell(`A${row}`).value)
    const nextScore = parseScoreSpan(worksheet.getCell(`A${row + 1}`).value)
    const currTotal = parseNumber(worksheet.getCell(`C${row}`).value)
    const nextTotal = parseNumber(worksheet.getCell(`C${row + 1}`).value)

    if (currScore === null || nextScore === null || currTotal === null || nextTotal === null) {
      row += 1
      continue
    }

    if (currScore.low > nextScore.high && nextTotal < currTotal) {
      worksheet.spliceRows(row + 1, 1)
      continue
    }

    row += 1
  }
}

function buildPlainExportWorkbook(workbook: ExcelJS.Workbook, meta?: SegmentationMeta) {
  const sourceWorksheet = workbook.worksheets[0]
  const outputWorkbook = new ExcelJS.Workbook()
  const outputWorksheet = outputWorkbook.addWorksheet(sourceWorksheet?.name || '一分一段')

  if (!sourceWorksheet) return outputWorkbook

  for (let rowNumber = 1; rowNumber <= sourceWorksheet.rowCount; rowNumber += 1) {
    const sourceRow = sourceWorksheet.getRow(rowNumber)
    sourceRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (isEmpty(cell.value)) return
      outputWorksheet.getCell(rowNumber, colNumber).value = getPlainCellValue(cell.value) as ExcelJS.CellValue
    })
  }

  applyExactMetaToWorksheet(outputWorksheet, meta)

  return outputWorkbook
}

async function loadWorkbookFromExcel(file: File, buffer: ArrayBuffer, meta?: SegmentationMeta) {
  let workbook: ExcelJS.Workbook

  if (isZipBuffer(buffer)) {
    try {
      workbook = await loadWorkbookByExcelJs(buffer)
    } catch {
      // 部分文件扩展名是 xlsx，但实际内容不是标准 xlsx zip 包。此时退回 SheetJS 读取。
      workbook = loadWorkbookBySheetJs(buffer)
    }
  } else if (isOleExcelBuffer(buffer) || /\.(xls|csv)$/i.test(file.name)) {
    workbook = loadWorkbookBySheetJs(buffer)
  } else {
    try {
      workbook = loadWorkbookBySheetJs(buffer)
    } catch {
      throw new Error('文件格式无法识别：请上传 .xlsx、.xls、.csv 或文本型 .pdf 文件。图片型 PDF、扫描件请先用外部 OCR 识别为表格文本，再粘贴到本页面处理。')
    }
  }

  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    throw new Error('Excel 文件中未识别到可处理的工作表')
  }

  const pdfLikeRows = worksheetToPdfLikeRows(worksheet)
  const pdfExtracted = buildWorkbookFromPdfLikeRows(pdfLikeRows, meta, {
    includeTable: false,
    detectedFormatPrefix: 'excel-pdf-',
  })
  if (pdfExtracted) {
    return pdfExtracted
  }

  if (isTemplateLikeWorksheet(worksheet)) {
    applyTemplateHeaders(worksheet)
    applyMetaToWorksheet(worksheet, meta)

    return {
      workbook,
      detectedFormat: isZipBuffer(buffer) ? 'excel-template-xlsx' : isOleExcelBuffer(buffer) ? 'excel-template-xls' : 'excel-template',
      extractedRows: Math.max(0, worksheet.rowCount - 7),
    }
  }

  const gridRows = worksheetToGrid(worksheet)
  const scopedGridRows = filterRowsBySubject(
    gridRows,
    meta,
    (row) => row.map((cell) => normalizeText(getPlainCellValue(cell))).join(' '),
  )
  const parsed = parseSegmentationTableRows(scopedGridRows, { level: meta?.level, province: normalizeMetaValue(meta?.province) })
  if (!parsed.rows.length) {
    const directPdfExtracted = buildWorkbookFromPdfLikeRows(pdfLikeRows, meta, {
      includeDirect: true,
      includeTable: false,
      detectedFormatPrefix: 'excel-pdf-',
    })
    if (directPdfExtracted) {
      return directPdfExtracted
    }

    throw new Error(`Excel 未识别到有效的一分一段数据。${parsed.warnings.join('；') || '请检查是否包含分数、人数、累计人数。'}`)
  }

  return {
    workbook: buildWorkbookFromParsedRows(parsed.rows, meta, worksheet.name || '一分一段'),
    detectedFormat: `excel-${parsed.detectedFormat}`,
    extractedRows: parsed.rows.length,
  }
}

function processLoadedWorkbook(
  workbook: ExcelJS.Workbook,
  meta: SegmentationMeta | undefined,
  sourceType: 'excel' | 'pdf' | 'paste',
  detectedFormat: string,
  extractedRows: number,
): SegmentationProcessResult['summary'] {
  const worksheet = workbook.worksheets[0]

  const yellowFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFF00' },
  }

  applyTemplateHeaders(worksheet)
  applyMetaToWorksheet(worksheet, meta)

  const yearValue = worksheet.getCell('B2').value
  let yearCheck = '√'
  if (String(getPlainCellValue(yearValue) ?? '').trim() !== REQUIRED_YEAR) {
    yearCheck = `× 应为${REQUIRED_YEAR}，当前为：${String(getPlainCellValue(yearValue) ?? '')}`
  }
  worksheet.getCell('G2').value = yearCheck

  const province = String(getPlainCellValue(worksheet.getCell('B3').value) ?? '').trim()
  const level = String(getPlainCellValue(worksheet.getCell('B6').value) ?? '').trim()
  const fullScore = getFullScoreByProvince(province, level)

  let insertedGapRows = 0
  let autoFilledCountRows = 0

  // ---------- 第8行特殊处理 ----------
  let row = 8
  const firstScoreSpan = parseScoreSpan(worksheet.getCell(`A${row}`).value)
  const firstScore = firstScoreSpan?.low ?? null
  const firstTotal = parseNumber(worksheet.getCell(`C${row}`).value)

  if (firstScore !== null) {
    if (firstTotal !== null && isEmpty(worksheet.getCell(`B${row}`).value)) {
      worksheet.getCell(`B${row}`).value = firstTotal
      autoFilledCountRows += 1
    }

    const normalizedFirstCount = parseNumber(worksheet.getCell(`B${row}`).value)
    const normalizedFirstTotal = parseNumber(worksheet.getCell(`C${row}`).value)

    if (firstScoreSpan?.isRange) {
      worksheet.getCell(`A${row}`).value = firstScoreSpan.label
      worksheet.getCell(`D${row}`).value = '是'
    } else if (normalizedFirstCount !== null && normalizedFirstTotal !== null && normalizedFirstCount !== normalizedFirstTotal) {
      const insertScore = firstScore + 1
      const insertCount = normalizedFirstTotal - normalizedFirstCount

      worksheet.spliceRows(row, 0, [
        formatTopScoreRange(insertScore, fullScore),
        insertCount,
        insertCount,
        '是',
        '补断点',
        '补断点',
      ])
      setGapRowFill(worksheet, row, yellowFill)

      // 原第8行被下移为第9行。保留原最高分本身，避免与新增的“最高分+1-满分”区间重叠。
      worksheet.getCell(`A${row + 1}`).value = firstScore

      insertedGapRows += 1
    } else {
      worksheet.getCell(`A${row}`).value = formatTopScoreRange(firstScore, fullScore)
      worksheet.getCell(`D${row}`).value = '是'
    }
  }

  normalizeRangeScoreRows(worksheet)
  if (sourceType === 'pdf') {
    removePdfRowsAfterCumulativeReset(worksheet)
  }

  // ---------- 补断点逻辑 ----------
  while (row < worksheet.rowCount) {
    const currScore = parseScoreSpan(worksheet.getCell(`A${row}`).value)
    const nextScore = parseScoreSpan(worksheet.getCell(`A${row + 1}`).value)

    if (currScore !== null && nextScore !== null && currScore.low - nextScore.high > 1) {
      const missingScore = currScore.low - 1
      const currTotal = worksheet.getCell(`C${row}`).value

      worksheet.spliceRows(row + 1, 0, [missingScore, 0, currTotal, '', '补断点', '补断点'])
      setGapRowFill(worksheet, row + 1, yellowFill)

      insertedGapRows += 1
    } else {
      row += 1
    }
  }

  // ---------- 校验与自动补人数 ----------
  let correctTotal: number | null = null

  for (let r = 8; r <= worksheet.rowCount; r += 1) {
    const scoreCell = worksheet.getCell(`A${r}`)
    const countCell = worksheet.getCell(`B${r}`)
    const totalCell = worksheet.getCell(`C${r}`)
    const cumulativeCheckCell = worksheet.getCell(`E${r}`)
    const scoreCheckCell = worksheet.getCell(`F${r}`)

    const score = parseScoreSpan(scoreCell.value)
    const total = parseNumber(totalCell.value)

    if (isEmpty(countCell.value) && total !== null) {
      if (r === 8) {
        countCell.value = total
        autoFilledCountRows += 1
      } else {
        const prevTotal = parseNumber(worksheet.getCell(`C${r - 1}`).value)
        if (prevTotal !== null) {
          countCell.value = total - prevTotal
          autoFilledCountRows += 1
        }
      }
    }

    const currentCount = parseNumber(countCell.value)
    const currentTotal = parseNumber(totalCell.value)

    if (r === 8) {
      if (cumulativeCheckCell.value !== '补断点') {
        cumulativeCheckCell.value = '√'
      }
      correctTotal = currentTotal
    } else if (correctTotal !== null && currentCount !== null && currentTotal !== null) {
      const expectedTotal: number = correctTotal + currentCount
      if (expectedTotal === currentTotal) {
        if (cumulativeCheckCell.value !== '补断点') {
          cumulativeCheckCell.value = '√'
        }
        correctTotal = currentTotal
      } else {
        if (cumulativeCheckCell.value !== '补断点') {
          cumulativeCheckCell.value = `× 应为${expectedTotal}`
        }
        correctTotal = expectedTotal
      }
    }

    if (r > 8) {
      const prevScore = parseScoreSpan(worksheet.getCell(`A${r - 1}`).value)
      if (prevScore !== null && score !== null) {
        const diff = prevScore.low - score.high
        if (scoreCheckCell.value !== '补断点') {
          scoreCheckCell.value = diff === 1 ? '√' : `× 差值${diff}`
        }
      } else if (scoreCheckCell.value !== '补断点') {
        scoreCheckCell.value = '× 分数非数字，无法校验'
      }
    } else if (scoreCheckCell.value !== '补断点') {
      scoreCheckCell.value = '√'
    }
  }

  return {
    yearCheck,
    insertedGapRows,
    autoFilledCountRows,
    extractedRows,
    sourceType,
    detectedFormat,
  }
}


export async function processSegmentationText(
  text: string,
  meta?: SegmentationMeta,
): Promise<SegmentationProcessResult> {
  const parsed = parseSegmentationPlainText(text, { level: meta?.level, province: normalizeMetaValue(meta?.province) })
  if (!parsed.rows.length) {
    throw new Error(parsed.warnings.join('；') || '未识别到有效的一分一段数据。请粘贴包含“分数 / 人数 / 累计人数”的表格文本或 OCR 结果。')
  }

  const workbook = buildWorkbookFromParsedRows(parsed.rows, meta)
  const summary = processLoadedWorkbook(
    workbook,
    meta,
    'paste',
    parsed.detectedFormat,
    parsed.rows.length,
  )

  const outBuffer = await writeXlsxBufferWithUniformFormatting(workbook)
  return {
    blob: new Blob([outBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    summary,
  }
}

export async function processSegmentationWorkbook(
  file: File,
  meta?: SegmentationMeta,
): Promise<SegmentationProcessResult> {
  await validateUploadFile(file, { allowedKinds: ['xlsx', 'xls', 'csv', 'pdf'] })
  const buffer = await file.arrayBuffer()
  const isPdf = shouldTreatAsPdf(file, buffer)
  const effectiveMeta = withFileInferredMeta(file, meta)
  const loaded = isPdf ? await buildWorkbookFromPdf(buffer, effectiveMeta) : await loadWorkbookFromExcel(file, buffer, effectiveMeta)

  const summary = processLoadedWorkbook(
    loaded.workbook,
    effectiveMeta,
    isPdf ? 'pdf' : 'excel',
    loaded.detectedFormat,
    loaded.extractedRows,
  )

  const exportWorkbook = buildPlainExportWorkbook(loaded.workbook, effectiveMeta)
  const outBuffer = await writeXlsxBufferWithUniformFormatting(exportWorkbook)
  return {
    blob: new Blob([outBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    summary,
  }
}
