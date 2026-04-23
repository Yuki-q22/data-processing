import ExcelJS from 'exceljs'

export type XueyeqiaoExportRow = {
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
  数据是否有问题: string
  问题列表: string
  修改后的备注: string
}

export type XueyeqiaoPreviewRow = XueyeqiaoExportRow & {
  rowId: string
  招生年份: string
  原始科类: string
  原始报考要求: string
  原始备注: string
  学校名称匹配: string
}

export type XueyeqiaoProcessResult = {
  yearValue: string
  inputRowCount: number
  outputRowCount: number
  detectedHeaders: string[]
  missingColumns: string[]
  previewRows: XueyeqiaoPreviewRow[]
  exportRows: XueyeqiaoExportRow[]
}

const REQUIRED_COLUMNS = [
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
  '报考要求',
  '专业备注',
  '招生计划人数',
  '最低分',
  '最低位次',
  '最高分',
  '平均分',
  '录取人数',
]

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

const SAFE_REMARK_REPLACEMENTS: Array<[string, string]> = [
  ['教助', '救助'],
  ['指辉', '指挥'],
  ['教学珊', '教学班'],
  ['培养珊', '培养班'],
  ['教据', '数据'],
  ['料学', '科学'],
  ['需达', '雷达'],
  ['话言', '语言'],
  ['色言', '色盲'],
  ['色育', '色盲'],
  ['人围', '入围'],
  ['项月', '项目'],
  ['币范类', '师范类'],
  ['投课', '授课'],
  ['就薄', '就读'],
  ['中溴', '中澳'],
  ['教学', '数学'],
]

const RISKY_PHRASE_REPLACEMENTS: Array<[RegExp, string, string]> = [
  [/5十3/g, '5+3', '短语修正：5十3→5+3'],
  [/法学十/g, '法学+', '短语修正：法学十→法学+'],
  [/数学与应用数笑/g, '数学与应用数学', '短语修正：数学与应用数笑→数学与应用数学'],
  [/色盲色弱申报/g, '色盲色弱慎报', '短语修正：色盲色弱申报→色盲色弱慎报'],
  [/5\+31体化/g, '5+3一体化', '短语修正：5+31体化→5+3一体化'],
  [/5\+3体化/g, '5+3一体化', '短语修正：5+3体化→5+3一体化'],
]

const TEMPLATE_NOTE = `备注：请删除示例后再填写；

1.省份：必须填写各省份简称，例如：北京、内蒙古，不能带有市、省、自治区、空格、特殊字符等

2.科类：浙江、上海限定“综合、艺术类、体育类”，内蒙古限定“文科、理科、蒙授文科、蒙授理科、艺术类、艺术文、艺术理、体育类、体育文、体育理、蒙授艺术、蒙授体育”，其他省份限定“文科、理科、艺术类、艺术文、艺术理、体育类、体育文、体育理”

3.批次：（以下为19年使用批次）

河北、内蒙古、吉林、江苏、安徽、福建、江西、河南、湖北、广西、重庆、四川、贵州、云南、西藏、陕西、甘肃、宁夏、新疆限定本科提前批、本科一批、本科二批、专科提前批、专科批、国家专项计划本科批、地方专项计划本科批；

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

const OUTPUT_HEADERS = [
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
  '数据是否有问题',
  '问题列表',
  '修改后的备注',
] as const

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

function normalizeSchoolName(value: string) {
  return value.replace(/\s/g, '')
}

function normalizeCategory(raw: string) {
  const text = t(raw)
  if (text === '物理' || text === '物理类') {
    return { category: '物理类', firstSubject: '物' }
  }
  if (text === '历史' || text === '历史类') {
    return { category: '历史类', firstSubject: '历' }
  }
  return { category: text, firstSubject: '' }
}

function deriveLevel1(batch: string, schoolName: string) {
  const batchText = t(batch)
  const schoolText = t(schoolName)

  if (batchText.includes('本科')) {
    if (schoolText.endsWith('职业大学') || schoolText.endsWith('职业技术大学')) {
      return '本科(职业)'
    }
    return '本科(普通)'
  }

  if (batchText.includes('专科')) {
    return '专科(高职)'
  }

  return ''
}

function parseApplyRequirement(value: string) {
  const raw = t(value)

  if (!raw) {
    return { subjectRequirementMode: '', secondSubject: '' }
  }

  if (raw.includes('不限')) {
    return { subjectRequirementMode: '不限科目专业组', secondSubject: '' }
  }

  if (raw.length === 1) {
    return { subjectRequirementMode: '单科、多科均需选考', secondSubject: raw }
  }

  if (raw.includes('且')) {
    return {
      subjectRequirementMode: '单科、多科均需选考',
      secondSubject: raw.replace(/且/g, ''),
    }
  }

  if (raw.includes('或')) {
    return {
      subjectRequirementMode: '多门选考',
      secondSubject: raw.replace(/或/g, ''),
    }
  }

  return {
    subjectRequirementMode: '单科、多科均需选考',
    secondSubject: raw,
  }
}

function buildGroupCode(province: string, enrollmentCode: string, groupNo: string) {
  const p = t(province)
  const code = t(enrollmentCode)
  const group = t(groupNo)

  if (NO_GROUP_CODE_PROVINCES.has(p)) return ''
  if (p === '吉林') return code && group ? `${code}${group}` : ''
  if (GROUP_CODE_EQUALS_ENROLLMENT_CODE_PROVINCES.has(p)) return code
  return code && group ? `${code}（${group}）` : ''
}

function normalizeBrackets(text: string) {
  return text.replace(/[([{【《<]/g, '（').replace(/[)\]}】》>]/g, '）')
}

function cleanOuterPunctuation(text: string) {
  return text
    .replace(/^[，、。！？；,;.!?\s]+/, '')
    .replace(/[，、。！？；,;.!?\s]+$/, '')
}

function balanceBrackets(text: string) {
  const chars = Array.from(text)
  const output: string[] = []
  let leftCount = 0
  let removedRight = 0

  for (const ch of chars) {
    if (ch === '（') {
      leftCount += 1
      output.push(ch)
    } else if (ch === '）') {
      if (leftCount > 0) {
        leftCount -= 1
        output.push(ch)
      } else {
        removedRight += 1
      }
    } else {
      output.push(ch)
    }
  }

  if (leftCount > 0) {
    output.push('）'.repeat(leftCount))
  }

  return { text: output.join(''), removedRight, addedRight: leftCount }
}

function flattenNestedBrackets(text: string) {
  let current = text
  let changed = false

  while (/（（[^（）]*））/.test(current)) {
    current = current.replace(/（（([^（）]*)））/g, '（$1）')
    changed = true
  }

  const compacted = current.replace(/（{2,}/g, '（').replace(/）{2,}/g, '）')
  if (compacted !== current) {
    current = compacted
    changed = true
  }

  return { text: current, changed }
}

function removeEmptyBrackets(text: string) {
  const next = text.replace(/（[\s，、。！？；,;.!?]*）/g, '')
  return { text: next, changed: next !== text }
}

function dedupeBracketContents(text: string) {
  const matches = text.match(/（[^（）]*）/g) || []
  if (matches.length <= 1) return { text, changed: false }

  const seen = new Set<string>()
  const unique: string[] = []

  matches.forEach((item) => {
    if (!seen.has(item)) {
      seen.add(item)
      unique.push(item)
    }
  })

  if (unique.length === matches.length) return { text, changed: false }

  const base = text.replace(/（[^（）]*）/g, '').trim()
  return { text: `${base}${unique.join('')}`, changed: true }
}

function compressPunctuation(text: string) {
  const next = text
    .replace(/[，,]{2,}/g, '，')
    .replace(/[；;]{2,}/g, '；')
    .replace(/[。\.]{2,}/g, '。')
    .replace(/([，；。])([，；。]+)/g, '$1')
    .replace(/\s{2,}/g, ' ')
  return { text: next, changed: next !== text }
}

function stripLeadingPunctuation(text: string) {
  const next = text.replace(/^[，、。！？；,;.!?\s]+/, '')
  return { text: next, changed: next !== text }
}

function applySafeReplacements(text: string) {
  let current = text
  const issues: string[] = []

  SAFE_REMARK_REPLACEMENTS.forEach(([wrong, correct]) => {
    if (current.includes(wrong)) {
      current = current.split(wrong).join(correct)
      issues.push(`错字修正：${wrong}→${correct}`)
    }
  })

  RISKY_PHRASE_REPLACEMENTS.forEach(([pattern, replacement, issue]) => {
    if (pattern.test(current)) {
      current = current.replace(pattern, replacement)
      issues.push(issue)
    }
  })

  return { text: current, issues }
}

function fixRemark(rawValue: string) {
  let text = t(rawValue)
  const issues: string[] = []

  if (!text) {
    return { fixedText: '', issues: ['无问题'] }
  }

  const original = text

  const bracketNormalized = normalizeBrackets(text)
  if (bracketNormalized !== text) {
    text = bracketNormalized
    issues.push('统一括号')
  }

  const outerCleaned = cleanOuterPunctuation(text)
  if (outerCleaned !== text) {
    text = outerCleaned
    issues.push('清理最外层标点')
  }

  const replaced = applySafeReplacements(text)
  text = replaced.text
  issues.push(...replaced.issues)

  const flattened = flattenNestedBrackets(text)
  if (flattened.changed) {
    text = flattened.text
    issues.push('修复嵌套括号')
  }

  const balanced = balanceBrackets(text)
  if (balanced.removedRight > 0) issues.push('删除多余右括号')
  if (balanced.addedRight > 0) issues.push('补齐缺失右括号')
  text = balanced.text

  const emptied = removeEmptyBrackets(text)
  if (emptied.changed) {
    text = emptied.text
    issues.push('删除空括号')
  }

  const deduped = dedupeBracketContents(text)
  if (deduped.changed) {
    text = deduped.text
    issues.push('括号内容去重')
  }

  const compressed = compressPunctuation(text)
  if (compressed.changed) {
    text = compressed.text
    issues.push('压缩多余标点')
  }

  const stripped = stripLeadingPunctuation(text)
  if (stripped.changed) {
    text = stripped.text
    issues.push('删除备注开头多余标点')
  }

  text = text.trim()

  if (issues.length === 0 && text === original) {
    return { fixedText: text, issues: ['无问题'] }
  }

  return {
    fixedText: text,
    issues: Array.from(new Set(issues)),
  }
}

export function processXueyeqiaoData(params: {
  rows: Record<string, unknown>[]
  validSchoolNames: string[]
}) {
  const { rows, validSchoolNames } = params

  const detectedHeaders = rows.length ? Object.keys(rows[0]) : []
  const missingColumns = REQUIRED_COLUMNS.filter((col) => !detectedHeaders.includes(col))
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
    } satisfies XueyeqiaoProcessResult
  }

  const schoolSet = new Set(validSchoolNames.map((name) => normalizeSchoolName(name)))

  const previewRows: XueyeqiaoPreviewRow[] = rows.map((row, rowNo) => {
    const schoolName = t(row['院校名称'])
    const province = t(row['省份'])
    const batch = t(row['批次'])
    const categoryRaw = t(row['科类'])
    const enrollmentType = t(row['招生类型'])
    const enrollmentCode = t(row['招生代码'])
    const groupNo = t(row['专业组编号'])
    const majorCode = t(row['专业代码'])
    const majorName = t(row['专业名称'])
    const majorRemarkRaw = t(row['专业备注'])
    const applyRequirementRaw = t(row['报考要求'])

    const normalizedCategory = normalizeCategory(categoryRaw)
    const level1 = deriveLevel1(batch, schoolName)
    const requirement = parseApplyRequirement(applyRequirementRaw)
    const groupCode = buildGroupCode(province, enrollmentCode, groupNo)
    const fixedRemark = fixRemark(majorRemarkRaw)

    const schoolMatch =
      schoolSet.size === 0
        ? '未启用学校规则'
        : schoolSet.has(normalizeSchoolName(schoolName))
          ? '匹配'
          : '未匹配'

    const issueList =
      fixedRemark.issues[0] === '无问题' ? [] : [...fixedRemark.issues]

    if (schoolMatch === '未匹配') {
      issueList.push('学校名称未匹配规则中心')
    }

    const hasIssue = issueList.length > 0

    const exportRow: XueyeqiaoExportRow = {
      学校名称: schoolName,
      省份: province,
      招生专业: majorName,
      '专业方向（选填）': '',
      '专业备注（选填）': majorRemarkRaw,
      一级层次: level1,
      招生科类: normalizedCategory.category,
      招生批次: batch,
      '招生类型（选填）': enrollmentType,
      最高分: toNumber(row['最高分']),
      最低分: toNumber(row['最低分']),
      平均分: toNumber(row['平均分']),
      '最低分位次（选填）': toNumber(row['最低位次']),
      '招生人数（选填）': toNumber(row['招生计划人数']),
      数据来源: '学业桥',
      专业组代码: groupCode,
      首选科目: normalizedCategory.firstSubject,
      选科要求: requirement.subjectRequirementMode,
      次选科目: requirement.secondSubject,
      专业代码: majorCode,
      招生代码: enrollmentCode,
      最低分数区间低: '',
      最低分数区间高: '',
      最低分数区间位次低: '',
      最低分数区间位次高: '',
      '录取人数（选填）': toNumber(row['录取人数']),
      数据是否有问题: hasIssue ? '有问题' : '无问题',
      问题列表: hasIssue ? Array.from(new Set(issueList)).join('；') : '无问题',
      修改后的备注: fixedRemark.fixedText,
    }

    return {
      rowId: String(rowNo + 1),
      招生年份: t(row['年份']),
      原始科类: categoryRaw,
      原始报考要求: applyRequirementRaw,
      原始备注: majorRemarkRaw,
      修改后的备注: fixedRemark.fixedText,
      数据是否有问题: exportRow.数据是否有问题,
      学校名称匹配: schoolMatch,
      问题列表: exportRow.问题列表,
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
      数据是否有问题: row.数据是否有问题,
      问题列表: row.问题列表,
      修改后的备注: row.修改后的备注,
    })),
  } satisfies XueyeqiaoProcessResult
}

export async function exportXueyeqiaoWorkbook(params: {
  exportRows: XueyeqiaoExportRow[]
  yearValue: string
}) {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('专业分模板')

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
  ws.getCell('B2').value = params.yearValue

  OUTPUT_HEADERS.forEach((header, headerNo) => {
    const cell = ws.getCell(3, headerNo + 1)
    cell.value = header
    cell.font = { bold: true }
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
    }
  })

  const safeRows = Array.isArray(params.exportRows) ? params.exportRows : []

  safeRows.forEach((row, rowNo) => {
    OUTPUT_HEADERS.forEach((header, colNo) => {
      const cell = ws.getCell(rowNo + 4, colNo + 1)
      const value = row[header]

      if (header === '专业组代码' || header === '专业代码' || header === '招生代码') {
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
    C: 18,
    D: 16,
    E: 22,
    F: 14,
    G: 12,
    H: 14,
    I: 16,
    J: 10,
    K: 10,
    L: 10,
    M: 14,
    N: 14,
    O: 12,
    P: 14,
    Q: 10,
    R: 18,
    S: 12,
    T: 14,
    U: 14,
    V: 16,
    W: 16,
    X: 18,
    Y: 18,
    Z: 14,
    AA: 14,
    AB: 28,
    AC: 22,
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