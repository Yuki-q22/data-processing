import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import * as pdfjsLib from 'pdfjs-dist'
import { parseSegmentationTableRows, parseSegmentationText as parseSegmentationPlainText, type SegmentationParsedRow } from './segmentationParsers'
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
  cumulative: number
}

type ScoreSegmentRow = {
  score: number
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

function setGapRowFill(worksheet: ExcelJS.Worksheet, row: number, fill: ExcelJS.Fill) {
  ;['A', 'B', 'C', 'E', 'F'].forEach((col) => {
    worksheet.getCell(`${col}${row}`).fill = fill
  })
}

function getFullScoreByProvince(province: string) {
  if (province === '上海') return 660
  if (province === '海南') return 900
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

function getRowNumbers(row: PdfRow) {
  return getRowNumberItems(row).map((item) => ({
    x: item.x,
    text: item.text,
    value: item.value,
  }))
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
  if (text.includes('吉林')) return '吉林'
  if (text.includes('贵州')) return '贵州'
  if (text.includes('上海')) return '上海'
  if (text.includes('海南')) return '海南'
  return ''
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
    const numbers = getRowNumbers(row).map((item) => item.value)
    if (numbers.length < 2) return

    const score = numbers[0]
    const cumulative = numbers[1]
    if (score >= 0 && score <= 1000 && cumulative >= 0) {
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
      segment,
      cumulative: row.cumulative,
    }
  })
}

async function buildWorkbookFromPdf(buffer: ArrayBuffer, meta?: SegmentationMeta) {
  const rows = await readPdfRowsFromBuffer(buffer)
  const inputProvince = normalizeMetaValue(meta?.province)
  const inferredProvince = inferProvinceFromRows(rows)
  const province = inputProvince || inferredProvince
  const fullScore = getFullScoreByProvince(province)

  const jilinRows = province === '贵州' ? [] : filterRowsByFullScore(parseJilinFromRows(rows, fullScore), fullScore)
  const guizhouRows = province === '吉林' ? [] : filterRowsByFullScore(parseGuizhouFromRows(rows, fullScore), fullScore)
  const directRows = province ? [] : filterRowsByFullScore(parseDirectFromRows(rows), fullScore)

  const candidates = [
    { format: 'jilin', rows: jilinRows, priority: province === '吉林' ? 10000 : inferredProvince === '吉林' ? 5000 : 0 },
    { format: 'horizontal_multiline', rows: guizhouRows, priority: province === '贵州' ? 10000 : inferredProvince === '贵州' ? 5000 : 0 },
    { format: 'direct', rows: directRows, priority: -1000 },
  ].filter((item) => item.rows.length)

  if (!candidates.length) {
    throw new Error('PDF 未识别到有效的一分一段数据。当前仅保留原有文本型 PDF 识别能力；图片型 PDF、扫描件或复杂表格请先用外部 OCR 识别为表格文本，再粘贴到本页面处理。')
  }

  const selected = candidates.sort((a, b) => (b.priority + b.rows.length) - (a.priority + a.rows.length))[0]
  const built = buildWorkbookFromCumulativeRows(selected.rows, meta)

  if (!inputProvince && inferredProvince) {
    built.workbook.worksheets[0].getCell('B3').value = inferredProvince
  }

  return {
    workbook: built.workbook,
    detectedFormat: selected.format,
    extractedRows: built.extractedRows,
  }
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

function isTemplateLikeWorksheet(worksheet: ExcelJS.Worksheet) {
  const scoreHeader = normalizeText(getPlainCellValue(worksheet.getCell('A7').value)).replace(/\s+/g, '')
  const countHeader = normalizeText(getPlainCellValue(worksheet.getCell('B7').value)).replace(/\s+/g, '')
  const cumulativeHeader = normalizeText(getPlainCellValue(worksheet.getCell('C7').value)).replace(/\s+/g, '')

  if (/分数|总分|成绩/.test(scoreHeader) && /人数/.test(countHeader) && /累计/.test(cumulativeHeader)) {
    return true
  }

  const firstScore = parseScoreNumber(worksheet.getCell('A8').value)
  const firstCumulative = parseNumber(worksheet.getCell('C8').value)
  return firstScore !== null && firstCumulative !== null
}

function buildWorkbookFromParsedRows(rows: SegmentationParsedRow[], meta?: SegmentationMeta, sheetName = '一分一段') {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(sheetName)

  applyTemplateHeaders(worksheet)
  applyMetaToWorksheet(worksheet, meta)

  rows.forEach((item, index) => {
    const row = index + 8
    worksheet.getCell(`A${row}`).value = item.score
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
    worksheet.getCell(`A${row}`).value = item.score
    worksheet.getCell(`B${row}`).value = item.segment
    worksheet.getCell(`C${row}`).value = item.cumulative
  })

  return { workbook, extractedRows: convertedRows.length }
}

async function loadWorkbookFromExcel(file: File, buffer: ArrayBuffer, meta?: SegmentationMeta) {
  let workbook: ExcelJS.Workbook

  if (isZipBuffer(buffer)) {
    try {
      workbook = await loadWorkbookByExcelJs(buffer)
    } catch (error) {
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

  if (isTemplateLikeWorksheet(worksheet)) {
    applyTemplateHeaders(worksheet)
    applyMetaToWorksheet(worksheet, meta)

    return {
      workbook,
      detectedFormat: isZipBuffer(buffer) ? 'excel-template-xlsx' : isOleExcelBuffer(buffer) ? 'excel-template-xls' : 'excel-template',
      extractedRows: Math.max(0, worksheet.rowCount - 7),
    }
  }

  const parsed = parseSegmentationTableRows(worksheetToGrid(worksheet), { level: meta?.level })
  if (!parsed.rows.length) {
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
  const fullScore = getFullScoreByProvince(province)

  let insertedGapRows = 0
  let autoFilledCountRows = 0

  // ---------- 第8行特殊处理 ----------
  let row = 8
  const firstScore = parseScoreNumber(worksheet.getCell(`A${row}`).value)
  const firstTotal = parseNumber(worksheet.getCell(`C${row}`).value)

  if (firstScore !== null) {
    if (firstTotal !== null && isEmpty(worksheet.getCell(`B${row}`).value)) {
      worksheet.getCell(`B${row}`).value = firstTotal
      autoFilledCountRows += 1
    }

    const normalizedFirstCount = parseNumber(worksheet.getCell(`B${row}`).value)
    const normalizedFirstTotal = parseNumber(worksheet.getCell(`C${row}`).value)

    if (normalizedFirstCount !== null && normalizedFirstTotal !== null && normalizedFirstCount !== normalizedFirstTotal) {
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

  // ---------- 补断点逻辑 ----------
  while (row < worksheet.rowCount) {
    const currScore = parseScoreNumber(worksheet.getCell(`A${row}`).value)
    const nextScore = parseScoreNumber(worksheet.getCell(`A${row + 1}`).value)

    if (currScore !== null && nextScore !== null && currScore - nextScore > 1) {
      const missingScore = currScore - 1
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

    const score = parseScoreNumber(scoreCell.value)
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
      const prevScore = parseScoreNumber(worksheet.getCell(`A${r - 1}`).value)
      if (prevScore !== null && score !== null) {
        const diff = prevScore - score
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
  const parsed = parseSegmentationPlainText(text, { level: meta?.level })
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

  const outBuffer = await workbook.xlsx.writeBuffer()
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
  const buffer = await file.arrayBuffer()
  const isPdf = shouldTreatAsPdf(file, buffer)
  const loaded = isPdf ? await buildWorkbookFromPdf(buffer, meta) : await loadWorkbookFromExcel(file, buffer, meta)

  const summary = processLoadedWorkbook(
    loaded.workbook,
    meta,
    isPdf ? 'pdf' : 'excel',
    loaded.detectedFormat,
    loaded.extractedRows,
  )

  const outBuffer = await loaded.workbook.xlsx.writeBuffer()
  return {
    blob: new Blob([outBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    summary,
  }
}
