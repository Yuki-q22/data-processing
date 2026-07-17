/**
 * 文件名称：库中导出专业分模板转换逻辑
 *
 * 文件作用：
 * - 将“库中导出专业分模板”转换为“专业分导入模板”
 * - 按 Word 规则处理 B2 招生年份、模板表头、选科要求、代码文本格式、层次转换
 *
 * 常改位置：
 * - SOURCE_REQUIRED_COLUMNS：源文件字段要求
 * - TEMPLATE_HEADERS：导出模板字段
 * - parseSubjectRequirement：选科要求 / 次选科目转换
 * - exportLibraryProfessionalScoreWorkbook：导出样式
 */

import ExcelJS from 'exceljs'
import { writeXlsxBufferWithUniformFormatting } from '../utils/excelExport'

export type LibraryProfessionalScoreExportRow = {
  学校名称: string
  省份: string
  招生专业: string
  '专业方向（选填）': string
  '专业备注（选填）': string
  一级层次: string
  招生科类: string
  招生批次: string
  '招生类型（选填）': string
  最高分: number | null
  最低分: number | null
  平均分: number | null
  '最低分位次（选填）': number | null
  '招生人数（选填）': number | null
  数据来源: string
  专业组代码: string
  首选科目: string
  选科要求: string
  次选科目: string
  专业代码: string
  招生代码: string
  最低分数区间低: string
  最低分数区间高: string
  最低分数区间位次低: string
  最低分数区间位次高: string
  '录取人数（选填）': number | null
}

export type LibraryProfessionalScorePreviewRow = LibraryProfessionalScoreExportRow & {
  rowId: string
  招生年份: string
  原始选科要求: string
}

export type LibraryProfessionalScoreProcessResult = {
  yearValue: string
  inputRowCount: number
  outputRowCount: number
  detectedHeaders: string[]
  missingColumns: string[]
  previewRows: LibraryProfessionalScorePreviewRow[]
  exportRows: LibraryProfessionalScoreExportRow[]
}

export const SOURCE_REQUIRED_COLUMNS = [
  '年份',
  '省份',
  '学校',
  '科类',
  '批次',
  '招生类型',
  '专业',
  '层次',
  '备注',
  '最高分',
  '平均分',
  '最低分',
  '最低分位次',
  '招生人数',
  '录取人数',
  '专业组代码',
  '专业组选科要求',
  '专业选科要求(新高考专业省份)',
  '招生代码',
  '专业代码',
  '数据来源',
]

export const TEMPLATE_HEADERS = [
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
] as const

const TEMPLATE_NOTE = `备注：请删除示例后再填写；
1.省份：必须填写各省份简称，例如：北京、内蒙古，不能带有市、省、自治区、空格、特殊字符等2.科类：浙江、上海限定“综合、艺术类、体育类”，内蒙古限定“文科、理科、蒙授文科、蒙授理科、艺术类、艺术文、艺术理、体育类、体育文、
体育理、蒙授艺术、蒙授体育”，其他省份限定“文科、理科、艺术类、艺术文、艺术理、体育类、体育文、体育理”
3.批次：（以下为19年使用批次）
河北、内蒙古、吉林、江苏、安徽、福建、江西、河南、湖北、广西、重庆、四川、贵州、云南、西藏、陕西、甘肃、宁夏、新疆限定本科提前批、
本科一批、本科二批、专科提前批、专科批、国家专项计划本科批、地方专项计划本科批；
黑龙江、湖南、青海限定本科提前批、本科一批、本科二批、本科三批、专科提前批、专科批、国家专项计划本科批、地方专项计划本科批；
山西限定本科一批A段、本科一批B段、本科二批A段、本科二批B段、本科二批C段、专科批、国家专项计划本科批、地方专项计划本科批；
浙江限定普通类提前批、平行录取一段、平行录取二段、平行录取三段
4.招生人数：仅能填写数字
5.最高分、最低分、平均分：仅能填写数字，保留小数后两位，且三者顺序不能改变，最低分为必填项，其中艺术类和体育类分数为文化课分数
6.一级层次：限定“本科、专科（高职）”，该部分为招生专业对应的专业层次
7.最低分位次：仅能填写数字;
8.数据来源：必须限定——官方考试院、大红本数据、学校官网、销售、抓取、圣达信、优志愿、学业桥
9.选科要求：不限科目专业组;多门选考;单科、多科均需选考
10.选科科目必须是科目的简写（物、化、生、历、地、政、技）
                    
11.2020北京、海南，17-19上海仅限制本科专业组代码必填
12.新八省首选科目必须选择（物理或历史）
13.分数区间仅限北京`

const LEGACY_NO_SUBJECT_PROVINCES = new Set(['新疆', '西藏'])
const SUBJECT_ORDER = ['物', '化', '生', '历', '地', '政', '技']

function t(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function toNumber(value: unknown): number | null {
  const text = t(value).replace(/,/g, '')
  if (!text) return null
  const num = Number(text)
  return Number.isNaN(num) ? null : num
}

function stripCaret(value: unknown): string {
  return t(value).replace(/\^/g, '')
}

function normalizeLevel(value: unknown): string {
  const text = t(value).replace(/（/g, '(').replace(/）/g, ')')
  if (text === '专科') return '专科(高职)'
  if (text === '专科(高职)') return '专科(高职)'
  return text
}

function deriveFirstSubject(category: string, province: string): string {
  if (LEGACY_NO_SUBJECT_PROVINCES.has(t(province))) return ''
  const text = t(category)
  if (text === '物理类' || text === '物理') return '物'
  if (text === '历史类' || text === '历史') return '历'
  return ''
}

function normalizeSubjectText(value: string): string {
  return value
    .replace(/思想政治/g, '政治')
    .replace(/技术/g, '技')
    .replace(/物理/g, '物')
    .replace(/化学/g, '化')
    .replace(/生物/g, '生')
    .replace(/历史/g, '历')
    .replace(/地理/g, '地')
    .replace(/政治/g, '政')
}

function uniqueSubjects(value: string): string {
  const text = normalizeSubjectText(value)
  return SUBJECT_ORDER.filter((subject) => text.includes(subject)).join('')
}

function getReselectionSegment(value: string): string {
  const text = t(value)
  const reselectionMatch = text.match(/再选\s*([^;；，。]*)/)
  if (reselectionMatch?.[1]) return reselectionMatch[1]
  return text
}

function parseSubjectRequirement(params: {
  province: string
  groupRequirement: string
  majorRequirement: string
}) {
  const province = t(params.province)
  if (LEGACY_NO_SUBJECT_PROVINCES.has(province)) {
    return { subjectRequirementMode: '', secondSubject: '' }
  }

  const raw = [params.groupRequirement, params.majorRequirement]
    .map(t)
    .filter(Boolean)
    .join(' ')

  if (!raw) {
    return { subjectRequirementMode: '', secondSubject: '' }
  }

  const segment = getReselectionSegment(raw)

  if (segment.includes('不限')) {
    return { subjectRequirementMode: '不限科目专业组', secondSubject: '' }
  }

  const secondSubject = uniqueSubjects(segment)
  if (!secondSubject) {
    return { subjectRequirementMode: '', secondSubject: '' }
  }

  const requiredMode = /必选|均需|均须|必须|均应|都选/.test(segment)
  const choiceMode = /[/／]|\bOR\b|或|[23]\s*选\s*1|选考其中|任选|任意/.test(segment)

  return {
    subjectRequirementMode: !requiredMode && choiceMode ? '多门选考' : '单科、多科均需选考',
    secondSubject,
  }
}

export function processLibraryProfessionalScoreRows(
  rows: Record<string, unknown>[]
): LibraryProfessionalScoreProcessResult {
  const detectedHeaders = rows.length ? Object.keys(rows[0]) : []
  const missingColumns = SOURCE_REQUIRED_COLUMNS.filter((col) => !detectedHeaders.includes(col))
  const yearValue = rows.map((row) => t(row['年份'])).find(Boolean) || ''

  if (missingColumns.length > 0) {
    return {
      yearValue,
      inputRowCount: rows.length,
      outputRowCount: 0,
      detectedHeaders,
      missingColumns,
      previewRows: [],
      exportRows: [],
    }
  }

  const previewRows: LibraryProfessionalScorePreviewRow[] = rows.map((row, rowNo) => {
    const province = t(row['省份'])
    const category = t(row['科类'])
    const groupRequirement = t(row['专业组选科要求'])
    const majorRequirement = t(row['专业选科要求(新高考专业省份)'])
    const subjectRequirement = parseSubjectRequirement({
      province,
      groupRequirement,
      majorRequirement,
    })

    const exportRow: LibraryProfessionalScoreExportRow = {
      学校名称: t(row['学校']),
      省份: province,
      招生专业: t(row['专业']),
      '专业方向（选填）': t(row['方向']),
      '专业备注（选填）': t(row['备注']),
      一级层次: normalizeLevel(row['层次']),
      招生科类: category,
      招生批次: t(row['批次']),
      '招生类型（选填）': t(row['招生类型']),
      最高分: toNumber(row['最高分']),
      最低分: toNumber(row['最低分']),
      平均分: toNumber(row['平均分']),
      '最低分位次（选填）': toNumber(row['最低分位次']),
      '招生人数（选填）': toNumber(row['招生人数']),
      数据来源: t(row['数据来源']),
      专业组代码: stripCaret(row['专业组代码']),
      首选科目: deriveFirstSubject(category, province),
      选科要求: subjectRequirement.subjectRequirementMode,
      次选科目: subjectRequirement.secondSubject,
      专业代码: stripCaret(row['专业代码']),
      招生代码: stripCaret(row['招生代码']),
      最低分数区间低: '',
      最低分数区间高: '',
      最低分数区间位次低: '',
      最低分数区间位次高: '',
      '录取人数（选填）': toNumber(row['录取人数']),
    }

    return {
      rowId: String(rowNo + 1),
      招生年份: t(row['年份']),
      原始选科要求: [groupRequirement, majorRequirement].filter(Boolean).join(' / '),
      ...exportRow,
    }
  })

  return {
    yearValue,
    inputRowCount: rows.length,
    outputRowCount: previewRows.length,
    detectedHeaders,
    missingColumns,
    previewRows,
    exportRows: previewRows.map((row) => ({
      学校名称: row.学校名称,
      省份: row.省份,
      招生专业: row.招生专业,
      '专业方向（选填）': row['专业方向（选填）'],
      '专业备注（选填）': row['专业备注（选填）'],
      一级层次: row.一级层次,
      招生科类: row.招生科类,
      招生批次: row.招生批次,
      '招生类型（选填）': row['招生类型（选填）'],
      最高分: row.最高分,
      最低分: row.最低分,
      平均分: row.平均分,
      '最低分位次（选填）': row['最低分位次（选填）'],
      '招生人数（选填）': row['招生人数（选填）'],
      数据来源: row.数据来源,
      专业组代码: row.专业组代码,
      首选科目: row.首选科目,
      选科要求: row.选科要求,
      次选科目: row.次选科目,
      专业代码: row.专业代码,
      招生代码: row.招生代码,
      最低分数区间低: row.最低分数区间低,
      最低分数区间高: row.最低分数区间高,
      最低分数区间位次低: row.最低分数区间位次低,
      最低分数区间位次高: row.最低分数区间位次高,
      '录取人数（选填）': row['录取人数（选填）'],
    })),
  }
}

export async function exportLibraryProfessionalScoreWorkbook(params: {
  exportRows: LibraryProfessionalScoreExportRow[]
  yearValue: string
}) {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('专业分导入模板')

  worksheet.mergeCells('A1:U1')
  const noteCell = worksheet.getCell('A1')
  noteCell.value = TEMPLATE_NOTE
  noteCell.font = { color: { argb: 'FFFF0000' }, size: 11 }
  noteCell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' }
  worksheet.getRow(1).height = 350

  worksheet.getCell('A2').value = '招生年份'
  worksheet.getCell('B2').value = /^\d+$/.test(params.yearValue)
    ? Number(params.yearValue)
    : params.yearValue
  worksheet.getCell('C2').value = null
  worksheet.getCell('D2').value = null

  TEMPLATE_HEADERS.forEach((header, index) => {
    const cell = worksheet.getCell(3, index + 1)
    cell.value = header
    cell.font = { bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false }
  })

  const textHeaders = new Set(['专业组代码', '专业代码', '招生代码', '首选科目', '选科要求', '次选科目'])
  const scoreHeaders = new Set(['最高分', '最低分', '平均分'])

  params.exportRows.forEach((row, rowIndex) => {
    TEMPLATE_HEADERS.forEach((header, colIndex) => {
      const cell = worksheet.getCell(rowIndex + 4, colIndex + 1)
      const value = row[header]

      if (textHeaders.has(header)) {
        cell.numFmt = '@'
        cell.value = String(value ?? '')
      } else {
        cell.value = value as string | number | null
      }

      if (scoreHeaders.has(header)) {
        cell.numFmt = '0.00'
      }

      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })
  })

  const widths = [20, 12, 22, 18, 22, 14, 14, 16, 16, 10, 10, 10, 14, 14, 14, 14, 10, 18, 12, 14, 14, 16, 16, 18, 18, 14]
  widths.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width
  })

  const buffer = await writeXlsxBufferWithUniformFormatting(workbook)
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
