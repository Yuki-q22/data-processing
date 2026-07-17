import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import {
  EXCEL_EXPORT_COLUMN_WIDTH,
  applyUniformExcelExportFormatting,
  writeXlsxBufferWithUniformFormatting,
} from './excelExport'

describe('Excel export formatting', () => {
  it('统一已有单元格格式并保留其他对齐属性', () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('计划')
    const cell = sheet.getCell('A1')
    cell.value = '备注'
    cell.alignment = { wrapText: true, vertical: 'top' }

    applyUniformExcelExportFormatting(workbook)

    expect(sheet.getColumn(1).width).toBe(EXCEL_EXPORT_COLUMN_WIDTH)
    expect(cell.alignment).toMatchObject({
      horizontal: 'left',
      vertical: 'top',
      wrapText: true,
    })
  })

  it('稀疏工作表不会实例化中间空行', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('稀疏表')
    sheet.getCell('A1').value = '表头'
    sheet.getCell('A100000').value = '末行'

    const buffer = await writeXlsxBufferWithUniformFormatting(workbook)

    expect(sheet.actualRowCount).toBe(2)
    expect(sheet.actualColumnCount).toBe(1)
    expect(sheet.getCell('A100000').alignment.horizontal).toBe('left')
    expect(buffer.byteLength).toBeGreaterThan(0)
  })
})
