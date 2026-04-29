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