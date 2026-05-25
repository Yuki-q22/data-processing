import {
  Button,
  Card,
  Checkbox,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { useEffect, useMemo } from 'react'
import { usePreviewStore } from '../stores/previewStore'
import { TARGET_FIELDS } from '../constants/targetFields'
import { useTaskStore } from '../stores/taskStore'
import { useRuleStore } from '../stores/ruleStore'
import { useRuleCenterStore } from '../stores/ruleCenterStore'
import { sheetToJsonInWorker } from '../utils/excelWorkerClient'
import { useLatestTaskGuard } from '../hooks/useLatestTaskGuard'
import { matchFields } from '../utils/mapping'
import { buildScoreRecords, buildPlanRecords } from '../modules/transform'
import { buildProcessedRecords } from '../modules/match'
import { attachValidationIssues } from '../modules/validate'
import type { EditableFieldMappingItem } from '../types/mapping'
import type { UploadedWorkbook } from '../types/workbook'

const { Paragraph } = Typography

function getSheetHeaders(workbook: UploadedWorkbook | null | undefined, sheetName?: string): string[] {
  if (!workbook || !sheetName) return []
  return workbook.sheets.find((sheet) => sheet.name === sheetName)?.headers ?? []
}

function sameSourceFields(
  mappings: EditableFieldMappingItem[],
  headers: string[]
): boolean {
  if (mappings.length !== headers.length) return false

  return headers.every((header, index) => mappings[index]?.sourceField === header)
}

export default function MappingStep() {
  const scoreMappings = usePreviewStore((state) => state.scoreMappings)
  const planMappings = usePreviewStore((state) => state.planMappings)
  const updateScoreMapping = usePreviewStore((state) => state.updateScoreMapping)
  const updatePlanMapping = usePreviewStore((state) => state.updatePlanMapping)
  const resetScoreMappingsToAuto = usePreviewStore((state) => state.resetScoreMappingsToAuto)
  const resetPlanMappingsToAuto = usePreviewStore((state) => state.resetPlanMappingsToAuto)
  const setScoreRecords = usePreviewStore((state) => state.setScoreRecords)
  const setPlanRecords = usePreviewStore((state) => state.setPlanRecords)
  const setProcessedRecords = usePreviewStore((state) => state.setProcessedRecords)

  const year = useTaskStore((state) => state.year)
  const defaultDataSource = useTaskStore((state) => state.defaultDataSource)
  const scoreWorkbook = useTaskStore((state) => state.scoreWorkbook)
  const planWorkbook = useTaskStore((state) => state.planWorkbook)
  const scoreSheetName = useTaskStore((state) => state.scoreSheetName)
  const planSheetName = useTaskStore((state) => state.planSheetName)
  const manualSchoolName = useTaskStore((state) => state.manualSchoolName)

  const fieldAliases = useRuleStore((state) => state.fieldAliases)
  const provinceRules = useRuleStore((state) => state.provinceRules)
  const categoryRules = useRuleStore((state) => state.categoryRules)
  const batchRules = useRuleStore((state) => state.batchRules)
  const ignoredPlanSourceFields = useRuleStore((state) => state.ignoredPlanSourceFields)

  const cloudRemarkTypeRules = useRuleCenterStore((state) => state.remarkTypeRules)
  const provinceYearCategoryType = useRuleCenterStore((state) => state.provinceYearCategoryType)
  const provinceCurrentBatchDictByYear = useRuleCenterStore((state) => state.provinceCurrentBatchDictByYear)
  const { startTask, isLatestTask } = useLatestTaskGuard()

  const remarkTypeRules = useMemo(
    () =>
      cloudRemarkTypeRules.map((rule) => ({
        keyword: rule.keyword,
        output: rule.outputType,
        priority: rule.priority,
      })),
    [cloudRemarkTypeRules]
  )

  const targetOptions = TARGET_FIELDS.map((field) => ({
    label: field,
    value: field,
  }))

  const scoreHeaders = useMemo(
    () => getSheetHeaders(scoreWorkbook, scoreSheetName),
    [scoreWorkbook, scoreSheetName]
  )

  const planHeaders = useMemo(
    () => getSheetHeaders(planWorkbook, planSheetName),
    [planWorkbook, planSheetName]
  )

  const autoScoreMappings = useMemo(
    () => matchFields(scoreHeaders, fieldAliases),
    [scoreHeaders, fieldAliases]
  )

  const autoPlanMappings = useMemo(
    () => matchFields(planHeaders, fieldAliases).filter(
      (item) => !ignoredPlanSourceFields.includes(item.sourceField)
    ),
    [planHeaders, fieldAliases, ignoredPlanSourceFields]
  )

  useEffect(() => {
    if (!scoreHeaders.length) return
    if (sameSourceFields(scoreMappings, scoreHeaders)) return

    resetScoreMappingsToAuto(autoScoreMappings)
  }, [autoScoreMappings, resetScoreMappingsToAuto, scoreHeaders, scoreMappings])

  useEffect(() => {
    if (!planHeaders.length) return
    if (sameSourceFields(planMappings, planHeaders)) return

    resetPlanMappingsToAuto(autoPlanMappings)
  }, [autoPlanMappings, planHeaders, planMappings, resetPlanMappingsToAuto])

  const handleResetAutoMappings = () => {
    if (!scoreWorkbook || !scoreSheetName || !planWorkbook || !planSheetName) {
      message.warning('请先在第一步上传并选择表格')
      return
    }

    resetScoreMappingsToAuto(autoScoreMappings)
    resetPlanMappingsToAuto(autoPlanMappings)

    message.success('已恢复自动映射')
  }

  const handleApplyMappings = async () => {
    if (!scoreWorkbook || !scoreSheetName || !planWorkbook || !planSheetName) {
      message.warning('请先在第一步上传并选择表格')
      return
    }

    const finalScoreMappings = scoreMappings.filter(
      (item) => !item.ignored && item.targetField
    )

    const finalPlanMappings = planMappings.filter(
      (item) => !item.ignored && item.targetField
    )

    if (!finalScoreMappings.length || !finalPlanMappings.length) {
      message.warning('请先完成原始专业分和招生计划字段映射')
      return
    }

    const taskId = startTask('apply-mappings')
    let scoreRows: Record<string, unknown>[]
    let planRows: Record<string, unknown>[]

    try {
      [scoreRows, planRows] = await Promise.all([
        sheetToJsonInWorker(scoreWorkbook.workbook, scoreSheetName),
        sheetToJsonInWorker(planWorkbook.workbook, planSheetName),
      ])
    } catch (error) {
      if (!isLatestTask('apply-mappings', taskId)) return
      message.error(error instanceof Error ? error.message : '映射应用失败')
      return
    }

    if (!isLatestTask('apply-mappings', taskId)) return

    const scoreRecords = buildScoreRecords(
      scoreRows,
      finalScoreMappings,
      year,
      defaultDataSource,
      {
        provinceRules,
        categoryRules,
        batchRules,
        provinceYearCategoryType,
        manualSchoolName,
        remarkTypeRules,
      }
    )

    const planRecords = buildPlanRecords(
      planRows,
      finalPlanMappings,
      year,
      defaultDataSource,
      {
        provinceRules,
        categoryRules,
        batchRules,
        provinceYearCategoryType,
        remarkTypeRules,
      }
    )

    setScoreRecords(scoreRecords)
    setPlanRecords(planRecords)

    const processed = buildProcessedRecords(
      scoreRecords,
      planRecords,
      provinceCurrentBatchDictByYear
    )

    const validated = attachValidationIssues(
      processed,
      provinceCurrentBatchDictByYear
    )

    setProcessedRecords(validated)

    message.success('映射已应用，预览数据已重新生成')
  }

  const commonColumns = (type: 'score' | 'plan') => [
    {
      title: '忽略',
      dataIndex: 'ignored',
      key: 'ignored',
      width: 80,
      render: (_: boolean, record: EditableFieldMappingItem) => (
        <Checkbox
          checked={!!record.ignored}
          onChange={(e) => {
            if (type === 'score') {
              updateScoreMapping(record.sourceField, {
                ignored: e.target.checked,
              })
            } else {
              updatePlanMapping(record.sourceField, {
                ignored: e.target.checked,
              })
            }
          }}
        />
      ),
    },
    {
      title: '原字段',
      dataIndex: 'sourceField',
      key: 'sourceField',
      width: 180,
    },
    {
      title: '示例值',
      dataIndex: 'sampleValue',
      key: 'sampleValue',
      width: 160,
      render: (value: string) => value || '-',
    },
    {
      title: '目标字段',
      dataIndex: 'targetField',
      key: 'targetField',
      width: 220,
      render: (value: string | undefined, record: EditableFieldMappingItem) => (
        <Select
          style={{ width: '100%' }}
          allowClear
          placeholder="请选择目标字段"
          value={value}
          options={targetOptions}
          disabled={!!record.ignored}
          onChange={(nextValue) => {
            if (type === 'score') {
              updateScoreMapping(record.sourceField, {
                targetField: nextValue,
              })
            } else {
              updatePlanMapping(record.sourceField, {
                targetField: nextValue,
              })
            }
          }}
        />
      ),
    },
    {
      title: '置信度',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 100,
      render: (value: number) => {
        const color = value >= 95 ? 'green' : value >= 88 ? 'orange' : 'red'

        return <Tag color={color}>{value}%</Tag>
      },
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="字段映射说明">
        <Paragraph style={{ marginBottom: 12 }}>
          上传文件或切换 Sheet 后会自动生成字段映射。这里可以手工调整字段映射，修改后点击“应用当前映射”，第四步预览会重新生成。
        </Paragraph>

        <Space>
          <Button onClick={handleResetAutoMappings}>恢复自动映射</Button>
          <Button type="primary" onClick={handleApplyMappings}>
            应用当前映射
          </Button>
        </Space>
      </Card>

      <Card title="原始专业分字段映射">
        <Table
          rowKey="sourceField"
          columns={commonColumns('score')}
          dataSource={scoreMappings}
          pagination={false}
          scroll={{ x: 800 }}
        />
      </Card>

      <Card title="招生计划字段映射">
        <Table
          rowKey="sourceField"
          columns={commonColumns('plan')}
          dataSource={planMappings}
          pagination={false}
          scroll={{ x: 800 }}
        />
      </Card>
    </div>
  )
}
