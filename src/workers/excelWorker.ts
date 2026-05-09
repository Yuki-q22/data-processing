import * as XLSX from 'xlsx'

type ExcelWorkerRequest =
  | {
      type: 'parseWorkbook'
      fileName: string
      buffer: ArrayBuffer
    }
  | {
      type: 'sheetToJson'
      workbook: XLSX.WorkBook
      sheetName: string
    }

type ExcelWorkerResponse =
  | {
      type: 'parseWorkbookResult'
      fileName: string
      workbook: XLSX.WorkBook
      sheetNames: string[]
    }
  | {
      type: 'sheetToJsonResult'
      rows: Record<string, unknown>[]
    }
  | {
      type: 'error'
      message: string
    }

self.onmessage = (event: MessageEvent<ExcelWorkerRequest>) => {
  try {
    const request = event.data

    if (request.type === 'parseWorkbook') {
      const workbook = XLSX.read(request.buffer, { type: 'array' })
      const response: ExcelWorkerResponse = {
        type: 'parseWorkbookResult',
        fileName: request.fileName,
        workbook,
        sheetNames: workbook.SheetNames,
      }
      self.postMessage(response)
      return
    }

    if (request.type === 'sheetToJson') {
      const sheet = request.workbook.Sheets[request.sheetName]
      const rows = sheet
        ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
            defval: '',
            raw: false,
          })
        : []

      const response: ExcelWorkerResponse = {
        type: 'sheetToJsonResult',
        rows,
      }
      self.postMessage(response)
    }
  } catch (error) {
    const response: ExcelWorkerResponse = {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(response)
  }
}
