import { jsPDF } from 'jspdf'

export type ExtractedImageItem = {
  id: string
  url: string
  blob: Blob
  objectUrl: string
  width: number
  height: number
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

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('图片转 DataURL 失败'))
    reader.readAsDataURL(blob)
  })
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

export async function fetchStaticImagesFromPage(url: string): Promise<ExtractedImageItem[]> {
  const htmlResp = await fetch(url)
  if (!htmlResp.ok) {
    throw new Error(`页面获取失败：HTTP ${htmlResp.status}`)
  }

  const html = await htmlResp.text()
  const imageUrls = extractStaticImageUrlsFromHtml(html, url)

  if (!imageUrls.length) {
    return []
  }

  const settled = await Promise.allSettled(
    imageUrls.map(async (imageUrl, index) => {
      const resp = await fetch(imageUrl)
      if (!resp.ok) {
        throw new Error(`图片获取失败：${imageUrl}`)
      }
      const blob = await resp.blob()
      const objectUrl = URL.createObjectURL(blob)
      const size = await getImageSize(objectUrl)

      return {
        id: `img_${index + 1}`,
        url: imageUrl,
        blob,
        objectUrl,
        width: size.width,
        height: size.height,
      } satisfies ExtractedImageItem
    })
  )

  return settled
    .filter((item): item is PromiseFulfilledResult<ExtractedImageItem> => item.status === 'fulfilled')
    .map((item) => item.value)
}

export async function imagesToPdfBlob(images: ExtractedImageItem[]): Promise<Blob> {
  if (!images.length) {
    throw new Error('没有图片可生成 PDF')
  }

  const pdf = new jsPDF({
    orientation: 'p',
    unit: 'pt',
    format: 'a4',
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 24
  const usableWidth = pageWidth - margin * 2
  const usableHeight = pageHeight - margin * 2

  for (let i = 0; i < images.length; i += 1) {
    const item = images[i]
    const dataUrl = await blobToDataUrl(item.blob)

    const widthRatio = usableWidth / item.width
    const heightRatio = usableHeight / item.height
    const scale = Math.min(widthRatio, heightRatio, 1)

    const renderWidth = item.width * scale
    const renderHeight = item.height * scale

    const x = (pageWidth - renderWidth) / 2
    const y = (pageHeight - renderHeight) / 2

    if (i > 0) {
      pdf.addPage()
    }

    const format = item.blob.type.includes('png') ? 'PNG' : 'JPEG'
    pdf.addImage(dataUrl, format, x, y, renderWidth, renderHeight)
  }

  return pdf.output('blob')
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
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}