export type FieldMappingItem = {
  sourceField: string
  sampleValue: string
  targetField?: string
  confidence: number
  required: boolean
}

export type EditableFieldMappingItem = FieldMappingItem & {
  ignored?: boolean
  locked?: boolean
}