import type * as XLSX from 'xlsx'

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

type SheetToJsonResult = {
  type: 'sheetToJsonResult'
  rows: Record<string, unknown>[]
}

type ErrorResult = {
  type: 'error'
  message: string
}

type WorkerResponse = ParseWorkbookResult | SheetToJsonResult | ErrorResult

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

export async function sheetToJsonInWorker(
  workbook: XLSX.WorkBook,
  sheetName: string,
): Promise<Record<string, unknown>[]> {
  const result = await postToWorker<SheetToJsonResult>({
    type: 'sheetToJson',
    workbook,
    sheetName,
  })

  return result.rows
}
