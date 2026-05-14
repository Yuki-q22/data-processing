/**
 * 文件名称：高考真题题目截图核心模块
 *
 * 文件作用：
 * - 在浏览器端读取 PDF。
 * - 按顶层题号 1. / 1． / 1、识别题目开始位置。
 * - 排除试卷头部、注意事项、大标题、单独科目名等公共内容。
 * - 按题号边界裁剪 PDF 页面并导出 PNG。
 * - 对跨页题目自动拼接为同一张图片。
 *
 * 依赖：
 * - pdfjs-dist：浏览器端解析和渲染 PDF。
 * - jszip：批量图片打包 ZIP。
 */

import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url'
import JSZip from 'jszip'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc

export type QuestionScreenshotOptions = {
  dpi: number
  edgeCm: number
  innerGapCm: number
  safeClipPt: number
  endBeforeBoundaryPt: number
  ignoreTopCm: number
  ignoreBottomCm: number
  splitExcludedLines: boolean
  /** 自动按渲染后的非空白像素收紧每个截图片段的上下空白。 */
  autoTrimWhitespace: boolean
  /** 白底判定阈值，数值越大越容易把浅灰背景视为空白。 */
  trimWhiteThreshold: number
  /** 自动收紧后额外保留的像素，避免文字边缘被切掉。 */
  trimPaddingPx: number
}

export type TextLine = {
  pageIndex: number
  x0: number
  y0: number
  x1: number
  y1: number
  text: string
}

export type QuestionStart = {
  qno: number
  pageIndex: number
  x: number
  y: number
  text: string
}

export type SectionStart = {
  pageIndex: number
  x: number
  y: number
  text: string
}

export type CropBoundary = {
  pageIndex: number
  y: number
  kind: 'question' | 'section' | 'end'
  text: string
}

export type CropSegment = {
  pageIndex: number
  x0: number
  y0: number
  x1: number
  y1: number
}

export type QuestionCropPlan = {
  id: string
  qno: number
  startText: string
  startPage: number
  endPage: number
  boundaryKind: CropBoundary['kind']
  boundaryText: string
  segments: CropSegment[]
}

export type PageInfo = {
  pageIndex: number
  width: number
  height: number
  lines: TextLine[]
}

export type QuestionScreenshotProject = {
  fileName: string
  pageCount: number
  pdf: PdfDocumentProxy
  pages: PageInfo[]
  starts: QuestionStart[]
  sections: SectionStart[]
  questions: QuestionCropPlan[]
}

export type ExportProgress = {
  current: number
  total: number
  fileName: string
}

type PdfDocumentProxy = {
  numPages: number
  getPage(pageNumber: number): Promise<PdfPageProxy>
}

type PdfPageProxy = {
  getViewport(params: { scale: number }): PdfViewport
  getTextContent(): Promise<{ items: PdfTextItem[] }>
  render(params: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }): { promise: Promise<void> }
}

type PdfViewport = {
  width: number
  height: number
  transform: number[]
}

type PdfTextItem = {
  str?: string
  width?: number
  height?: number
  transform?: number[]
}

type InternalTextItem = {
  x0: number
  y0: number
  x1: number
  y1: number
  text: string
}

const QUESTION_RE = /^\s*([1-9]\d{0,2})[.．、](?!\d)\s*/

const SECTION_TITLE_RE = /^\s*(?:[一二三四五六七八九十]+\s*[、.．]\s*(?:单项选择题|单选题|多项选择题|多选题|不定项选择题|选择题\s*\d*|选择题|非选择题|填空题|实验题|解答题|计算题|综合题|问答题|作图题|判断题|客观题|主观题|材料题|材料分析题|阅读材料)(?:\s*[:：])?(?:\s*[（(].*?[）)])?|(?:选择题|非选择题|客观题|主观题|单项选择题|多项选择题|不定项选择题)\s*部分|第\s*[一二三四五六七八九十]+\s*部分)/

const PAPER_SECRET_RE = /(?:机密|绝密|秘密)\s*[★*]\s*启用前/

const PAPER_TITLE_RE = /^\s*(?:\d{4}\s*年)?[\u4e00-\u9fa5]{0,20}(?:省|市|自治区|全国)?.{0,26}(?:普通高中学业水平选择性考试|普通高中学业水平考试|普通高等学校招生全国统一考试|普通高等学校招生考试|高等学校招生考试|高考|学业水平选择性考试)\s*$/

const NOTICE_TITLE_RE = /^\s*(?:注意事项|考生须知|答题注意事项|考生注意|考试说明|试卷说明)\s*[:：]?\s*$/

const NOTICE_ITEM_RE = /^\s*\d{1,2}[.．、]\s*(?:答卷前|答题前|回答选择题时|回答非选择题时|考试结束后|考试结束|请将|用铅笔|用黑色字迹|将答案|本试卷|本卷|作答|考生)/

const PARAM_NOTICE_RE = /^\s*\d{1,2}[.．、]\s*(?:可能用到|可能用到的相关参数|相关参数|参考公式|已知条件|本卷中|本试卷中)/

const QUESTION_ANYWHERE_RE = /(?:^|[\s　]|[A-DＡ-Ｄ][.．、]?\s*|[。；;，,、）)]\s*)([1-9]\d{0,2})[.．、](?!\d)\s*/g

const PAGE_NUMBER_RE = /^\s*(?:第\s*)?\d+\s*(?:页\s*[\/／]?\s*共\s*\d+\s*页|[\/／]\s*\d+\s*页?)\s*$|^\s*第\s*\d+\s*页\s*[\/／]\s*共\s*\d+\s*页\s*$/

const SOURCE_WATERMARK_RE = /(?:学科网|组卷网|zxxk|zujuan|www\.)/i

// 答案、解析、下一份试卷头部等内容出现时，通常表示最后一道题已经结束。
const ANSWER_OR_ANALYSIS_TITLE_RE = /^\s*(?:参考答案|答案解析|试题答案|真题答案|答案与解析|解析|评分标准|参考评分标准|命题意图|详解)\s*[:：]?\s*$/

const ANSWER_ITEM_RE = /(?:【\s*\d+\s*题答案\s*】|【\s*答案\s*】)/

// 有些 PDF 的页脚不是标准页码文本，保留一个很小的默认安全区。
const AUTO_FOOTER_IGNORE_CM = 1.25

// 跨页续接页的页眉通常包含来源 LOGO/水印。
// 默认跳过约 2.3cm，避免把页眉 LOGO 截进跨页题，同时保留本示例 PDF 中 y≈69pt 开始的题图。
const AUTO_CONTINUATION_HEADER_IGNORE_CM = 1.45

const HEAD_PREAMBLE_KEYWORDS = [
  '考生注意',
  '注意事项',
  '试卷说明',
  '试题卷',
  '答题纸',
  '答题卡',
  '选择题部分',
  '非选择题部分',
  '可能用到',
  '相关参数',
  '参考公式',
  '重力加速度',
]

const NOTICE_KEYWORDS = [
  '姓名',
  '考生号',
  '考场号',
  '座位号',
  '准考证号',
  '答题卡',
  '答题纸',
  '答案标号',
  '用铅笔',
  '用黑色字迹',
  '橡皮擦',
  '橡皮',
  '修改液',
  '修正带',
  '本试卷上无效',
  '试卷上无效',
  '一并交回',
  '交回',
  '答卷前',
  '答题前',
  '回答选择题',
  '回答非选择题',
  '考试结束',
]

const SUBJECT_NAMES = new Set([
  '语文',
  '数学',
  '英语',
  '物理',
  '化学',
  '生物',
  '历史',
  '地理',
  '政治',
  '思想政治',
  '道德与法治',
  '文科综合',
  '理科综合',
  '综合',
])

export const DEFAULT_QUESTION_SCREENSHOT_OPTIONS: QuestionScreenshotOptions = {
  dpi: 240,
  edgeCm: 1,
  innerGapCm: 0.12,
  safeClipPt: 2,
  endBeforeBoundaryPt: 8,
  ignoreTopCm: 0,
  ignoreBottomCm: 0,
  splitExcludedLines: true,
  autoTrimWhitespace: true,
  trimWhiteThreshold: 245,
  trimPaddingPx: 10,
}

function normText(text: string) {
  return (text || '').replace(/\s+/g, ' ').trim()
}

function compactText(text: string) {
  return (text || '').replace(/\s+/g, '')
}

function cmToPt(cm: number) {
  return (cm / 2.54) * 72
}

function cmToPx(cm: number, dpi: number) {
  return Math.max(0, Math.round((cm / 2.54) * dpi))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function isSectionTitle(text: string) {
  return SECTION_TITLE_RE.test(normText(text))
}

function isCenteredSingleSubjectLine(line: TextLine, pageWidth: number) {
  const text = compactText(line.text)
  if (!SUBJECT_NAMES.has(text)) return false

  const lineCenter = (line.x0 + line.x1) / 2
  const pageCenter = pageWidth / 2
  const width = line.x1 - line.x0

  if (Math.abs(lineCenter - pageCenter) > pageWidth * 0.25) return false
  if (width > pageWidth * 0.35) return false

  return true
}


function isPageNumberLine(line: TextLine, pageWidth: number, pageHeight: number) {
  const text = compactText(line.text)
  if (!PAGE_NUMBER_RE.test(text)) return false

  const lineCenter = (line.x0 + line.x1) / 2
  const pageCenter = pageWidth / 2
  const centerNearMiddle = Math.abs(lineCenter - pageCenter) <= pageWidth * 0.25
  const nearBottom = line.y0 >= pageHeight * 0.65

  return centerNearMiddle && nearBottom
}

function isSourceWatermarkLine(line: TextLine, pageHeight: number) {
  const text = normText(line.text)
  if (!SOURCE_WATERMARK_RE.test(text)) return false

  // 学科网 / 组卷网这类来源标识通常在页眉或题目前的空白区。
  // 只在页面上半部分过滤，避免误删题干中引用网站名称的极端情况。
  return line.y0 <= pageHeight * 0.35
}

function isLikelyPreambleNoticeContinuation(line: TextLine, pageHeight: number) {
  const text = normText(line.text)
  if (!text) return false

  // 注意事项里的续行需要过滤，但题目正文也可能出现“答题纸、答题卡”等词。
  // 因此只在页面靠前区域按关键词兜底过滤；正文中同类词不再误删。
  if (line.y0 > pageHeight * 0.42) return false
  return NOTICE_KEYWORDS.some((keyword) => text.includes(keyword))
}

function isParameterNoticeLine(line: TextLine) {
  const text = normText(line.text)
  if (PARAM_NOTICE_RE.test(text)) return true
  return HEAD_PREAMBLE_KEYWORDS.some((keyword) => text.includes(keyword)) && !QUESTION_RE.test(text)
}

function isHardStopLineAfterQuestions(line: TextLine, pageHeight: number) {
  const text = normText(line.text)
  const compact = compactText(text)

  if (!text) return false
  if (ANSWER_OR_ANALYSIS_TITLE_RE.test(text)) return true
  if (ANSWER_ITEM_RE.test(text)) return true

  // 答案页 / 下一份试卷页可能从页面顶部就重新出现试卷标题或注意事项，不能限制为页面中下部。
  if (PAPER_SECRET_RE.test(compact)) return true
  if (PAPER_TITLE_RE.test(text)) return true

  const looksLikeExamTitle =
    /\d{4}\s*年/.test(text) &&
    /(?:普通高校招生|普通高等学校招生|选考科目考试|高考|学业水平)/.test(text)
  if (looksLikeExamTitle) return true

  // 注意事项编号在正文中偶尔可能出现引用，因此只在页面靠前或答案页常见位置作为硬结束。
  const nearTopOrMiddle = line.y0 <= pageHeight * 0.55
  if (nearTopOrMiddle && NOTICE_TITLE_RE.test(text)) return true
  if (nearTopOrMiddle && NOTICE_ITEM_RE.test(text)) return true
  if (nearTopOrMiddle && PARAM_NOTICE_RE.test(text)) return true

  return false
}

function isPaperMetaLine(line: TextLine, pageWidth: number, pageHeight: number) {
  const text = normText(line.text)
  const compact = compactText(text)

  if (!text) return true
  if (PAPER_SECRET_RE.test(compact)) return true
  if (PAPER_TITLE_RE.test(text)) return true
  if (NOTICE_TITLE_RE.test(text)) return true
  if (NOTICE_ITEM_RE.test(text)) return true
  if (PARAM_NOTICE_RE.test(text)) return true
  if (isSectionTitle(text)) return true
  if (isCenteredSingleSubjectLine(line, pageWidth)) return true
  if (isPageNumberLine(line, pageWidth, pageHeight)) return true
  if (isSourceWatermarkLine(line, pageHeight)) return true
  if (isLikelyPreambleNoticeContinuation(line, pageHeight)) return true

  return false
}

function updateNoticeState(line: TextLine, pageWidth: number, pageHeight: number, inNotice: boolean) {
  const text = normText(line.text)

  if (NOTICE_TITLE_RE.test(text)) {
    return { excluded: true, inNotice: true }
  }

  if (isSectionTitle(text)) {
    return { excluded: true, inNotice: false }
  }

  if (inNotice) {
    // 注意事项内部也可能出现“4. 可能用到的相关参数”这种编号行，
    // 不能把它当成真正题号。只有不再像试卷公共说明时，才退出注意事项区域。
    if (QUESTION_RE.test(text) && !NOTICE_ITEM_RE.test(text) && !PARAM_NOTICE_RE.test(text)) {
      return { excluded: false, inNotice: false }
    }

    return { excluded: true, inNotice: true }
  }

  if (isPaperMetaLine(line, pageWidth, pageHeight)) {
    if (NOTICE_TITLE_RE.test(text) || NOTICE_ITEM_RE.test(text) || PARAM_NOTICE_RE.test(text) || isParameterNoticeLine(line)) {
      return { excluded: true, inNotice: true }
    }

    return { excluded: true, inNotice: false }
  }

  return { excluded: false, inNotice: false }
}

function isBeforeOrSame(aPage: number, aY: number, bPage: number, bY: number) {
  if (aPage !== bPage) return aPage < bPage
  return aY <= bY
}

function isAfter(aPage: number, aY: number, bPage: number, bY: number, minGap = 1) {
  if (aPage !== bPage) return aPage > bPage
  return aY > bY + minGap
}

function isBefore(aPage: number, aY: number, bPage: number, bY: number, minGap = 1) {
  if (aPage !== bPage) return aPage < bPage
  return aY < bY - minGap
}

function firstBoundaryPosition(boundaries: SequenceBoundary[]) {
  if (!boundaries.length) return null
  const sorted = boundaries.slice().sort((a, b) => a.pageIndex - b.pageIndex || a.y - b.y)
  return sorted[0]
}

type SequenceBoundary = { pageIndex: number; y: number }

function lineCenterY(line: TextLine) {
  return (line.y0 + line.y1) / 2
}

function lineInsideY(line: TextLine, y0: number, y1: number) {
  const center = lineCenterY(line)
  return center >= y0 && center < y1
}


function findQuestionMatchesInLine(line: TextLine) {
  const text = normText(line.text)
  QUESTION_ANYWHERE_RE.lastIndex = 0
  const matches: Array<{ qno: number; index: number; text: string; x: number }> = []

  let match: RegExpExecArray | null
  while ((match = QUESTION_ANYWHERE_RE.exec(text)) !== null) {
    const full = match[0] || ''
    const qnoText = match[1] || ''
    const qno = Number(qnoText)
    if (!Number.isFinite(qno)) continue

    // QUESTION_ANYWHERE_RE 可能会把前面的选项标记 D. / 标点一起吃掉，
    // 真实题号位置应当从捕获到的数字开始算。
    const numberOffsetInMatch = Math.max(0, full.indexOf(qnoText))
    const index = match.index + numberOffsetInMatch

    // 规避极少数“选项 A. 1.23 / B. 2.34”这类数字被误当题号。
    const before = text.slice(Math.max(0, index - 8), index)
    const after = text.slice(index, index + 24)
    if (/第\s*$/.test(before) || /^[1-9]\d{0,2}[.．、]\s*(?:页|分|秒|m|cm|kg|N|Pa|V|A|W|J|Hz)/i.test(after)) {
      continue
    }

    // 估算题号在这一行中的横向位置。裁剪主要依赖 y 坐标，x 只用于日志和去重。
    const ratio = text.length > 0 ? index / text.length : 0
    const x = line.x0 + (line.x1 - line.x0) * ratio
    matches.push({
      qno,
      index,
      x,
      text: text.slice(index),
    })
  }

  return matches
}


function subtractInterval(
  intervals: Array<[number, number]>,
  removeStart: number,
  removeEnd: number,
) {
  const next: Array<[number, number]> = []

  intervals.forEach(([start, end]) => {
    if (removeEnd <= start || removeStart >= end) {
      next.push([start, end])
      return
    }

    if (removeStart > start) {
      next.push([start, Math.max(start, removeStart)])
    }

    if (removeEnd < end) {
      next.push([Math.min(end, removeEnd), end])
    }
  })

  return next.filter(([start, end]) => end - start > 2)
}

function safeFilename(text: string, maxLength = 42) {
  const cleaned = text.replace(/[\\/:*?"<>|\r\n\t]/g, '_').replace(/\s+/g, '')
  return (cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned) || 'question'
}

function getTextItemRect(item: PdfTextItem, viewport: PdfViewport): InternalTextItem | null {
  const text = normText(item.str || '')
  if (!text || !item.transform) return null

  const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
  const rawX = tx[4]
  const rawY = tx[5]
  const width = Math.max(0, Number(item.width || 0))
  const height = Math.max(4, Math.abs(Number(tx[3] || item.height || 8)))

  const x0 = rawX
  const y0 = rawY - height
  const x1 = rawX + width
  const y1 = rawY + Math.max(1, height * 0.25)

  if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) {
    return null
  }

  return { x0, y0, x1, y1, text }
}

function groupTextItemsToLines(items: InternalTextItem[], pageIndex: number) {
  const sorted = items
    .slice()
    .sort((a, b) => Math.round(a.y0 * 10) - Math.round(b.y0 * 10) || a.x0 - b.x0)

  const lineGroups: InternalTextItem[][] = []

  sorted.forEach((item) => {
    const itemCenterY = (item.y0 + item.y1) / 2
    const lastGroup = lineGroups[lineGroups.length - 1]

    if (!lastGroup) {
      lineGroups.push([item])
      return
    }

    const lastY = lastGroup.reduce((sum, current) => sum + (current.y0 + current.y1) / 2, 0) / lastGroup.length
    const tolerance = Math.max(3.5, Math.min(8, (item.y1 - item.y0) * 0.65))

    if (Math.abs(itemCenterY - lastY) <= tolerance) {
      lastGroup.push(item)
    } else {
      lineGroups.push([item])
    }
  })

  return lineGroups
    .map((group) => {
      const sortedGroup = group.slice().sort((a, b) => a.x0 - b.x0)
      const text = normText(sortedGroup.map((item) => item.text).join(''))
      const x0 = Math.min(...sortedGroup.map((item) => item.x0))
      const y0 = Math.min(...sortedGroup.map((item) => item.y0))
      const x1 = Math.max(...sortedGroup.map((item) => item.x1))
      const y1 = Math.max(...sortedGroup.map((item) => item.y1))

      return { pageIndex, x0, y0, x1, y1, text }
    })
    .filter((line) => line.text)
}

async function readPageInfo(pdf: PdfDocumentProxy, pageIndex: number): Promise<PageInfo> {
  const page = await pdf.getPage(pageIndex + 1)
  const viewport = page.getViewport({ scale: 1 })
  const textContent = await page.getTextContent()
  const items = textContent.items
    .map((item) => getTextItemRect(item, viewport))
    .filter((item): item is InternalTextItem => item !== null)

  return {
    pageIndex,
    width: viewport.width,
    height: viewport.height,
    lines: groupTextItemsToLines(items, pageIndex),
  }
}

function detectQuestionStarts(pages: PageInfo[], sectionBoundaries: SectionStart[]) {
  const raw: QuestionStart[] = []

  pages.forEach((page) => {
    let inNotice = false

    page.lines.forEach((line) => {
      const noticeResult = updateNoticeState(line, page.width, page.height, inNotice)
      inNotice = noticeResult.inNotice

      if (noticeResult.excluded) return
      if (isSectionTitle(line.text)) return

      const firstSection = firstBoundaryPosition(sectionBoundaries.filter((boundary) => isSectionTitle(boundary.text)))
      if (firstSection && isBefore(line.pageIndex, line.y0, firstSection.pageIndex, firstSection.y, 1)) return

      // 兜底：注意事项或参数说明里的 1. / 2. / 3. 不应进入题号序列。
      if (NOTICE_ITEM_RE.test(line.text) || PARAM_NOTICE_RE.test(line.text) || isParameterNoticeLine(line)) return

      const matches = findQuestionMatchesInLine(line)
      if (!matches.length) return

      matches.forEach((match) => {
        raw.push({
          qno: match.qno,
          pageIndex: page.pageIndex,
          y: line.y0,
          x: match.x,
          text: match.text,
        })
      })
    })
  })

  const filtered: QuestionStart[] = []

  raw.forEach((start) => {
    const previous = filtered[filtered.length - 1]
    if (previous) {
      const samePosition =
        start.pageIndex === previous.pageIndex &&
        Math.abs(start.y - previous.y) < 6 &&
        Math.abs(start.x - previous.x) < 20

      if (start.qno === previous.qno && samePosition) return
      if (start.qno < previous.qno) return
      if (start.qno === previous.qno && !samePosition) return
    }

    filtered.push(start)
  })

  return filtered
}

function detectSectionStarts(pages: PageInfo[]) {
  const sections: SectionStart[] = []

  pages.forEach((page) => {
    let inNotice = false

    page.lines.forEach((line) => {
      const noticeResult = updateNoticeState(line, page.width, page.height, inNotice)
      inNotice = noticeResult.inNotice

      if (noticeResult.excluded && !isSectionTitle(line.text)) return

      if (isSectionTitle(line.text)) {
        sections.push({
          pageIndex: page.pageIndex,
          y: line.y0,
          x: line.x0,
          text: line.text,
        })
      }
    })
  })

  const filtered: SectionStart[] = []

  sections.forEach((section) => {
    const previous = filtered[filtered.length - 1]
    if (previous && section.pageIndex === previous.pageIndex && Math.abs(section.y - previous.y) < 8) {
      return
    }
    filtered.push(section)
  })

  return filtered
}

function detectHardStopBoundaries(pages: PageInfo[]) {
  const boundaries: SectionStart[] = []

  pages.forEach((page) => {
    page.lines.forEach((line) => {
      if (!isHardStopLineAfterQuestions(line, page.height)) return
      boundaries.push({
        pageIndex: page.pageIndex,
        y: line.y0,
        x: line.x0,
        text: line.text,
      })
    })
  })

  return boundaries
}

function mergeSectionLikeBoundaries(...groups: SectionStart[][]) {
  const merged = groups.flat().sort((a, b) => a.pageIndex - b.pageIndex || a.y - b.y || a.x - b.x)
  const filtered: SectionStart[] = []

  merged.forEach((boundary) => {
    const previous = filtered[filtered.length - 1]
    if (previous && previous.pageIndex === boundary.pageIndex && Math.abs(previous.y - boundary.y) < 8) {
      // 同一位置如果既是“大标题”又是“硬结束边界”，优先保留大标题文本。
      if (!isSectionTitle(previous.text) && isSectionTitle(boundary.text)) {
        filtered[filtered.length - 1] = boundary
      }
      return
    }
    filtered.push(boundary)
  })

  return filtered
}

function nextBoundaryForQuestion(
  pages: PageInfo[],
  start: QuestionStart,
  nextQuestion: QuestionStart | undefined,
  sections: SectionStart[],
): CropBoundary {
  const candidates: CropBoundary[] = []

  if (nextQuestion) {
    candidates.push({
      pageIndex: nextQuestion.pageIndex,
      y: nextQuestion.y,
      kind: 'question',
      text: nextQuestion.text,
    })
  }

  sections.forEach((section) => {
    if (!isAfter(section.pageIndex, section.y, start.pageIndex, start.y, 1)) return

    if (nextQuestion) {
      if (!isBeforeOrSame(section.pageIndex, section.y, nextQuestion.pageIndex, nextQuestion.y)) return
    }

    candidates.push({
      pageIndex: section.pageIndex,
      y: section.y,
      kind: 'section',
      text: section.text,
    })
  })

  if (!candidates.length) {
    const lastPage = pages[pages.length - 1]
    return {
      pageIndex: lastPage.pageIndex,
      y: lastPage.height,
      kind: 'end',
      text: '',
    }
  }

  candidates.sort((a, b) => a.pageIndex - b.pageIndex || a.y - b.y)
  return candidates[0]
}

function getIncludedAndExcludedLines(page: PageInfo, rangeY0: number, rangeY1: number) {
  const included: TextLine[] = []
  const excluded: TextLine[] = []
  let inNotice = false

  page.lines.forEach((line) => {
    if (!lineInsideY(line, rangeY0, rangeY1)) return

    const noticeResult = updateNoticeState(line, page.width, page.height, inNotice)
    inNotice = noticeResult.inNotice

    const shouldExclude = noticeResult.excluded || isSectionTitle(line.text)

    if (shouldExclude) {
      excluded.push(line)
    } else {
      included.push(line)
    }
  })

  return { included, excluded }
}

function buildPageSegments(
  page: PageInfo,
  rangeY0: number,
  rangeY1: number,
  options: QuestionScreenshotOptions,
) {
  const { included, excluded } = getIncludedAndExcludedLines(page, rangeY0, rangeY1)
  if (!included.length) return []

  let intervals: Array<[number, number]> = [[rangeY0, rangeY1]]

  if (options.splitExcludedLines) {
    excluded.forEach((line) => {
      // 对页码、试卷头、注意事项、大标题等排除行，直接从截图区间里切掉。
      intervals = subtractInterval(intervals, line.y0 - 3, line.y1 + 3)
    })
  }

  const segments: CropSegment[] = []
  const x0 = 0
  const x1 = page.width

  intervals.forEach(([startY, endY]) => {
    const contentLines = included.filter((line) => lineInsideY(line, startY, endY))
    if (!contentLines.length) return

    // 使用完整区间裁剪，再在渲染后按像素自动收紧上下空白。
    // 这样既不会漏掉 PDF 文本层识别不到的图片/矢量图，又不会保留跨页处的大段空白。
    const y0 = clamp(startY, 0, page.height)
    const y1 = clamp(endY, 0, page.height)

    if (y1 <= y0 + 2) return

    segments.push({
      pageIndex: page.pageIndex,
      x0,
      y0,
      x1,
      y1,
    })
  })

  return segments
}

function buildSegmentsForQuestion(
  pages: PageInfo[],
  start: QuestionStart,
  boundary: CropBoundary,
  options: QuestionScreenshotOptions,
) {
  const segments: CropSegment[] = []
  const userTopIgnorePt = cmToPt(options.ignoreTopCm)
  const continuationHeaderIgnorePt = cmToPt(Math.max(options.ignoreTopCm, AUTO_CONTINUATION_HEADER_IGNORE_CM))
  const bottomIgnorePt = cmToPt(Math.max(options.ignoreBottomCm, AUTO_FOOTER_IGNORE_CM))

  for (let pageIndex = start.pageIndex; pageIndex <= boundary.pageIndex; pageIndex += 1) {
    const page = pages[pageIndex]
    if (!page) continue

    let y0 = pageIndex === start.pageIndex ? Math.max(0, start.y - 1) : continuationHeaderIgnorePt
    let y1 = page.height - bottomIgnorePt

    if (pageIndex === start.pageIndex && options.ignoreTopCm > 0) {
      y0 = Math.max(y0, userTopIgnorePt)
    }

    if (pageIndex === boundary.pageIndex) {
      if (boundary.kind !== 'end') {
        y1 = Math.min(y1, Math.max(y0, boundary.y - options.endBeforeBoundaryPt))
      }
    }

    if (y1 <= y0 + 2) continue
    segments.push(...buildPageSegments(page, y0, y1, options))
  }

  return segments
}

function buildQuestionPlans(
  pages: PageInfo[],
  starts: QuestionStart[],
  sections: SectionStart[],
  options: QuestionScreenshotOptions,
) {
  return starts.map((start, index) => {
    const nextQuestion = starts[index + 1]
    const boundary = nextBoundaryForQuestion(pages, start, nextQuestion, sections)
    const segments = buildSegmentsForQuestion(pages, start, boundary, options)
    const endPage = segments.length ? Math.max(...segments.map((segment) => segment.pageIndex)) + 1 : boundary.pageIndex + 1

    return {
      id: `${start.qno}-${start.pageIndex}-${Math.round(start.y)}`,
      qno: start.qno,
      startText: start.text,
      startPage: start.pageIndex + 1,
      endPage,
      boundaryKind: boundary.kind,
      boundaryText: boundary.text,
      segments,
    }
  })
}

export function mergeQuestionScreenshotOptions(
  partial?: Partial<QuestionScreenshotOptions>,
): QuestionScreenshotOptions {
  return { ...DEFAULT_QUESTION_SCREENSHOT_OPTIONS, ...(partial || {}) }
}

export async function loadQuestionScreenshotProject(
  file: File,
  partialOptions?: Partial<QuestionScreenshotOptions>,
): Promise<QuestionScreenshotProject> {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('当前工具只支持 PDF。请先把 Word / WPS / DOCX 手动另存为 PDF 后再上传。')
  }

  const options = mergeQuestionScreenshotOptions(partialOptions)
  const buffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
  const pdf = (await loadingTask.promise) as PdfDocumentProxy

  const pages: PageInfo[] = []
  for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex += 1) {
    pages.push(await readPageInfo(pdf, pageIndex))
  }

  const regularSections = detectSectionStarts(pages)
  const hardStopBoundaries = detectHardStopBoundaries(pages)
  const sections = mergeSectionLikeBoundaries(regularSections, hardStopBoundaries)
  const starts = detectQuestionStarts(pages, sections)

  if (!starts.length) {
    throw new Error('没有识别到题号。请确认题号格式是 1. / 1． / 1、，且 PDF 不是纯扫描图片。')
  }

  return {
    fileName: file.name,
    pageCount: pdf.numPages,
    pdf,
    pages,
    starts,
    sections,
    questions: buildQuestionPlans(pages, starts, sections, options),
  }
}

async function renderPageToCanvas(page: PdfPageProxy, scale: number) {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)

  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器无法创建 Canvas 上下文')

  await page.render({ canvasContext: context, viewport }).promise
  return canvas
}

function cropCanvas(source: HTMLCanvasElement, segment: CropSegment, scale: number) {
  const sourceX = Math.max(0, Math.floor(segment.x0 * scale))
  const sourceY = Math.max(0, Math.floor(segment.y0 * scale))
  const sourceWidth = Math.min(source.width - sourceX, Math.ceil((segment.x1 - segment.x0) * scale))
  const sourceHeight = Math.min(source.height - sourceY, Math.ceil((segment.y1 - segment.y0) * scale))

  const target = document.createElement('canvas')
  target.width = Math.max(1, sourceWidth)
  target.height = Math.max(1, sourceHeight)

  const context = target.getContext('2d')
  if (!context) throw new Error('浏览器无法创建 Canvas 上下文')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, target.width, target.height)
  context.drawImage(source, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight)
  return target
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('图片生成失败'))
      }
    }, 'image/png')
  })
}


function rowHasInk(data: Uint8ClampedArray, width: number, y: number, threshold: number) {
  const offset = y * width * 4
  const step = 2

  // 不能只要几个深色像素就认为这一行有内容，否则 PDF 压缩噪点、页面边缘阴影会导致跨页空白裁不掉。
  // 这里按整行宽度设置最小墨点数，并限制上限，兼顾数学公式、短选项行和大段文字行。
  const minInkCount = Math.max(8, Math.min(160, Math.ceil(width * 0.008)))
  let inkCount = 0

  for (let x = 0; x < width; x += step) {
    const i = offset + x * 4
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    if (a <= 8) continue

    // 用“暗度”而不是任一通道低于阈值，避免浅灰扫描背景 / 压缩噪点导致整页都无法裁掉空白。
    const average = (r + g + b) / 3
    const darkness = 255 - average
    const darkEnough = average < threshold && darkness >= 14

    if (darkEnough) {
      inkCount += 1
      if (inkCount >= minInkCount) return true
    }
  }

  return false
}


function hasNearbyInkRow(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  y: number,
  threshold: number,
  direction: 1 | -1,
) {
  // 要求附近多行中至少有 2 行存在有效墨点，避免孤立噪点把整段空白保留下来。
  let hit = 0
  for (let offset = 0; offset <= 5; offset += 1) {
    const yy = y + direction * offset
    if (yy < 0 || yy >= height) continue
    if (rowHasInk(data, width, yy, threshold)) hit += 1
    if (hit >= 2) return true
  }
  return false
}

function trimCanvasVerticalWhitespace(canvas: HTMLCanvasElement, options: QuestionScreenshotOptions) {
  if (!options.autoTrimWhitespace) return canvas
  if (canvas.width <= 1 || canvas.height <= 1) return canvas

  const context = canvas.getContext('2d')
  if (!context) return canvas

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const threshold = clamp(options.trimWhiteThreshold, 220, 255)
  let top = 0
  let bottom = canvas.height - 1

  while (top < canvas.height && !hasNearbyInkRow(imageData.data, canvas.width, canvas.height, top, threshold, 1)) top += 1
  while (bottom > top && !hasNearbyInkRow(imageData.data, canvas.width, canvas.height, bottom, threshold, -1)) bottom -= 1

  if (top >= bottom) return canvas

  const padding = Math.max(0, Math.round(options.trimPaddingPx))
  top = Math.max(0, top - padding)
  bottom = Math.min(canvas.height - 1, bottom + padding)
  const height = bottom - top + 1

  if (top === 0 && height === canvas.height) return canvas

  const target = document.createElement('canvas')
  target.width = canvas.width
  target.height = Math.max(1, height)

  const targetContext = target.getContext('2d')
  if (!targetContext) return canvas

  targetContext.fillStyle = '#ffffff'
  targetContext.fillRect(0, 0, target.width, target.height)
  targetContext.drawImage(canvas, 0, top, canvas.width, height, 0, 0, canvas.width, height)
  return target
}

function stitchCanvases(canvases: HTMLCanvasElement[], options: QuestionScreenshotOptions) {
  if (!canvases.length) throw new Error('没有可拼接的图片片段')

  const edgePx = cmToPx(options.edgeCm, options.dpi)
  const gapPx = cmToPx(options.innerGapCm, options.dpi)
  const contentWidth = Math.max(...canvases.map((canvas) => canvas.width))
  const contentHeight = canvases.reduce((sum, canvas) => sum + canvas.height, 0) + gapPx * Math.max(0, canvases.length - 1)

  const finalCanvas = document.createElement('canvas')
  finalCanvas.width = contentWidth + edgePx * 2
  finalCanvas.height = contentHeight + edgePx * 2

  const context = finalCanvas.getContext('2d')
  if (!context) throw new Error('浏览器无法创建 Canvas 上下文')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, finalCanvas.width, finalCanvas.height)

  let y = edgePx
  canvases.forEach((canvas, index) => {
    context.drawImage(canvas, edgePx, y)
    y += canvas.height
    if (index !== canvases.length - 1) y += gapPx
  })

  return finalCanvas
}

export async function renderQuestionToBlob(
  project: QuestionScreenshotProject,
  question: QuestionCropPlan,
  partialOptions?: Partial<QuestionScreenshotOptions>,
) {
  const options = mergeQuestionScreenshotOptions(partialOptions)
  if (!question.segments.length) throw new Error(`题${question.qno}没有可裁剪内容`)

  const scale = options.dpi / 72
  const pageCanvasCache = new Map<number, HTMLCanvasElement>()
  const pieces: HTMLCanvasElement[] = []

  for (const segment of question.segments) {
    let pageCanvas = pageCanvasCache.get(segment.pageIndex)
    if (!pageCanvas) {
      const page = await project.pdf.getPage(segment.pageIndex + 1)
      pageCanvas = await renderPageToCanvas(page, scale)
      pageCanvasCache.set(segment.pageIndex, pageCanvas)
    }

    pieces.push(trimCanvasVerticalWhitespace(cropCanvas(pageCanvas, segment, scale), options))
  }

  const finalCanvas = stitchCanvases(pieces, options)
  return canvasToBlob(finalCanvas)
}

export function buildQuestionImageFilename(question: QuestionCropPlan) {
  const pagePart = question.startPage === question.endPage ? `P${question.startPage}` : `P${question.startPage}-P${question.endPage}`
  return `题${String(question.qno).padStart(2, '0')}_${pagePart}_${safeFilename(question.startText)}.png`
}

export async function exportQuestionsToZip(
  project: QuestionScreenshotProject,
  partialOptions?: Partial<QuestionScreenshotOptions>,
  onProgress?: (progress: ExportProgress) => void,
) {
  const options = mergeQuestionScreenshotOptions(partialOptions)
  const zip = new JSZip()
  const validQuestions = project.questions.filter((question) => question.segments.length > 0)

  if (!validQuestions.length) {
    throw new Error('没有可导出的题目截图。请检查题号识别结果或调整裁剪参数。')
  }

  for (let index = 0; index < validQuestions.length; index += 1) {
    const question = validQuestions[index]
    const fileName = buildQuestionImageFilename(question)
    onProgress?.({ current: index + 1, total: validQuestions.length, fileName })
    const blob = await renderQuestionToBlob(project, question, options)
    zip.file(fileName, blob)
  }

  const log = buildDetectLog(project)
  zip.file('_detected_questions.txt', log)

  return zip.generateAsync({ type: 'blob' })
}

export function buildDetectLog(project: QuestionScreenshotProject) {
  const lines: string[] = []

  lines.push('[题号识别结果]')
  project.starts.forEach((start) => {
    lines.push(`题${String(start.qno).padStart(2, '0')}\t第${start.pageIndex + 1}页\ty=${start.y.toFixed(1)}\tx=${start.x.toFixed(1)}\t${start.text}`)
  })

  lines.push('')
  lines.push('[大标题识别结果：这些不会截图，也不会截入上一题]')
  project.sections.forEach((section) => {
    lines.push(`第${section.pageIndex + 1}页\ty=${section.y.toFixed(1)}\tx=${section.x.toFixed(1)}\t${section.text}`)
  })

  lines.push('')
  lines.push('[导出计划]')
  project.questions.forEach((question) => {
    lines.push(
      `题${String(question.qno).padStart(2, '0')}\t第${question.startPage}-${question.endPage}页\t片段数=${question.segments.length}\t结束边界=${question.boundaryKind}\t${question.startText}`,
    )
  })

  return lines.join('\n')
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
