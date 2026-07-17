import type ExcelJS from 'exceljs'

export const EXCEL_EXPORT_COLUMN_WIDTH = 12.75

export function applyUniformExcelExportFormatting(workbook: ExcelJS.Workbook): void {
  workbook.eachSheet((worksheet) => {
    const maxColumn = worksheet.columnCount

    for (let columnNumber = 1; columnNumber <= maxColumn; columnNumber += 1) {
      worksheet.getColumn(columnNumber).width = EXCEL_EXPORT_COLUMN_WIDTH
    }

    // 只遍历实际存在的单元格，避免稀疏工作表被扩展成巨大的空白矩形。
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const currentAlignment = cell.alignment
        cell.alignment = {
          ...currentAlignment,
          horizontal: 'left',
          vertical: currentAlignment?.vertical ?? 'middle',
        }
      })
    })
  })
}

export async function writeXlsxBufferWithUniformFormatting(workbook: ExcelJS.Workbook) {
  applyUniformExcelExportFormatting(workbook)
  return workbook.xlsx.writeBuffer()
}
