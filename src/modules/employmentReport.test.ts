import { describe, expect, it } from 'vitest'
import { fetchStaticImagesFromPage, toSafePdfFilename } from './employmentReport'

describe('employment report input validation', () => {
  it('拒绝空链接和相对链接', async () => {
    await expect(fetchStaticImagesFromPage('')).rejects.toThrow('请输入网页链接')
    await expect(fetchStaticImagesFromPage('NewsDetail.html')).rejects.toThrow('需要包含 http:// 或 https://')
  })

  it('导出文件名移除操作系统非法字符', () => {
    expect(toSafePdfFilename('就业/质量:报告*2025')).toBe('就业_质量_报告_2025.pdf')
    expect(toSafePdfFilename('')).toBe('就业质量报告.pdf')
  })
})
