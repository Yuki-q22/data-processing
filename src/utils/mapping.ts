import type { FieldMappingItem } from '../types/mapping'

function normalizeText(value: string) {
  return value.replace(/\s/g, '').trim()
}

function isCodeField(value: string) {
  return value.includes('代码')
}

export function matchFields(
  sourceHeaders: string[],
  aliasDict: Record<string, string[]>
): FieldMappingItem[] {
  return sourceHeaders.map((header) => {
    const normalizedHeader = normalizeText(header)
    let bestTarget = ''
    let bestConfidence = 0

    for (const [target, aliases] of Object.entries(aliasDict)) {
      for (const alias of aliases) {
        const normalizedAlias = normalizeText(alias)

        // 1. 完全相等最高优先级
        if (normalizedHeader === normalizedAlias) {
          bestTarget = target
          bestConfidence = 100
          break
        }

        // 2. 如果原字段是“代码类”，只允许匹配代码类目标，避免专业代码→招生专业
        if (isCodeField(normalizedHeader) && !isCodeField(normalizedAlias)) {
          continue
        }

        // 3. 包含匹配
        if (
          normalizedHeader.includes(normalizedAlias) ||
          normalizedAlias.includes(normalizedHeader)
        ) {
          if (bestConfidence < 88) {
            bestTarget = target
            bestConfidence = 88
          }
        }
      }
    }

    return {
      sourceField: header,
      sampleValue: '',
      targetField: bestConfidence >= 88 ? bestTarget || undefined : undefined,
      confidence: bestConfidence,
      required: false,
    }
  })
}