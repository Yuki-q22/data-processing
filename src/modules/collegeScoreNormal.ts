import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'

export type NormalCollegeScoreOutputRow = {
  学校名称: string
  省份: string
  招生类别: string
  招生批次: string
  招生类型: string
  选测等级: string
  最高分: number | null
  最低分: number | null
  平均分: number | null
  最高位次: number | null
  最低位次: number | null
  平均位次: number | null
  录取人数: number | null
  招生人数: number | null
  数据来源: string
  省控线科类: string
  省控线批次: string
  省控线备注: string
  专业组代码: string
  首选科目: string
  院校招生代码: string
}

export type NormalCollegeScoreProcessResult = {
  year: string
  inputRowCount: number
  outputRowCount: number
  rows: NormalCollegeScoreOutputRow[]
  missingColumns: string[]
  detectedHeaders: string[]
}

const EXPECTED_COLUMNS = [
  '学校名称',
  '省份',
  '招生专业',
  '专业方向（选填）',
  '专业备注（选填）',
  '一级层次',
  '招生科类',
  '招生批次',
  '招生类型（选填）',
  '最高分',
  '最低分',
  '平均分',
  '最低分位次（选填）',
  '招生人数（选填）',
  '数据来源',
  '专业组代码',
  '首选科目',
  '选科要求',
  '次选科目',
  '专业代码',
  '招生代码',
  '最低分数区间低',
  '最低分数区间高',
  '最低分数区间位次低',
  '最低分数区间位次高',
  '录取人数（选填）',
]

const OUTPUT_HEADERS = [
  '学校名称',
  '省份',
  '招生类别',
  '招生批次',
  '招生类型',
  '选测等级',
  '最高分',
  '最低分',
  '平均分',
  '最高位次',
  '最低位次',
  '平均位次',
  '录取人数',
  '招生人数',
  '数据来源',
  '省控线科类',
  '省控线批次',
  '省控线备注',
  '专业组代码',
  '首选科目',
  '院校招生代码',
] as const

const TEMPLATE_NOTE = `备注：请删除示例后再填写；

1.省份：必须填写各省份简称，例如：北京、内蒙古，不能带有市、省、自治区、空格、特殊字符等

2.科类：浙江、上海限定“综合、艺术类、体育类”，内蒙古限定“文科、理科、蒙授文科、蒙授理科、艺术类、艺术文、艺术理、体育类、体育文、体育理、蒙授艺术、蒙授体育”，其他省份限定“文科、理科、艺术类、艺术文、艺术理、体育类、体育文、体育理”

3.批次：（以下为19年使用批次）

    北京、天津、辽宁、上海、山东、广东、海南限定本科提前批、本科批、专科提前批、专科批、国家专项计划本科批、地方专项计划本科批；

    河北、内蒙古、吉林、江苏、安徽、福建、江西、河南、湖北、广西、重庆、四川、贵州、云南、西藏、陕西、甘肃、宁夏、新疆限定本科提前批、本科一批、本科二批、专科提前批、专科批、国家专项计划本科批、地方专项计划本科批；

    黑龙江、湖南、青海限定本科提前批、本科一批、本科二批、本科三批、专科提前批、专科批、国家专项计划本科批、地方专项计划本科批；

    山西限定本科一批A段、本科一批B段、本科二批A段、本科二批B段、本科二批C段、专科批、国家专项计划本科批、地方专项计划本科批；

    浙江限定普通类提前批、平行录取一段、平行录取二段、平行录取三段

4.最高分、最低分、平均分：仅能填写数字（最多保留2位小数），且三者顺序不能改变，最低分为必填项，其中艺术类和体育类分数为文化课分数

5.最低分位次：仅能填写数字

6.录取人数：仅能填写数字

7.首选科目：新八省必填，只能填写（历史或物理）`

type InputRow = Record<string, unknown> & {
  __rowNo: number
  __highestScore: number | null
  __lowestScore: number | null
  __avgScore: number | null
  __lowestRank: number | null
  __enrollCount: number | null
  __admitCount: number | null
  __normalizedFirstSubject: string
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
  return text
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

function buildGroupKey(row: InputRow): string {
  const base = [
    t(row['学校名称']),
    t(row['省份']),
    t(row['一级层次']),
    t(row['招生科类']),
    t(row['招生批次']),
    t(row['招生类型（选填）']),
  ]

  const groupCode = t(row['专业组代码'])
  if (groupCode) {
    return [...base, groupCode].join('||')
  }

  return base.join('||')
}

function maxNullable(values: Array<number | null>): number | null {
  const valid = values.filter((item): item is number => item !== null)
  if (!valid.length) return null
  return Math.max(...valid)
}

function sumNullable(values: Array<number | null>): number | null {
  const valid = values.filter((item): item is number => item !== null)
  if (!valid.length) return null
  return valid.reduce((sum, item) => sum + item, 0)
}

function processRows(rows: Record<string, unknown>[]): NormalCollegeScoreOutputRow[] {
  const normalizedRows: InputRow[] = rows
    .map((row, rowNo) => ({
      ...row,
      __rowNo: rowNo,
      __highestScore: toNumber(row['最高分']),
      __lowestScore: toNumber(row['最低分']),
      __avgScore: toNumber(row['平均分']),
      __lowestRank: toNumber(row['最低分位次（选填）']),
      __enrollCount: toNumber(row['招生人数（选填）']),
      __admitCount: toNumber(row['录取人数（选填）']),
      __normalizedFirstSubject: normalizeFirstSubject(row['首选科目']),
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

  const output: Array<NormalCollegeScoreOutputRow & { __sortNo: number }> = []

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
      招生类别: t(representative['招生科类']),
      招生批次: t(representative['招生批次']),
      招生类型: t(representative['招生类型（选填）']),
      选测等级: '',
      最高分: maxNullable(groupRows.map((row) => row.__highestScore)),
      最低分: representative.__lowestScore,
      平均分: representative.__avgScore,
      最高位次: null,
      最低位次: representative.__lowestRank,
      平均位次: null,
      录取人数: sumNullable(groupRows.map((row) => row.__admitCount)),
      招生人数: sumNullable(groupRows.map((row) => row.__enrollCount)),
      数据来源: t(representative['数据来源']),
      省控线科类: '',
      省控线批次: '',
      省控线备注: '',
      专业组代码: t(representative['专业组代码']),
      首选科目: representative.__normalizedFirstSubject,
      院校招生代码: t(representative['招生代码']),
      __sortNo: representative.__rowNo,
    })
  }

  return output
    .sort((a, b) => a.__sortNo - b.__sortNo)
    .map(({ __sortNo, ...rest }) => rest)
}

export function processNormalCollegeScoreWorkbook(
  workbook: XLSX.WorkBook,
  sheetName: string
): NormalCollegeScoreProcessResult {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    throw new Error('未找到所选 Sheet')
  }

  const year = getCellText(sheet, 'B2')
  const detectedHeaders = readHeaders(sheet)
  const missingColumns = EXPECTED_COLUMNS.filter((col) => !detectedHeaders.includes(col))

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

export async function exportNormalCollegeScoreWorkbook(
  result: NormalCollegeScoreProcessResult
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('院校分提取结果')

  ws.mergeCells('A1:U1')
  const noteCell = ws.getCell('A1')
  noteCell.value = TEMPLATE_NOTE
  noteCell.font = { color: { argb: 'FFFF0000' }, size: 11 }
  noteCell.alignment = {
    wrapText: true,
    vertical: 'top',
    horizontal: 'left',
  }
  ws.getRow(1).height = 350

  ws.getCell('A2').value = '招生年'
  ws.getCell('B2').value = result.year
  ws.getCell('C2').value = 1
  ws.getCell('D2').value = '模板类型（模板标识不要更改）'

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

      if (header === '专业组代码' || header === '院校招生代码') {
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
    E: 14,
    F: 10,
    G: 10,
    H: 10,
    I: 10,
    J: 10,
    K: 10,
    L: 10,
    M: 10,
    N: 10,
    O: 12,
    P: 12,
    Q: 12,
    R: 12,
    S: 14,
    T: 10,
    U: 14,
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