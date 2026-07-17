import { beforeEach, describe, expect, it } from 'vitest'
import { usePreviewStore } from './previewStore'

beforeEach(() => {
  usePreviewStore.getState().resetPreview()
})

describe('previewStore processing revision', () => {
  it('处理结果绑定当前输入版本', () => {
    const revision = usePreviewStore.getState().inputRevision
    usePreviewStore.getState().setProcessedRecords([])

    expect(usePreviewStore.getState().processedRevision).toBe(revision)
  })

  it('输入变化后清空旧处理结果和人工选择', () => {
    const store = usePreviewStore.getState()
    const revision = store.inputRevision
    store.setProcessedRecords([])
    store.setManualMatchSelection('score-1', 'plan-1')
    store.invalidateProcessing()

    const next = usePreviewStore.getState()
    expect(next.inputRevision).toBe(revision + 1)
    expect(next.processedRevision).toBeUndefined()
    expect(next.processedRecords).toEqual([])
    expect(next.manualMatchSelections).toEqual({})
  })
})
