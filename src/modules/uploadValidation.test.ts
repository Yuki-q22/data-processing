import { describe, expect, it } from 'vitest'
import { validateUploadFile } from './uploadValidation'

function makeFile(name: string, bytes: number[]) {
  return new File([new Uint8Array(bytes)], name)
}

describe('validateUploadFile', () => {
  it.each([
    ['plan.xlsx', [0x50, 0x4b, 0x03, 0x04], ['xlsx'] as const],
    ['plan.xls', [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], ['xls'] as const],
    ['paper.pdf', [0x25, 0x50, 0x44, 0x46, 0x2d], ['pdf'] as const],
    ['data.csv', [0x61, 0x2c, 0x62], ['csv'] as const],
  ])('接受扩展名和文件头匹配的文件：%s', async (name, bytes, allowedKinds) => {
    await expect(validateUploadFile(makeFile(name, bytes), {
      allowedKinds: [...allowedKinds],
    })).resolves.toBeUndefined()
  })

  it('拒绝空文件', async () => {
    await expect(validateUploadFile(new File([], 'empty.xlsx'), {
      allowedKinds: ['xlsx'],
    })).rejects.toThrow('上传文件为空')
  })

  it('拒绝扩展名不在允许列表中的文件', async () => {
    await expect(validateUploadFile(makeFile('data.txt', [0x61]), {
      allowedKinds: ['csv'],
    })).rejects.toThrow('文件格式不支持')
  })

  it('拒绝伪装成 Excel 或 PDF 的文件', async () => {
    await expect(validateUploadFile(makeFile('fake.xlsx', [0x61, 0x62]), {
      allowedKinds: ['xlsx'],
    })).rejects.toThrow('文件内容不是有效的 .xlsx')
    await expect(validateUploadFile(makeFile('fake.pdf', [0x61, 0x62]), {
      allowedKinds: ['pdf'],
    })).rejects.toThrow('文件内容不是有效的 PDF')
  })

  it('拒绝超过调用方大小上限的文件', async () => {
    await expect(validateUploadFile(makeFile('data.csv', [1, 2, 3]), {
      allowedKinds: ['csv'],
      maxBytes: 2,
    })).rejects.toThrow('文件过大')
  })

  it('文件大小等于上限时允许通过', async () => {
    const file = makeFile('PLAN.XLSX', [0x50, 0x4b, 0x03, 0x04])
    await expect(validateUploadFile(file, {
      allowedKinds: ['xlsx'],
      maxBytes: file.size,
    })).resolves.toBeUndefined()
  })

  it('拒绝非 File 对象', async () => {
    await expect(validateUploadFile({} as File, {
      allowedKinds: ['xlsx'],
    })).rejects.toThrow('上传文件无效')
  })
})
