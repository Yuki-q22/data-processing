import ExcelJS from 'exceljs'
import { writeXlsxBufferWithUniformFormatting } from '../utils/excelExport'
import {
  buildMajorComboForRuleCenter,
  normalizeMajorComboForRuleCenter,
  normalizeMajorForRuleCenter,
  validateSchoolAndMajorComboDetailed,
} from './ruleCenterValidation'

export type XueyeqiaoPlanExportRow = {
  学校名称: string
  省份: string
  招生专业: string
  专业方向: string
  专业备注: string
  一级层次: string
  招生科类: string
  招生批次: string
  招生类型: string
  招生代码: string
  招生人数: number | null
  专业学制: number | null
  学费: number | null
  数据来源: string
  专业组代码: string
  首选科目: string
  选科要求: string
  次选科目: string
  专业代码: string
  学费单位: string
  批次备注: string
}

export type XueyeqiaoPlanPreviewRow = XueyeqiaoPlanExportRow & {
  rowId: string
  招生年份: string
  原始报考要求: string
  学校名称校验结果: string
  专业名称校验结果: string
}

export type XueyeqiaoPlanProcessResult = {
  yearValue: string
  inputRowCount: number
  outputRowCount: number
  detectedHeaders: string[]
  missingColumns: string[]
  previewRows: XueyeqiaoPlanPreviewRow[]
  exportRows: XueyeqiaoPlanExportRow[]
}

const SOURCE_REQUIRED_COLUMNS = [
  '数据类型',
  '年份',
  '省份',
  '批次',
  '科类',
  '院校名称',
  '院校原始名称',
  '招生代码',
  '专业组编号',
  '专业代码',
  '招生类型',
  '专业名称',
  '专业类别',
  '报考要求',
  '专业层次',
  '专业备注',
  '学年',
  '学费',
  '学费单位',
  '招生计划人数',
]

export const XUEYEQIAO_PLAN_TEMPLATE_HEADERS = [
  '学校名称',
  '省份',
  '招生专业',
  '专业方向',
  '专业备注',
  '一级层次',
  '招生科类',
  '招生批次',
  '招生类型',
  '招生代码',
  '招生人数',
  '专业学制',
  '学费',
  '数据来源',
  '专业组代码',
  '首选科目',
  '选科要求',
  '次选科目',
  '专业代码',
  '学费单位',
  '批次备注',
] as const

const TEMPLATE_NOTE = `备注：请删除示例后再填写；
1.省份：必须填写各省份简称，例如：北京、内蒙古，不能带有市、省、自治区、空格、特殊字符等
2.科类：浙江、上海限定“综合、艺术类、体育类”，内蒙古限定“文科、理科、蒙授文科、蒙授理科、艺术类、艺术文、艺术理、体育类、体育文、体育理、蒙授艺术、蒙授体育”，其他省份限定“文科、理科、艺术类、艺术文、艺术理、体育类、体育文、体育理”
3.批次：（以下为19年使用批次）
北京、天津、辽宁、上海、山东、广东、海南限定本科提前批、本科批、专科提前批、专科批、国家专项计划本科批、地方专项计划本科批；
河北、内蒙古、吉林、江苏、安徽、福建、江西、河南、湖北、广西、重庆、四川、贵州、云南、西藏、陕西、甘肃、宁夏、新疆限定本科提前批、本科一批、本科二批、专科提前批、专科批、国家专项计划本科批、地方专项计划本科批；黑龙江、湖南、青海限定本科提前批、本科一批、本科二批、本科三批、专科提前批、专科批、国家专项计划本科批、地方专项计划本科批；
浙江限定普通类提前批、平行录取一段、平行录取二段、平行录取三段4.招生人数：仅能填写数字
5.学制：仅能填写数字
6.一级层次：限定“本科(普通)、专科(高职)”，该部分为招生专业对应的专业层次
7.数据来源：必须限定这五种——官方考试院、大红本数据、学校官网、销售、抓取
8.选科要求：不限科目专业组;多门选考;单科、多科均需选考
9.选科科目必须是科目的简写（物、化、生、历、地、政、技）
10.2020北京、海南，17-19上海仅限制本科专业组代码必填
11.新八省必须选择新八省首选科目（物理或历史）`

const NO_GROUP_CODE_PROVINCES = new Set([
  '河北',
  '辽宁',
  '山东',
  '浙江',
  '重庆',
  '贵州',
  '青海',
  '新疆',
  '西藏',
])

const GROUP_CODE_EQUALS_ENROLLMENT_CODE_PROVINCES = new Set([
  '湖北',
  '江苏',
  '上海',
  '海南',
  '天津',
])

const SUBJECT_SHORT_MAP: Record<string, string> = {
  物理: '物',
  化学: '化',
  生物: '生',
  历史: '历',
  地理: '地',
  政治: '政',
  思想政治: '政',
  技术: '技',
  物: '物',
  化: '化',
  生: '生',
  历: '历',
  地: '地',
  政: '政',
  技: '技',
}

const SUBJECT_ORDER = ['物', '化', '生', '历', '地', '政', '技']
const VOCATIONAL_REMARK_KEYWORDS = ['职业教育本科', '本科层次职业教育', '职业本科']

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

function normalizeCategory(raw: unknown) {
  const text = t(raw)
  if (text === '物理' || text === '物理类') return '物理类'
  if (text === '历史' || text === '历史类') return '历史类'
  return text
}

function deriveFirstSubject(category: string) {
  if (category === '物理类') return '物'
  if (category === '历史类') return '历'
  return ''
}

function normalizeSubjects(value: string) {
  let text = value
  Object.entries(SUBJECT_SHORT_MAP)
    .sort(([a], [b]) => b.length - a.length)
    .forEach(([from, to]) => {
      text = text.replaceAll(from, to)
    })

  const compact = text.replace(/\s/g, '')
  const subjects = SUBJECT_ORDER.filter((subject) => compact.includes(subject))
  return subjects.join('') || compact
}

function parseApplyRequirement(value: unknown) {
  const raw = t(value)
  if (!raw) return { subjectRequirementMode: '', secondSubject: '' }
  if (raw.includes('不限')) {
    return { subjectRequirementMode: '不限科目专业组', secondSubject: '' }
  }

  if (raw.length === 1) {
    return { subjectRequirementMode: '单科、多科均需选考', secondSubject: raw }
  }

  if (raw.includes('且')) {
    return {
      subjectRequirementMode: '单科、多科均需选考',
      secondSubject: normalizeSubjects(raw.replace(/且/g, '')),
    }
  }

  if (raw.includes('或')) {
    return {
      subjectRequirementMode: '多门选考',
      secondSubject: normalizeSubjects(raw.replace(/或/g, '')),
    }
  }

  return {
    subjectRequirementMode: '单科、多科均需选考',
    secondSubject: normalizeSubjects(raw),
  }
}

function buildGroupCode(province: string, enrollmentCode: string, groupNo: string) {
  const p = t(province)
  const code = stripCaret(enrollmentCode)
  const group = stripCaret(groupNo)

  if (NO_GROUP_CODE_PROVINCES.has(p)) return ''
  if (p === '吉林') return code && group ? `${code}${group}` : ''
  if (GROUP_CODE_EQUALS_ENROLLMENT_CODE_PROVINCES.has(p)) return code
  return code && group ? `${code}（${group}）` : ''
}

function normalizeLevelName(level: string) {
  return normalizeMajorComboForRuleCenter(level)
}

function buildMajorLevelSet(validMajorCombos: string[]) {
  return new Set(validMajorCombos.map(normalizeMajorComboForRuleCenter).filter(Boolean))
}

function hasMajorLevel(majorLevelSet: Set<string>, majorName: string, level: string) {
  return majorLevelSet.has(
    normalizeMajorComboForRuleCenter(buildMajorComboForRuleCenter(majorName, level))
  )
}

function buildVocationalOnlyMajorSet(validMajorCombos: string[]) {
  const vocational = new Set<string>()
  const ordinary = new Set<string>()
  const vocationalSuffix = normalizeLevelName('本科(职业)')
  const ordinarySuffix = normalizeLevelName('本科(普通)')

  validMajorCombos.forEach((combo) => {
    const normalized = normalizeMajorComboForRuleCenter(combo)
    const major = normalizeMajorForRuleCenter(combo)
    if (!major) return

    if (normalized.endsWith(vocationalSuffix)) {
      vocational.add(major)
    }

    if (normalized.endsWith(ordinarySuffix)) {
      ordinary.add(major)
    }
  })

  ordinary.forEach((major) => vocational.delete(major))
  return vocational
}

function deriveLevel(params: {
  batch: string
  schoolName: string
  majorName: string
  majorRemark: string
  majorLevelSet: Set<string>
  vocationalOnlyMajors: Set<string>
}) {
  const batch = t(params.batch)
  if (batch.includes('专科')) return '专科(高职)'
  if (!batch.includes('本科')) return ''

  const schoolName = t(params.schoolName)
  const majorName = t(params.majorName)
  const majorRemark = t(params.majorRemark)
  const isVocationalUniversity =
    schoolName.includes('职业') &&
    schoolName.includes('大学') &&
    schoolName !== '天津职业技术师范大学'
  const hasVocationalMajor = hasMajorLevel(params.majorLevelSet, majorName, '本科(职业)')

  if (isVocationalUniversity) {
    return hasVocationalMajor ? '本科(职业)' : '本科(普通)'
  }

  if (VOCATIONAL_REMARK_KEYWORDS.some((keyword) => majorRemark.includes(keyword))) {
    return hasVocationalMajor ? '本科(职业)' : '本科(普通)'
  }

  return params.vocationalOnlyMajors.has(normalizeMajorForRuleCenter(majorName))
    ? '本科(职业)'
    : '本科(普通)'
}

function deriveLevelFromSourceMajorLevel(value: unknown) {
  const levelCode = t(value)
  if (levelCode === '1') return '本科(普通)'
  if (levelCode === '2') return '专科(高职)'
  if (levelCode === '3') return '本科(职业)'
  return null
}

export function processXueyeqiaoPlanRows(params: {
  rows: Record<string, unknown>[]
  validSchoolNames?: string[]
  validMajorCombos?: string[]
}): XueyeqiaoPlanProcessResult {
  const { rows, validSchoolNames = [], validMajorCombos = [] } = params
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

  const majorLevelSet = buildMajorLevelSet(validMajorCombos)
  const vocationalOnlyMajors = buildVocationalOnlyMajorSet(validMajorCombos)

  const previewRows: XueyeqiaoPlanPreviewRow[] = rows.map((row, rowNo) => {
    const schoolName = t(row['院校名称'])
    const province = t(row['省份'])
    const batch = t(row['批次'])
    const majorName = t(row['专业名称'])
    const majorRemark = t(row['专业备注'])
    const category = normalizeCategory(row['科类'])
    const requirement = parseApplyRequirement(row['报考要求'])
    const level =
      deriveLevelFromSourceMajorLevel(row['专业层次']) ??
      deriveLevel({
        batch,
        schoolName,
        majorName,
        majorRemark,
        majorLevelSet,
        vocationalOnlyMajors,
      })
    const ruleCenterValidation = validateSchoolAndMajorComboDetailed({
      validSchoolNames,
      validMajorCombos,
      schoolName,
      majorName,
      level,
    })

    const exportRow: XueyeqiaoPlanExportRow = {
      学校名称: schoolName,
      省份: province,
      招生专业: majorName,
      专业方向: '',
      专业备注: majorRemark,
      一级层次: level,
      招生科类: category,
      招生批次: batch,
      招生类型: t(row['招生类型']),
      招生代码: stripCaret(row['招生代码']),
      招生人数: toNumber(row['招生计划人数']),
      专业学制: toNumber(row['学年']),
      学费: toNumber(row['学费']),
      数据来源: '学业桥',
      专业组代码: buildGroupCode(province, t(row['招生代码']), t(row['专业组编号'])),
      首选科目: deriveFirstSubject(category),
      选科要求: requirement.subjectRequirementMode,
      次选科目: requirement.secondSubject,
      专业代码: stripCaret(row['专业代码']),
      学费单位: t(row['学费单位']),
      批次备注: '',
    }

    return {
      rowId: String(rowNo + 1),
      招生年份: t(row['年份']),
      原始报考要求: t(row['报考要求']),
      学校名称校验结果: ruleCenterValidation.schoolResult,
      专业名称校验结果: ruleCenterValidation.majorResult,
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
      专业方向: row.专业方向,
      专业备注: row.专业备注,
      一级层次: row.一级层次,
      招生科类: row.招生科类,
      招生批次: row.招生批次,
      招生类型: row.招生类型,
      招生代码: row.招生代码,
      招生人数: row.招生人数,
      专业学制: row.专业学制,
      学费: row.学费,
      数据来源: row.数据来源,
      专业组代码: row.专业组代码,
      首选科目: row.首选科目,
      选科要求: row.选科要求,
      次选科目: row.次选科目,
      专业代码: row.专业代码,
      学费单位: row.学费单位,
      批次备注: row.批次备注,
    })),
  }
}

export async function exportXueyeqiaoPlanWorkbook(params: {
  exportRows: XueyeqiaoPlanExportRow[]
  yearValue: string
}) {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('招生计划模板')

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

  XUEYEQIAO_PLAN_TEMPLATE_HEADERS.forEach((header, index) => {
    const cell = worksheet.getCell(3, index + 1)
    cell.value = header
    cell.font = { bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false }
  })

  const textHeaders = new Set([
    '招生代码',
    '专业组代码',
    '首选科目',
    '选科要求',
    '次选科目',
    '专业代码',
  ])

  params.exportRows.forEach((row, rowIndex) => {
    XUEYEQIAO_PLAN_TEMPLATE_HEADERS.forEach((header, colIndex) => {
      const cell = worksheet.getCell(rowIndex + 4, colIndex + 1)
      const value = row[header]

      if (textHeaders.has(header)) {
        cell.numFmt = '@'
        cell.value = String(value ?? '')
      } else {
        cell.value = value as string | number | null
      }

      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })
  })

  const widths = [20, 12, 22, 16, 22, 14, 14, 16, 16, 14, 12, 10, 12, 12, 16, 10, 18, 12, 14, 12, 14]
  widths.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width
  })

  const buffer = await writeXlsxBufferWithUniformFormatting(workbook)
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
