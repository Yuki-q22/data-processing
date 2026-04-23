import type * as XLSX from 'xlsx'

export type SheetMeta = {
  name: string
  rowCount: number
  previewHeaders: string[]
}

export type UploadedWorkbook = {
  fileName: string
  workbook: XLSX.WorkBook
  sheets: SheetMeta[]
}