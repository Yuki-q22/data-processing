type RemarkLikeInput = {
  rowId?: string
  id?: string

  remark?: unknown
  备注?: unknown
  majorRemark?: unknown
  planRemark?: unknown

  direction?: unknown
  方向?: unknown
  planDirection?: unknown

  recruitType?: unknown
  enrollmentType?: unknown
  招生类型?: unknown
  planRecruitType?: unknown

  majorName?: unknown
  专业?: unknown
  专业名称?: unknown
}

function toText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeText(value: unknown) {
  return toText(value)
    .replace(/[（）]/g, (char) => (char === '（' ? '(' : ')'))
    .replace(/\s+/g, '')
    .replace(/[，。；：、,.;:]/g, '')
    .toLowerCase()
}

function collectRemarkText(record: RemarkLikeInput) {
  return [
    record.remark,
    record.备注,
    record.majorRemark,
    record.planRemark,
    record.direction,
    record.方向,
    record.planDirection,
    record.recruitType,
    record.enrollmentType,
    record.招生类型,
    record.planRecruitType,
    record.majorName,
    record.专业,
    record.专业名称,
  ]
    .map(toText)
    .filter(Boolean)
    .join(' ')
}

function splitUsefulTokens(value: unknown) {
  const text = normalizeText(value)

  if (!text) return []

  const tokens = new Set<string>()

  const keywordList = [
    '中外合作',
    '中外合作办学',
    '校企合作',
    '地方专项',
    '国家专项',
    '高校专项',
    '定向',
    '民族班',
    '预科',
    '护理',
    '师范',
    '非师范',
    '公费师范',
    '免费师范',
    '优师',
    '农林',
    '单列',
    '较高收费',
    '软件',
    '医学',
    '口腔',
    '临床',
    '征集',
    '走读',
    '专项',
    '合作',
    '师范类',
    '不招',
    '只招',
  ]

  keywordList.forEach((keyword) => {
    const cleanKeyword = normalizeText(keyword)

    if (cleanKeyword && text.includes(cleanKeyword)) {
      tokens.add(cleanKeyword)
    }
  })

  const bracketMatches: string[] = text.match(/\(([^)]{1,30})\)/g) ?? []

bracketMatches.forEach((item: string) => {
  const clean = item.replace(/[()]/g, '')

  if (clean) {
    tokens.add(clean)
  }
})

  return Array.from(tokens)
}

export function getManualMatchRemarkScore(
  currentRecord: RemarkLikeInput,
  candidate: RemarkLikeInput
) {
  const recordRawText = collectRemarkText(currentRecord)
  const candidateRawText = collectRemarkText(candidate)

  const recordText = normalizeText(recordRawText)
  const candidateText = normalizeText(candidateRawText)

  if (!recordText || !candidateText) {
    return 0
  }

  let score = 0

  const tokens = splitUsefulTokens(recordRawText)

  tokens.forEach((token) => {
    if (candidateText.includes(token)) {
      score += 10
    }
  })

  if (candidateText.includes(recordText) || recordText.includes(candidateText)) {
    score += 20
  }

  if (recordText.includes('非师范')) {
    if (candidateText.includes('非师范')) {
      score += 30
    }

    if (!candidateText.includes('非师范') && candidateText.includes('师范')) {
      score -= 20
    }
  }

  if (recordText.includes('师范') && !recordText.includes('非师范')) {
    if (candidateText.includes('师范') && !candidateText.includes('非师范')) {
      score += 15
    }
  }

  if (recordText.includes('中外合作')) {
    if (candidateText.includes('中外合作')) {
      score += 30
    }

    if (!candidateText.includes('中外合作') && candidateText.includes('合作')) {
      score += 10
    }
  }

  if (recordText.includes('地方专项') && candidateText.includes('地方专项')) {
    score += 30
  }

  if (recordText.includes('国家专项') && candidateText.includes('国家专项')) {
    score += 30
  }

  if (recordText.includes('高校专项') && candidateText.includes('高校专项')) {
    score += 30
  }

  if (recordText.includes('预科') && candidateText.includes('预科')) {
    score += 25
  }

  if (recordText.includes('民族班') && candidateText.includes('民族班')) {
    score += 25
  }

  return score
}

export function getBestRemarkMatchedCandidate<T extends RemarkLikeInput>(
  currentRecord: RemarkLikeInput,
  candidates: T[]
) {
  let bestKey = ''
  let bestScore = 0

  candidates.forEach((candidate) => {
    const key = String(candidate.rowId || candidate.id || '')
    const score = getManualMatchRemarkScore(currentRecord, candidate)

    if (key && score > bestScore) {
      bestScore = score
      bestKey = key
    }
  })

  return {
    bestKey,
    bestScore,
  }
}