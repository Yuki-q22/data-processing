import * as XLSX from 'xlsx'

type ExcelWorkerRequest =
  | {
      type: 'parseWorkbook'
      fileName: string
      buffer: ArrayBuffer
    }
  | {
      type: 'parseUploadedWorkbook'
      fileName: string
      buffer: ArrayBuffer
    }
  | {
      type: 'sheetToJson'
      workbook: XLSX.WorkBook
      sheetName: string
      range?: number
    }
  | {
      type: 'readSheetData'
      workbook: XLSX.WorkBook
      sheetName: string
      headerRowIndex?: number
      range?: number
      cellAddresses?: string[]
    }

type ExcelWorkerResponse =
  | {
      type: 'parseWorkbookResult'
      fileName: string
      workbook: XLSX.WorkBook
      sheetNames: string[]
    }
  | {
      type: 'parseUploadedWorkbookResult'
      fileName: string
      workbook: XLSX.WorkBook
      sheets: {
        name: string
        rowCount: number
        headers: string[]
        previewHeaders: string[]
      }[]
    }
  | {
      type: 'sheetToJsonResult'
      rows: Record<string, unknown>[]
    }
  | {
      type: 'readSheetDataResult'
      rows: Record<string, unknown>[]
      headers: string[]
      cells: Record<string, string>
    }
  | {
      type: 'error'
      message: string
    }

function normalizeCellText(value: unknown) {
  return String(value ?? '').trim()
}

function getCellText(sheet: XLSX.WorkSheet, address: string): string {
  const cell = sheet[address]
  if (!cell) return ''
  if ('w' in cell && cell.w) return normalizeCellText(cell.w)
  return normalizeCellText(cell.v)
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

    if (request.type === 'parseUploadedWorkbook') {
      const workbook = XLSX.read(request.buffer, { type: 'array' })
      const sheets = workbook.SheetNames.map((sheetName) => {
        const sheet = workbook.Sheets[sheetName]
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          defval: '',
          raw: false,
        })
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: '',
          raw: false,
        })

        const headers = (aoa[0] || [])
          .map((value) => String(value ?? '').trim())
          .filter(Boolean)

        return {
          name: sheetName,
          rowCount: rows.length,
          headers,
          previewHeaders: headers.slice(0, 20),
        }
      })

      const response: ExcelWorkerResponse = {
        type: 'parseUploadedWorkbookResult',
        fileName: request.fileName,
        workbook,
        sheets,
      }
      self.postMessage(response)
      return
    }

    if (request.type === 'sheetToJson') {
      const sheet = request.workbook.Sheets[request.sheetName]
      const rows = sheet
        ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
            range: request.range,
            defval: '',
            raw: false,
          })
        : []

      const response: ExcelWorkerResponse = {
        type: 'sheetToJsonResult',
        rows,
      }
      self.postMessage(response)
      return
    }

    if (request.type === 'readSheetData') {
      const sheet = request.workbook.Sheets[request.sheetName]
      if (!sheet) {
        throw new Error('未找到所选 Sheet')
      }

      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: '',
        raw: false,
      })
      const headers = (matrix[request.headerRowIndex ?? 0] || [])
        .map(normalizeCellText)
        .filter(Boolean)
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        range: request.range,
        defval: '',
        raw: false,
      })
      const cells = Object.fromEntries(
        (request.cellAddresses || []).map((address) => [
          address,
          getCellText(sheet, address),
        ]),
      )

      const response: ExcelWorkerResponse = {
        type: 'readSheetDataResult',
        rows,
        headers,
        cells,
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
