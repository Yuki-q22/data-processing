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

export async function fetchStaticImagesFromPage(url: string): Promise<StaticImagesFromPageResult> {
  const htmlResp = await fetch(url)
  if (!htmlResp.ok) {
    throw new Error(`页面获取失败：HTTP ${htmlResp.status}`)
  }

  const html = await htmlResp.text()
  const pageTitle = extractPageTitleFromHtml(html)
  const imageUrls = extractStaticImageUrlsFromHtml(html, url)

  if (!imageUrls.length) {
    return { pageTitle, images: [] }
  }

  const settled = await Promise.allSettled(
    imageUrls.map(async (imageUrl, index) => {
      const resp = await fetch(imageUrl)
      if (!resp.ok) {
        throw new Error(`图片获取失败：${imageUrl}`)
      }

      const blob = await resp.blob()
      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error(`图片文件无效：${imageUrl}`)
      }

      const objectUrl = URL.createObjectURL(blob)

      try {
        const size = await getImageSize(objectUrl)

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
    })
  )

  return {
    pageTitle,
    images: settled
      .filter((item): item is PromiseFulfilledResult<ExtractedImageItem> => item.status === 'fulfilled')
      .map((item) => item.value),
  }
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
