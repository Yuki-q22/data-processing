/**
 * 文件名称：上传文件字段校验逻辑
 *
 * 文件作用：
 * - 校验上传文件是否包含必要字段
 * - 生成“字段不完整，缺少 X 个字段”的提示
 * - 判断招生计划、专业分、院校分等文件格式是否符合要求
 *
 * 常改位置：
 * - 必填字段列表
 * - 字段别名识别
 * - 缺失字段提示文字
 * - 是否允许某些字段为空
 *
 * 注意：
 * - 如果上传后提示缺少字段，优先检查本文件
 */

export type UploadValidationResult = {
  totalColumns: number
  detectedColumns: string[]
  requiredFields: string[]
  matchedFields: string[]
  missingFields: string[]
  isValid: boolean
}

function normalizeHeader(value: unknown) {
  return String(value ?? '').trim()
}

function getFieldCandidates(field: string, fieldAliases?: Record<string, string[]>) {
  const aliasList = fieldAliases?.[field] ?? []
  return Array.from(new Set([field, ...aliasList].map(normalizeHeader).filter(Boolean)))
}

export function validateUploadedHeaders(
  headers: string[],
  requiredFields: string[],
  fieldAliases?: Record<string, string[]>
): UploadValidationResult {
  const detectedColumns = headers.map(normalizeHeader).filter(Boolean)
  const normalizedSet = new Set(detectedColumns)

  const matchedFields: string[] = []
  const missingFields: string[] = []

  requiredFields.forEach((field) => {
    const candidates = getFieldCandidates(field, fieldAliases)
    const matched = candidates.some((candidate) => normalizedSet.has(candidate))

    if (matched) {
      matchedFields.push(field)
    } else {
      missingFields.push(field)
    }
  })

  return {
    totalColumns: detectedColumns.length,
    detectedColumns,
    requiredFields,
    matchedFields,
    missingFields,
    isValid: missingFields.length === 0,
  }
}

export type UploadFileKind = 'xlsx' | 'xls' | 'csv' | 'pdf'

type UploadFileValidationOptions = {
  allowedKinds: UploadFileKind[]
  maxBytes?: number
}

const DEFAULT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024

function getExtension(fileName: string) {
  return fileName.toLowerCase().match(/\.([^.]+)$/)?.[1] || ''
}

function startsWithBytes(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value)
}

export async function validateUploadFile(
  file: File,
  options: UploadFileValidationOptions,
) {
  if (!(file instanceof File)) {
    throw new Error('上传文件无效')
  }
  if (file.size <= 0) {
    throw new Error('上传文件为空')
  }

  const maxBytes = options.maxBytes ?? DEFAULT_MAX_UPLOAD_BYTES
  if (file.size > maxBytes) {
    throw new Error(`文件过大，最大支持 ${Math.round(maxBytes / 1024 / 1024)} MB`)
  }

  const extension = getExtension(file.name) as UploadFileKind
  if (!options.allowedKinds.includes(extension)) {
    throw new Error(`文件格式不支持，请上传 ${options.allowedKinds.map((item) => `.${item}`).join('、')}`)
  }

  // 浏览器 accept 只影响文件选择器，这里通过文件头再次验证实际格式。
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  const isZip =
    startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWithBytes(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWithBytes(bytes, [0x50, 0x4b, 0x07, 0x08])
  const isOle = startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  const isPdf = startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])

  if (extension === 'xlsx' && !isZip) throw new Error('文件内容不是有效的 .xlsx 工作簿')
  if (extension === 'xls' && !isOle) throw new Error('文件内容不是有效的 .xls 工作簿')
  if (extension === 'pdf' && !isPdf) throw new Error('文件内容不是有效的 PDF')
}
