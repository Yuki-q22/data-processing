import { jsPDF } from 'jspdf'

export type ExtractedImageItem = {
  id: string
  url: string
  blob: Blob
  objectUrl: string
  width: number
  height: number
}

export type StaticImagesFromPageResult = {
  pageTitle: string
  images: ExtractedImageItem[]
}

type FetchStaticImagesOptions = {
  signal?: AbortSignal
}

const FETCH_TIMEOUT_MS = 20_000
const MAX_PAGE_IMAGES = 200
const MAX_PAGE_HTML_BYTES = 10 * 1024 * 1024
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_TOTAL_IMAGE_BYTES = 200 * 1024 * 1024
const IMAGE_FETCH_CONCURRENCY = 6

function getAbsoluteUrl(src: string, baseUrl: string) {
  try {
    return new URL(src, baseUrl).toString()
  } catch {
    return ''
  }
}

function dedupe<T>(items: T[]) {
  return Array.from(new Set(items))
}

function normalizePageUrl(url: string) {
  const trimmed = url.trim()

  if (!trimmed) {
    throw new Error('请输入网页链接')
  }

  if (/^\/\//.test(trimmed)) {
    return `https:${trimmed}`
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('请输入完整网页链接，需要包含 http:// 或 https://。如果当前只有 NewsDetail.html 这类相对路径，请补全网站域名。')
  }

  try {
    return new URL(trimmed).toString()
  } catch {
    throw new Error('网页链接格式不正确，请检查后重试')
  }
}

async function fetchReadableResource(
  url: string,
  targetName: string,
  parentSignal?: AbortSignal,
) {
  const controller = new AbortController()
  const abortFromParent = () => controller.abort(parentSignal?.reason)
  if (parentSignal?.aborted) {
    controller.abort(parentSignal.reason)
  } else {
    parentSignal?.addEventListener('abort', abortFromParent, { once: true })
  }
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const cleanup = () => {
    clearTimeout(timeoutId)
    parentSignal?.removeEventListener('abort', abortFromParent)
  }

  try {
    const response = await fetch(url, { signal: controller.signal })
    return { response, signal: controller.signal, cleanup }
  } catch (error) {
    cleanup()
    if (controller.signal.aborted) {
      throw new Error(parentSignal?.aborted ? `${targetName}抓取已取消` : `${targetName}抓取超时`)
    }
    const message = error instanceof Error ? error.message : String(error)

    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      throw new Error(
        `${targetName}抓取失败：浏览器无法读取该链接，常见原因是网站跨域限制、链接无法访问或图片禁止外链。请确认链接为公开完整地址；如果仍失败，需要先下载网页源码或图片后再本地处理。`
      )
    }

    throw error
  }
}

async function readResponseBlobWithinLimit(
  resource: Awaited<ReturnType<typeof fetchReadableResource>>,
  maxBytes: number,
  targetName: string,
  parentSignal?: AbortSignal,
) {
  const { response, signal } = resource
  const declaredBytes = Number(response.headers.get('content-length') || 0)
  if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
    throw new Error(`${targetName}超过 ${Math.round(maxBytes / 1024 / 1024)} MB`)
  }

  if (!response.body) {
    const blob = await response.blob()
    if (blob.size > maxBytes) {
      throw new Error(`${targetName}超过 ${Math.round(maxBytes / 1024 / 1024)} MB`)
    }
    return blob
  }

  const reader = response.body.getReader()
  const chunks: ArrayBuffer[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue

      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel()
        throw new Error(`${targetName}超过 ${Math.round(maxBytes / 1024 / 1024)} MB`)
      }

      const chunk = new Uint8Array(value.byteLength)
      chunk.set(value)
      chunks.push(chunk.buffer)
    }
  } catch (error) {
    if (signal.aborted) {
      throw new Error(parentSignal?.aborted ? `${targetName}抓取已取消` : `${targetName}抓取超时`)
    }
    throw error
  } finally {
    reader.releaseLock()
  }

  return new Blob(chunks, {
    type: response.headers.get('content-type') || '',
  })
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length)
  let nextIndex = 0

  const run = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      try {
        results[index] = { status: 'fulfilled', value: await mapper(items[index], index) }
      } catch (error) {
        results[index] = { status: 'rejected', reason: error }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run()),
  )
  return results
}

async function getImageSize(objectUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
      })
    }
    img.onerror = () => reject(new Error('图片尺寸读取失败'))
    img.src = objectUrl
  })
}

async function compressImageForPdf(
  blob: Blob,
  maxWidth = 1200,
  quality = 0.75
): Promise<{ dataUrl: string; width: number; height: number }> {
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error('图片压缩失败：图片文件无效')
  }

  const objectUrl = URL.createObjectURL(blob)

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('图片压缩失败：图片加载失败'))
      image.src = objectUrl
    })

    const sourceWidth = img.naturalWidth || img.width
    const sourceHeight = img.naturalHeight || img.height

    if (!sourceWidth || !sourceHeight) {
      throw new Error('图片压缩失败：图片尺寸无效')
    }

    const scale = Math.min(1, maxWidth / sourceWidth)
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('图片压缩失败：无法创建 Canvas')
    }

    // 统一转为 JPEG，避免透明 PNG/超大 PNG 导致 jsPDF 内部字符串过大。
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)

    return {
      dataUrl: canvas.toDataURL('image/jpeg', quality),
      width,
      height,
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export function extractStaticImageUrlsFromHtml(html: string, baseUrl: string): string[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const rawUrls = Array.from(doc.querySelectorAll('img'))
    .map((img) => img.getAttribute('src') || '')
    .map((src) => src.trim())
    .filter(Boolean)

  const absoluteUrls = rawUrls
    .map((src) => getAbsoluteUrl(src, baseUrl))
    .filter((url) => /^https?:\/\//i.test(url))

  return dedupe(absoluteUrls)
}

export function extractPageTitleFromHtml(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  return (doc.querySelector('title')?.textContent || '').replace(/\s+/g, ' ').trim()
}

export function toSafePdfFilename(pageTitle: string) {
  const safeTitle = pageTitle.replace(/[\\/:*?"<>|]/g, '_').trim()
  return `${safeTitle || '就业质量报告'}.pdf`
}

export async function fetchStaticImagesFromPage(
  url: string,
  options: FetchStaticImagesOptions = {},
): Promise<StaticImagesFromPageResult> {
  const pageUrl = normalizePageUrl(url)
  const htmlResource = await fetchReadableResource(pageUrl, '页面', options.signal)
  let html: string
  try {
    if (!htmlResource.response.ok) {
      throw new Error(`页面获取失败：HTTP ${htmlResource.response.status}`)
    }
    const htmlBlob = await readResponseBlobWithinLimit(
      htmlResource,
      MAX_PAGE_HTML_BYTES,
      '页面内容',
      options.signal,
    )
    html = await htmlBlob.text()
  } finally {
    htmlResource.cleanup()
  }

  const pageTitle = extractPageTitleFromHtml(html)
  const imageUrls = extractStaticImageUrlsFromHtml(html, pageUrl).slice(0, MAX_PAGE_IMAGES)

  if (!imageUrls.length) {
    return { pageTitle, images: [] }
  }

  let totalImageBytes = 0
  const settled = await mapWithConcurrency(
    imageUrls,
    IMAGE_FETCH_CONCURRENCY,
    async (imageUrl, index) => {
      if (options.signal?.aborted) throw new Error('图片抓取已取消')

      const imageResource = await fetchReadableResource(imageUrl, '图片', options.signal)
      let blob: Blob
      try {
        const resp = imageResource.response
        if (!resp.ok) {
          throw new Error(`图片获取失败：${imageUrl}`)
        }

        const contentType = resp.headers.get('content-type') || ''
        if (contentType && !contentType.toLowerCase().startsWith('image/')) {
          throw new Error(`响应内容不是图片：${imageUrl}`)
        }
        blob = await readResponseBlobWithinLimit(
          imageResource,
          MAX_IMAGE_BYTES,
          '图片',
          options.signal,
        )
      } finally {
        imageResource.cleanup()
      }

      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error(`图片文件无效：${imageUrl}`)
      }
      totalImageBytes += blob.size
      if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) {
        throw new Error('图片总大小超过 200 MB，请减少页面图片数量后重试')
      }

      const objectUrl = URL.createObjectURL(blob)

      try {
        const size = await getImageSize(objectUrl)
        if (options.signal?.aborted) throw new Error('图片抓取已取消')

        return {
          id: `img_${index + 1}`,
          url: imageUrl,
          blob,
          objectUrl,
          width: size.width,
          height: size.height,
        } satisfies ExtractedImageItem
      } catch (error) {
        URL.revokeObjectURL(objectUrl)
        throw error
      }
    },
  )

  const images = settled
    .filter((item): item is PromiseFulfilledResult<ExtractedImageItem> => item.status === 'fulfilled')
    .map((item) => item.value)

  if (!images.length) {
    throw new Error(
      '页面已读取，但页面中的图片全部抓取失败。常见原因是图片地址禁止跨域读取或禁止外链，请尝试下载网页中的图片后再本地处理。'
    )
  }

  return { pageTitle, images }
}

export async function imagesToPdfBlob(images: ExtractedImageItem[]): Promise<Blob> {
  if (!images.length) {
    throw new Error('没有图片可生成 PDF')
  }

  const firstImage = images[0]
  const firstPageWidth = Math.max(1, Math.round(firstImage.width))
  const firstPageHeight = Math.max(1, Math.round(firstImage.height))
  const pdf = new jsPDF({
    orientation: firstPageWidth >= firstPageHeight ? 'l' : 'p',
    unit: 'pt',
    format: [firstPageWidth, firstPageHeight],
    compress: true,
  })

  for (let i = 0; i < images.length; i += 1) {
    const item = images[i]
    const pageWidth = Math.max(1, Math.round(item.width))
    const pageHeight = Math.max(1, Math.round(item.height))

    // 先压缩，再写入 PDF，避免大图/大量 PNG 导致：
    // Error in function Array.join (: Invalid string length
    const compressed = await compressImageForPdf(item.blob, 1200, 0.75)

    if (i > 0) {
      pdf.addPage([pageWidth, pageHeight], pageWidth >= pageHeight ? 'l' : 'p')
    }

    pdf.addImage(
      compressed.dataUrl,
      'JPEG',
      0,
      0,
      pageWidth,
      pageHeight,
      undefined,
      'FAST'
    )
  }

  const arrayBuffer = pdf.output('arraybuffer')
  return new Blob([arrayBuffer], { type: 'application/pdf' })
}

export function cleanupImageObjectUrls(images: ExtractedImageItem[]) {
  images.forEach((item) => {
    try {
      URL.revokeObjectURL(item.objectUrl)
    } catch {
      // ignore
    }
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  if (!(blob instanceof Blob)) {
    throw new Error('下载失败：生成的文件不是有效 Blob')
  }

  if (blob.size === 0) {
    throw new Error('下载失败：生成的文件为空')
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')

  a.href = url
  a.download = filename
  a.style.display = 'none'

  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  window.setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 1000)
}
