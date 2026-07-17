import { describe, expect, it } from 'vitest'
import { haveSameMappingSources, matchFields } from './mapping'
import type { EditableFieldMappingItem } from '../types/mapping'

function mapping(sourceField: string): EditableFieldMappingItem {
  return {
    sourceField,
    sampleValue: '',
    confidence: 100,
    required: false,
  }
}

describe('haveSameMappingSources', () => {
  it('映射来源和过滤后的来源一致时保持稳定', () => {
    const mappings = [mapping('年份'), mapping('学校')]
    expect(haveSameMappingSources(mappings, ['年份', '学校'])).toBe(true)
  })

  it('原始表头包含忽略字段时应与过滤后的来源比较', () => {
    const mappings = [mapping('年份'), mapping('学校')]
    expect(haveSameMappingSources(mappings, ['年份', '忽略字段', '学校'])).toBe(false)
    expect(haveSameMappingSources(mappings, ['年份', '学校'])).toBe(true)
  })

  it('顺序或数量变化时触发重新映射', () => {
    const mappings = [mapping('年份'), mapping('学校')]
    expect(haveSameMappingSources(mappings, ['学校', '年份'])).toBe(false)
    expect(haveSameMappingSources(mappings, ['年份'])).toBe(false)
  })
})

describe('matchFields', () => {
  it('代码字段不会误匹配到非代码字段', () => {
    const result = matchFields(['专业代码'], {
      专业: ['专业'],
      专业代码: ['专业代码'],
    })

    expect(result[0].targetField).toBe('专业代码')
    expect(result[0].confidence).toBe(100)
  })
})
