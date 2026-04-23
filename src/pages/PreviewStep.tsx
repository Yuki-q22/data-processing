import { Card, Empty, Space, Statistic, Table, Tag } from 'antd'
import { useMemo } from 'react'
import { usePreviewStore } from '../stores/previewStore'
import {
  getMatchStatusLabel,
  MATCH_STATUS_COLOR_MAP,
  UI_FONT_SIZE,
  UI_TAG_FONT_SIZE,
} from '../constants/display'

export default function PreviewStep() {
  const { processedRecords } = usePreviewStore()

  const summary = useMemo(() => {
    const total = processedRecords.length
    const matched = processedRecords.filter(
      (item) =>
        item.matchStatus !== 'unmatched' &&
        item.matchStatus !== 'matched_multiple'
    ).length
    const warnings = processedRecords.reduce(
      (sum, item) => sum + item.issues.filter((x) => x.level === 'warning').length,
      0
    )
    const errors = processedRecords.reduce(
      (sum, item) => sum + item.issues.filter((x) => x.level === 'error').length,
      0
    )

    return {
      total,
      matched,
      warnings,
      errors,
    }
  }, [processedRecords])

  const columns = [
    {
      title: '行号',
      dataIndex: 'rowId',
      key: 'rowId',
      width: 80,
      fixed: 'left' as const,
    },
    {
      title: '年份',
      dataIndex: ['result', 'year'],
      key: 'year',
      width: 90,
      render: (value: string) => <span style={{ fontSize: UI_FONT_SIZE }}>{value || '-'}</span>,
    },
    {
      title: '学校',
      dataIndex: ['result', 'schoolName'],
      key: 'schoolName',
      width: 180,
      render: (value: string) => <span style={{ fontSize: UI_FONT_SIZE }}>{value || '-'}</span>,
    },
    {
      title: '省份',
      dataIndex: ['result', 'province'],
      key: 'province',
      width: 100,
      render: (value: string) => <span style={{ fontSize: UI_FONT_SIZE }}>{value || '-'}</span>,
    },
    {
      title: '原始科类',
      dataIndex: ['source', 'rawSubjectCategory'],
      key: 'rawSubjectCategory',
      width: 160,
      render: (value: string, record: any) => {
        const needsReview = record?.source?.subjectCategoryNeedsReview
        if (!value) return <span style={{ fontSize: UI_FONT_SIZE }}>-</span>
        return needsReview ? (
          <Tag color="orange" style={{ fontSize: UI_TAG_FONT_SIZE }}>{value}</Tag>
        ) : (
          <span style={{ fontSize: UI_FONT_SIZE }}>{value}</span>
        )
      },
    },
    {
      title: '匹配后科类',
      dataIndex: ['result', 'subjectCategory'],
      key: 'subjectCategory',
      width: 140,
      render: (value: string) => <span style={{ fontSize: UI_FONT_SIZE }}>{value || '-'}</span>,
    },
    {
      title: '首选科目',
      dataIndex: ['result', 'firstSubject'],
      key: 'firstSubject',
      width: 100,
      render: (value: string) => <span style={{ fontSize: UI_FONT_SIZE }}>{value || '-'}</span>,
    },
    {
      title: '选科要求',
      dataIndex: ['result', 'subjectRequirementMode'],
      key: 'subjectRequirementMode',
      width: 180,
      render: (value: string) => <span style={{ fontSize: UI_FONT_SIZE }}>{value || '-'}</span>,
    },
    {
      title: '次选科目',
      dataIndex: ['result', 'secondSubject'],
      key: 'secondSubject',
      width: 120,
      render: (value: string) => <span style={{ fontSize: UI_FONT_SIZE }}>{value || '-'}</span>,
    },
    {
      title: '批次',
      dataIndex: ['result', 'batch'],
      key: 'batch',
      width: 140,
      render: (value: string) => <span style={{ fontSize: UI_FONT_SIZE }}>{value || '-'}</span>,
    },
    {
      title: '类型',
      dataIndex: ['result', 'enrollmentType'],
      key: 'enrollmentType',
      width: 140,
      render: (value: string) => <span style={{ fontSize: UI_FONT_SIZE }}>{value || '-'}</span>,
    },
    {
      title: '专业',
      dataIndex: ['result', 'majorName'],
      key: 'majorName',
      width: 220,
      render: (value: string) => <span style={{ fontSize: UI_FONT_SIZE }}>{value || '-'}</span>,
    },
    {
      title: '最低分',
      dataIndex: ['result', 'lowestScore'],
      key: 'lowestScore',
      width: 100,
      render: (value: number | null) => <span style={{ fontSize: UI_FONT_SIZE }}>{value ?? '-'}</span>,
    },
    {
      title: '最高分',
      dataIndex: ['result', 'highestScore'],
      key: 'highestScore',
      width: 100,
      render: (value: number | null) => <span style={{ fontSize: UI_FONT_SIZE }}>{value ?? '-'}</span>,
    },
    {
      title: '最低位次',
      dataIndex: ['result', 'lowestRank'],
      key: 'lowestRank',
      width: 120,
      render: (value: number | null) => <span style={{ fontSize: UI_FONT_SIZE }}>{value ?? '-'}</span>,
    },
    {
      title: '匹配状态',
      dataIndex: 'matchStatus',
      key: 'matchStatus',
      width: 160,
      render: (status: string) => (
        <Tag
          color={MATCH_STATUS_COLOR_MAP[status] || 'default'}
          style={{ fontSize: UI_TAG_FONT_SIZE }}
        >
          {getMatchStatusLabel(status)}
        </Tag>
      ),
    },
    {
      title: '问题数',
      dataIndex: 'issues',
      key: 'issueCount',
      width: 100,
      render: (issues: any[]) => <span style={{ fontSize: UI_FONT_SIZE }}>{issues.length}</span>,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Space size={16}>
        <Card><Statistic title="总记录数" value={summary.total} /></Card>
        <Card><Statistic title="已匹配" value={summary.matched} /></Card>
        <Card><Statistic title="警告数" value={summary.warnings} /></Card>
        <Card><Statistic title="错误数" value={summary.errors} /></Card>
      </Space>

      <Card title="处理结果预览" style={{ borderRadius: 12 }}>
        {processedRecords.length === 0 ? (
          <Empty description="暂无处理结果，请先在上传页生成预览数据" />
        ) : (
          <Table
            rowKey="rowId"
            size="middle"
            style={{ fontSize: UI_FONT_SIZE }}
            columns={columns}
            dataSource={processedRecords}
            scroll={{ x: 2600 }}
            pagination={{ pageSize: 10 }}
          />
        )}
      </Card>
    </div>
  )
}