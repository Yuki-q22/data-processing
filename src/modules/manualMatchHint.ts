type RemarkLikeInput = {
  rowId?: string
  id?: string

  remark?: unknown
  备注?: unknown
  majorRemark?: unknown
  planRemark?: unknown
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

/**
 * 只收集备注字段。
 * 注意：
 * - 不收集专业名称
 * - 不收集层次
 * - 不收集招生类型
 * - 不收集方向
 * - 不收集批次
 *
 * 避免“专业相同”或“类型相同”干扰备注智能高亮。
 */
function collectRemarkText(record: RemarkLikeInput) {
  return [
    record.remark,
    record.备注,
    record.majorRemark,
    record.planRemark,
  ]
    .map(toText)
    .filter(Boolean)
    .join(' ')
}

function extractBracketTokens(value: string) {
  const tokens: string[] = []
  const matches: string[] = value.match(/\(([^)]{1,80})\)/g) ?? []

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

  /**
   * 只放和备注强相关的关键词。
   * 不放“本科”“本科普通”“本科C段”等层次/批次词，避免错误高亮。
   */
  const keywordList = [
    '少数民族',
    '少数民族预科',
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
  /**
   * “非师范”不能被普通“师范”误判为相近。
   */
  if (recordText.includes('非师范')) {
    return candidateText.includes('师范') && !candidateText.includes('非师范')
  }

  if (candidateText.includes('非师范')) {
    return recordText.includes('师范') && !recordText.includes('非师范')
  }

  /**
   * “不招/只招”这类限制条件不同，不要轻易高亮。
   */
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
    '藏区专项',
    '革命老区专项',
    '其他民族地区专项',
    '民族地区专项',
    '少数民族',
    '少数民族预科',
    '民族班',
    '中外合作',
    '中外合作办学',
    '地方专项',
    '国家专项',
    '高校专项',
    '建档立卡',
    '预科',
    '定向',
    '公费师范',
    '免费师范',
    '优师',
    '南疆单列',
    '边防军人子女预科',
  ]

  strongKeywords.forEach((keyword) => {
    const clean = normalizeText(keyword)

    if (recordText.includes(clean) && candidateText.includes(clean)) {
      score += clean.length >= 5 ? 70 : 50
    }
  })

  return score
}

export function getManualMatchRemarkScore(
  currentRecord: RemarkLikeInput,
  candidate: RemarkLikeInput
) {
  const recordRawText = collectRemarkText(currentRecord)
  const candidateRawText = collectRemarkText(candidate)

  const recordText = normalizeText(recordRawText)
  const candidateText = normalizeText(candidateRawText)

  /**
   * 当前记录没有备注时，不做备注智能高亮。
   */
  if (!recordText) return 0

  /**
   * 候选没有备注时，不参与高亮。
   */
  if (!candidateText) return 0

  if (hasNegativeConflict(recordText, candidateText)) {
    return -999
  }

  let score = 0

  /**
   * 完全相同，最高优先级。
   */
  if (recordText === candidateText) {
    score += 120
  }

  /**
   * 双向包含。
   */
  if (candidateText.includes(recordText)) {
    score += 80
  }

  if (recordText.includes(candidateText)) {
    score += 50
  }

  const recordTokens = splitUsefulTokens(recordRawText)
  const candidateTokens = splitUsefulTokens(candidateRawText)

  recordTokens.forEach((token) => {
    if (!token) return

    if (candidateText.includes(token)) {
      score += token.length >= 4 ? 25 : 12
    }

    if (candidateTokens.includes(token)) {
      score += token.length >= 4 ? 25 : 12
    }
  })

  score += getStrongKeywordScore(recordText, candidateText)

  /**
   * 特殊处理：
   * 当前备注是“革命老区专项”，候选备注包含“革命老区专项”，必须明显高于普通备注。
   */
  if (
    recordText.includes('革命老区专项') &&
    candidateText.includes('革命老区专项')
  ) {
    score += 100
  }

  if (recordText.includes('藏区专项') && candidateText.includes('藏区专项')) {
    score += 100
  }

  if (
    recordText.includes('其他民族地区专项') &&
    candidateText.includes('其他民族地区专项')
  ) {
    score += 100
  }

  if (recordText.includes('中外合作') && candidateText.includes('中外合作')) {
    score += 90
  }

  /**
   * 如果当前备注有明显特殊词，而候选没有任何特殊词，则降低分数。
   */
  const currentHasSpecialToken = recordTokens.some((token) => token.length >= 2)
  const candidateHasSpecialToken = candidateTokens.some((token) => token.length >= 2)

  if (currentHasSpecialToken && !candidateHasSpecialToken) {
    score -= 30
  }

  /**
   * 如果当前备注和候选备注都没有可识别关键词，但文本完全不同，不给弱匹配分。
   * 这样避免“普通类”误高亮到无关候选。
   */
  if (!currentHasSpecialToken && !candidateHasSpecialToken && recordText !== candidateText) {
    return 0
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