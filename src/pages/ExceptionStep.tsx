import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { useMemo, useState } from 'react'
import { usePreviewStore } from '../stores/previewStore'
import { useRuleStore } from '../stores/ruleStore'
import { buildProcessedRecords } from '../modules/match'
import { attachValidationIssues } from '../modules/validate'
import {
  getIssueCodeLabel,
  getIssueLevelLabel,
  getMatchStatusLabel,
  ISSUE_LEVEL_COLOR_MAP,
  MATCH_STATUS_COLOR_MAP,
  UI_FONT_SIZE,
  UI_TAG_FONT_SIZE,
  UI_TITLE_FONT_SIZE,
} from '../constants/display'

const { Text } = Typography

export default function ExceptionStep() {
  const {
    processedRecords,
    scoreRecords,
    planRecords,
    manualMatchSelections,
    setManualMatchSelection,
    clearManualMatchSelection,
    setProcessedRecords,
  } = usePreviewStore()

  const { provinceCurrentBatchDictByYear } = useRuleStore()

  const [keyword, setKeyword] = useState('')
  const [matchStatusFilter, setMatchStatusFilter] = useState<string | undefined>()
  const [issueCodeFilter, setIssueCodeFilter] = useState<string | undefined>()
  const [issueLevelFilter, setIssueLevelFilter] = useState<string | undefined>()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeRowId, setActiveRowId] = useState<string | null>(null)

  const exceptionRecords = useMemo(() => {
    return processedRecords.filter((item) => {
      const hasIssues = item.matchStatus === 'unmatched' || item.issues.length > 0
      const hasManualSelection = !!manualMatchSelections[item.rowId]
      return hasIssues || hasManualSelection
    })
  }, [processedRecords, manualMatchSelections])

  const issueCodeOptions = useMemo(() => {
    const codes = new Set<string>()
    exceptionRecords.forEach((item) => {
      item.issues.forEach((issue) => codes.add(issue.code))
    })
    return Array.from(codes).map((code) => ({
      label: getIssueCodeLabel(code),
      value: code,
    }))
  }, [exceptionRecords])

  const filteredRecords = useMemo(() => {
    const kw = keyword.trim().toLowerCase()

    return exceptionRecords.filter((item) => {
      const year = item.result.year || ''
      const school = item.result.schoolName || ''
      const major = item.result.majorName || ''
      const province = item.result.province || ''
      const remark = item.result.majorRemark || ''
      const rawSubjectCategory = item.source.rawSubjectCategory || ''
      const matchedSubjectCategory = item.result.subjectCategory || ''
      const issueMessages = item.issues.map((issue) => issue.message).join(' ')
      const issueCodes = item.issues.map((issue) => getIssueCodeLabel(issue.code)).join(' ')

      const keywordOk =
        !kw ||
        year.toLowerCase().includes(kw) ||
        school.toLowerCase().includes(kw) ||
        major.toLowerCase().includes(kw) ||
        province.toLowerCase().includes(kw) ||
        remark.toLowerCase().includes(kw) ||
        rawSubjectCategory.toLowerCase().includes(kw) ||
        matchedSubjectCategory.toLowerCase().includes(kw) ||
        issueMessages.toLowerCase().includes(kw) ||
        issueCodes.toLowerCase().includes(kw)

      const matchStatusOk = !matchStatusFilter || item.matchStatus === matchStatusFilter
      const issueCodeOk =
        !issueCodeFilter || item.issues.some((issue) => issue.code === issueCodeFilter)
      const issueLevelOk =
        !issueLevelFilter || item.issues.some((issue) => issue.level === issueLevelFilter)

      return keywordOk && matchStatusOk && issueCodeOk && issueLevelOk
    })
  }, [exceptionRecords, keyword, matchStatusFilter, issueCodeFilter, issueLevelFilter])

  const activeRecord = useMemo(() => {
    if (!activeRowId) return null
    return (
      filteredRecords.find((item) => item.rowId === activeRowId) ||
      exceptionRecords.find((item) => item.rowId === activeRowId) ||
      null
    )
  }, [activeRowId, filteredRecords, exceptionRecords])

  const nextActionableRecord = useMemo(() => {
    if (!activeRecord) return null
    const currentIndex = filteredRecords.findIndex((item) => item.rowId === activeRecord.rowId)
    if (currentIndex < 0) return null

    for (let i = currentIndex + 1; i < filteredRecords.length; i += 1) {
      const record = filteredRecords[i]
      if (record.matchCandidates?.length) {
        return record
      }
    }
    return null
  }, [activeRecord, filteredRecords])

  const rebuildWithManualSelections = (
    nextManualSelections: Record<string, string>
  ) => {
    const processed = buildProcessedRecords(
      scoreRecords,
      planRecords,
      provinceCurrentBatchDictByYear,
      nextManualSelections
    )
    const validated = attachValidationIssues(processed, provinceCurrentBatchDictByYear)
    setProcessedRecords(validated)
  }

  const handleApplyManual = (sourceRowId: string, planRowId: string) => {
    const nextSelections = {
      ...manualMatchSelections,
      [sourceRowId]: planRowId,
    }
    setManualMatchSelection(sourceRowId, planRowId)
    rebuildWithManualSelections(nextSelections)
  }

  const handleClearManual = (sourceRowId: string) => {
    const nextSelections = { ...manualMatchSelections }
    delete nextSelections[sourceRowId]
    clearManualMatchSelection(sourceRowId)
    rebuildWithManualSelections(nextSelections)
  }

  const openMatchDrawer = (record: any) => {
    setActiveRowId(record.rowId)
    setDrawerOpen(true)
  }

  const closeMatchDrawer = () => {
    setDrawerOpen(false)
    setActiveRowId(null)
  }

  const goNextRecord = () => {
    if (nextActionableRecord) {
      setActiveRowId(nextActionableRecord.rowId)
    }
  }

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
      fixed: 'left' as const,
      render: (value: string) => <span style={{ fontSize: UI_FONT_SIZE }}>{value || '-'}</span>,
    },
    {
      title: '学校',
      dataIndex: ['result', 'schoolName'],
      key: 'schoolName',
      width: 180,
      fixed: 'left' as const,
      render: (value: string) => <span style={{ fontSize: UI_FONT_SIZE }}>{value || '-'}</span>,
    },
    {
      title: '省份',
      dataIndex: ['result', 'province'],
      key: 'province',
      width: 100,
      fixed: 'left' as const,
      render: (value: string) => <span style={{ fontSize: UI_FONT_SIZE }}>{value || '-'}</span>,
    },
    {
      title: '原始科类',
      dataIndex: ['source', 'rawSubjectCategory'],
      key: 'rawSubjectCategory',
      width: 140,
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
      title: '专业',
      dataIndex: ['result', 'majorName'],
      key: 'majorName',
      width: 180,
      render: (value: string) => <span style={{ fontSize: UI_FONT_SIZE }}>{value || '-'}</span>,
    },
    {
      title: '专业备注',
      dataIndex: ['result', 'majorRemark'],
      key: 'majorRemark',
      width: 150,
      render: (value: string) => <span style={{ fontSize: UI_FONT_SIZE }}>{value || '-'}</span>,
    },
    {
      title: '问题说明',
      dataIndex: 'issues',
      key: 'issues',
      width: 340,
      render: (issues: { message: string; level: string }[]) => {
        if (!issues.length) {
          return <div style={{ fontSize: UI_FONT_SIZE, lineHeight: 1.8 }}>当前无问题，保留用于人工回看</div>
        }
        return (
          <div style={{ whiteSpace: 'pre-line', lineHeight: 1.8, fontSize: UI_FONT_SIZE }}>
            {issues
              .map((issue) => `【${getIssueLevelLabel(issue.level)}】${issue.message}`)
              .join('\n')}
          </div>
        )
      },
    },
    {
      title: '问题等级',
      dataIndex: 'issues',
      key: 'issueLevels',
      width: 120,
      render: (issues: { level: string }[]) => {
        const levels = Array.from(new Set(issues.map((issue) => issue.level)))
        if (!levels.length) return <span style={{ fontSize: UI_FONT_SIZE }}>-</span>

        return (
          <Space wrap>
            {levels.map((level) => (
              <Tag key={level} color={ISSUE_LEVEL_COLOR_MAP[level] || 'default'} style={{ fontSize: UI_TAG_FONT_SIZE }}>
                {getIssueLevelLabel(level)}
              </Tag>
            ))}
          </Space>
        )
      },
    },
    {
      title: '问题代码',
      dataIndex: 'issues',
      key: 'issueCodes',
      width: 180,
      render: (issues: { code: string }[]) => {
        if (!issues.length) return <span style={{ fontSize: UI_FONT_SIZE }}>-</span>
        return (
          <Space wrap>
            {issues.map((issue) => (
              <Tag key={issue.code} style={{ fontSize: UI_TAG_FONT_SIZE }}>
                {getIssueCodeLabel(issue.code)}
              </Tag>
            ))}
          </Space>
        )
      },
    },
    {
      title: '匹配状态',
      dataIndex: 'matchStatus',
      key: 'matchStatus',
      width: 140,
      render: (status: string) => (
        <Tag color={MATCH_STATUS_COLOR_MAP[status] || 'default'} style={{ fontSize: UI_TAG_FONT_SIZE }}>
          {getMatchStatusLabel(status)}
        </Tag>
      ),
    },
    {
      title: '人工匹配状态',
      key: 'manualStatus',
      width: 140,
      render: (_: any, record: any) => {
        const selected = manualMatchSelections[record.rowId]
        return selected ? (
          <Tag color="blue" style={{ fontSize: UI_TAG_FONT_SIZE }}>已人工指定</Tag>
        ) : (
          <Tag style={{ fontSize: UI_TAG_FONT_SIZE }}>未指定</Tag>
        )
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: any, record: any) => {
        const hasCandidates = !!record.matchCandidates?.length
        const hasManual = !!manualMatchSelections[record.rowId]

        if (!hasCandidates && !hasManual) {
          return <Text type="secondary" style={{ fontSize: UI_FONT_SIZE }}>无候选</Text>
        }

        return (
          <Button
            type={hasManual ? 'default' : 'primary'}
            size="small"
            onClick={() => openMatchDrawer(record)}
          >
            {hasManual ? '查看/修改' : '去匹配'}
          </Button>
        )
      },
    },
  ]

  const activeSelectedId =
    activeRecord ? manualMatchSelections[activeRecord.rowId] : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="异常筛选" style={{ borderRadius: 12 }}>
        <Space wrap size={12}>
          <Input
            allowClear
            placeholder="搜索年份 / 学校 / 专业 / 备注 / 原始科类 / 省份 / 问题"
            style={{ width: 460 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />

          <Select
            allowClear
            placeholder="匹配状态"
            style={{ width: 180 }}
            value={matchStatusFilter}
            onChange={setMatchStatusFilter}
            options={[
              { label: '未匹配', value: 'unmatched' },
              { label: '匹配到多条', value: 'matched_multiple' },
              { label: '清洗后匹配', value: 'matched_cleaned' },
              { label: '忽略批次匹配', value: 'matched_without_batch' },
              { label: '精确匹配', value: 'matched_exact' },
              { label: '人工指定匹配', value: 'matched_manual' },
            ]}
          />

          <Select
            allowClear
            placeholder="问题等级"
            style={{ width: 140 }}
            value={issueLevelFilter}
            onChange={setIssueLevelFilter}
            options={[
              { label: '错误', value: 'error' },
              { label: '警告', value: 'warning' },
            ]}
          />

          <Select
            allowClear
            showSearch
            placeholder="问题代码"
            style={{ width: 220 }}
            value={issueCodeFilter}
            onChange={setIssueCodeFilter}
            options={issueCodeOptions}
          />
        </Space>
      </Card>

      <Card
        title={`异常处理（共 ${filteredRecords.length} 条）`}
        style={{ borderRadius: 12 }}
      >
        {filteredRecords.length === 0 ? (
          <Empty description="暂无符合条件的异常数据" />
        ) : (
          <Table
            rowKey="rowId"
            size="middle"
            style={{ fontSize: UI_FONT_SIZE }}
            columns={columns}
            dataSource={filteredRecords}
            scroll={{ x: 2400 }}
            pagination={{ pageSize: 10 }}
          />
        )}
      </Card>

      <Drawer
        title="人工指定匹配"
        open={drawerOpen}
        onClose={closeMatchDrawer}
        width={900}
      >
        {!activeRecord ? (
          <Empty description="未选中异常记录" />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Card size="small" title="当前异常记录">
              <Descriptions column={2} size="small" bordered style={{ fontSize: UI_FONT_SIZE }}>
                <Descriptions.Item label="行号">{activeRecord.rowId}</Descriptions.Item>
                <Descriptions.Item label="年份">{activeRecord.result.year || '-'}</Descriptions.Item>
                <Descriptions.Item label="学校">{activeRecord.result.schoolName || '-'}</Descriptions.Item>
                <Descriptions.Item label="省份">{activeRecord.result.province || '-'}</Descriptions.Item>
                <Descriptions.Item label="原始科类">
                  {activeRecord.source.rawSubjectCategory || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="匹配后科类">
                  {activeRecord.result.subjectCategory || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="专业">
                  {activeRecord.result.majorName || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="专业备注">
                  {activeRecord.result.majorRemark || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="批次">
                  {activeRecord.result.batch || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="类型">
                  {activeRecord.result.enrollmentType || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="问题说明" span={2}>
                  {activeRecord.issues.length
                    ? activeRecord.issues
                        .map((issue: any) => `【${getIssueLevelLabel(issue.level)}】${issue.message}`)
                        .join('；')
                    : '当前无问题，保留用于人工回看'}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card
              size="small"
              title={`候选招生计划（${activeRecord.matchCandidates?.length || 0} 条）`}
              extra={
                <Space>
                  {activeSelectedId ? (
                    <Button size="small" onClick={() => handleClearManual(activeRecord.rowId)}>
                      清除人工指定
                    </Button>
                  ) : null}

                  <Button
                    size="small"
                    onClick={goNextRecord}
                    disabled={!nextActionableRecord}
                  >
                    下一个
                  </Button>
                </Space>
              }
            >
              {!activeRecord.matchCandidates?.length ? (
                <Empty description="当前没有可人工指定的候选项" />
              ) : (
                <Radio.Group
                  style={{ width: '100%', fontSize: UI_FONT_SIZE }}
                  value={activeSelectedId}
                  onChange={(e) => handleApplyManual(activeRecord.rowId, e.target.value)}
                >
                  <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    {activeRecord.matchCandidates.map((candidate: any) => (
                      <Card
                        key={candidate.rowId}
                        size="small"
                        style={{
                          border:
                            activeSelectedId === candidate.rowId
                              ? '1px solid #1677ff'
                              : undefined,
                        }}
                      >
                        <Radio value={candidate.rowId} style={{ fontSize: UI_FONT_SIZE }}>
                          <span style={{ fontWeight: 500, fontSize: UI_TITLE_FONT_SIZE }}>
                            {candidate.schoolName || '-'} / {candidate.majorName || '-'}
                          </span>
                        </Radio>

                        <div style={{ marginTop: 8, marginLeft: 24, lineHeight: 1.9, fontSize: UI_FONT_SIZE }}>
                          <div>省份：{candidate.province || '-'}</div>
                          <div>科类：{candidate.subjectCategory || '-'}</div>
                          <div>备注：{candidate.majorRemark || '-'}</div>
                          <div>批次：{candidate.batch || '-'}</div>
                          <div>层次：{candidate.level1 || '-'}</div>
                          <div>类型：{candidate.enrollmentType || '-'}</div>
                        </div>
                      </Card>
                    ))}
                  </Space>
                </Radio.Group>
              )}
            </Card>
          </Space>
        )}
      </Drawer>
    </div>
  )
}