import { create } from 'zustand'
import type { UploadedWorkbook } from '../types/workbook'

type TaskStore = {
  taskName: string
  year: string
  defaultDataSource: string
  enableFuzzyMatch: boolean
  manualSchoolName: string

  templateWorkbook?: UploadedWorkbook
  scoreWorkbook?: UploadedWorkbook
  planWorkbook?: UploadedWorkbook

  templateSheetName?: string
  scoreSheetName?: string
  planSheetName?: string

  setTaskMeta: (
    patch: Partial<
      Pick<
        TaskStore,
        'taskName' | 'year' | 'defaultDataSource' | 'enableFuzzyMatch' | 'manualSchoolName'
      >
    >
  ) => void

  setWorkbook: (
    type: 'template' | 'score' | 'plan',
    workbook?: UploadedWorkbook
  ) => void

  setSheetName: (
    type: 'template' | 'score' | 'plan',
    sheetName?: string
  ) => void

  resetTask: () => void
}

export const useTaskStore = create<TaskStore>((set) => ({
  taskName: '专业分处理任务',
  year: '2025',
  defaultDataSource: '销售',
  enableFuzzyMatch: true,
  manualSchoolName: '',

  templateWorkbook: undefined,
  scoreWorkbook: undefined,
  planWorkbook: undefined,

  templateSheetName: undefined,
  scoreSheetName: undefined,
  planSheetName: undefined,

  setTaskMeta: (patch) => set((state) => ({ ...state, ...patch })),

  setWorkbook: (type, workbook) =>
    set((state) => {
      const firstSheet = workbook?.sheets?.[0]?.name

      if (type === 'template') {
        return {
          ...state,
          templateWorkbook: workbook,
          templateSheetName: firstSheet,
        }
      }

      if (type === 'score') {
        return {
          ...state,
          scoreWorkbook: workbook,
          scoreSheetName: firstSheet,
        }
      }

      return {
        ...state,
        planWorkbook: workbook,
        planSheetName: firstSheet,
      }
    }),

  setSheetName: (type, sheetName) =>
    set((state) => {
      if (type === 'template') return { ...state, templateSheetName: sheetName }
      if (type === 'score') return { ...state, scoreSheetName: sheetName }
      return { ...state, planSheetName: sheetName }
    }),

  resetTask: () =>
    set({
      taskName: '专业分处理任务',
      year: '2025',
      defaultDataSource: '销售',
      enableFuzzyMatch: true,
      manualSchoolName: '',
      templateWorkbook: undefined,
      scoreWorkbook: undefined,
      planWorkbook: undefined,
      templateSheetName: undefined,
      scoreSheetName: undefined,
      planSheetName: undefined,
    }),
}))