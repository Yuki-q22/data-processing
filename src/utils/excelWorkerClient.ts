import type * as XLSX from 'xlsx'
import type { UploadedWorkbook } from '../types/workbook'

export type WorkerLoadedWorkbook = {
  fileName: string
  workbook: XLSX.WorkBook
  sheetNames: string[]
}

type ParseWorkbookResult = {
  type: 'parseWorkbookResult'
  fileName: string
  workbook: XLSX.WorkBook
  sheetNames: string[]
}

type ParseUploadedWorkbookResult = {
  type: 'parseUploadedWorkbookResult'
  fileName: string
  workbook: XLSX.WorkBook
  sheets: UploadedWorkbook['sheets']
}

type SheetToJsonResult = {
  type: 'sheetToJsonResult'
  rows: Record<string, unknown>[]
}

export type WorkerSheetData = {
  rows: Record<string, unknown>[]
  headers: string[]
  cells: Record<string, string>
}

type ReadSheetDataResult = {
  type: 'readSheetDataResult'
} & WorkerSheetData

type ErrorResult = {
  type: 'error'
  message: string
}

type WorkerResponse =
  | ParseWorkbookResult
  | ParseUploadedWorkbookResult
  | SheetToJsonResult
  | ReadSheetDataResult
  | ErrorResult

function createExcelWorker() {
  return new Worker(new URL('../workers/excelWorker.ts', import.meta.url), {
    type: 'module',
  })
}

function postToWorker<T extends WorkerResponse>(
  payload: unknown,
  transfer?: Transferable[],
): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = createExcelWorker()

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      worker.terminate()
      const data = event.data

      if (data.type === 'error') {
        reject(new Error(data.message))
        return
      }

      resolve(data as T)
    }

    worker.onerror = (error) => {
      worker.terminate()
      reject(error)
    }

    worker.postMessage(payload, transfer || [])
  })
}

export async function parseWorkbookInWorker(file: File): Promise<WorkerLoadedWorkbook> {
  const buffer = await file.arrayBuffer()
  const result = await postToWorker<ParseWorkbookResult>(
    {
      type: 'parseWorkbook',
      fileName: file.name,
      buffer,
    },
    [buffer],
  )

  return {
    fileName: result.fileName,
    workbook: result.workbook,
    sheetNames: result.sheetNames,
  }
}

export async function parseUploadedWorkbookInWorker(file: File): Promise<UploadedWorkbook> {
  const buffer = await file.arrayBuffer()
  const result = await postToWorker<ParseUploadedWorkbookResult>(
    {
      type: 'parseUploadedWorkbook',
      fileName: file.name,
      buffer,
    },
    [buffer],
  )

  return {
    fileName: result.fileName,
    workbook: result.workbook,
    sheets: result.sheets,
  }
}

export async function sheetToJsonInWorker(
  workbook: XLSX.WorkBook,
  sheetName: string,
  options: { range?: number } = {},
): Promise<Record<string, unknown>[]> {
  const result = await postToWorker<SheetToJsonResult>({
    type: 'sheetToJson',
    workbook,
    sheetName,
    range: options.range,
  })

  return result.rows
}

export async function readSheetDataInWorker(
  workbook: XLSX.WorkBook,
  sheetName: string,
  options: {
    headerRowIndex?: number
    range?: number
    cellAddresses?: string[]
  } = {},
): Promise<WorkerSheetData> {
  const result = await postToWorker<ReadSheetDataResult>({
    type: 'readSheetData',
    workbook,
    sheetName,
    headerRowIndex: options.headerRowIndex,
    range: options.range,
    cellAddresses: options.cellAddresses,
  })

  return {
    rows: result.rows,
    headers: result.headers,
    cells: result.cells,
  }
}
