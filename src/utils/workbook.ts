import * as XLSX from 'xlsx'
import type { UploadedWorkbook, SheetMeta } from '../types/workbook'

export async function parseWorkbook(file: File): Promise<UploadedWorkbook> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  const sheets: SheetMeta[] = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: '',
    })

    const previewHeaders = (rows[0] || []).map((v) => String(v)).slice(0, 20)

    return {
      name: sheetName,
      rowCount: rows.length,
      previewHeaders,
    }
  })

  return {
    fileName: file.name,
    sheets,
    workbook,
  }
}

export function getSheetRows(workbook: unknown, sheetName: string): any[][] {
  const wb = workbook as XLSX.WorkBook
  const sheet = wb.Sheets[sheetName]
  return XLSX.utils.sheet_to_json<any[]>(sheet, {
    header: 1,
    defval: '',
  })
}

export function getSheetJson(workbook: unknown, sheetName: string): Record<string, unknown>[] {
  const wb = workbook as XLSX.WorkBook
  const sheet = wb.Sheets[sheetName]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  })
}