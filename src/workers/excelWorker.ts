import * as XLSX from 'xlsx'

type WorkbookRequest = {
  workbookId?: string
  workbook?: XLSX.WorkBook
}

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
  | ({
      type: 'sheetToJson'
      sheetName: string
      range?: number
    } & WorkbookRequest)
  | ({
      type: 'readSheetData'
      sheetName: string
      headerRowIndex?: number
      range?: number
      cellAddresses?: string[]
    } & WorkbookRequest)
  | {
      type: 'releaseWorkbook'
      workbookId: string
    }

type ExcelWorkerResponse =
  | {
      type: 'parseWorkbookResult'
      fileName: string
      workbookId: string
      workbook: XLSX.WorkBook
      sheetNames: string[]
    }
  | {
      type: 'parseUploadedWorkbookResult'
      fileName: string
      workbookId: string
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
      workbookId?: string
      rows: Record<string, unknown>[]
    }
  | {
      type: 'readSheetDataResult'
      workbookId?: string
      rows: Record<string, unknown>[]
      headers: string[]
      cells: Record<string, string>
    }
  | {
      type: 'releaseWorkbookResult'
    }
  | {
      type: 'error'
      message: string
    }

type WorkerRequestEnvelope = {
  requestId: string
  payload: ExcelWorkerRequest
}

const MAX_CACHED_WORKBOOKS = 3
const MAX_WORKBOOK_SHEETS = 50
const MAX_WORKSHEET_ROWS = 300_000
const MAX_WORKSHEET_COLUMNS = 512
const MAX_ESTIMATED_CELLS = 5_000_000
const workbooks = new Map<string, XLSX.WorkBook>()
const workbookOrder: string[] = []
let workbookSequence = 0

function normalizeCellText(value: unknown) {
  return String(value ?? '').trim()
}

function getCellText(sheet: XLSX.WorkSheet, address: string): string {
  const cell = sheet[address]
  if (!cell) return ''
  if ('w' in cell && cell.w) return normalizeCellText(cell.w)
  return normalizeCellText(cell.v)
}

function validateWorkbookDimensions(workbook: XLSX.WorkBook) {
  if (workbook.SheetNames.length > MAX_WORKBOOK_SHEETS) {
    throw new Error(`工作簿 Sheet 数过多，最大支持 ${MAX_WORKBOOK_SHEETS} 个`)
  }

  let estimatedCells = 0
  workbook.SheetNames.forEach((sheetName) => {
    const rangeText = workbook.Sheets[sheetName]?.['!ref']
    if (!rangeText) return

    const range = XLSX.utils.decode_range(rangeText)
    const rowCount = range.e.r - range.s.r + 1
    const columnCount = range.e.c - range.s.c + 1
    if (rowCount > MAX_WORKSHEET_ROWS) {
      throw new Error(`Sheet“${sheetName}”行数过多，最大支持 ${MAX_WORKSHEET_ROWS} 行`)
    }
    if (columnCount > MAX_WORKSHEET_COLUMNS) {
      throw new Error(`Sheet“${sheetName}”列数过多，最大支持 ${MAX_WORKSHEET_COLUMNS} 列`)
    }

    estimatedCells += rowCount * columnCount
    if (estimatedCells > MAX_ESTIMATED_CELLS) {
      throw new Error(`工作簿数据规模过大，最多支持约 ${MAX_ESTIMATED_CELLS} 个单元格`)
    }
  })
}

function postResponse(requestId: string, data: ExcelWorkerResponse) {
  self.postMessage({ requestId, data })
}

function cacheWorkbook(workbook: XLSX.WorkBook) {
  workbookSequence += 1
  const workbookId = `workbook_${Date.now()}_${workbookSequence}`
  workbooks.set(workbookId, workbook)
  workbookOrder.push(workbookId)

  while (workbookOrder.length > MAX_CACHED_WORKBOOKS) {
    const expiredId = workbookOrder.shift()
    if (expiredId) workbooks.delete(expiredId)
  }

  return workbookId
}

function getWorkbook(request: WorkbookRequest) {
  if (request.workbookId) {
    const workbook = workbooks.get(request.workbookId)
    if (!workbook) {
      throw new Error('WORKBOOK_EXPIRED：工作簿缓存已释放，请重试')
    }
    const orderIndex = workbookOrder.indexOf(request.workbookId)
    if (orderIndex >= 0) workbookOrder.splice(orderIndex, 1)
    workbookOrder.push(request.workbookId)
    return { workbook, workbookId: request.workbookId }
  }

  if (request.workbook) {
    validateWorkbookDimensions(request.workbook)
    return {
      workbook: request.workbook,
      workbookId: cacheWorkbook(request.workbook),
    }
  }
  throw new Error('缺少待处理工作簿')
}

self.onmessage = (event: MessageEvent<WorkerRequestEnvelope>) => {
  const { requestId, payload: request } = event.data

  try {
    if (request.type === 'parseWorkbook') {
      const workbook = XLSX.read(request.buffer, { type: 'array' })
      validateWorkbookDimensions(workbook)
      const workbookId = cacheWorkbook(workbook)
      postResponse(requestId, {
        type: 'parseWorkbookResult',
        fileName: request.fileName,
        workbookId,
        workbook,
        sheetNames: workbook.SheetNames,
      })
      return
    }

    if (request.type === 'parseUploadedWorkbook') {
      const workbook = XLSX.read(request.buffer, { type: 'array' })
      validateWorkbookDimensions(workbook)
      const workbookId = cacheWorkbook(workbook)
      const sheets = workbook.SheetNames.map((sheetName) => {
        const sheet = workbook.Sheets[sheetName]
        // 元数据只解析一次矩阵，避免再为行数生成一份完整对象数组。
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          defval: '',
          raw: false,
          blankrows: false,
        })
        const headers = (aoa[0] || [])
          .map((value) => String(value ?? '').trim())
          .filter(Boolean)

        return {
          name: sheetName,
          rowCount: Math.max(0, aoa.length - 1),
          headers,
          previewHeaders: headers.slice(0, 20),
        }
      })

      postResponse(requestId, {
        type: 'parseUploadedWorkbookResult',
        fileName: request.fileName,
        workbookId,
        workbook,
        sheets,
      })
      return
    }

    if (request.type === 'sheetToJson') {
      const { workbook, workbookId } = getWorkbook(request)
      const sheet = workbook.Sheets[request.sheetName]
      const rows = sheet
        ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
            range: request.range,
            defval: '',
            raw: false,
          })
        : []

      postResponse(requestId, {
        type: 'sheetToJsonResult',
        workbookId,
        rows,
      })
      return
    }

    if (request.type === 'readSheetData') {
      const { workbook, workbookId } = getWorkbook(request)
      const sheet = workbook.Sheets[request.sheetName]
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

      postResponse(requestId, {
        type: 'readSheetDataResult',
        workbookId,
        rows,
        headers,
        cells,
      })
      return
    }

    workbooks.delete(request.workbookId)
    const orderIndex = workbookOrder.indexOf(request.workbookId)
    if (orderIndex >= 0) workbookOrder.splice(orderIndex, 1)
    postResponse(requestId, { type: 'releaseWorkbookResult' })
  } catch (error) {
    postResponse(requestId, {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
