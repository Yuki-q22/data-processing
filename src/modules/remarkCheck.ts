/**
 * 招生计划备注检查核心逻辑。
 *
 * 维护规则时优先修改文件顶部的 TYPO_MAP、WHITELIST 和
 * REMARK_COLUMN_NAMES。这里的函数不依赖页面，可直接用于单元测试和
 * 其他数据处理工具。
 */

export const TYPO_MAP: Readonly<Record<string, string>> = {
  详见院校招生张程: '详见院校招生章程',
  详见学校招生张程: '详见学校招生章程',
  身休健康: '身体健康',
  只招有专业志原考生: '只招有专业志愿考生',
  不招色肓: '不招色盲',
  不招色弱色肓: '不招色弱色盲',
  单色识别不全者慎报: '单色识别不全者慎报',
  中外合作力学: '中外合作办学',
  校企合作力学: '校企合作办学',
  办学地点详见院校章程: '办学地点详见院校招生章程',
}

export const WHITELIST = [
  '中外合作办学',
  '校企合作',
  '师范类',
  '地方专项计划',
  '国家专项计划',
  '只招英语语种考生',
  '详见院校招生章程',
  '不招色盲',
  '不招色弱',
  '色盲色弱不宜报考',
] as const

export const REMARK_COLUMN_NAMES = ['备注', '专业备注', '计划备注', '招生备注'] as const

const INVALID_REMARKS = new Set(['无', '暂无', '-', '/'])
const EMPTY_TEXT_VALUES = new Set(['nan', 'none'])
const ENGLISH_PUNCTUATION_MAP: Readonly<Record<string, string>> = {
  ',': '，',
  ';': '；',
  ':': '：',
  '(': '（',
  ')': '）',
}

const CLEARLY_CORRUPT_CHARS = new Set(['�'])
const UNCERTAIN_ABNORMAL_CHARS = new Set(['□', '?', '？', '*'])
// 这些控制码正是需要识别并安全删除的不可见字符。
// eslint-disable-next-line no-control-regex
const INVISIBLE_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/u
const HORIZONTAL_SPACE_PATTERN = /[\t\f\v \u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+/gu
const HAN_SPACE_HAN_PATTERN = /(?<=\p{Script=Han}) (?=\p{Script=Han})/gu

export type RemarkCheckResult = {
  issues: string
  fixed: string
  issueList: string[]
  changed: boolean
}

type TextCheckResult = {
  text: string
  issues: string[]
  changed: boolean
}

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)))
}

function toText(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' && Number.isNaN(value)) return ''
  return String(value)
}

export function isEmptyRemark(value: unknown) {
  const text = toText(value).trim()
  return !text || EMPTY_TEXT_VALUES.has(text.toLowerCase())
}

export function isInvalidRemark(value: unknown) {
  return INVALID_REMARKS.has(toText(value).trim())
}

export function findRemarkColumn(headers: string[]) {
  const normalized = new Map(headers.map((header) => [header.trim(), header]))
  for (const candidate of REMARK_COLUMN_NAMES) {
    const original = normalized.get(candidate)
    if (original) return original
  }
  return undefined
}

function describeAbnormalChar(char: string) {
  if (INVISIBLE_CHAR_PATTERN.test(char)) {
    const codePoint = char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0') || ''
    return `不可见字符 U+${codePoint}`
  }
  return char
}

export function checkAbnormalChars(text: string): TextCheckResult {
  const found: string[] = []
  let cleaned = ''

  for (const char of text) {
    const isInvisible = INVISIBLE_CHAR_PATTERN.test(char)
    const isClearlyCorrupt = CLEARLY_CORRUPT_CHARS.has(char)
    const isUncertain = UNCERTAIN_ABNORMAL_CHARS.has(char)
    const codePoint = char.codePointAt(0) || 0
    const isPrivateUse = codePoint >= 0xe000 && codePoint <= 0xf8ff

    if (isInvisible || isClearlyCorrupt || isUncertain || isPrivateUse) {
      found.push(describeAbnormalChar(char))
    }

    // 明确的替换符、私用区乱码和不可见控制符可安全删除；
    // □、问号、星号可能是原表中的有效标记，只提示，不强删。
    if (!isInvisible && !isClearlyCorrupt && !isPrivateUse) {
      cleaned += char
    }
  }

  const abnormal = unique(found)
  return {
    text: cleaned,
    issues: abnormal.length ? [`存在疑似异常字符：${abnormal.join('、')}`] : [],
    changed: cleaned !== text,
  }
}

export function checkTypos(text: string): TextCheckResult {
  // 白名单中的完整固定表达直接放行；错字规则本身仍只做精确匹配，
  // 不用模糊相似度猜测，以免改坏招生限制条件。
  if ((WHITELIST as readonly string[]).includes(text.trim())) {
    return { text, issues: [], changed: false }
  }

  let current = text
  const issues: string[] = []

  const entries = Object.entries(TYPO_MAP).sort(([left], [right]) => right.length - left.length)
  for (const [wrong, correct] of entries) {
    if (wrong === correct || !current.includes(wrong)) continue
    current = current.split(wrong).join(correct)
    issues.push(`疑似错字：${wrong} → ${correct}`)
  }

  return { text: current, issues, changed: current !== text }
}

function duplicateKey(segment: string) {
  return segment.replace(/[\s\u3000]+/gu, '').trim()
}

function removeDelimitedDuplicates(text: string) {
  const parts = text.split(/([。；;，,\r\n]+)/u)
  const seen = new Set<string>()
  const duplicateLabels: string[] = []
  const kept: Array<{ segment: string; delimiter: string }> = []
  const endsWithDelimiter = /[。；;，,\r\n]+$/u.test(text)
  const terminalDelimiter = endsWithDelimiter ? parts.at(-2) || '' : ''

  for (let index = 0; index < parts.length; index += 2) {
    const segment = parts[index] || ''
    const delimiter = parts[index + 1] || ''
    const trimmed = segment.trim()
    const key = duplicateKey(trimmed)

    if (!key) continue

    if (seen.has(key)) {
      duplicateLabels.push(trimmed)
      continue
    }

    seen.add(key)
    kept.push({ segment: trimmed, delimiter })
  }

  const rebuilt = kept
    .map((item, index) => {
      if (index < kept.length - 1) return `${item.segment}${item.delimiter || '；'}`
      return `${item.segment}${terminalDelimiter}`
    })
    .join('')

  return {
    text: rebuilt || text,
    duplicates: unique(duplicateLabels),
  }
}

function removeContinuousDuplicates(text: string) {
  let current = text
  const phrases: string[] = []
  let changedInPass = true

  while (changedInPass) {
    changedInPass = false

    outer: for (let start = 0; start < current.length; start += 1) {
      const maxLength = Math.min(12, Math.floor((current.length - start) / 2))
      for (let length = maxLength; length >= 2; length -= 1) {
        const phrase = current.slice(start, start + length)
        const repeated = current.slice(start + length, start + length * 2)
        if (phrase !== repeated || !/^[\p{Script=Han}A-Za-z0-9]+$/u.test(phrase)) continue

        current = `${current.slice(0, start + length)}${current.slice(start + length * 2)}`
        phrases.push(phrase)
        changedInPass = true
        break outer
      }
    }
  }

  return { text: current, phrases: unique(phrases) }
}

function checkDuplicateBracketContents(text: string) {
  const seen = new Map<string, string>()
  const duplicateContents: string[] = []

  for (const match of text.matchAll(/（([^（）]+)）/gu)) {
    const content = match[1].trim()
    const key = duplicateKey(content)
    if (!key) continue
    if (seen.has(key)) {
      duplicateContents.push(seen.get(key) || content)
    } else {
      seen.set(key, content)
    }
  }

  // 只有相邻且内容完全相同的括号组可以确定是重复录入，因此自动保留一组；
  // 非相邻的相同括号内容只标注，避免误删不同语境下的重要限制条件。
  let current = text
  let changedInPass = true
  while (changedInPass) {
    changedInPass = false
    current = current.replace(
      /（([^（）]+)）[\s\u3000]*（([^（）]+)）/gu,
      (full, left: string, right: string) => {
        if (duplicateKey(left) !== duplicateKey(right)) return full
        changedInPass = true
        return `（${left.trim()}）`
      },
    )
  }

  return {
    text: current,
    contents: unique(duplicateContents),
  }
}

export function checkDuplicates(text: string): TextCheckResult {
  const bracket = checkDuplicateBracketContents(text)
  const delimited = removeDelimitedDuplicates(bracket.text)
  const continuous = removeContinuousDuplicates(delimited.text)
  const issues = [
    ...bracket.contents.map((item) => `重复括号内容：${item}`),
    ...delimited.duplicates.map((item) => `重复内容：${item}`),
    ...continuous.phrases.map((item) => `疑似连续重复：${item}`),
  ]

  return {
    text: continuous.text,
    issues,
    changed: continuous.text !== text,
  }
}

function bracketsAreUnbalanced(text: string) {
  let depth = 0
  for (const char of text) {
    if (char === '（') depth += 1
    if (char === '）') {
      if (depth === 0) return true
      depth -= 1
    }
  }
  return depth !== 0
}

export function checkFormatIssues(text: string): TextCheckResult {
  let current = text
  const issues: string[] = []
  let changed = false

  if (/[\r\n]/u.test(current)) {
    current = current.replace(/[\t \u00A0\u3000]*[\r\n]+[\t \u00A0\u3000]*/gu, '；')
    // 原句已有结尾标点时，换行只表示视觉分隔，不再额外叠加分号。
    current = current.replace(/([，；：。！？、])；/gu, '$1').replace(/；([，；：。！？、])/gu, '$1')
    issues.push('换行符已统一为中文分号')
    changed = true
  }

  const hasHorizontalSpace = HORIZONTAL_SPACE_PATTERN.test(current)
  HORIZONTAL_SPACE_PATTERN.lastIndex = 0
  if (hasHorizontalSpace) {
    const before = current
    current = current.trim().replace(HORIZONTAL_SPACE_PATTERN, ' ')
    HORIZONTAL_SPACE_PATTERN.lastIndex = 0
    current = current
      .replace(HAN_SPACE_HAN_PATTERN, '')
      .replace(/\s*([，；：。！？、（）])\s*/gu, '$1')
    if (current !== before) {
      issues.push('存在多余空格')
      changed = true
    }
  } else {
    const trimmed = current.trim()
    if (trimmed !== current) {
      current = trimmed
      issues.push('存在多余空格')
      changed = true
    }
  }

  if (/[,;:()]/u.test(current)) {
    current = current.replace(/[,;:()]/gu, (char) => ENGLISH_PUNCTUATION_MAP[char] || char)
    issues.push('英文标点已统一为中文标点')
    changed = true
  }

  // “？”可能是 OCR 占位符，按异常字符策略只标注，不在这里压缩或删除。
  if (/([，；：。！、])\1+/u.test(current)) {
    current = current.replace(/([，；：。！、])\1+/gu, '$1')
    issues.push('存在连续标点')
    changed = true
  }

  if (bracketsAreUnbalanced(current)) {
    issues.push('括号疑似不成对，请人工检查')
  }

  return { text: current, issues, changed }
}

/** 仅做格式标准化，不应用错字和重复内容规则。 */
export function normalizeRemark(value: unknown) {
  if (isEmptyRemark(value)) return ''
  const raw = toText(value)
  const abnormal = checkAbnormalChars(raw)
  return checkFormatIssues(abnormal.text).text
}

export function processRemark(value: unknown): RemarkCheckResult {
  if (isEmptyRemark(value) || isInvalidRemark(value)) {
    return { issues: '', fixed: '', issueList: [], changed: false }
  }

  const original = toText(value)
  const abnormal = checkAbnormalChars(original)
  const typo = checkTypos(abnormal.text)
  const duplicate = checkDuplicates(typo.text)
  const format = checkFormatIssues(duplicate.text)
  const issueList = unique([
    ...typo.issues,
    ...duplicate.issues,
    ...format.issues,
    ...abnormal.issues,
  ])
  const autoChanged = abnormal.changed || typo.changed || duplicate.changed || format.changed
  const fixed = autoChanged && format.text !== original ? format.text : ''

  return {
    issues: issueList.join('；'),
    fixed,
    issueList,
    changed: autoChanged,
  }
}
