type RemarkLikeInput = {
  rowId?: string
  id?: string

  remark?: unknown
  备注?: unknown
  majorRemark?: unknown
  planRemark?: unknown
  enrollmentType?: unknown
  招生类型?: unknown
}

function toText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeText(value: unknown) {
  return toText(value)
    .replace(/[（）]/g, (char) => (char === '（' ? '(' : ')'))
    .replace(/\s+/g, '')
    .replace(/[，。；：、,.;:]/g, '')
    .replace(/[【】\[\]{}《》<>]/g, '')
    .toLowerCase()
}

function collectRemarkText(record: RemarkLikeInput) {
  return [record.remark, record.备注, record.majorRemark, record.planRemark]
    .map(toText)
    .filter(Boolean)
    .join(' ')
}

function collectEnrollmentTypeText(record: RemarkLikeInput) {
  return [record.enrollmentType, record.招生类型]
    .map(toText)
    .filter(Boolean)
    .join(' ')
}

/**
 * 人工匹配候选相似度使用：备注 + 招生类型。
 * 不使用专业名称、层次、方向、批次，避免专业名称过强导致备注相近项被压低。
 */
function collectCompareText(record: RemarkLikeInput) {
  return [collectRemarkText(record), collectEnrollmentTypeText(record)]
    .filter(Boolean)
    .join(' ')
}

function splitRemarkParts(value: unknown) {
  const rawText = toText(value)

  if (!rawText) return []

  return rawText
    .replace(/[（）]/g, (char) => (char === '（' ? '(' : ')'))
    .split(/[\s，。；：、,.;:/|｜]+/)
    .map((item) => normalizeText(item))
    .filter((item) => item.length >= 2)
}

function extractBracketTokens(value: string) {
  const tokens: string[] = []
  const matches: string[] = value.match(/\(([^)]{1,120})\)/g) ?? []

  matches.forEach((item: string) => {
    const clean = item.replace(/[()]/g, '').trim()

    if (clean) {
      tokens.push(normalizeText(clean))
      splitRemarkParts(clean).forEach((part) => tokens.push(part))
    }
  })

  return tokens
}

function makeNgrams(text: string, size: number) {
  const grams = new Set<string>()

  if (text.length < size) {
    if (text) grams.add(text)
    return grams
  }

  for (let i = 0; i <= text.length - size; i += 1) {
    grams.add(text.slice(i, i + size))
  }

  return grams
}

function diceSimilarity(a: string, b: string, size: number) {
  const gramsA = makeNgrams(a, size)
  const gramsB = makeNgrams(b, size)

  if (!gramsA.size || !gramsB.size) return 0

  let intersection = 0

  gramsA.forEach((gram) => {
    if (gramsB.has(gram)) intersection += 1
  })

  return (2 * intersection) / (gramsA.size + gramsB.size)
}

function getTextSimilarityScore(recordText: string, candidateText: string) {
  const sim2 = diceSimilarity(recordText, candidateText, 2)
  const sim3 = diceSimilarity(recordText, candidateText, 3)

  // 2-gram 对短中文片段更敏感，3-gram 对长备注更稳定。
  return Math.round(sim2 * 35 + sim3 * 45)
}

function splitUsefulTokens(value: unknown) {
  const rawText = toText(value)
  const text = normalizeText(rawText)

  if (!text) return []

  const tokens = new Set<string>()

  const keywordList = [
    '少数民族',
    '少数民族预科',
    '少数民族人才培养',
    '少数民族人才培养专项',
    '预科',
    '民族班',
    '藏区专项',
    '革命老区专项',
    '其他民族地区专项',
    '民族地区专项',
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
    '贫困地区专项',
    '协作计划',
    '南疆单列',
    '边防军人子女预科',
    '只招',
    '不招',
    '英语',
    '日语',
    '俄语',
    '学费待定',
    '学费',
    '待定',
    '普通类',
    '特殊类型',
    '提前批',
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

  splitRemarkParts(rawText).forEach((part) => {
    if (part.length >= 2) {
      tokens.add(part)
    }
  })

  return Array.from(tokens)
}

function hasNegativeConflict(recordText: string, candidateText: string) {
  if (recordText.includes('非师范')) {
    return candidateText.includes('师范') && !candidateText.includes('非师范')
  }

  if (candidateText.includes('非师范')) {
    return recordText.includes('师范') && !recordText.includes('非师范')
  }

  if (recordText.includes('不招') && !candidateText.includes('不招')) {
    return true
  }

  if (candidateText.includes('不招') && !recordText.includes('不招')) {
    return true
  }

  if (recordText.includes('只招') && !candidateText.includes('只招')) {
    return true
  }

  if (candidateText.includes('只招') && !recordText.includes('只招')) {
    return true
  }

  return false
}

function getStrongKeywordScore(recordText: string, candidateText: string) {
  let score = 0

  const strongKeywords = [
    '少数民族人才培养专项',
    '少数民族人才培养',
    '藏区专项',
    '革命老区专项',
    '其他民族地区专项',
    '民族地区专项',
    '少数民族预科',
    '少数民族',
    '民族班',
    '中外合作办学',
    '中外合作',
    '地方专项',
    '国家专项',
    '高校专项',
    '建档立卡',
    '南疆单列',
    '边防军人子女预科',
    '公费师范',
    '免费师范',
    '优师',
    '预科',
    '定向',
  ]

  strongKeywords.forEach((keyword) => {
    const clean = normalizeText(keyword)

    if (recordText.includes(clean) && candidateText.includes(clean)) {
      score += clean.length >= 6 ? 90 : 65
    }
  })

  return score
}

function getEnrollmentTypeScore(currentRecord: RemarkLikeInput, candidate: RemarkLikeInput) {
  const currentType = normalizeText(collectEnrollmentTypeText(currentRecord))
  const candidateType = normalizeText(collectEnrollmentTypeText(candidate))

  if (!currentType || !candidateType) return 0
  if (currentType === candidateType) return 130
  if (currentType.includes(candidateType) || candidateType.includes(currentType)) return 80

  return getTextSimilarityScore(currentType, candidateType)
}

function getTokenCoverageScore(recordTokens: string[], candidateTokens: string[], candidateText: string) {
  let score = 0

  recordTokens.forEach((token) => {
    if (!token) return

    if (candidateText.includes(token)) {
      if (token.length >= 8) score += 60
      else if (token.length >= 5) score += 40
      else if (token.length >= 3) score += 22
      else score += 8
    }

    if (candidateTokens.includes(token)) {
      if (token.length >= 8) score += 50
      else if (token.length >= 5) score += 35
      else if (token.length >= 3) score += 18
      else score += 6
    }
  })

  return score
}

export function getManualMatchRemarkScore(
  currentRecord: RemarkLikeInput,
  candidate: RemarkLikeInput
) {
  const recordRemarkText = collectRemarkText(currentRecord)
  const candidateRemarkText = collectRemarkText(candidate)
  const recordRawText = collectCompareText(currentRecord)
  const candidateRawText = collectCompareText(candidate)

  const recordText = normalizeText(recordRawText)
  const candidateText = normalizeText(candidateRawText)

  if (!recordText) return 0
  if (!candidateText) return 0

  if (hasNegativeConflict(recordText, candidateText)) {
    return -999
  }

  let score = 0

  if (recordText === candidateText) {
    score += 160
  }

  if (candidateText.includes(recordText)) {
    score += 120
  }

  if (recordText.includes(candidateText)) {
    score += 80
  }

  const recordTokens = splitUsefulTokens(recordRawText)
  const candidateTokens = splitUsefulTokens(candidateRawText)

  score += getTokenCoverageScore(recordTokens, candidateTokens, candidateText)
  score += getStrongKeywordScore(recordText, candidateText)
  score += getEnrollmentTypeScore(currentRecord, candidate)

  /**
   * 长备注兜底：即使没有完整关键词命中，也按中文连续片段相似度给分。
   * 解决“备注很长但核心内容相近时无法高亮”的问题。
   */
  score += getTextSimilarityScore(recordText, candidateText)

  /**
   * 只在双方都有备注时，额外计算备注本身的相似度。
   * 这样招生类型一致不会被长空备注稀释，备注一致也能优先高亮。
   */
  const normalizedRecordRemark = normalizeText(recordRemarkText)
  const normalizedCandidateRemark = normalizeText(candidateRemarkText)

  if (normalizedRecordRemark && normalizedCandidateRemark) {
    if (normalizedRecordRemark === normalizedCandidateRemark) score += 160
    if (normalizedCandidateRemark.includes(normalizedRecordRemark)) score += 120
    if (normalizedRecordRemark.includes(normalizedCandidateRemark)) score += 80
    score += getTextSimilarityScore(normalizedRecordRemark, normalizedCandidateRemark)
  }

  /**
   * 明确业务词额外加权。
   */
  const exactStrongPairs = [
    '革命老区专项',
    '藏区专项',
    '其他民族地区专项',
    '少数民族人才培养专项',
    '少数民族人才培养',
    '少数民族预科',
    '中外合作',
    '地方专项',
    '国家专项',
    '高校专项',
    '建档立卡',
  ]

  exactStrongPairs.forEach((keyword) => {
    const clean = normalizeText(keyword)

    if (recordText.includes(clean) && candidateText.includes(clean)) {
      score += 120
    }
  })

  const currentHasSpecialToken = recordTokens.some((token) => token.length >= 2)
  const candidateHasSpecialToken = candidateTokens.some((token) => token.length >= 2)

  if (currentHasSpecialToken && !candidateHasSpecialToken) {
    score -= 50
  }

  if (!currentHasSpecialToken && !candidateHasSpecialToken && recordText !== candidateText) {
    const similarityScore = getTextSimilarityScore(recordText, candidateText)

    return similarityScore >= 35 ? similarityScore : 0
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
