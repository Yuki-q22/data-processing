import { create } from 'zustand'
import type { UploadedWorkbook } from '../types/workbook'
import { releaseWorkbookInWorker } from '../utils/excelWorkerClient'

type TaskStore = {
  taskName: string
  year: string
  defaultDataSource: string
  manualSchoolName: string
  manualProvince: string

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
        'taskName' | 'year' | 'defaultDataSource' | 'manualSchoolName' | 'manualProvince'
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

export const useTaskStore = create<TaskStore>((set, get) => ({
  taskName: '专业分处理任务',
  year: '2025',
  defaultDataSource: '销售',
  manualSchoolName: '',
  manualProvince: '',

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
        if (state.templateWorkbook?.workbook !== workbook?.workbook) {
          releaseWorkbookInWorker(state.templateWorkbook?.workbook)
        }
        return {
          ...state,
          templateWorkbook: workbook,
          templateSheetName: firstSheet,
        }
      }

      if (type === 'score') {
        if (state.scoreWorkbook?.workbook !== workbook?.workbook) {
          releaseWorkbookInWorker(state.scoreWorkbook?.workbook)
        }
        return {
          ...state,
          scoreWorkbook: workbook,
          scoreSheetName: firstSheet,
        }
      }

      if (state.planWorkbook?.workbook !== workbook?.workbook) {
        releaseWorkbookInWorker(state.planWorkbook?.workbook)
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

  resetTask: () => {
    const state = get()
    releaseWorkbookInWorker(state.templateWorkbook?.workbook)
    releaseWorkbookInWorker(state.scoreWorkbook?.workbook)
    releaseWorkbookInWorker(state.planWorkbook?.workbook)
    set({
      taskName: '专业分处理任务',
      year: '2025',
      defaultDataSource: '销售',
      manualSchoolName: '',
      manualProvince: '',
      templateWorkbook: undefined,
      scoreWorkbook: undefined,
      planWorkbook: undefined,
      templateSheetName: undefined,
      scoreSheetName: undefined,
      planSheetName: undefined,
    })
  },
}))
