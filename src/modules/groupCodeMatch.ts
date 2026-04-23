import ExcelJS from 'exceljs'

export type GroupCodeCandidate = {
  candidateId: string
  schoolName: string
  province: string
  level1: string
  subjectCategory: string
  batch: string
  majorName: string
  majorRemark: string
  enrollmentType: string
  groupCode: string
  enrollmentCode: string
  electiveRaw: string
  convertedRequirementMode: string
  convertedSecondSubject: string
  sourceRow: Record<string, unknown>
}

export type GroupCodeMatchRow = {
  rowId: string
  matchKey: string
  yearValue: number

  schoolName: string
  province: string
  level1: string
  subjectCategory: string
  batch: string
  majorName: string
  majorRemark: string
  enrollmentType: string

  originalGroupCode: string
  originalRequirementMode: string
  originalSecondSubject: string

  resolvedGroupCode: string
  resolvedRequirementMode: string
  resolvedSecondSubject: string

  duplicateInImport: boolean
  duplicateInPlan: boolean
  requiresGroupCode: boolean
  requiresElectiveConversion: boolean
  status: 'existing' | 'auto' | 'manual_required' | 'manual_done' | 'no_candidate'
  reason: string

  candidates: GroupCodeCandidate[]
  sourceRow: Record<string, unknown>
}

export type GroupCodeMatchResult = {
  rows: GroupCodeMatchRow[]
}

type ManualSelection = {
  candidateId?: string
  manualGroupCode?: string
  manualRequirementMode?: string
  manualSecondSubject?: string
}

const IMPORT_HEADERS = [
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

1.省份：必须填写各省份简称，例如：北京、内蒙古，不能带有市、省、自治区、空格、特殊字符等

2.科类：浙江、上海限定“综合、艺术类、体育类”，内蒙古限定“文科、理科、蒙授文科、蒙授理科、艺术类、艺术文、艺术理、体育类、体育文、体育理、蒙授艺术、蒙授体育”，其他省份限定“文科、理科、艺术类、艺术文、艺术理、体育类、体育文、体育理”

3.批次：（以下为19年使用批次）

河北、内蒙古、吉林、江苏、安徽、福建、江西、河南、湖北、广西、重庆、四川、贵州、云南、西藏、陕西、甘肃、宁夏、新疆限定本科提前批、本科一批、本科二批、专科提前批、专科批、国家专项计划本科批、地方专项计划本科批；

黑龙江、湖南、青海限定本科提前批、本科一批、本科二批、本科三批、专科提前批、专科批、国家专项计划本科批、地方专项计划本科批；

山西限定本科一批A段、本科一批B段、本科二批A段、本科二批B段、本科二批C段、专科批、国家专项计划本科批、地方专项计划本科批；

浙江限定普通类提前批、平行录取一段、平行录取二段、平行录取三段

4.最高分、最低分、平均分：仅能填写数字（最多保留2位小数），且三者顺序不能改变，最低分为必填项，其中艺术类和体育类分数为文化课分数

5.最低分位次：仅能填写数字

6.录取人数：仅能填写数字

7.首选科目：新八省必填，只能填写（历史或物理）`

const NEW_GAOKAO_NO_GROUP_2025_PLUS = new Set([
  '河北',
  '辽宁',
  '山东',
  '浙江',
  '重庆',
  '贵州',
  '青海',
])

const NO_GROUP_CODE_2025_PLUS = new Set([
  '新疆',
  '西藏',
  '河北',
  '辽宁',
  '山东',
  '浙江',
  '重庆',
  '贵州',
  '青海',
])

const NO_GROUP_CODE_PRE_2025_FIXED = new Set([
  '河北',
  '辽宁',
  '山东',
  '浙江',
  '重庆',
  '贵州',
])

const OLD_GAOKAO_CATEGORY_SET = new Set([
  '文科',
  '理科',
  '艺术文',
  '艺术理',
  '体育文',
  '体育理',
  '蒙授文科',
  '蒙授理科',
])

function t(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function stripCaret(value: unknown): string {
  return t(value).replace(/\^/g, '')
}

function firstOf(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (key in row) return t(row[key])
  }
  return ''
}

function normalizeLevel(value: string) {
  const text = t(value).replace('（', '(').replace('）', ')')
  if (text === '专科') return '专科(高职)'
  if (text === '专科(高职)') return '专科(高职)'
  return text
}

function normalizePlanLevel(value: string) {
  const text = t(value)
  if (text === '专科') return '专科(高职)'
  return text
}

function normalizeCategory(value: string) {
  return t(value)
}

function getImportMatchKey(row: Record<string, unknown>) {
  return [
    firstOf(row, ['学校名称']),
    firstOf(row, ['省份']),
    normalizeLevel(firstOf(row, ['一级层次'])),
    normalizeCategory(firstOf(row, ['招生科类'])),
    firstOf(row, ['招生批次']),
    firstOf(row, ['招生专业']),
  ].join('||')
}

function getPlanMatchKey(row: Record<string, unknown>) {
  return [
    firstOf(row, ['学校', '学校名称']),
    firstOf(row, ['省份']),
    normalizePlanLevel(firstOf(row, ['层次'])),
    normalizeCategory(firstOf(row, ['科类'])),
    firstOf(row, ['批次']),
    firstOf(row, ['专业']),
  ].join('||')
}

function countByKey(
  rows: Record<string, unknown>[],
  keyBuilder: (row: Record<string, unknown>) => string
) {
  const map = new Map<string, number>()
  rows.forEach((row) => {
    const key = keyBuilder(row)
    map.set(key, (map.get(key) || 0) + 1)
  })
  return map
}

function parseYear(value: string) {
  const matched = value.match(/\d{4}/)
  if (!matched) return 2025
  return Number(matched[0])
}

function provinceHasGroupCode(yearValue: number, province: string, category: string) {
  const p = t(province)
  const c = t(category)

  if (yearValue >= 2025) {
    return !NO_GROUP_CODE_2025_PLUS.has(p)
  }

  if (NO_GROUP_CODE_PRE_2025_FIXED.has(p)) {
    return false
  }

  if (OLD_GAOKAO_CATEGORY_SET.has(c)) {
    return false
  }

  return true
}

function provinceNeedsElectiveConversion(yearValue: number, province: string) {
  if (yearValue < 2025) return false
  return NEW_GAOKAO_NO_GROUP_2025_PLUS.has(t(province))
}

function subjectNameToCode(token: string) {
  const value = t(token)
  if (value === '物理' || value === '物') return '物'
  if (value === '化学' || value === '化') return '化'
  if (value === '生物' || value === '生') return '生'
  if (value === '历史' || value === '历') return '历'
  if (value === '地理' || value === '地') return '地'
  if (value === '思想政治' || value === '政治' || value === '政') return '政'
  if (value === '技术' || value === '技') return '技'
  return ''
}

function extractSubjectCodes(rawText: string) {
  const text = rawText.replace(/\s+/g, '').replace(/思想政治/g, '政治')
  const pattern = /(物理|历史|化学|生物|地理|政治|技术|物|化|生|历|地|政|技)/g
  const matches = text.match(pattern) || []
  const result: string[] = []

  matches.forEach((item) => {
    const code = subjectNameToCode(item)
    if (code && !result.includes(code)) {
      result.push(code)
    }
  })

  return result.join('')
}

function combinePlanElectiveRequirement(row: Record<string, unknown>) {
  const a = stripCaret(
    '专业组选科要求' in row ? row['专业组选科要求'] : ''
  )
  const b = stripCaret(
    '专业选科要求(新高考专业省份)' in row
      ? row['专业选科要求(新高考专业省份)']
      : '专业选科要求（新高考专业省份）' in row
        ? row['专业选科要求（新高考专业省份）']
        : ''
  )

  if (a && b) return `${a}${b}`
  return a || b || ''
}

function convertPlanElectiveRequirement(rawText: string) {
  const text = t(rawText).replace(/\s+/g, '').replace(/，/g, '、')

  if (!text) {
    return {
      mode: '',
      secondSubject: '',
      raw: '',
    }
  }

  if (text.includes('不限')) {
    return {
      mode: '不限科目专业组',
      secondSubject: '',
      raw: text,
    }
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
    raw: text,
  }
}

function buildReason(
  duplicateInImport: boolean,
  duplicateInPlan: boolean,
  candidatesCount: number,
  requiresGroupCode: boolean,
  candidateGroupCode: string
) {
  if (duplicateInImport && duplicateInPlan) {
    return '导入模板和招生计划在同一组合键上都存在重复，需手动补充'
  }
  if (duplicateInImport) {
    return '导入模板在同一组合键上存在重复，需手动补充'
  }
  if (duplicateInPlan) {
    return '招生计划在同一组合键上存在重复，需手动补充'
  }
  if (candidatesCount === 0) {
    return '未找到匹配的招生计划记录，需手动补充'
  }
  if (requiresGroupCode && !candidateGroupCode) {
    return '该省份应有专业组代码，但招生计划中未取到专业组代码，需手动补充'
  }
  return ''
}

export function processGroupCodeMatch(params: {
  importRows: Record<string, unknown>[]
  planRows: Record<string, unknown>[]
  yearValue: string
}) {
  const { importRows, planRows, yearValue } = params
  const parsedYear = parseYear(yearValue)

  const importKeyCount = countByKey(importRows, getImportMatchKey)
  const planKeyCount = countByKey(planRows, getPlanMatchKey)

  const planMap = new Map<string, GroupCodeCandidate[]>()

  planRows.forEach((row, rowNo) => {
    const matchKey = getPlanMatchKey(row)
    const convertedElective = convertPlanElectiveRequirement(combinePlanElectiveRequirement(row))

    const candidate: GroupCodeCandidate = {
      candidateId: `plan_${rowNo + 1}`,
      schoolName: firstOf(row, ['学校', '学校名称']),
      province: firstOf(row, ['省份']),
      level1: normalizePlanLevel(firstOf(row, ['层次'])),
      subjectCategory: normalizeCategory(firstOf(row, ['科类'])),
      batch: firstOf(row, ['批次']),
      majorName: firstOf(row, ['专业']),
      majorRemark: firstOf(row, ['备注']),
      enrollmentType: firstOf(row, ['招生类型']),
      groupCode: stripCaret('专业组代码' in row ? row['专业组代码'] : ''),
      enrollmentCode: firstOf(row, ['招生代码']),
      electiveRaw: combinePlanElectiveRequirement(row),
      convertedRequirementMode: convertedElective.mode,
      convertedSecondSubject: convertedElective.secondSubject,
      sourceRow: row,
    }

    if (!planMap.has(matchKey)) {
      planMap.set(matchKey, [])
    }
    planMap.get(matchKey)!.push(candidate)
  })

  const rows: GroupCodeMatchRow[] = importRows.map((row, rowNo) => {
    const matchKey = getImportMatchKey(row)
    const candidates = planMap.get(matchKey) || []

    const schoolName = firstOf(row, ['学校名称'])
    const province = firstOf(row, ['省份'])
    const level1 = normalizeLevel(firstOf(row, ['一级层次']))
    const subjectCategory = normalizeCategory(firstOf(row, ['招生科类']))
    const batch = firstOf(row, ['招生批次'])
    const majorName = firstOf(row, ['招生专业'])
    const majorRemark = firstOf(row, ['专业备注（选填）'])
    const enrollmentType = firstOf(row, ['招生类型（选填）'])
    const originalGroupCode = firstOf(row, ['专业组代码'])
    const originalRequirementMode = firstOf(row, ['选科要求'])
    const originalSecondSubject = firstOf(row, ['次选科目'])

    const duplicateInImport = (importKeyCount.get(matchKey) || 0) > 1
    const duplicateInPlan = (planKeyCount.get(matchKey) || 0) > 1
    const requiresGroupCode = provinceHasGroupCode(parsedYear, province, subjectCategory)
    const requiresElectiveConversion = provinceNeedsElectiveConversion(parsedYear, province)

    let status: GroupCodeMatchRow['status'] = 'no_candidate'
    let reason = ''
    let resolvedGroupCode = originalGroupCode
    let resolvedRequirementMode = originalRequirementMode
    let resolvedSecondSubject = originalSecondSubject

    if (originalGroupCode) {
      status = 'existing'
    } else if (duplicateInImport || duplicateInPlan) {
      status = 'manual_required'
      reason = buildReason(
        duplicateInImport,
        duplicateInPlan,
        candidates.length,
        requiresGroupCode,
        candidates[0]?.groupCode || ''
      )
    } else if (candidates.length === 0) {
      status = 'no_candidate'
      reason = buildReason(false, false, 0, requiresGroupCode, '')
    } else if (candidates.length === 1) {
      const candidate = candidates[0]

      if (requiresGroupCode && !candidate.groupCode) {
        status = 'manual_required'
        reason = buildReason(false, false, 1, true, '')
      } else {
        status = 'auto'
        resolvedGroupCode = requiresGroupCode ? candidate.groupCode : ''
        if (requiresElectiveConversion) {
          resolvedRequirementMode = candidate.convertedRequirementMode
          resolvedSecondSubject = candidate.convertedSecondSubject
        }
      }
    } else {
      status = 'manual_required'
      reason = '存在多条候选招生计划记录，需手动补充'
    }

    if (status === 'existing' && candidates.length === 1 && requiresElectiveConversion) {
      resolvedRequirementMode = candidates[0].convertedRequirementMode
      resolvedSecondSubject = candidates[0].convertedSecondSubject
    }

    return {
      rowId: String(rowNo + 1),
      matchKey,
      yearValue: parsedYear,

      schoolName,
      province,
      level1,
      subjectCategory,
      batch,
      majorName,
      majorRemark,
      enrollmentType,

      originalGroupCode,
      originalRequirementMode,
      originalSecondSubject,

      resolvedGroupCode,
      resolvedRequirementMode,
      resolvedSecondSubject,

      duplicateInImport,
      duplicateInPlan,
      requiresGroupCode,
      requiresElectiveConversion,
      status,
      reason,
      candidates,
      sourceRow: row,
    }
  })

  return { rows } satisfies GroupCodeMatchResult
}

export function applyManualSelections(
  rows: GroupCodeMatchRow[],
  selections: Record<string, ManualSelection>
) {
  return rows.map((row) => {
    const selection = selections[row.rowId]
    if (!selection) return row

    let resolvedGroupCode = row.resolvedGroupCode
    let resolvedRequirementMode = row.resolvedRequirementMode
    let resolvedSecondSubject = row.resolvedSecondSubject
    let status = row.status

    if (selection.candidateId) {
      const candidate = row.candidates.find((item) => item.candidateId === selection.candidateId)
      if (candidate) {
        resolvedGroupCode = row.requiresGroupCode ? candidate.groupCode : ''
        if (row.requiresElectiveConversion) {
          resolvedRequirementMode = candidate.convertedRequirementMode
          resolvedSecondSubject = candidate.convertedSecondSubject
        }
        status = 'manual_done'
      }
    }

    if (selection.manualGroupCode !== undefined) {
      resolvedGroupCode = t(selection.manualGroupCode)
      status = 'manual_done'
    }

    if (selection.manualRequirementMode !== undefined) {
      resolvedRequirementMode = t(selection.manualRequirementMode)
      status = 'manual_done'
    }

    if (selection.manualSecondSubject !== undefined) {
      resolvedSecondSubject = t(selection.manualSecondSubject)
      status = 'manual_done'
    }

    return {
      ...row,
      resolvedGroupCode,
      resolvedRequirementMode,
      resolvedSecondSubject,
      status,
    }
  })
}

export async function exportMatchedProfessionalTemplate(params: {
  rows: GroupCodeMatchRow[]
  yearValue: string
}) {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('更新后专业分模板')

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
  ws.getCell('C2').value = 1
  ws.getCell('D2').value = '模板类型（模板标识不要更改）'

  IMPORT_HEADERS.forEach((header, headerNo) => {
    const cell = ws.getCell(3, headerNo + 1)
    cell.value = header
    cell.font = { bold: true }
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
    }
  })

  params.rows.forEach((row, rowNo) => {
    const outputRow: Record<string, unknown> = {
  ...row.sourceRow,
  专业组代码: row.resolvedGroupCode,
  选科要求: row.resolvedRequirementMode,
  次选科目: row.resolvedSecondSubject,
}

    IMPORT_HEADERS.forEach((header, colNo) => {
      const cell = ws.getCell(rowNo + 4, colNo + 1)
      const value = outputRow[header]

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
  }

  Object.entries(widths).forEach(([col, width]) => {
    ws.getColumn(col).width = width
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export function getManualRequiredRows(rows: GroupCodeMatchRow[]) {
  return rows.filter((row) => row.status === 'manual_required' || row.status === 'no_candidate')
}