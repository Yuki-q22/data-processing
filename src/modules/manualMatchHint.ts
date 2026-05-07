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

  batch?: unknown
  批次?: unknown
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
  ]
    .map(toText)
    .filter(Boolean)
    .join(' ')
}

function extractBracketTokens(value: string) {
  const tokens: string[] = []
  const matches = value.match(/\(([^)]{1,50})\)/g) ?? []

  matches.forEach((item: string) => {
    const clean = item.replace(/[()]/g, '').trim()

    if (clean) {
      tokens.push(normalizeText(clean))
    }
  })

  return tokens
}

function splitUsefulTokens(value: unknown) {
  const rawText = toText(value)
  const text = normalizeText(rawText)

  if (!text) return []

  const tokens = new Set<string>()

  const keywordList = [
    '少数民族',
    '少数民族预科',
    '预科',
    '民族班',
    '藏区专项',
    '革命老区专项',
    '其他民族地区专项',
    '不区分民族成分',
    '中外合作',
    '中外合作办学',
    '校企合作',
    '地方专项',
    '国家专项',
    '高校专项',
    '定向',
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
    '建档立卡',
    '本科c段',
    '本科普通',
    '本科',
  ]

  keywordList.forEach((keyword) => {
    const cleanKeyword = normalizeText(keyword)

    if (cleanKeyword && text.includes(cleanKeyword)) {
      tokens.add(cleanKeyword)
    }
  })

  extractBracketTokens(rawText).forEach((token) => {
    if (token) {
      tokens.add(token)
    }
  })

  return Array.from(tokens)
}

function hasNegativeConflict(recordText: string, candidateText: string) {
  // “非师范”不能被普通“师范”误判为相近
  if (recordText.includes('非师范')) {
    return candidateText.includes('师范') && !candidateText.includes('非师范')
  }

  if (candidateText.includes('非师范')) {
    return recordText.includes('师范') && !recordText.includes('非师范')
  }

  return false
}

export function getManualMatchRemarkScore(
  currentRecord: RemarkLikeInput,
  candidate: RemarkLikeInput
) {
  const recordRawText = collectRemarkText(currentRecord)
  const candidateRawText = collectRemarkText(candidate)

  const recordText = normalizeText(recordRawText)
  const candidateText = normalizeText(candidateRawText)

  // 当前记录没有备注时，不做备注智能高亮
  if (!recordText) return 0

  // 候选没有备注、方向、类型时，不参与高亮
  if (!candidateText) return 0

  if (hasNegativeConflict(recordText, candidateText)) {
    return -999
  }

  let score = 0

  // 完全相同，最高优先级
  if (recordText === candidateText) {
    score += 100
  }

  // 双向包含
  if (candidateText.includes(recordText)) {
    score += 60
  }

  if (recordText.includes(candidateText)) {
    score += 40
  }

  const recordTokens = splitUsefulTokens(recordRawText)
  const candidateTokens = splitUsefulTokens(candidateRawText)

  recordTokens.forEach((token) => {
    if (!token) return

    if (candidateText.includes(token)) {
      score += token.length >= 4 ? 20 : 10
    }

    if (candidateTokens.includes(token)) {
      score += token.length >= 4 ? 20 : 10
    }
  })

  // 重点业务词额外加权
  const strongKeywords = [
    '藏区专项',
    '革命老区专项',
    '其他民族地区专项',
    '少数民族',
    '少数民族预科',
    '民族班',
    '中外合作',
    '地方专项',
    '国家专项',
    '高校专项',
    '建档立卡',
  ]

  strongKeywords.forEach((keyword) => {
    const clean = normalizeText(keyword)

    if (recordText.includes(clean) && candidateText.includes(clean)) {
      score += 50
    }
  })

  // 原始记录是“普通类/无特殊备注”，候选也无明显特殊备注，才给低分
  const specialTokens = recordTokens.filter((token) => token.length >= 2)

  if (!specialTokens.length && !candidateTokens.length) {
    score += 5
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