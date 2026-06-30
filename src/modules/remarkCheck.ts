/**
 * 招生计划备注检查核心逻辑。
 *
 * 维护规则时优先修改文件顶部的 TYPO_MAP、WHITELIST 和
 * REMARK_COLUMN_NAMES。这里的函数不依赖页面，可直接用于单元测试和
 * 其他数据处理工具。
 */

export const TYPO_MAP: Readonly<Record<string, string>> = {
  详贝院校招生章程: '详见院校招生章程',
  详贝学校招生章程: '详见学校招生章程',
  祥见院校招生章程: '详见院校招生章程',
  祥见学校招生章程: '详见学校招生章程',
  详见院校招生张程: '详见院校招生章程',
  详见学校招生张程: '详见学校招生章程',
  详见院校招牛章程: '详见院校招生章程',
  详见学校招牛章程: '详见学校招生章程',
  详见院校招生章呈: '详见院校招生章程',
  详见学校招生章呈: '详见学校招生章程',
  详贝: '详见',
  祥见: '详见',
  张程: '章程',
  章呈: '章程',
  招牛: '招生',
  召生: '招生',
  只召: '只招',
  召收: '招收',
  身休健康: '身体健康',
  身体建康: '身体健康',
  身体健庚: '身体健康',
  体捡: '体检',
  休检: '体检',
  只招有专业志原考生: '只招有专业志愿考生',
  只招有专亚志愿考生: '只招有专业志愿考生',
  有专业志原: '有专业志愿',
  专业志原: '专业志愿',
  专亚志愿: '专业志愿',
  专此志愿: '专业志愿',
  志愿考牛: '志愿考生',
  考牛: '考生',
  男牛: '男生',
  女牛: '女生',
  语仲: '语种',
  语钟: '语种',
  曰语: '日语',
  英浯: '英语',
  英诘: '英语',
  不招色肓: '不招色盲',
  不招色弱色肓: '不招色弱色盲',
  色育: '色盲',
  色肓: '色盲',
  色若: '色弱',
  色弱色育: '色弱色盲',
  色弱色肓: '色弱色盲',
  色盲色若: '色盲色弱',
  不直报考: '不宜报考',
  不宣报考: '不宜报考',
  不官报考: '不宜报考',
  进人: '进入',
  人学: '入学',
  人校: '入校',
  转人: '转入',
  编人: '编入',
  人读: '入读',
  单色识别不全者慎报: '单色识别不全者慎报',
  单色识别不金: '单色识别不全',
  单色识别不仝: '单色识别不全',
  单色识别丕全: '单色识别不全',
  中外合作力学: '中外合作办学',
  校企合作力学: '校企合作办学',
  合作力学: '合作办学',
  中外合作办字: '中外合作办学',
  校企合作办字: '校企合作办学',
  联合培荞: '联合培养',
  办学地占: '办学地点',
  办学地奌: '办学地点',
  办学地点详见院校章程: '办学地点详见院校招生章程',
  师范粪: '师范类',
  帅范类: '师范类',
  帅范: '师范',
  非公费帅范: '非公费师范',
  公费帅范: '公费师范',
  囯家专项计划: '国家专项计划',
  国家专顷计划: '国家专项计划',
  国家专顶计划: '国家专项计划',
  地方专顷计划: '地方专项计划',
  地方专顶计划: '地方专项计划',
  专项计刘: '专项计划',
  计刘: '计划',
  项日: '项目',
  项自: '项目',
  顷目: '项目',
  专顷: '专项',
  专顶: '专项',
  少数民旅: '少数民族',
  民旅: '民族',
  加份: '加分',
  政第: '政策',
  执衍: '执行',
  认同并执厅: '认同并执行',
  符台: '符合',
  台格: '合格',
  成绩台格: '成绩合格',
  口试成缋: '口试成绩',
  成缋: '成绩',
  录収: '录取',
  录叹: '录取',
  包含专亚: '包含专业',
  包含专此: '包含专业',
  包含专止: '包含专业',
  学贵: '学费',
  学弗: '学费',
  字费: '学费',
  住宿贵: '住宿费',
  收费标淮: '收费标准',
  标淮: '标准',
}

const SUSPECT_TYPO_MAP: Readonly<Record<string, string>> = {
  老生: '考生',
  老试: '考试',
  报孝: '报考',
  慎填: '慎报',
  校冈: '校区',
  校医: '校区',
  由请: '申请',
  甲请: '申请',
  电请: '申请',
  攻策: '政策',
  识刖: '识别',
  语神: '语种',
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
const EMPTY_BRACKET_PATTERN = /（\s*）/gu
const REDUNDANT_NESTED_BRACKET_PATTERN = /（\s*（([^（）]*)）\s*）/u
const REDUNDANT_NESTED_BRACKET_REPLACE_PATTERN = /（\s*（([^（）]*)）\s*）/gu
const BRACKET_GROUP_SEPARATOR_PATTERN = /）[、，；]+（/gu
const LEADING_PUNCTUATION_PATTERN = /^[，；：。！？、]+/u
const TRAILING_SEPARATOR_PATTERN = /[，；：、]+$/u
const PUNCTUATION_RUN_PATTERN = /[，；：。！？、]{2,}/gu
const HAN_OCR_NOISE_SYMBOL_PATTERN = /(?<=\p{Script=Han})[%％](?=\p{Script=Han})/gu
const TUITION_PATTERN = /学费[^，；。！？、（）\d]{0,12}?(\d+(?:\.\d+)?)\s*(万元|万|元)/gu
const HEIGHT_VALUE_PATTERN = /(?:身高|身长)[^，；。！？、（）]{0,12}?(\d+(?:\.\d+)?)\s*(cm|CM|厘米|米|m|M)/gu
const HEIGHT_WRONG_UNIT_PATTERN = /(?:身高|身长)[^，；。！？、（）]{0,12}?(\d+(?:\.\d+)?)\s*(kg|KG|公斤|千克|斤)/gu
const WEIGHT_VALUE_PATTERN = /体重[^，；。！？、（）]{0,12}?(\d+(?:\.\d+)?)\s*(kg|KG|公斤|千克|斤)/gu
const WEIGHT_WRONG_UNIT_PATTERN = /体重[^，；。！？、（）]{0,12}?(\d+(?:\.\d+)?)\s*(cm|CM|厘米|米|m|M)/gu
const BRACKET_CONTENT_TYPO_MAP: Readonly<Record<string, string>> = {
  通类: '普通类',
  普类: '普通类',
}

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

function checkSuspectTypos(text: string): TextCheckResult {
  const issues = Object.entries(SUSPECT_TYPO_MAP)
    .sort(([left], [right]) => right.length - left.length)
    .filter(([wrong]) => text.includes(wrong))
    .map(([wrong, correct]) => `疑似 OCR 错字：${wrong} 可能为 ${correct}，请人工检查`)

  return { text, issues, changed: false }
}

function checkOcrNoiseSymbols(text: string): TextCheckResult {
  const current = text.replace(HAN_OCR_NOISE_SYMBOL_PATTERN, '')
  return {
    text: current,
    issues: current !== text ? ['疑似 OCR 多余符号：%/％'] : [],
    changed: current !== text,
  }
}

function duplicateKey(segment: string) {
  return segment.replace(/[\s\u3000]+/gu, '').trim()
}

function collapsePunctuationRun(run: string) {
  const terminalMarks = [...run].filter((char) => '。！？'.includes(char))
  if (terminalMarks.length) return terminalMarks.at(-1) || run[0]
  if (run.includes('；')) return '；'
  if (run.includes('，')) return '，'
  return run[0]
}

function cleanupPunctuationArtifacts(text: string) {
  return text
    .replace(PUNCTUATION_RUN_PATTERN, collapsePunctuationRun)
    .replace(BRACKET_GROUP_SEPARATOR_PATTERN, '）（')
    .replace(/（[，；：。！？、]+/gu, '（')
    .replace(/[，；：。！？、]+）/gu, '）')
    .replace(LEADING_PUNCTUATION_PATTERN, '')
    .replace(TRAILING_SEPARATOR_PATTERN, '')
    .trim()
}

function outerBracketGroups(text: string) {
  const groups: Array<{ start: number; end: number; content: string }> = []
  let depth = 0
  let start: number | undefined

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '（') {
      if (depth === 0) start = index
      depth += 1
      continue
    }

    if (char !== '）' || depth === 0) continue
    depth -= 1
    if (depth === 0 && start !== undefined) {
      groups.push({ start, end: index + 1, content: text.slice(start + 1, index) })
      start = undefined
    }
  }

  return groups
}

function removeDelimitedDuplicates(text: string) {
  const parts = text.split(/([。；;，,\r\n]+)/u)
  const seen = new Set<string>()
  const duplicateLabels: string[] = []
  let rebuilt = ''

  for (let index = 0; index < parts.length; index += 2) {
    const segment = parts[index] || ''
    const delimiter = parts[index + 1] || ''
    const trimmed = segment.trim()
    const key = duplicateKey(trimmed)

    if (!key) {
      if (!rebuilt && delimiter) rebuilt = delimiter
      continue
    }

    if (seen.has(key)) {
      duplicateLabels.push(trimmed)
      continue
    }

    seen.add(key)
    rebuilt += `${trimmed}${delimiter}`
  }

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
        if (
          phrase !== repeated
          || /^\d+$/u.test(phrase)
          || !/^[\p{Script=Han}A-Za-z0-9]+$/u.test(phrase)
        ) continue

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
  const duplicateRanges: Array<{ start: number; end: number }> = []
  let previousGroup: { start: number; end: number; content: string } | undefined

  for (const group of outerBracketGroups(text)) {
    const content = group.content.trim()
    const key = duplicateKey(content)
    if (!key) continue
    if (seen.has(key)) {
      duplicateContents.push(seen.get(key) || content)
      if (previousGroup) {
        const between = text.slice(previousGroup.end, group.start)
        if (duplicateKey(previousGroup.content) === key && !between.trim()) {
          duplicateRanges.push({ start: group.start, end: group.end })
        }
      }
    } else {
      seen.set(key, content)
    }
    previousGroup = group
  }

  let current = text
  if (duplicateRanges.length) {
    let cursor = 0
    current = duplicateRanges
      .map(({ start, end }) => {
        const chunk = text.slice(cursor, start)
        cursor = end
        return chunk
      })
      .join('') + text.slice(cursor)
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

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function checkBracketIssues(text: string): TextCheckResult {
  let current = text
  const issues: string[] = []
  let changed = false

  const withoutEmptyBrackets = current.replace(EMPTY_BRACKET_PATTERN, '')
  if (withoutEmptyBrackets !== current) {
    current = withoutEmptyBrackets
    issues.push('存在空括号')
    changed = true
  }

  if (REDUNDANT_NESTED_BRACKET_PATTERN.test(current)) {
    while (REDUNDANT_NESTED_BRACKET_PATTERN.test(current)) {
      current = current.replace(
        REDUNDANT_NESTED_BRACKET_REPLACE_PATTERN,
        (_full, content: string) => `（${content.trim()}）`,
      )
    }
    issues.push('存在嵌套括号：已去除重复外层括号')
    changed = true
  }

  for (const [wrong, correct] of Object.entries(BRACKET_CONTENT_TYPO_MAP)
    .sort(([left], [right]) => right.length - left.length)) {
    const pattern = new RegExp(`（\\s*${escapeRegExp(wrong)}\\s*）`, 'gu')
    if (pattern.test(current)) {
      current = current.replace(pattern, `（${correct}）`)
      issues.push(`括号内容疑似错字：${wrong} → ${correct}`)
      changed = true
    }
  }

  const shortContents: string[] = []
  for (const group of outerBracketGroups(current)) {
    const content = group.content.replace(/[\s\u3000]+/gu, '')
    if (content.length > 0 && content.length <= 1) shortContents.push(content)
  }

  if (shortContents.length) {
    issues.push(`括号内容过短：${unique(shortContents).join('、')}，请人工检查`)
  }

  if (changed) {
    current = cleanupPunctuationArtifacts(current)
  }

  return { text: current, issues, changed }
}

function checkPhysicalConstraints(text: string): TextCheckResult {
  const issues: string[] = []

  for (const match of text.matchAll(HEIGHT_WRONG_UNIT_PATTERN)) {
    issues.push(`身高单位疑似错误：${match[1]}${match[2]}`)
  }

  for (const match of text.matchAll(HEIGHT_VALUE_PATTERN)) {
    const rawValue = match[1]
    const unit = match[2]
    const value = Number(rawValue)
    const heightCm = unit.toLowerCase() === 'm' || unit === '米' ? value * 100 : value
    if (heightCm < 100 || heightCm > 230) {
      issues.push(`身高数值疑似异常：${rawValue}${unit}`)
    }
  }

  for (const match of text.matchAll(WEIGHT_WRONG_UNIT_PATTERN)) {
    issues.push(`体重单位疑似错误：${match[1]}${match[2]}`)
  }

  for (const match of text.matchAll(WEIGHT_VALUE_PATTERN)) {
    const rawValue = match[1]
    const unit = match[2]
    const value = Number(rawValue)
    const weightKg = unit === '斤' ? value / 2 : value
    if (weightKg < 30 || weightKg > 200) {
      issues.push(`体重数值疑似异常：${rawValue}${unit}`)
    }
  }

  return { text, issues: unique(issues), changed: false }
}

function checkTuition(text: string): TextCheckResult {
  const issues: string[] = []

  for (const match of text.matchAll(TUITION_PATTERN)) {
    const rawValue = match[1]
    const unit = match[2]
    const value = Number(rawValue)
    const yuan = unit === '万' || unit === '万元' ? value * 10000 : value
    if (yuan > 300000) {
      issues.push(`学费金额疑似异常：${rawValue}${unit}超过30万元`)
    }
  }

  return { text, issues: unique(issues), changed: false }
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

  const collapsedPunctuation = current.replace(PUNCTUATION_RUN_PATTERN, collapsePunctuationRun)
  if (collapsedPunctuation !== current) {
    current = collapsedPunctuation
    issues.push('存在连续标点')
    changed = true
  }

  const withoutBracketSeparator = current.replace(BRACKET_GROUP_SEPARATOR_PATTERN, '）（')
  if (withoutBracketSeparator !== current) {
    current = withoutBracketSeparator
    issues.push('括号组之间存在多余标点符号')
    changed = true
  }

  const withoutExtraPunctuation = current
    .replace(/（[，；：。！？、]+/gu, '（')
    .replace(/[，；：。！？、]+）/gu, '）')
    .replace(LEADING_PUNCTUATION_PATTERN, '')
    .replace(TRAILING_SEPARATOR_PATTERN, '')
  if (withoutExtraPunctuation !== current) {
    current = withoutExtraPunctuation
    issues.push('存在多余标点符号')
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
  const ocrNoise = checkOcrNoiseSymbols(abnormal.text)
  const typo = checkTypos(ocrNoise.text)
  const suspectTypo = checkSuspectTypos(typo.text)
  const format = checkFormatIssues(suspectTypo.text)
  const bracket = checkBracketIssues(format.text)
  const duplicate = checkDuplicates(bracket.text)
  const physical = checkPhysicalConstraints(duplicate.text)
  const tuition = checkTuition(physical.text)
  const issueList = unique([
    ...typo.issues,
    ...ocrNoise.issues,
    ...suspectTypo.issues,
    ...format.issues,
    ...bracket.issues,
    ...duplicate.issues,
    ...physical.issues,
    ...tuition.issues,
    ...abnormal.issues,
  ])
  const autoChanged = (
    abnormal.changed
    || ocrNoise.changed
    || typo.changed
    || suspectTypo.changed
    || format.changed
    || bracket.changed
    || duplicate.changed
    || physical.changed
    || tuition.changed
  )
  const fixed = autoChanged && tuition.text !== original ? tuition.text : ''

  return {
    issues: issueList.join('；'),
    fixed,
    issueList,
    changed: autoChanged,
  }
}
