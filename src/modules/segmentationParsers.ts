export type SegmentationParsedRow = {
  score: number
  count?: number | null
  cumulative: number
  source?: string
}

export type SegmentationParseResult = {
  rows: SegmentationParsedRow[]
  detectedFormat: string
  warnings: string[]
}

type TableGrid = string[][]

type ParserOptions = {
  level?: string
}

type ColumnGroup = {
  scoreCol: number
  countCol?: number
  cumulativeCol: number
  headerRowIndex: number
  label: string
}

const SCORE_HEADER_RE = /(分数|总分|文化总分|成绩)$/
const COUNT_HEADER_RE = /(本分人数|本段人数|分数段人数|分段人数|段内人数|同分人数|人数)/
const CUMULATIVE_HEADER_RE = /(累计人数|累计人次|累计数|累计)/
const RANK_ONLY_RE = /名次|排名|位次/
const RATIO_RE = /比例|占比|率|%|％/

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/[，]/g, ',')
    .replace(/[＋]/g, '+')
    .trim()
}

function compactText(value: unknown) {
  return normalizeCell(value).replace(/\s+/g, '')
}

function isScoreHeader(value: unknown) {
  const text = compactText(value)
  if (!text) return false
  if (/累计|人数|比例|名次|排名|位次|线差/.test(text)) return false
  return SCORE_HEADER_RE.test(text) || ['分数', '总分', '成绩', '文化总分'].includes(text)
}

function isCountHeader(value: unknown) {
  const text = compactText(value)
  if (!text) return false
  if (/累计|比例|占比|率|名次|排名|位次/.test(text)) return false
  return COUNT_HEADER_RE.test(text)
}

function isCumulativeHeader(value: unknown) {
  const text = compactText(value)
  if (!text) return false
  if (RATIO_RE.test(text)) return false
  return CUMULATIVE_HEADER_RE.test(text) || (/累计/.test(text) && !RATIO_RE.test(text))
}

function isRankOnlyHeader(value: unknown) {
  const text = compactText(value)
  return RANK_ONLY_RE.test(text) && !/累计/.test(text)
}

function extractIntegers(value: unknown) {
  return Array.from(normalizeCell(value).matchAll(/\d[\d,]*(?:\.\d+)?/g))
    .map((match) => match[0])
    .filter((raw) => !raw.includes('.'))
    .map((raw) => Number(raw.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n))
}

function parseInteger(value: unknown) {
  const values = extractIntegers(value)
  return values.length ? values[0] : null
}

function parseScore(value: unknown) {
  const text = normalizeCell(value)
  if (!text) return null
  const n = parseInteger(text)
  if (n === null) return null
  if (n < 0 || n > 1000) return null
  return n
}

function isValidScore(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 1000
}

function isValidCumulative(value: number) {
  return Number.isFinite(value) && value >= 0
}

function normalizeGrid(rows: unknown[][]): TableGrid {
  return rows
    .map((row) => row.map((cell) => normalizeCell(cell)))
    .filter((row) => row.some((cell) => cell !== ''))
}

function getCell(rows: TableGrid, rowIndex: number, colIndex: number) {
  return rows[rowIndex]?.[colIndex] ?? ''
}

function getHeaderLabel(rows: TableGrid, headerRowIndex: number, countCol: number, cumulativeCol: number) {
  const fragments: string[] = []
  for (let r = Math.max(0, headerRowIndex - 3); r <= headerRowIndex; r += 1) {
    fragments.push(getCell(rows, r, countCol), getCell(rows, r, cumulativeCol))
  }
  return compactText(fragments.filter(Boolean).join(' '))
}

function selectGroupFromSameScoreColumn(groups: ColumnGroup[], options?: ParserOptions) {
  if (groups.length <= 1) return groups

  const level = compactText(options?.level)
  const wantsCollege = /专科|高职/.test(level)
  const wantsBachelor = /本科/.test(level) && !wantsCollege

  if (wantsCollege) {
    const matched = groups.filter((group) => /专科|高职/.test(group.label))
    if (matched.length) return matched.slice(0, 1)
  }

  if (wantsBachelor) {
    const matched = groups.filter((group) => /本科/.test(group.label) && !/专科|高职/.test(group.label))
    if (matched.length) return matched.slice(0, 1)
  }

  return groups.slice(0, 1)
}

function filterGroupsByLevel(groups: ColumnGroup[], options?: ParserOptions) {
  const byScoreCol = new Map<number, ColumnGroup[]>()
  groups.forEach((group) => {
    const current = byScoreCol.get(group.scoreCol) || []
    current.push(group)
    byScoreCol.set(group.scoreCol, current)
  })

  return Array.from(byScoreCol.values()).flatMap((sameScoreGroups) => selectGroupFromSameScoreColumn(sameScoreGroups, options))
}

function findGroupedColumnHeaders(rows: TableGrid, options?: ParserOptions) {
  const groups: ColumnGroup[] = []

  rows.forEach((row, rowIndex) => {
    const scoreCols = row
      .map((cell, index) => ({ cell, index }))
      .filter((item) => isScoreHeader(item.cell))
      .map((item) => item.index)

    if (!scoreCols.length) return

    scoreCols.forEach((scoreCol, scoreColIndex) => {
      const nextScoreCol = scoreCols[scoreColIndex + 1] ?? row.length
      const sectionStart = scoreCol + 1
      const sectionEnd = nextScoreCol

      for (let col = sectionStart; col < sectionEnd; col += 1) {
        if (!isCountHeader(row[col])) continue

        let cumulativeCol = -1
        for (let nextCol = col + 1; nextCol < sectionEnd; nextCol += 1) {
          if (isCountHeader(row[nextCol])) break
          if (isRankOnlyHeader(row[nextCol])) continue
          if (isCumulativeHeader(row[nextCol])) {
            cumulativeCol = nextCol
            break
          }
        }

        if (cumulativeCol === -1) continue

        groups.push({
          scoreCol,
          countCol: col,
          cumulativeCol,
          headerRowIndex: rowIndex,
          label: getHeaderLabel(rows, rowIndex, col, cumulativeCol),
        })
      }

      if (!groups.some((group) => group.headerRowIndex === rowIndex && group.scoreCol === scoreCol)) {
        const cumulativeCol = row.findIndex((cell, index) => index > scoreCol && index < sectionEnd && isCumulativeHeader(cell))
        if (cumulativeCol > scoreCol) {
          groups.push({
            scoreCol,
            cumulativeCol,
            headerRowIndex: rowIndex,
            label: getHeaderLabel(rows, rowIndex, scoreCol, cumulativeCol),
          })
        }
      }
    })
  })

  return filterGroupsByLevel(groups, options)
}

function parseRowsByGroups(rows: TableGrid, groups: ColumnGroup[]): SegmentationParsedRow[] {
  const parsed: SegmentationParsedRow[] = []

  groups.forEach((group) => {
    for (let r = group.headerRowIndex + 1; r < rows.length; r += 1) {
      const row = rows[r]
      const score = parseScore(row[group.scoreCol])
      const cumulative = parseInteger(row[group.cumulativeCol])
      if (score === null || cumulative === null || !isValidCumulative(cumulative)) continue

      const count = group.countCol === undefined ? null : parseInteger(row[group.countCol])
      parsed.push({
        score,
        count,
        cumulative,
        source: `r${r + 1}:c${group.scoreCol + 1}-${group.cumulativeCol + 1}`,
      })
    }
  })

  return parsed
}

function parseGenericGroupedRows(rows: TableGrid, options?: ParserOptions): SegmentationParseResult {
  const groups = findGroupedColumnHeaders(rows, options)
  const parsedRows = parseRowsByGroups(rows, groups)
  return {
    rows: dedupeAndSortRows(parsedRows),
    detectedFormat: groups.length > 1 ? 'generic-multi-group-table' : 'generic-single-group-table',
    warnings: [],
  }
}

function parseGuizhouWideRows(rows: TableGrid): SegmentationParseResult {
  const parsedRows: SegmentationParsedRow[] = []

  rows.forEach((row, rowIndex) => {
    const scoreLabelCol = row.findIndex((cell) => isScoreHeader(cell))
    if (scoreLabelCol < 0) return

    const scoreCols = row
      .map((cell, colIndex) => ({ colIndex, score: parseScore(cell) }))
      .filter((item) => item.colIndex > scoreLabelCol && item.score !== null) as Array<{ colIndex: number; score: number }>

    if (scoreCols.length < 5) return

    let countRowIndex = -1
    let cumulativeRowIndex = -1
    for (let nextRowIndex = rowIndex + 1; nextRowIndex < rows.length && nextRowIndex <= rowIndex + 5; nextRowIndex += 1) {
      const candidateText = compactText(rows[nextRowIndex].join(' '))
      if (countRowIndex === -1 && COUNT_HEADER_RE.test(candidateText) && !/累计/.test(candidateText)) {
        countRowIndex = nextRowIndex
      }
      if (cumulativeRowIndex === -1 && CUMULATIVE_HEADER_RE.test(candidateText) && !RATIO_RE.test(candidateText)) {
        cumulativeRowIndex = nextRowIndex
      }
    }

    if (cumulativeRowIndex === -1) return

    scoreCols.forEach(({ colIndex, score }) => {
      const cumulative = parseInteger(rows[cumulativeRowIndex][colIndex])
      if (cumulative === null || !isValidCumulative(cumulative)) return

      const count = countRowIndex === -1 ? null : parseInteger(rows[countRowIndex][colIndex])
      parsedRows.push({ score, count, cumulative, source: `wide-r${rowIndex + 1}:c${colIndex + 1}` })
    })
  })

  return {
    rows: dedupeAndSortRows(parsedRows),
    detectedFormat: 'guizhou-wide-table',
    warnings: [],
  }
}

function parseJilinMatrixRows(rows: TableGrid): SegmentationParseResult {
  const parsedRows: SegmentationParsedRow[] = []

  rows.forEach((row, rowIndex) => {
    const scoreLabelCol = row.findIndex((cell) => isScoreHeader(cell))
    if (scoreLabelCol < 0) return

    const offsets = row
      .map((cell, colIndex) => {
        const text = compactText(cell)
        const match = text.match(/^([+-])(\d+)$/)
        if (!match) return null
        const offset = Number(match[2]) * (match[1] === '-' ? -1 : 1)
        return { colIndex, offset }
      })
      .filter((item): item is { colIndex: number; offset: number } => Boolean(item))
      .sort((a, b) => a.colIndex - b.colIndex)

    if (offsets.length < 5) return

    for (let r = rowIndex + 1; r < rows.length; r += 1) {
      const baseScore = parseScore(rows[r][scoreLabelCol])
      if (baseScore === null) continue

      offsets.forEach(({ colIndex, offset }) => {
        const cumulative = parseInteger(rows[r][colIndex])
        if (cumulative === null || !isValidCumulative(cumulative)) return
        const score = baseScore + offset
        if (!isValidScore(score)) return
        parsedRows.push({ score, cumulative, count: null, source: `jilin-r${r + 1}:c${colIndex + 1}` })
      })
    }
  })

  return {
    rows: dedupeAndSortRows(parsedRows),
    detectedFormat: 'jilin-matrix-table',
    warnings: [],
  }
}

function chooseSharedScorePairIndex(pairCount: number, options?: ParserOptions) {
  const level = compactText(options?.level)
  if (pairCount <= 1) return 0
  if (/专科|高职/.test(level)) return Math.min(1, pairCount - 1)
  return 0
}

function parseDirectNumericRows(rows: TableGrid, options?: ParserOptions): SegmentationParseResult {
  const parsedRows: SegmentationParsedRow[] = []

  rows.forEach((row, rowIndex) => {
    const values = row.flatMap((cell) => extractIntegers(cell))
    if (values.length < 2) return

    const first = values[0]
    if (!isValidScore(first)) return

    if (values.length >= 5 && (values.length - 1) % 2 === 0) {
      const pairCount = (values.length - 1) / 2
      const pairIndex = chooseSharedScorePairIndex(pairCount, options)
      const count = values[1 + pairIndex * 2]
      const cumulative = values[2 + pairIndex * 2]
      if (isValidCumulative(cumulative)) {
        parsedRows.push({ score: first, count, cumulative, source: `direct-shared-r${rowIndex + 1}` })
      }
      return
    }

    if (values.length >= 3) {
      for (let i = 0; i + 2 < values.length; i += 3) {
        const score = values[i]
        const count = values[i + 1]
        const cumulative = values[i + 2]
        if (!isValidScore(score) || !isValidCumulative(cumulative)) continue
        parsedRows.push({ score, count, cumulative, source: `direct-group-r${rowIndex + 1}:n${i + 1}` })
      }
      return
    }

    const cumulative = values[1]
    if (isValidCumulative(cumulative)) {
      parsedRows.push({ score: first, count: null, cumulative, source: `direct-r${rowIndex + 1}` })
    }
  })

  return {
    rows: dedupeAndSortRows(parsedRows),
    detectedFormat: 'direct-numeric-table',
    warnings: [],
  }
}

function dedupeAndSortRows(rows: SegmentationParsedRow[]) {
  const bestByScore = new Map<number, SegmentationParsedRow>()

  rows.forEach((row) => {
    if (!isValidScore(row.score) || !isValidCumulative(row.cumulative)) return
    const current = bestByScore.get(row.score)
    if (!current) {
      bestByScore.set(row.score, row)
      return
    }

    const currentHasCount = current.count !== null && current.count !== undefined
    const nextHasCount = row.count !== null && row.count !== undefined
    if (!currentHasCount && nextHasCount) {
      bestByScore.set(row.score, row)
    }
  })

  return Array.from(bestByScore.values()).sort((a, b) => b.score - a.score)
}

function splitPlainTextLine(line: string) {
  const normalized = line
    .replace(/\u00a0/g, ' ')
    .replace(/[|｜]/g, '\t')
    .replace(/ {0,1}\t {0,1}/g, '\t')
    .trim()

  if (!normalized) return []
  if (normalized.includes('\t')) {
    return normalized.split(/\t+/).map((cell) => normalizeCell(cell))
  }

  const byMultiSpace = normalized.split(/\s{2,}/).map((cell) => normalizeCell(cell))
  if (byMultiSpace.length >= 2) return byMultiSpace

  const integerCount = extractIntegers(normalized).length
  if (integerCount >= 2 || /分数|总分|人数|累计|本段|本分|文化总分/.test(normalized)) {
    return normalized.split(/\s+/).map((cell) => normalizeCell(cell))
  }

  return [normalized]
}

export function parsePlainTextToGrid(text: string): TableGrid {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => splitPlainTextLine(line))
    .filter((row) => row.some((cell) => cell !== ''))
}

export function parseSegmentationTableRows(rows: unknown[][], options?: ParserOptions): SegmentationParseResult {
  const grid = normalizeGrid(rows)
  if (!grid.length) {
    return { rows: [], detectedFormat: 'empty', warnings: ['未读取到有效表格内容'] }
  }

  const candidates = [
    parseJilinMatrixRows(grid),
    parseGuizhouWideRows(grid),
    parseGenericGroupedRows(grid, options),
    parseDirectNumericRows(grid, options),
  ].filter((candidate) => candidate.rows.length)

  if (!candidates.length) {
    return {
      rows: [],
      detectedFormat: 'unrecognized',
      warnings: ['未识别到“分数 / 人数 / 累计人数”结构，请检查粘贴内容或表头。'],
    }
  }

  const selected = candidates.sort((a, b) => b.rows.length - a.rows.length)[0]
  return {
    ...selected,
    rows: dedupeAndSortRows(selected.rows),
  }
}

export function parseSegmentationText(text: string, options?: ParserOptions): SegmentationParseResult {
  return parseSegmentationTableRows(parsePlainTextToGrid(text), options)
}
