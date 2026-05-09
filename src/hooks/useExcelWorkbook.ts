import { useCallback, useState } from 'react'
import { parseWorkbookInWorker, type WorkerLoadedWorkbook } from '../utils/excelWorkerClient'

export function useExcelWorkbook() {
  const [loadedWorkbook, setLoadedWorkbook] = useState<WorkerLoadedWorkbook | null>(null)
  const [sheetName, setSheetName] = useState<string>()
  const [loading, setLoading] = useState(false)

  const loadWorkbook = useCallback(async (file: File) => {
    setLoading(true)
    try {
      const loaded = await parseWorkbookInWorker(file)
      setLoadedWorkbook(loaded)
      setSheetName(loaded.sheetNames[0])
      return loaded
    } finally {
      setLoading(false)
    }
  }, [])

  const resetWorkbook = useCallback(() => {
    setLoadedWorkbook(null)
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
