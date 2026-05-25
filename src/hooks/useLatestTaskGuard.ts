import { useCallback, useRef } from 'react'

export function useLatestTaskGuard() {
  const taskIdsRef = useRef<Record<string, number>>({})

  const startTask = useCallback((key: string) => {
    const nextId = (taskIdsRef.current[key] ?? 0) + 1
    taskIdsRef.current[key] = nextId
    return nextId
  }, [])

  const isLatestTask = useCallback((key: string, taskId: number) => {
    return taskIdsRef.current[key] === taskId
  }, [])

  const cancelTask = useCallback((key: string) => {
    taskIdsRef.current[key] = (taskIdsRef.current[key] ?? 0) + 1
  }, [])

  return {
    startTask,
    isLatestTask,
    cancelTask,
  }
}
