import { Alert, Button, Card, Empty, Space, Statistic, Table, Tag, Typography, message } from 'antd'
import { useMemo } from 'react'
import { usePreviewStore } from '../stores/previewStore'
import { useTaskStore } from '../stores/taskStore'
import { useRuleCenterStore } from '../stores/ruleCenterStore'
import {
  exportProfessionalScoreTemplate,
  getExportableRecords,
} from '../modules/templateExport'
import { validateSchoolAndMajorComboDetailed } from '../modules/ruleCenterValidation'
import type { ProcessedRecord } from '../types/record'

const { Paragraph } = Typography

type RulePreviewRow = {
  rowId: string
  schoolName: string
  majorName: string
  level: string
  schoolResult: string
  majorResult: string
  issues: string[]
}

function buildRulePreviewRow(
  record: ProcessedRecord,
  validSchoolNames: string[],
  validMajorCombos: string[]
): RulePreviewRow {
  const r = record.result
  const schoolResult = validateSchoolAndMajorComboDetailed({
    validSchoolNames,
    schoolName: r.schoolName,
  })
  const majorResult = validateSchoolAndMajorComboDetailed({
    validMajorCombos,
    majorName: r.majorName,
    level: r.level1,
  })

  return {
    rowId: record.rowId,
    schoolName: r.schoolName || '',
    majorName: r.majorName || '',
    level: r.level1 || '',
    schoolResult: schoolResult.schoolResult,
    majorResult: majorResult.majorResult,
    issues: Array.from(new Set([...schoolResult.issues, ...majorResult.issues])),
  }
}

function getResultTagColor(value: string) {
  if (value === '匹配') return 'green'
  if (value === '未匹配') return 'red'
  return 'default'
}

export default function ExportStep() {
  const processedRecords = usePreviewStore((state) => state.processedRecords)
  const year = useTaskStore((state) => state.year)
  const validSchoolNames = useRuleCenterStore((state) => state.validSchoolNames)
  const validMajorCombos = useRuleCenterStore((state) => state.validMajorCombos)

  const exportable = useMemo(() => getExportableRecords(processedRecords), [processedRecords])
  const blocked = processedRecords.length - exportable.length

  const rulePreviewRows = useMemo(
    () => exportable.map((record) => buildRulePreviewRow(record, validSchoolNames, validMajorCombos)),
    [exportable, validSchoolNames, validMajorCombos]
  )

  const ruleSummary = useMemo(() => {
    const schoolUnmatched = rulePreviewRows.filter((row) => row.schoolResult === '未匹配').length
    const majorUnmatched = rulePreviewRows.filter((row) => row.majorResult === '未匹配').length
    const issueRows = rulePreviewRows.filter((row) => row.issues.length > 0).length

    return {
      schoolUnmatched,
      majorUnmatched,
      issueRows,
      schoolRulesEnabled: validSchoolNames.length > 0,
      majorRulesEnabled: validMajorCombos.length > 0,
    }
  }, [rulePreviewRows, validSchoolNames.length, validMajorCombos.length])

  const issuePreviewRows = useMemo(() => rulePreviewRows.filter((row) => row.issues.length > 0).slice(0, 100), [rulePreviewRows])

  const handleExport = async () => {
    if (!processedRecords.length) {
      message.warning('请先生成预览数据')
      return
    }

    if (!exportable.length) {
      message.warning('没有通过校验的数据可导出')
      return
    }

    try {
      await exportProfessionalScoreTemplate(year, processedRecords, {
        validSchoolNames,
        validMajorCombos,
      })
      message.success('模板导出成功')
    } catch (error) {
      console.error(error)
      message.error('模板导出失败')
    }
  }

  const columns = [
    { title: '行号', dataIndex: 'rowId', key: 'rowId', width: 90 },
    { title: '学校', dataIndex: 'schoolName', key: 'schoolName', width: 180 },
    { title: '专业', dataIndex: 'majorName', key: 'majorName', width: 220 },
    { title: '层次', dataIndex: 'level', key: 'level', width: 120 },
    {
      title: '学校规则校验',
      dataIndex: 'schoolResult',
      key: 'schoolResult',
      width: 140,
      render: (value: string) => <Tag color={getResultTagColor(value)}>{value}</Tag>,
    },
    {
      title: '专业规则校验',
      dataIndex: 'majorResult',
      key: 'majorResult',
      width: 140,
      render: (value: string) => <Tag color={getResultTagColor(value)}>{value}</Tag>,
    },
    {
      title: '异常说明',
      dataIndex: 'issues',
      key: 'issues',
      width: 420,
      render: (issues: string[]) => (issues.length ? issues.join('；') : '-'),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title="导出结果">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Paragraph style={{ marginBottom: 0 }}>
            导出时仅拦截必要字段缺失、数据来源非法等阻断性错误；最高分/最低分/平均分顺序错误只做标注，仍可导出。规则中心的学校/专业规则校验结果会写入导出模板最后两列，并在下方提前预览。
          </Paragraph>

          <Space wrap size={16}>
            <Card><Statistic title="总记录数" value={processedRecords.length} /></Card>
            <Card><Statistic title="可导出记录数" value={exportable.length} /></Card>
            <Card><Statistic title="被拦截记录数" value={blocked} /></Card>
            <Card><Statistic title="学校规则未匹配" value={ruleSummary.schoolUnmatched} /></Card>
            <Card><Statistic title="专业规则未匹配" value={ruleSummary.majorUnmatched} /></Card>
          </Space>

          {!ruleSummary.schoolRulesEnabled || !ruleSummary.majorRulesEnabled ? (
            <Alert
              type="warning"
              showIcon
              message="规则中心校验未完全启用"
              description={`当前${ruleSummary.schoolRulesEnabled ? '' : '未导入学校名称规则'}${!ruleSummary.schoolRulesEnabled && !ruleSummary.majorRulesEnabled ? '，' : ''}${ruleSummary.majorRulesEnabled ? '' : '未导入专业名称+层次规则'}。未启用的规则会在导出模板中显示为“未启用”。`}
            />
          ) : null}

          {ruleSummary.issueRows > 0 ? (
            <Alert
              type="warning"
              showIcon
              message={`导出前规则校验发现 ${ruleSummary.issueRows} 条需核查记录`}
              description="这些记录仍可导出，但建议先确认学校名称、专业名称与层次是否符合规则中心标准。"
            />
          ) : exportable.length > 0 ? (
            <Alert type="success" showIcon message="可导出记录均通过已启用的规则中心校验" />
          ) : null}

          <Button type="primary" onClick={handleExport} disabled={!exportable.length}>
            导出专业分模板
          </Button>
        </Space>
      </Card>

      <Card title={`导出前学校/专业规则校验预览（异常 ${ruleSummary.issueRows} 条）`}>
        {!exportable.length ? (
          <Empty description="暂无可导出记录" />
        ) : issuePreviewRows.length === 0 ? (
          <Empty description="暂无学校/专业规则异常" />
        ) : (
          <>
            <Paragraph type="secondary">这里只展示前 100 条规则异常；完整校验结果会写入导出的 Excel。</Paragraph>
            <Table<RulePreviewRow>
              rowKey="rowId"
              size="middle"
              columns={columns}
              dataSource={issuePreviewRows}
              scroll={{ x: 1300 }}
              pagination={{ pageSize: 10 }}
              rowClassName={(_, index) => `table-row-animate table-row-delay-${Math.min(index % 8, 7)}`}
            />
          </>
        )}
      </Card>
    </Space>
  )
}
