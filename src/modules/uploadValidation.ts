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