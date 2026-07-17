import type * as XLSX from 'xlsx'
import type { UploadedWorkbook } from '../types/workbook'
import { validateUploadFile } from '../modules/uploadValidation'

export type WorkerLoadedWorkbook = {
  fileName: string
  workbook: XLSX.WorkBook
  sheetNames: string[]
}

type ParseWorkbookResult = {
  type: 'parseWorkbookResult'
  fileName: string
  workbookId: string
  workbook: XLSX.WorkBook
  sheetNames: string[]
}

type ParseUploadedWorkbookResult = {
  type: 'parseUploadedWorkbookResult'
  fileName: string
  workbookId: string
  workbook: XLSX.WorkBook
  sheets: UploadedWorkbook['sheets']
}

type SheetToJsonResult = {
  type: 'sheetToJsonResult'
  workbookId?: string
  rows: Record<string, unknown>[]
}

export type WorkerSheetData = {
  rows: Record<string, unknown>[]
  headers: string[]
  cells: Record<string, string>
}

type ReadSheetDataResult = {
  type: 'readSheetDataResult'
  workbookId?: string
} & WorkerSheetData

type ReleaseWorkbookResult = {
  type: 'releaseWorkbookResult'
}

type ErrorResult = {
  type: 'error'
  message: string
}

type WorkerResponse =
  | ParseWorkbookResult
  | ParseUploadedWorkbookResult
  | SheetToJsonResult
  | ReadSheetDataResult
  | ReleaseWorkbookResult
  | ErrorResult

type WorkerResponseEnvelope = {
  requestId: string
  data: WorkerResponse
}

type PendingRequest = {
  resolve: (data: WorkerResponse) => void
  reject: (error: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
}

const WORKER_REQUEST_TIMEOUT_MS = 120_000
let sharedWorker: Worker | null = null
let requestSequence = 0
const pendingRequests = new Map<string, PendingRequest>()
const workbookIds = new WeakMap<XLSX.WorkBook, string>()
const workbookFinalizer = typeof FinalizationRegistry === 'undefined'
  ? undefined
  : new FinalizationRegistry<string>((workbookId) => {
      void postToWorker<ReleaseWorkbookResult>({
        type: 'releaseWorkbook',
        workbookId,
      }).catch(() => undefined)
    })

function createRequestId() {
  requestSequence += 1
  return `excel_${Date.now()}_${requestSequence}`
}

function rejectPendingRequests(message: string) {
  pendingRequests.forEach((pending) => {
    clearTimeout(pending.timeoutId)
    pending.reject(new Error(message))
  })
  pendingRequests.clear()
}

function getExcelWorker() {
  if (sharedWorker) return sharedWorker

  const worker = new Worker(new URL('../workers/excelWorker.ts', import.meta.url), {
    type: 'module',
  })

  worker.onmessage = (event: MessageEvent<WorkerResponseEnvelope>) => {
    const { requestId, data } = event.data
    const pending = pendingRequests.get(requestId)
    if (!pending) return

    pendingRequests.delete(requestId)
    clearTimeout(pending.timeoutId)

    if (data.type === 'error') {
      pending.reject(new Error(data.message))
      return
    }

    pending.resolve(data)
  }

  worker.onerror = (event) => {
    rejectPendingRequests(event.message || 'Excel Worker 运行失败')
    worker.terminate()
    if (sharedWorker === worker) sharedWorker = null
  }

  sharedWorker = worker
  return worker
}

function postToWorker<T extends WorkerResponse>(
  payload: unknown,
  transfer?: Transferable[],
): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = getExcelWorker()
    const requestId = createRequestId()
    const timeoutId = setTimeout(() => {
      if (!pendingRequests.has(requestId)) return
      worker.terminate()
      if (sharedWorker === worker) sharedWorker = null
      rejectPendingRequests('Excel 处理超时，请检查文件大小或内容后重试')
    }, WORKER_REQUEST_TIMEOUT_MS)

    pendingRequests.set(requestId, {
      resolve: (data) => resolve(data as T),
      reject,
      timeoutId,
    })

    try {
      worker.postMessage({ requestId, payload }, transfer || [])
    } catch (error) {
      pendingRequests.delete(requestId)
      clearTimeout(timeoutId)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

function rememberWorkbook(workbook: XLSX.WorkBook, workbookId: string) {
  workbookIds.set(workbook, workbookId)
  workbookFinalizer?.unregister(workbook)
  workbookFinalizer?.register(workbook, workbookId, workbook)
}

function isExpiredWorkbookError(error: unknown) {
  return error instanceof Error && error.message.includes('WORKBOOK_EXPIRED')
}

export async function parseWorkbookInWorker(file: File): Promise<WorkerLoadedWorkbook> {
  await validateUploadFile(file, { allowedKinds: ['xlsx', 'xls'] })
  const buffer = await file.arrayBuffer()
  const result = await postToWorker<ParseWorkbookResult>(
    {
      type: 'parseWorkbook',
      fileName: file.name,
      buffer,
    },
    [buffer],
  )

  rememberWorkbook(result.workbook, result.workbookId)
  return {
    fileName: result.fileName,
    workbook: result.workbook,
    sheetNames: result.sheetNames,
  }
}

export async function parseUploadedWorkbookInWorker(file: File): Promise<UploadedWorkbook> {
  await validateUploadFile(file, { allowedKinds: ['xlsx', 'xls'] })
  const buffer = await file.arrayBuffer()
  const result = await postToWorker<ParseUploadedWorkbookResult>(
    {
      type: 'parseUploadedWorkbook',
      fileName: file.name,
      buffer,
    },
    [buffer],
  )

  rememberWorkbook(result.workbook, result.workbookId)
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
  const workbookId = workbookIds.get(workbook)

  try {
    const result = await postToWorker<SheetToJsonResult>({
      type: 'sheetToJson',
      workbookId,
      workbook: workbookId ? undefined : workbook,
      sheetName,
      range: options.range,
    })
    if (result.workbookId) rememberWorkbook(workbook, result.workbookId)
    return result.rows
  } catch (error) {
    if (!workbookId || !isExpiredWorkbookError(error)) throw error

    workbookIds.delete(workbook)
    const result = await postToWorker<SheetToJsonResult>({
      type: 'sheetToJson',
      workbook,
      sheetName,
      range: options.range,
    })
    if (result.workbookId) rememberWorkbook(workbook, result.workbookId)
    return result.rows
  }
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
  const workbookId = workbookIds.get(workbook)
  const payload = {
    type: 'readSheetData',
    workbookId,
    workbook: workbookId ? undefined : workbook,
    sheetName,
    headerRowIndex: options.headerRowIndex,
    range: options.range,
    cellAddresses: options.cellAddresses,
  }

  let result: ReadSheetDataResult
  try {
    result = await postToWorker<ReadSheetDataResult>(payload)
  } catch (error) {
    if (!workbookId || !isExpiredWorkbookError(error)) throw error
    workbookIds.delete(workbook)
    result = await postToWorker<ReadSheetDataResult>({
      ...payload,
      workbookId: undefined,
      workbook,
    })
  }

  if (result.workbookId) rememberWorkbook(workbook, result.workbookId)

  return {
    rows: result.rows,
    headers: result.headers,
    cells: result.cells,
  }
}

export function releaseWorkbookInWorker(workbook: XLSX.WorkBook | undefined) {
  if (!workbook) return
  const workbookId = workbookIds.get(workbook)
  if (!workbookId) return

  workbookIds.delete(workbook)
  workbookFinalizer?.unregister(workbook)
  void postToWorker<ReleaseWorkbookResult>({
    type: 'releaseWorkbook',
    workbookId,
  }).catch(() => undefined)
}
