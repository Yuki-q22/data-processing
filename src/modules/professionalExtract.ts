import ExcelJS from 'exceljs'
import { writeXlsxBufferWithUniformFormatting } from '../utils/excelExport'
import { validateUploadFile } from './uploadValidation'

type MatchItem = {
  start: number
  major: string
}

export type ProfessionalExtractPreviewRow = {
  rowId: string
  level: string
  note: string
  extracted: string
}

export type ProfessionalExtractResult = {
  blob: Blob
  fileName: string
  totalRows: number
  standardLevelCount: number
  matchedRows: number
  previewRows: ProfessionalExtractPreviewRow[]
  logs: string[]
}

type ProgressPayload = {
  progress: number
  status: string
  log?: string
}

function cellToString(value: ExcelJS.CellValue | undefined, trim = true) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return trim ? String(value).trim() : String(value)

  if (typeof value === 'object') {
    if ('text' in value && value.text !== undefined) {
      const text = String(value.text)
      return trim ? text.trim() : text
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      const text = value.richText.map((item) => item.text || '').join('')
      return trim ? text.trim() : text
    }
    if ('result' in value && value.result !== undefined) {
      return cellToString(value.result as ExcelJS.CellValue, trim)
    }
  }

  const text = String(value)
  return trim ? text.trim() : text
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function filterDirections(text: string, matches: MatchItem[], allStdMajors: string[]) {
  const result: MatchItem[] = []
  const allSorted = Array.from(new Set(allStdMajors)).sort((a, b) => b.length - a.length)

  for (const match of matches) {
    const start = match.start

    let parenDepth = 0
    let parenStart = -1
    for (let i = start - 1; i >= 0; i -= 1) {
      if (text[i] === '）') {
        parenDepth += 1
      } else if (text[i] === '（') {
        if (parenDepth === 0) {
          parenStart = i
          break
        } else {
          parenDepth -= 1
        }
      }
    }

    if (parenStart === -1) {
      result.push(match)
      continue
    }

    let isDirection = false
    for (const stdMajor of allSorted) {
      const mlen = stdMajor.length
      if (parenStart >= mlen) {
        if (text.slice(parenStart - mlen, parenStart) === stdMajor) {
          isDirection = true
          break
        }
      }
    }

    if (!isDirection) {
      result.push(match)
    }
  }

  return result
}

function filterEnglishRequirements(text: string, matches: MatchItem[]) {
  const result: string[] = []
  const excludePatterns = [
    /非英语/g,
    /外语要求[：:]英语/g,
    /外语语种要求[：:]英语/g,
    /要求外语语种[为:]英语/g,
    /招英语语种/g,
    /宜英语语种/g,
  ]

  for (const match of matches) {
    const major = match.major
    const start = match.start

    if (major !== '英语') {
      result.push(major)
      continue
    }

    let isRequirement = false
    for (const pattern of excludePatterns) {
      pattern.lastIndex = 0
      let reqMatch = pattern.exec(text)
      while (reqMatch) {
        const reqStart = reqMatch.index
        const reqEnd = reqMatch.index + reqMatch[0].length
        if (start >= reqStart && start < reqEnd) {
          isRequirement = true
          break
        }
        reqMatch = pattern.exec(text)
      }
      if (isRequirement) break
    }

    if (!isRequirement) {
      result.push(major)
    }
  }

  return result
}

function buildOutputFileName(sourceName: string) {
  const stem = sourceName.replace(/\.(xlsx|xls)$/i, '') || '专业提取工具'
  return `${stem}_提取后.xlsx`
}

function getActiveWorksheet(workbook: ExcelJS.Workbook, fileLabel: string) {
  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    throw new Error(`${fileLabel}中没有可处理的工作表`)
  }
  return worksheet
}

async function loadWorkbook(file: File) {
  await validateUploadFile(file, { allowedKinds: ['xlsx'] })
  const workbook = new ExcelJS.Workbook()
  const buffer = await file.arrayBuffer()
  await workbook.xlsx.load(buffer)
  return workbook
}

export async function processProfessionalExtract(params: {
  sourceFile: File
  stdFile: File
  onProgress?: (payload: ProgressPayload) => void
}): Promise<ProfessionalExtractResult> {
  const { sourceFile, stdFile, onProgress } = params
  const logs: string[] = []

  const notify = (payload: ProgressPayload) => {
    if (payload.log) logs.push(payload.log)
    onProgress?.(payload)
  }

  notify({
    progress: 5,
    status: '正在加载标准专业...',
    log: `标准专业表: ${stdFile.name}`,
  })

  const stdWorkbook = await loadWorkbook(stdFile)
  const stdWorksheet = getActiveWorksheet(stdWorkbook, '标准专业表')
  const stdMajors = new Map<string, string[]>()

  for (let rowIndex = 2; rowIndex <= stdWorksheet.rowCount; rowIndex += 1) {
    const row = stdWorksheet.getRow(rowIndex)
    const level = cellToString(row.getCell(1).value)
    const major = cellToString(row.getCell(2).value)

    if (level && major) {
      const current = stdMajors.get(level) || []
      current.push(major)
      stdMajors.set(level, current)
    }
  }

  notify({
    progress: 20,
    status: '正在编译匹配规则...',
    log: `加载了 ${stdMajors.size} 个层次的标准专业`,
  })

  const patterns = new Map<string, RegExp>()
  for (const [level, majors] of stdMajors.entries()) {
    const majorsSorted = Array.from(new Set(majors)).sort((a, b) => b.length - a.length)
    const escaped = majorsSorted.map((major) => escapeRegExp(major))
    const patternStr = `(?:${escaped.join('|')})(?=专业|[、,，；;.。:：（）()\\s\\-\\+]|$)`
    patterns.set(level, new RegExp(patternStr, 'g'))
  }

  notify({
    progress: 30,
    status: '正在读取大类招生表...',
    log: `大类招生表: ${sourceFile.name}`,
  })

  const sourceWorkbook = await loadWorkbook(sourceFile)
  const worksheet = getActiveWorksheet(sourceWorkbook, '大类招生表')
  const totalRows = Math.max(worksheet.rowCount - 1, 0)

  notify({
    progress: 35,
    status: '正在处理...',
    log: `总行数: ${totalRows}`,
  })

  worksheet.getCell(1, 8).value = '提取标准专业'

  let matchedRows = 0
  const previewRows: ProfessionalExtractPreviewRow[] = []

  for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const level = cellToString(worksheet.getCell(rowIndex, 5).value)
    const note = cellToString(worksheet.getCell(rowIndex, 7).value, false)
    const outputCell = worksheet.getCell(rowIndex, 8)

    if (!note || !level) {
      outputCell.value = ''
      continue
    }

    const pat = patterns.get(level)
    if (!pat) {
      outputCell.value = ''
      continue
    }

    pat.lastIndex = 0
    const rawMatches: MatchItem[] = []
    let match = pat.exec(note)
    while (match) {
      rawMatches.push({
        start: match.index,
        major: match[0],
      })
      match = pat.exec(note)
    }

    const filtered = filterEnglishRequirements(note, filterDirections(note, rawMatches, stdMajors.get(level) || []))
    const seen = new Set<string>()
    const result: string[] = []
    for (const item of filtered) {
      if (!seen.has(item)) {
        seen.add(item)
        result.push(item)
      }
    }

    const extracted = result.join(',')
    outputCell.value = extracted

    if (extracted) {
      matchedRows += 1
      if (previewRows.length < 50) {
        previewRows.push({
          rowId: String(rowIndex),
          level,
          note,
          extracted,
        })
      }
    }

    if (rowIndex % 50 === 0 && totalRows > 0) {
      const pct = 35 + ((rowIndex - 1) / totalRows) * 55
      notify({
        progress: Math.min(90, pct),
        status: `正在处理... ${rowIndex - 1}/${totalRows}`,
      })
    }
  }

  notify({
    progress: 95,
    status: '正在保存结果...',
  })

  const buffer = await writeXlsxBufferWithUniformFormatting(sourceWorkbook)
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const fileName = buildOutputFileName(sourceFile.name)

  notify({
    progress: 100,
    status: '提取完成!',
    log: `结果已生成: ${fileName}`,
  })

  return {
    blob,
    fileName,
    totalRows,
    standardLevelCount: stdMajors.size,
    matchedRows,
    previewRows,
    logs,
  }
}

export function downloadProfessionalExtractResult(result: ProfessionalExtractResult) {
  const url = URL.createObjectURL(result.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = result.fileName
  a.click()
  URL.revokeObjectURL(url)
}
