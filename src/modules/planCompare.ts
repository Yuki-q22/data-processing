import ExcelJS from 'exceljs'

export type PlanScoreCompareRow = {
  rowId: string
  matchKey: string
  exists: boolean
  reason: string
  school: string
  province: string
  category: string
  batch: string
  major: string
  level: string
  groupCode: string
  enrollmentCode: string
  sourceRow: Record<string, unknown>
}

export type PlanCollegeCompareRow = {
  rowId: string
  matchKey: string
  exists: boolean
  reason: string
  school: string
  province: string
  category: string
  batch: string
  level: string
  groupCode: string
  enrollmentCode: string
  missingEnrollmentCodeFlag: boolean
  sourceRow: Record<string, unknown>
}

export type PlanCompareResult = {
  yearValue: string
  missingPlanHeaders: string[]
  missingScoreHeaders: string[]
  missingCollegeHeaders: string[]
  planScoreRows: PlanScoreCompareRow[]
  planCollegeRows: PlanCollegeCompareRow[]
}

export type ProfessionalTemplateRow = {
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

export type CollegeTemplateRow = {
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
  层次: string
}

const PLAN_REQUIRED_HEADERS = [
  '年份',
  '省份',
  '学校',
  '科类',
  '批次',
  '招生类型',
  '专业',
  '层次',
  '方向',
  '备注',
  '招生人数',
  '招生代码',
  '专业代码',
  '专业组代码',
  '专业组选科要求',
  '专业选科要求(新高考专业省份)',
  '数据来源',
]

const SCORE_REQUIRED_HEADERS = [
  '年份',
  '省份',
  '学校',
  '科类',
  '批次',
  '招生类型',
  '专业',
  '层次',
  '备注',
  '专业组代码',
]

const COLLEGE_REQUIRED_HEADERS = [
  '年份',
  '省份',
  '学校',
  '科类',
  '批次',
  '招生类型',
  '专业组代码',
  '招生代码',
]

const PROFESSIONAL_TEMPLATE_HEADERS = [
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

const COLLEGE_TEMPLATE_HEADERS = [
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
  '层次',
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

function t(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function n(value: unknown): number | null {
  const text = t(value).replace(/,/g, '')
  if (!text) return null
  const num = Number(text)
  return Number.isNaN(num) ? null : num
}

function stripCaret(value: unknown): string {
  return t(value).replace(/\^/g, '')
}

function detectMissingHeaders(
  rows: Record<string, unknown>[],
  requiredHeaders: string[]
): string[] {
  if (!rows.length) return requiredHeaders
  const actualHeaders = Object.keys(rows[0])
  return requiredHeaders.filter((header) => !actualHeaders.includes(header))
}

function normalizeLevelForKey(value: unknown): string {
  const text = t(value)
  if (text === '专科' || text === '专科（高职）' || text === '专科(高职)') {
    return '专科(高职)'
  }
  return text
}

function normalizeLevelForExport(value: unknown): string {
  const text = t(value)
  if (text === '专科') return '专科(高职)'
  return text
}

/**
 * 专业分模板使用：物理类/历史类 → 物/历
 */
function getFirstSubjectFromCategory(category: unknown): string {
  const text = t(category)
  if (text.includes('物理类') || text === '物理') return '物'
  if (text.includes('历史类') || text === '历史') return '历'
  return ''
}

/**
 * 院校分模板使用：物理类/历史类 → 物理/历史
 */
function getCollegeFirstSubjectFromCategory(category: unknown): string {
  const text = t(category)
  if (text.includes('物理类') || text === '物理') return '物理'
  if (text.includes('历史类') || text === '历史') return '历史'
  return ''
}

function subjectNameToCode(token: string): string {
  const text = t(token)
  if (text === '物理' || text === '物') return '物'
  if (text === '化学' || text === '化') return '化'
  if (text === '生物' || text === '生') return '生'
  if (text === '历史' || text === '历') return '历'
  if (text === '地理' || text === '地') return '地'
  if (text === '思想政治' || text === '政治' || text === '政') return '政'
  if (text === '技术' || text === '技') return '技'
  return ''
}

function extractSubjectCodes(rawText: string): string {
  const text = rawText.replace(/\s+/g, '').replace(/思想政治/g, '政治')
  const matches = text.match(/(物理|历史|化学|生物|地理|政治|技术|物|化|生|历|地|政|技)/g) || []
  const result: string[] = []

  matches.forEach((item) => {
    const code = subjectNameToCode(item)
    if (code && !result.includes(code)) {
      result.push(code)
    }
  })

  return result.join('')
}

function combineElectiveRequirement(planRow: Record<string, unknown>): string {
  const a = stripCaret(planRow['专业组选科要求'])
  const b =
    '专业选科要求(新高考专业省份)' in planRow
      ? stripCaret(planRow['专业选科要求(新高考专业省份)'])
      : '专业选科要求（新高考专业省份）' in planRow
        ? stripCaret(planRow['专业选科要求（新高考专业省份）'])
        : ''

  if (a && b) return `${a}${b}`
  return a || b || ''
}

function convertElectiveRequirement(rawText: string): {
  mode: string
  secondSubject: string
} {
  const text = t(rawText).replace(/\s+/g, '').replace(/，/g, '、')

  if (!text) {
    return { mode: '', secondSubject: '' }
  }

  if (text.includes('不限')) {
    return { mode: '不限科目专业组', secondSubject: '' }
  }

  let target = text
  if (text.includes('再选')) {
    const parts = text.split('再选')
    target = parts[parts.length - 1] || text
  }

  const hasChoice =
    /选1/.test(target) ||
    /\d选1/.test(target) ||
    (target.includes('/') && !target.includes('必选'))

  const mode = hasChoice ? '多门选考' : '单科、多科均需选考'
  const secondSubject = extractSubjectCodes(target)

  return {
    mode,
    secondSubject,
  }
}

function buildPlanScoreKey(row: Record<string, unknown>): string {
  const groupCode = stripCaret(row['专业组代码'])
  const base = [
    t(row['年份']),
    t(row['省份']),
    t(row['学校']),
    t(row['科类']),
    t(row['批次']),
    t(row['专业']),
    normalizeLevelForKey(row['层次']),
  ]

  return groupCode ? [...base, groupCode].join('||') : base.join('||')
}

function buildScoreKey(row: Record<string, unknown>): string {
  const groupCode = stripCaret(row['专业组代码'])
  const base = [
    t(row['年份']),
    t(row['省份']),
    t(row['学校']),
    t(row['科类']),
    t(row['批次']),
    t(row['专业']),
    normalizeLevelForKey(row['层次']),
  ]

  return groupCode ? [...base, groupCode].join('||') : base.join('||')
}

function buildPlanCollegeKey(row: Record<string, unknown>): string {
  const groupCode = stripCaret(row['专业组代码'])
  const enrollmentCode = stripCaret(row['招生代码'])
  const base = [
    t(row['年份']),
    t(row['省份']),
    t(row['学校']),
    t(row['科类']),
    t(row['批次']),
  ]

  return groupCode
    ? [...base, groupCode, enrollmentCode].join('||')
    : [...base, enrollmentCode].join('||')
}

function buildCollegeKey(row: Record<string, unknown>): string {
  const groupCode = stripCaret(row['专业组代码'])
  const enrollmentCode = stripCaret(row['招生代码'])
  const base = [
    t(row['年份']),
    t(row['省份']),
    t(row['学校']),
    t(row['科类']),
    t(row['批次']),
  ]

  return groupCode
    ? [...base, groupCode, enrollmentCode].join('||')
    : [...base, enrollmentCode].join('||')
}

export function processPlanCompare(params: {
  planRows: Record<string, unknown>[]
  scoreRows: Record<string, unknown>[]
  collegeRows: Record<string, unknown>[]
  yearValue: string
}): PlanCompareResult {
  const { planRows, scoreRows, collegeRows, yearValue } = params

  const missingPlanHeaders = detectMissingHeaders(planRows, PLAN_REQUIRED_HEADERS)
  const missingScoreHeaders = scoreRows.length ? detectMissingHeaders(scoreRows, SCORE_REQUIRED_HEADERS) : []
  const missingCollegeHeaders = collegeRows.length
    ? detectMissingHeaders(collegeRows, COLLEGE_REQUIRED_HEADERS)
    : []

  const scoreKeySet = new Set(scoreRows.map((row) => buildScoreKey(row)))
  const collegeKeySet = new Set(collegeRows.map((row) => buildCollegeKey(row)))

  const planScoreRows: PlanScoreCompareRow[] = planRows.map((row, rowNo) => {
    const key = buildPlanScoreKey(row)
    const exists = scoreKeySet.has(key)

    return {
      rowId: `ps_${rowNo + 1}`,
      matchKey: key,
      exists,
      reason: exists ? '已在专业分文件中存在' : '专业分文件中不存在该组合键',
      school: t(row['学校']),
      province: t(row['省份']),
      category: t(row['科类']),
      batch: t(row['批次']),
      major: t(row['专业']),
      level: normalizeLevelForKey(row['层次']),
      groupCode: stripCaret(row['专业组代码']),
      enrollmentCode: stripCaret(row['招生代码']),
      sourceRow: row,
    }
  })

  const planCollegeRows: PlanCollegeCompareRow[] = planRows.map((row, rowNo) => {
    const key = buildPlanCollegeKey(row)
    const exists = collegeKeySet.has(key)
    const planEnrollmentCode = stripCaret(row['招生代码'])
    const missingEnrollmentCodeFlag = !planEnrollmentCode

    let reason = exists ? '已在院校分文件中存在' : '院校分文件中不存在该组合键'
    if (missingEnrollmentCodeFlag) {
      reason = `${reason}；招生计划缺少招生代码，需重点检查`
    }

    return {
      rowId: `pc_${rowNo + 1}`,
      matchKey: key,
      exists,
      reason,
      school: t(row['学校']),
      province: t(row['省份']),
      category: t(row['科类']),
      batch: t(row['批次']),
      level: normalizeLevelForKey(row['层次']),
      groupCode: stripCaret(row['专业组代码']),
      enrollmentCode: planEnrollmentCode,
      missingEnrollmentCodeFlag,
      sourceRow: row,
    }
  })

  return {
    yearValue,
    missingPlanHeaders,
    missingScoreHeaders,
    missingCollegeHeaders,
    planScoreRows,
    planCollegeRows,
  }
}

export function buildProfessionalTemplateRows(
  compareRows: PlanScoreCompareRow[]
): ProfessionalTemplateRow[] {
  return compareRows
    .filter((row) => !row.exists)
    .map((row) => {
      const source = row.sourceRow
      const electiveRaw = combineElectiveRequirement(source)
      const elective = convertElectiveRequirement(electiveRaw)

      return {
        学校名称: t(source['学校']),
        省份: t(source['省份']),
        招生专业: t(source['专业']),
        '专业方向（选填）': t(source['方向']),
        '专业备注（选填）': t(source['备注']),
        一级层次: normalizeLevelForExport(source['层次']),
        招生科类: t(source['科类']),
        招生批次: t(source['批次']),
        '招生类型（选填）': t(source['招生类型']),
        最高分: n(source['最高分']),
        最低分: n(source['最低分']),
        平均分: n(source['平均分']),
        '最低分位次（选填）': n(source['最低分位次']),
        '招生人数（选填）': n(source['招生人数']),
        数据来源: t(source['数据来源']),
        专业组代码: stripCaret(source['专业组代码']),
        首选科目: getFirstSubjectFromCategory(source['科类']),
        选科要求: elective.mode,
        次选科目: elective.secondSubject,
        专业代码: stripCaret(source['专业代码']),
        招生代码: stripCaret(source['招生代码']),
        最低分数区间低: '',
        最低分数区间高: '',
        最低分数区间位次低: '',
        最低分数区间位次高: '',
        '录取人数（选填）': null,
      }
    })
}

export function buildCollegeTemplateRows(
  compareRows: PlanCollegeCompareRow[]
): CollegeTemplateRow[] {
  return compareRows
    .filter((row) => !row.exists)
    .map((row) => {
      const source = row.sourceRow
      return {
        学校名称: t(source['学校']),
        省份: t(source['省份']),
        招生类别: t(source['科类']),
        招生批次: t(source['批次']),
        招生类型: t(source['招生类型']),
        选测等级: '',
        最高分: null,
        最低分: null,
        平均分: null,
        最高位次: null,
        最低位次: null,
        平均位次: null,
        录取人数: null,
        招生人数: n(source['招生人数']),
        数据来源: t(source['数据来源']),
        省控线科类: '',
        省控线批次: '',
        省控线备注: '',
        专业组代码: stripCaret(source['专业组代码']),
        首选科目: getCollegeFirstSubjectFromCategory(source['科类']),
        院校招生代码: stripCaret(source['招生代码']),
        层次: normalizeLevelForExport(source['层次']),
      }
    })
}

async function fillTemplateSheet<T extends Record<string, unknown>>(params: {
  worksheet: ExcelJS.Worksheet
  yearValue: string
  headers: readonly string[]
  rows: T[]
}) {
  const { worksheet, yearValue, headers, rows } = params

  worksheet.mergeCells('A1:U1')
  const noteCell = worksheet.getCell('A1')
  noteCell.value = TEMPLATE_NOTE
  noteCell.font = { color: { argb: 'FFFF0000' }, size: 11 }
  noteCell.alignment = {
    wrapText: true,
    vertical: 'top',
    horizontal: 'left',
  }
  worksheet.getRow(1).height = 350

  worksheet.getCell('A2').value = '招生年'
  worksheet.getCell('B2').value = yearValue
  worksheet.getCell('C2').value = 1
  worksheet.getCell('D2').value = '模板类型（模板标识不要更改）'

  headers.forEach((header, headerNo) => {
    const cell = worksheet.getCell(3, headerNo + 1)
    cell.value = header
    cell.font = { bold: true }
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
    }
  })

  rows.forEach((row, rowNo) => {
    headers.forEach((header, colNo) => {
      const cell = worksheet.getCell(rowNo + 4, colNo + 1)
      const value = row[header]

      if (
        header === '专业组代码' ||
        header === '专业代码' ||
        header === '招生代码' ||
        header === '院校招生代码'
      ) {
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

  for (let colNo = 1; colNo <= headers.length; colNo += 1) {
    worksheet.getColumn(colNo).width = 14
  }
}

export async function exportProfessionalCompareTemplate(params: {
  rows: ProfessionalTemplateRow[]
  yearValue: string
}): Promise<Blob> {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('专业分模板')

  await fillTemplateSheet({
    worksheet: ws,
    yearValue: params.yearValue,
    headers: PROFESSIONAL_TEMPLATE_HEADERS,
    rows: params.rows,
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export async function exportCollegeCompareTemplate(params: {
  rows: CollegeTemplateRow[]
  yearValue: string
}): Promise<Blob> {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('院校分模板')

  await fillTemplateSheet({
    worksheet: ws,
    yearValue: params.yearValue,
    headers: COLLEGE_TEMPLATE_HEADERS,
    rows: params.rows,
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}