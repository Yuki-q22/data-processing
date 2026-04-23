import { Button, Card, Checkbox, Select, Space, Table, Tag, Typography, message } from 'antd'
import { usePreviewStore } from '../stores/previewStore'
import { TARGET_FIELDS } from '../constants/targetFields'
import { useTaskStore } from '../stores/taskStore'
import { useRuleStore } from '../stores/ruleStore'
import { getSheetJson, getSheetRows } from '../utils/workbook'
import { matchFields } from '../utils/mapping'
import { buildScoreRecords, buildPlanRecords } from '../modules/transform'
import { buildProcessedRecords } from '../modules/match'
import { attachValidationIssues } from '../modules/validate'

const { Paragraph } = Typography

export default function MappingStep() {
  const {
    scoreMappings,
    planMappings,
    updateScoreMapping,
    updatePlanMapping,
    resetScoreMappingsToAuto,
    resetPlanMappingsToAuto,
    setScoreRecords,
    setPlanRecords,
    setProcessedRecords,
  } = usePreviewStore()

  const {
    year,
    defaultDataSource,
    scoreWorkbook,
    planWorkbook,
    scoreSheetName,
    planSheetName,
  } = useTaskStore()

  const {
    fieldAliases,
    provinceRules,
    categoryRules,
    batchRules,
    provinceYearCategoryType,
    ignoredPlanSourceFields,
    provinceCurrentBatchDictByYear,
    remarkTypeRules,
  } = useRuleStore()

  const targetOptions = TARGET_FIELDS.map((field) => ({
    label: field,
    value: field,
  }))

  const handleResetAutoMappings = () => {
    if (!scoreWorkbook || !scoreSheetName || !planWorkbook || !planSheetName) {
      message.warning('请先在第一步上传并选择表格')
      return
    }

    const scoreHeaderRows = getSheetRows(scoreWorkbook.workbook, scoreSheetName)
    const planHeaderRows = getSheetRows(planWorkbook.workbook, planSheetName)

    const scoreHeaders = (scoreHeaderRows[0] || []).map((v: unknown) => String(v)).filter(Boolean)
    const planHeaders = (planHeaderRows[0] || []).map((v: unknown) => String(v)).filter(Boolean)

    const autoScoreMappings = matchFields(scoreHeaders, fieldAliases)
    const autoPlanMappings = matchFields(planHeaders, fieldAliases).filter(
      (item) => !ignoredPlanSourceFields.includes(item.sourceField)
    )

    resetScoreMappingsToAuto(autoScoreMappings)
    resetPlanMappingsToAuto(autoPlanMappings)

    message.success('已恢复自动映射')
  }

  const handleApplyMappings = () => {
    if (!scoreWorkbook || !scoreSheetName || !planWorkbook || !planSheetName) {
      message.warning('请先在第一步上传并选择表格')
      return
    }

    const scoreRows = getSheetJson(scoreWorkbook.workbook, scoreSheetName)
    const planRows = getSheetJson(planWorkbook.workbook, planSheetName)

    const finalScoreMappings = scoreMappings
      .filter((item) => !item.ignored && item.targetField)

    const finalPlanMappings = planMappings
      .filter((item) => !item.ignored && item.targetField)

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

  const commonColumns = (
    type: 'score' | 'plan'
  ) => [
    {
      title: '忽略',
      dataIndex: 'ignored',
      key: 'ignored',
      width: 80,
      render: (_: boolean, record: any) => (
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
      render: (value: string | undefined, record: any) => (
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
      <Card title="字段映射说明" style={{ borderRadius: 12 }}>
        <Paragraph style={{ marginBottom: 12 }}>
          这里可以手工调整字段映射。修改后点击“应用当前映射”，第四步预览会重新生成。
        </Paragraph>

        <Space>
          <Button onClick={handleResetAutoMappings}>恢复自动映射</Button>
          <Button type="primary" onClick={handleApplyMappings}>
            应用当前映射
          </Button>
        </Space>
      </Card>

      <Card title="原始专业分字段映射" style={{ borderRadius: 12 }}>
        <Table
          rowKey="sourceField"
          columns={commonColumns('score')}
          dataSource={scoreMappings}
          pagination={false}
          scroll={{ x: 800 }}
        />
      </Card>

      <Card title="招生计划字段映射" style={{ borderRadius: 12 }}>
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