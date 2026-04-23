import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'

export type ArtCollegeScoreOutputRow = {
  学校名称: string
  省份: string
  招生类别: string
  招生批次: string
  专业类别: string
  投档分: number | null
  位次: number | null
  招生代码: string
  专业组: string
  备注: string
  是否校考: string
}

export type ArtCollegeScoreProcessResult = {
  year: string
  inputRowCount: number
  outputRowCount: number
  rows: ArtCollegeScoreOutputRow[]
  missingColumns: string[]
  detectedHeaders: string[]
}

const EXPECTED_NEW_COLUMNS = [
  '学校名称',
  '省份',
  '专业',
  '专业方向（选填）',
  '专业备注（选填）',
  '专业层次',
  '专业类别',
  '是否校考',
  '招生类别',
  '招生批次',
  '最低分',
  '最低分位次（选填）',
  '专业组代码',
  '首选科目',
  '选科要求',
  '次选科目',
  '招生代码',
  '校统考分',
  '校文化分',
  '专业代码',
  '数据来源',
]

const OUTPUT_HEADERS = [
  '学校名称',
  '省份',
  '招生类别',
  '招生批次',
  '专业类别',
  '投档分',
  '位次',
  '招生代码',
  '专业组',
  '备注',
  '是否校考',
] as const

const TEMPLATE_NOTE = `备注：请删除示例后再填写；

1.省份：必须填写各省份简称，例如：北京、内蒙古，不能带有市、省、自治区、空格、特殊字符等

2.最低分位次：仅能填写数字

3.录取人数：仅能填写数字

4.是否校考：有效值【是，否】，不填写或不在有效值中默认'否'`

type InputRow = Record<string, unknown> & {
  __rowNo: number
  __lowestScore: number | null
  __rank: number | null
  __schoolExamScore: number | null
  __cultureScore: number | null
  __normalizedFirstSubject: string
  __normalizedExamFlag: string
}

function t(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function toNumber(value: unknown): number | null {
  const text = t(value).replace(/,/g, '')
  if (!text) return null
  const n = Number(text)
  return Number.isNaN(n) ? null : n
}

function normalizeFirstSubject(value: unknown): string {
  const text = t(value)
  if (text === '物') return '物理'
  if (text === '历') return '历史'
  if (text === '物理') return '物理'
  if (text === '历史') return '历史'
  if (text === '不分科类' || text === '文科' || text === '理科' || text === '综合') return text
  return text
}

function normalizeExamFlag(value: unknown): string {
  const text = t(value)

  // 空白则保持空白
  if (!text) return ''

  // 仅保留有效值
  if (text === '是' || text === '否') return text

  // 其他异常值仍按“否”处理
  return '否'
}

function getCellText(sheet: XLSX.WorkSheet, address: string): string {
  const cell = sheet[address]
  if (!cell) return ''
  if ('w' in cell && cell.w) return String(cell.w).trim()
  return t(cell.v)
}

function readHeaders(sheet: XLSX.WorkSheet): string[] {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  })
  const headerRow = aoa[2] || []
  return headerRow.map((item) => t(item)).filter(Boolean)
}

function buildRemark(row: Record<string, unknown>) {
  const majorRemark = t(row['专业备注（选填）'])
  const majorDirection = t(row['专业方向（选填）'])

  if (majorRemark && majorDirection) {
    return `${majorRemark}；${majorDirection}`
  }
  if (majorRemark) return majorRemark
  if (majorDirection) return majorDirection
  return ''
}

function buildGroupKey(row: InputRow): string {
  const base = [
    t(row['学校名称']),
    t(row['省份']),
    t(row['专业方向（选填）']),
    t(row['专业层次']),
    t(row['专业类别']),
    t(row['招生类别']),
    t(row['招生批次']),
  ]

  const groupCode = t(row['专业组代码'])
  if (groupCode) {
    return [...base, groupCode].join('||')
  }

  return base.join('||')
}

function processRows(rows: Record<string, unknown>[]): ArtCollegeScoreOutputRow[] {
  const normalizedRows: InputRow[] = rows
    .map((row, rowNo) => ({
      ...row,
      __rowNo: rowNo,
      __lowestScore: toNumber(row['最低分']),
      __rank: toNumber(row['最低分位次（选填）']),
      __schoolExamScore: toNumber(row['校统考分']),
      __cultureScore: toNumber(row['校文化分']),
      __normalizedFirstSubject: normalizeFirstSubject(row['首选科目']),
      __normalizedExamFlag: normalizeExamFlag(row['是否校考']),
    }))
    .filter((row) => row.__lowestScore !== null)

  const grouped = new Map<string, InputRow[]>()

  normalizedRows.forEach((row) => {
    const key = buildGroupKey(row)
    if (!grouped.has(key)) {
      grouped.set(key, [])
    }
    grouped.get(key)!.push(row)
  })

  const output: Array<ArtCollegeScoreOutputRow & { __sortNo: number }> = []

  for (const [, groupRows] of grouped) {
    const sorted = [...groupRows].sort((a, b) => {
      const aScore = a.__lowestScore ?? Number.POSITIVE_INFINITY
      const bScore = b.__lowestScore ?? Number.POSITIVE_INFINITY
      if (aScore !== bScore) return aScore - bScore
      return a.__rowNo - b.__rowNo
    })

    const representative = sorted[0]

    output.push({
      学校名称: t(representative['学校名称']),
      省份: t(representative['省份']),
      招生类别: t(representative['招生类别']),
      招生批次: t(representative['招生批次']),
      专业类别: t(representative['专业类别']),
      投档分: representative.__lowestScore,
      位次: representative.__rank,
      招生代码: t(representative['招生代码']),
      专业组: t(representative['专业组代码']),
      备注: buildRemark(representative),
      是否校考: representative.__normalizedExamFlag,
      __sortNo: representative.__rowNo,
    })
  }

  return output
    .sort((a, b) => a.__sortNo - b.__sortNo)
    .map(({ __sortNo, ...rest }) => rest)
}

export function processArtCollegeScoreWorkbook(
  workbook: XLSX.WorkBook,
  sheetName: string
): ArtCollegeScoreProcessResult {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    throw new Error('未找到所选 Sheet')
  }

  const year = getCellText(sheet, 'B2')
  const detectedHeaders = readHeaders(sheet)
  const missingColumns = EXPECTED_NEW_COLUMNS.filter((col) => !detectedHeaders.includes(col))

  if (missingColumns.length > 0) {
    return {
      year,
      inputRowCount: 0,
      outputRowCount: 0,
      rows: [],
      missingColumns,
      detectedHeaders,
    }
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    range: 2,
    raw: false,
    defval: '',
  })

  const outputRows = processRows(rows)

  return {
    year,
    inputRowCount: rows.length,
    outputRowCount: outputRows.length,
    rows: outputRows,
    missingColumns,
    detectedHeaders,
  }
}

export async function exportArtCollegeScoreWorkbook(
  result: ArtCollegeScoreProcessResult
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('院校分提取结果')

  ws.mergeCells('A1:K1')
  const noteCell = ws.getCell('A1')
  noteCell.value = TEMPLATE_NOTE
  noteCell.font = { color: { argb: 'FFFF0000' }, size: 11 }
  noteCell.alignment = {
    wrapText: true,
    vertical: 'top',
    horizontal: 'left',
  }
  ws.getRow(1).height = 90

  ws.getCell('A2').value = '招生年'
  ws.getCell('B2').value = result.year

  OUTPUT_HEADERS.forEach((header, headerNo) => {
    const cell = ws.getCell(3, headerNo + 1)
    cell.value = header
    cell.font = { bold: true }
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
    }
  })

  result.rows.forEach((row, rowNo) => {
    OUTPUT_HEADERS.forEach((header, colNo) => {
      const cell = ws.getCell(rowNo + 4, colNo + 1)
      const value = row[header]

      if (header === '招生代码' || header === '专业组') {
        cell.numFmt = '@'
        cell.value = String(value ?? '')
      } else {
        cell.value = value as string | number | null
      }

      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
      }
    })
  })

  const widths: Record<string, number> = {
    A: 18,
    B: 10,
    C: 12,
    D: 14,
    E: 12,
    F: 10,
    G: 10,
    H: 14,
    I: 14,
    J: 24,
    K: 10,
  }

  Object.entries(widths).forEach(([col, width]) => {
    ws.getColumn(col).width = width
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}