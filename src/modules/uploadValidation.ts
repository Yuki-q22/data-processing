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

export function validateUploadedHeaders(
  headers: string[],
  requiredFields: string[]
): UploadValidationResult {
  const detectedColumns = headers.map(normalizeHeader).filter(Boolean)
  const normalizedSet = new Set(detectedColumns)

  const matchedFields = requiredFields.filter((field) => normalizedSet.has(field))
  const missingFields = requiredFields.filter((field) => !normalizedSet.has(field))

  return {
    totalColumns: detectedColumns.length,
    detectedColumns,
    requiredFields,
    matchedFields,
    missingFields,
    isValid: missingFields.length === 0,
  }
}