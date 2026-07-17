import { useCallback, useEffect, useRef, useState } from 'react'
import {
  parseWorkbookInWorker,
  releaseWorkbookInWorker,
  type WorkerLoadedWorkbook,
} from '../utils/excelWorkerClient'

export function useExcelWorkbook() {
  const [loadedWorkbook, setLoadedWorkbook] = useState<WorkerLoadedWorkbook | null>(null)
  const [sheetName, setSheetName] = useState<string>()
  const [loading, setLoading] = useState(false)
  const workbookRef = useRef<WorkerLoadedWorkbook | null>(null)

  useEffect(() => () => {
    releaseWorkbookInWorker(workbookRef.current?.workbook)
  }, [])

  const loadWorkbook = useCallback(async (file: File) => {
    setLoading(true)
    try {
      const loaded = await parseWorkbookInWorker(file)
      setLoadedWorkbook((current) => {
        if (current?.workbook !== loaded.workbook) {
          releaseWorkbookInWorker(current?.workbook)
        }
        workbookRef.current = loaded
        return loaded
      })
      setSheetName(loaded.sheetNames[0])
      return loaded
    } finally {
      setLoading(false)
    }
  }, [])

  const resetWorkbook = useCallback(() => {
    setLoadedWorkbook((current) => {
      releaseWorkbookInWorker(current?.workbook)
      workbookRef.current = null
      return null
    })
    setSheetName(undefined)
  }, [])

  return {
    loadedWorkbook,
    sheetName,
    loading,
    loadWorkbook,
    setSheetName,
    resetWorkbook,
  }
}
