import { create } from 'zustand'
import type { EditableFieldMappingItem } from '../types/mapping'
import type { PlanRecord, ProcessedRecord, ScoreRecord } from '../types/record'

type PreviewStore = {
  scoreMappings: EditableFieldMappingItem[]
  planMappings: EditableFieldMappingItem[]

  scoreRecords: ScoreRecord[]
  planRecords: PlanRecord[]
  processedRecords: ProcessedRecord[]

  manualMatchSelections: Record<string, string>

  setScoreMappings: (items: EditableFieldMappingItem[]) => void
  setPlanMappings: (items: EditableFieldMappingItem[]) => void

  updateScoreMapping: (
    sourceField: string,
    patch: Partial<EditableFieldMappingItem>
  ) => void

  updatePlanMapping: (
    sourceField: string,
    patch: Partial<EditableFieldMappingItem>
  ) => void

  resetScoreMappingsToAuto: (items: EditableFieldMappingItem[]) => void
  resetPlanMappingsToAuto: (items: EditableFieldMappingItem[]) => void

  setScoreRecords: (items: ScoreRecord[]) => void
  setPlanRecords: (items: PlanRecord[]) => void
  setProcessedRecords: (items: ProcessedRecord[]) => void

  setManualMatchSelection: (sourceRowId: string, planRowId: string) => void
  clearManualMatchSelection: (sourceRowId: string) => void
  resetManualMatchSelections: () => void

  resetPreview: () => void
}

export const usePreviewStore = create<PreviewStore>((set) => ({
  scoreMappings: [],
  planMappings: [],
  scoreRecords: [],
  planRecords: [],
  processedRecords: [],
  manualMatchSelections: {},

  setScoreMappings: (items) => set({ scoreMappings: items }),
  setPlanMappings: (items) => set({ planMappings: items }),

  updateScoreMapping: (sourceField, patch) =>
    set((state) => ({
      scoreMappings: state.scoreMappings.map((item) =>
        item.sourceField === sourceField ? { ...item, ...patch } : item
      ),
    })),

  updatePlanMapping: (sourceField, patch) =>
    set((state) => ({
      planMappings: state.planMappings.map((item) =>
        item.sourceField === sourceField ? { ...item, ...patch } : item
      ),
    })),

  resetScoreMappingsToAuto: (items) => set({ scoreMappings: items }),
  resetPlanMappingsToAuto: (items) => set({ planMappings: items }),

  setScoreRecords: (items) => set({ scoreRecords: items }),
  setPlanRecords: (items) => set({ planRecords: items }),
  setProcessedRecords: (items) => set({ processedRecords: items }),

  setManualMatchSelection: (sourceRowId, planRowId) =>
    set((state) => ({
      manualMatchSelections: {
        ...state.manualMatchSelections,
        [sourceRowId]: planRowId,
      },
    })),

  clearManualMatchSelection: (sourceRowId) =>
    set((state) => {
      const next = { ...state.manualMatchSelections }
      delete next[sourceRowId]
      return { manualMatchSelections: next }
    }),

  resetManualMatchSelections: () => set({ manualMatchSelections: {} }),

  resetPreview: () =>
    set({
      scoreMappings: [],
      planMappings: [],
      scoreRecords: [],
      planRecords: [],
      processedRecords: [],
      manualMatchSelections: {},
    }),
}))