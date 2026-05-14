import { Card, Empty, Input, Select, Space, Statistic, Table, Tag, Typography } from 'antd'
import { useMemo, useState } from 'react'
import { usePreviewStore } from '../stores/previewStore'
import {
  getIssueCodeLabel,
  getIssueLevelLabel,
  getMatchStatusLabel,
  ISSUE_LEVEL_COLOR_MAP,
  MATCH_STATUS_COLOR_MAP,
  UI_FONT_SIZE,
  UI_TAG_FONT_SIZE,
} from '../constants/display'
import type { ProcessedRecord } from '../types/record'

const { Text } = Typography

const MATCH_STATUS_OPTIONS = [
  { label: '全部匹配状态', value: 'all' },
  { label: '精确匹配', value: 'matched_exact' },
  { label: '忽略批次匹配', value: 'matched_without_batch' },
  { label: '清洗后匹配', value: 'matched_cleaned' },
  { label: '人工指定匹配', value: 'matched_manual' },
  { label: '匹配到多条', value: 'matched_multiple' },
  { label: '未匹配', value: 'unmatched' },
]

const ISSUE_LEVEL_OPTIONS = [
  { label: '全部问题等级', value: 'all' },
  { label: '错误', value: 'error' },
  { label: '警告', value: 'warning' },
  { label: '无问题', value: 'none' },
]

function getRecordSearchText(record: ProcessedRecord) {
  const values = [
    record.rowId,
    record.result.year,
    record.result.schoolName,
    record.result.province,
    record.result.subjectCategory,
    record.result.batch,
    record.result.enrollmentType,
    record.result.majorName,
    record.result.majorDirection,
    record.result.majorRemark,
    record.result.level1,
    record.result.groupCode,
    record.result.majorCode,
    record.result.enrollmentCode,
    record.source.rawSubjectCategory,
    record.matchStatus,
    getMatchStatusLabel(record.matchStatus),
    ...record.issues.flatMap((issue) => [
      issue.code,
      getIssueCodeLabel(issue.code),
      issue.level,
      getIssueLevelLabel(issue.level),
      issue.message,
    ]),
  ]

  return values.filter(Boolean).join(' ').toLowerCase()
}

export default function PreviewStep() {
  const { processedRecords } = usePreviewStore()
  const [keyword, setKeyword] = useState('')
  const [matchStatusFilter, setMatchStatusFilter] = useState('all')
  const [issueLevelFilter, setIssueLevelFilter] = useState('all')
  const [issueCodeFilter, setIssueCodeFilter] = useState('all')
  const [provinceFilter, setProvinceFilter] = useState('all')

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

    return { total, matched, warnings, errors }
  }, [processedRecords])

  const provinceOptions = useMemo(() => {
    const provinces = Array.from(
      new Set(processedRecords.map((item) => item.result.province).filter(Boolean))
    ).sort()

    return [
      { label: '全部省份', value: 'all' },
      ...provinces.map((province) => ({ label: province as string, value: province as string })),
    ]
  }, [processedRecords])

  const issueCodeOptions = useMemo(() => {
    const codes = Array.from(
      new Set(
        processedRecords.flatMap((item) => item.issues.map((issue) => issue.code)).filter(Boolean)
      )
    ).sort()

    return [
      { label: '全部问题代码', value: 'all' },
      ...codes.map((code) => ({ label: getIssueCodeLabel(code), value: code })),
    ]
  }, [processedRecords])

  const filteredRecords = useMemo(() => {
    const kw = keyword.trim().toLowerCase()

    return processedRecords.filter((record) => {
      const keywordOk = !kw || getRecordSearchText(record).includes(kw)
      const matchStatusOk =
        matchStatusFilter === 'all' || record.matchStatus === matchStatusFilter
      const provinceOk = provinceFilter === 'all' || record.result.province === provinceFilter
      const issueLevelOk =
        issueLevelFilter === 'all' ||
        (issueLevelFilter === 'none'
          ? record.issues.length === 0
          : record.issues.some((issue) => issue.level === issueLevelFilter))
      const issueCodeOk =
        issueCodeFilter === 'all' || record.issues.some((issue) => issue.code === issueCodeFilter)

      return keywordOk && matchStatusOk && provinceOk && issueLevelOk && issueCodeOk
    })
  }, [processedRecords, keyword, matchStatusFilter, provinceFilter, issueLevelFilter, issueCodeFilter])

  const columns = [
    { title: '行号', dataIndex: 'rowId', key: 'rowId', width: 80, fixed: 'left' as const },
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
      render: (value: string, record: ProcessedRecord) => {
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
        <Tag color={MATCH_STATUS_COLOR_MAP[status] || 'default'} style={{ fontSize: UI_TAG_FONT_SIZE }}>
          {getMatchStatusLabel(status)}
        </Tag>
      ),
    },
    {
      title: '问题',
      dataIndex: 'issues',
      key: 'issues',
      width: 260,
      render: (issues: ProcessedRecord['issues']) => {
        if (!issues.length) return <Text style={{ fontSize: UI_FONT_SIZE }}>无</Text>
        return (
          <Space wrap size={[4, 4]}>
            {issues.map((issue, index) => (
              <Tag key={`${issue.code}_${index}`} color={ISSUE_LEVEL_COLOR_MAP[issue.level] || 'default'} style={{ fontSize: UI_TAG_FONT_SIZE }}>
                {getIssueCodeLabel(issue.code)}
              </Tag>
            ))}
          </Space>
        )
      },
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Space size={16} wrap>
        <Card><Statistic title="总记录数" value={summary.total} /></Card>
        <Card><Statistic title="已匹配" value={summary.matched} /></Card>
        <Card><Statistic title="警告数" value={summary.warnings} /></Card>
        <Card><Statistic title="错误数" value={summary.errors} /></Card>
        <Card><Statistic title="当前筛选结果" value={filteredRecords.length} /></Card>
      </Space>

      <Card title="预览筛选">
        <Space wrap size={12}>
          <Input
            allowClear
            placeholder="搜索行号 / 年份 / 学校 / 省份 / 科类 / 批次 / 类型 / 专业 / 备注 / 代码 / 问题"
            style={{ width: 520 }}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <Select value={provinceFilter} onChange={setProvinceFilter} style={{ width: 160 }} showSearch options={provinceOptions} />
          <Select value={matchStatusFilter} onChange={setMatchStatusFilter} style={{ width: 180 }} options={MATCH_STATUS_OPTIONS} />
          <Select value={issueLevelFilter} onChange={setIssueLevelFilter} style={{ width: 160 }} options={ISSUE_LEVEL_OPTIONS} />
          <Select value={issueCodeFilter} onChange={setIssueCodeFilter} style={{ width: 220 }} showSearch options={issueCodeOptions} />
        </Space>
      </Card>

      <Card title={`处理结果预览（共 ${filteredRecords.length} 条）`}>
        {processedRecords.length === 0 ? (
          <Empty description="暂无处理结果，请先在上传页生成预览数据" />
        ) : filteredRecords.length === 0 ? (
          <Empty description="暂无符合筛选条件的数据" />
        ) : (
          <Table<ProcessedRecord>
            rowKey="rowId"
            size="middle"
            style={{ fontSize: UI_FONT_SIZE }}
            columns={columns}
            dataSource={filteredRecords}
            scroll={{ x: 2800 }}
            pagination={{ pageSize: 10 }}
          />
        )}
      </Card>
    </div>
  )
}
