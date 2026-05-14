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
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import { useMemo, useState } from 'react'
import { usePreviewStore } from '../stores/previewStore'
import { useRuleCenterStore } from '../stores/ruleCenterStore'
import type { PlanRecord, ProcessedRecord, ValidationIssue } from '../types/record'
import { buildProcessedRecords } from '../modules/match'
import { attachValidationIssues } from '../modules/validate'
import { getBestRemarkMatchedCandidate, getManualMatchRemarkScore } from '../modules/manualMatchHint'
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

const IMPORTANT_COMPARE_FIELDS: Array<{
  label: string
  current: string
  candidate: string
}> = [
  { label: '省份', current: 'province', candidate: 'province' },
  { label: '科类', current: 'subjectCategory', candidate: 'subjectCategory' },
  { label: '批次', current: 'batch', candidate: 'batch' },
  { label: '层次', current: 'level1', candidate: 'level1' },
  { label: '招生类型', current: 'enrollmentType', candidate: 'enrollmentType' },
  { label: '专业', current: 'majorName', candidate: 'majorName' },
  { label: '专业组代码', current: 'groupCode', candidate: 'groupCode' },
]

function normalizeCompareText(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
}

function buildCandidateRecommendReasons(
  activeRecord: ProcessedRecord,
  candidate: PlanRecord,
  remarkBestMatch: { bestKey: string; bestScore: number },
) {
  const reasons: Array<{ label: string; color?: string }> = []
  const result = activeRecord?.result || {}

  IMPORTANT_COMPARE_FIELDS.forEach((field) => {
    const currentValue = normalizeCompareText(result[field.current as keyof typeof result])
    const candidateValue = normalizeCompareText(candidate[field.candidate as keyof typeof candidate])
    if (!currentValue || !candidateValue) return
    if (currentValue === candidateValue) {
      reasons.push({ label: `${field.label}一致`, color: 'green' })
    }
  })

  if (remarkBestMatch.bestScore >= 45 && remarkBestMatch.bestKey === String(candidate.rowId)) {
    reasons.unshift({ label: `备注/招生类型最相近 ${remarkBestMatch.bestScore}`, color: 'gold' })
  }

  if (activeRecord?.matchStatus === 'matched_multiple') {
    reasons.push({ label: '系统匹配到多条候选', color: 'blue' })
  }

  if (!reasons.length) {
    reasons.push({ label: '候选组合键相近，需人工确认' })
  }

  return reasons
}

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

  const { provinceCurrentBatchDictByYear } = useRuleCenterStore()

  const [keyword, setKeyword] = useState('')
  const [matchStatusFilter, setMatchStatusFilter] = useState<
    string | undefined
  >()
  const [issueCodeFilter, setIssueCodeFilter] = useState<string | undefined>()
  const [issueLevelFilter, setIssueLevelFilter] = useState<string | undefined>()
  const [onlyNeedManualMatch, setOnlyNeedManualMatch] = useState(false)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeRowId, setActiveRowId] = useState<string | null>(null)

  const exceptionRecords = useMemo(() => {
    return processedRecords.filter((item) => {
      const hasIssues =
        item.matchStatus === 'unmatched' || item.issues.length > 0
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
      const issueCodes = item.issues
        .map((issue) => getIssueCodeLabel(issue.code))
        .join(' ')

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

      const matchStatusOk =
        !matchStatusFilter || item.matchStatus === matchStatusFilter

      const issueCodeOk =
        !issueCodeFilter ||
        item.issues.some((issue) => issue.code === issueCodeFilter)

      const issueLevelOk =
        !issueLevelFilter ||
        item.issues.some((issue) => issue.level === issueLevelFilter)

      const needManualMatchOk =
        !onlyNeedManualMatch ||
        (!!item.matchCandidates?.length && !manualMatchSelections[item.rowId])

      return (
        keywordOk &&
        matchStatusOk &&
        issueCodeOk &&
        issueLevelOk &&
        needManualMatchOk
      )
    })
  }, [
    exceptionRecords,
    keyword,
    matchStatusFilter,
    issueCodeFilter,
    issueLevelFilter,
    onlyNeedManualMatch,
    manualMatchSelections,
  ])

  const activeRecord = useMemo(() => {
    if (!activeRowId) return null

    return (
      filteredRecords.find((item) => item.rowId === activeRowId) ||
      exceptionRecords.find((item) => item.rowId === activeRowId) ||
      null
    )
  }, [activeRowId, filteredRecords, exceptionRecords])

  const remarkBestMatch = useMemo(() => {
    if (!activeRecord?.matchCandidates?.length) {
      return {
        bestKey: '',
        bestScore: 0,
      }
    }

    const currentRemark =
      activeRecord.result.majorRemark ??
      activeRecord.source.majorRemark ??
      ''
    const currentEnrollmentType =
      activeRecord.result.enrollmentType ??
      activeRecord.source.enrollmentType ??
      ''

    return getBestRemarkMatchedCandidate(
      {
        rowId: activeRecord.rowId,
        remark: currentRemark,
        majorRemark: currentRemark,
        enrollmentType: currentEnrollmentType,
      },
      activeRecord.matchCandidates.map((candidate: PlanRecord) => {
        const candidateRemark = candidate.majorRemark ?? ''
        const candidateEnrollmentType = candidate.enrollmentType ?? ''

        return {
          rowId: candidate.rowId,
          id: candidate.rowId,
          remark: candidateRemark,
          majorRemark: candidateRemark,
          enrollmentType: candidateEnrollmentType,
        }
      })
    )
  }, [activeRecord])

  const activeCandidateRows = useMemo(() => {
    if (!activeRecord?.matchCandidates?.length) return []

    const currentRemark =
      activeRecord.result.majorRemark ??
      activeRecord.source.majorRemark ??
      ''
    const currentEnrollmentType =
      activeRecord.result.enrollmentType ??
      activeRecord.source.enrollmentType ??
      ''

    return [...activeRecord.matchCandidates]
      .map((candidate) => {
        const score = getManualMatchRemarkScore(
          {
            rowId: activeRecord.rowId,
            remark: currentRemark,
            majorRemark: currentRemark,
            enrollmentType: currentEnrollmentType,
          },
          {
            rowId: candidate.rowId,
            id: candidate.rowId,
            remark: candidate.majorRemark ?? '',
            majorRemark: candidate.majorRemark ?? '',
            enrollmentType: candidate.enrollmentType ?? '',
          }
        )

        return {
          candidate,
          score,
        }
      })
      .sort((a, b) => b.score - a.score)
  }, [activeRecord])

  const nextActionableRecord = useMemo(() => {
    if (!activeRowId) return null

    const records = filteredRecords.length ? filteredRecords : exceptionRecords
    const currentIndex = records.findIndex((item) => item.rowId === activeRowId)

    const hasCandidates = (record: ProcessedRecord) => !!record.matchCandidates?.length

    if (currentIndex >= 0) {
      for (let i = currentIndex + 1; i < records.length; i += 1) {
        if (hasCandidates(records[i])) {
          return records[i]
        }
      }
    }

    const currentRowNumber = Number(activeRowId)

    if (!Number.isNaN(currentRowNumber)) {
      const nextByRowId = records
        .filter((item) => {
          const rowNumber = Number(item.rowId)

          return (
            !Number.isNaN(rowNumber) &&
            rowNumber > currentRowNumber &&
            hasCandidates(item)
          )
        })
        .sort((a, b) => Number(a.rowId) - Number(b.rowId))[0]

      if (nextByRowId) return nextByRowId
    }

    return (
      records.find((item) => item.rowId !== activeRowId && hasCandidates(item)) ||
      null
    )
  }, [activeRowId, filteredRecords, exceptionRecords])

  const prevActionableRecord = useMemo(() => {
    if (!activeRowId) return null

    const records = filteredRecords.length ? filteredRecords : exceptionRecords
    const currentIndex = records.findIndex((item) => item.rowId === activeRowId)

    const hasCandidates = (record: ProcessedRecord) => !!record.matchCandidates?.length

    if (currentIndex >= 0) {
      for (let i = currentIndex - 1; i >= 0; i -= 1) {
        if (hasCandidates(records[i])) {
          return records[i]
        }
      }
    }

    const currentRowNumber = Number(activeRowId)

    if (!Number.isNaN(currentRowNumber)) {
      const prevByRowId = records
        .filter((item) => {
          const rowNumber = Number(item.rowId)

          return (
            !Number.isNaN(rowNumber) &&
            rowNumber < currentRowNumber &&
            hasCandidates(item)
          )
        })
        .sort((a, b) => Number(b.rowId) - Number(a.rowId))[0]

      if (prevByRowId) return prevByRowId
    }

    return null
  }, [activeRowId, filteredRecords, exceptionRecords])

  const rebuildWithManualSelections = (
    nextManualSelections: Record<string, string>
  ) => {
    const processed = buildProcessedRecords(
      scoreRecords,
      planRecords,
      provinceCurrentBatchDictByYear,
      nextManualSelections
    )

    const validated = attachValidationIssues(
      processed,
      provinceCurrentBatchDictByYear
    )

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

  const openMatchDrawer = (record: ProcessedRecord) => {
    setActiveRowId(record.rowId)
    setDrawerOpen(true)
  }

  const closeMatchDrawer = () => {
    setDrawerOpen(false)
    setActiveRowId(null)
  }

  const goPrevRecord = () => {
  if (!prevActionableRecord) return

  setActiveRowId(prevActionableRecord.rowId)
}

const goNextRecord = () => {
  if (!nextActionableRecord) return

  setActiveRowId(nextActionableRecord.rowId)
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
      render: (value: string) => (
        <span style={{ fontSize: UI_FONT_SIZE }}>{value || '-'}</span>
      ),
    },
    {
      title: '学校',
      dataIndex: ['result', 'schoolName'],
      key: 'schoolName',
      width: 180,
      fixed: 'left' as const,
      render: (value: string) => (
        <span style={{ fontSize: UI_FONT_SIZE }}>{value || '-'}</span>
      ),
    },
    {
      title: '省份',
      dataIndex: ['result', 'province'],
      key: 'province',
      width: 100,
      fixed: 'left' as const,
      render: (value: string) => (
        <span style={{ fontSize: UI_FONT_SIZE }}>{value || '-'}</span>
      ),
    },
    {
      title: '原始科类',
      dataIndex: ['source', 'rawSubjectCategory'],
      key: 'rawSubjectCategory',
      width: 140,
      render: (value: string, record: ProcessedRecord) => {
        const needsReview = record?.source?.subjectCategoryNeedsReview

        if (!value) {
          return <span style={{ fontSize: UI_FONT_SIZE }}>-</span>
        }

        return needsReview ? (
          <Tag color="orange" style={{ fontSize: UI_TAG_FONT_SIZE }}>
            {value}
          </Tag>
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
      render: (value: string) => (
        <span style={{ fontSize: UI_FONT_SIZE }}>{value || '-'}</span>
      ),
    },
    {
      title: '专业',
      dataIndex: ['result', 'majorName'],
      key: 'majorName',
      width: 180,
      render: (value: string) => (
        <span style={{ fontSize: UI_FONT_SIZE }}>{value || '-'}</span>
      ),
    },
    {
      title: '专业备注',
      dataIndex: ['result', 'majorRemark'],
      key: 'majorRemark',
      width: 150,
      render: (value: string) => (
        <span style={{ fontSize: UI_FONT_SIZE }}>{value || '-'}</span>
      ),
    },
    {
      title: '问题说明',
      dataIndex: 'issues',
      key: 'issues',
      width: 340,
      render: (issues: { message: string; level: string }[]) => {
        if (!issues.length) {
          return (
            <div style={{ fontSize: UI_FONT_SIZE, lineHeight: 1.8 }}>
              当前无问题，保留用于人工回看
            </div>
          )
        }

        return (
          <div
            style={{
              whiteSpace: 'pre-line',
              lineHeight: 1.8,
              fontSize: UI_FONT_SIZE,
            }}
          >
            {issues
              .map(
                (issue) =>
                  `【${getIssueLevelLabel(issue.level)}】${issue.message}`
              )
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

        if (!levels.length) {
          return <span style={{ fontSize: UI_FONT_SIZE }}>-</span>
        }

        return (
          <Space wrap>
            {levels.map((level) => (
              <Tag
                key={level}
                color={ISSUE_LEVEL_COLOR_MAP[level] || 'default'}
                style={{ fontSize: UI_TAG_FONT_SIZE }}
              >
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
        if (!issues.length) {
          return <span style={{ fontSize: UI_FONT_SIZE }}>-</span>
        }

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
        <Tag
          color={MATCH_STATUS_COLOR_MAP[status] || 'default'}
          style={{ fontSize: UI_TAG_FONT_SIZE }}
        >
          {getMatchStatusLabel(status)}
        </Tag>
      ),
    },
    {
      title: '人工匹配状态',
      key: 'manualStatus',
      width: 140,
      render: (_: unknown, record: ProcessedRecord) => {
        const selected = manualMatchSelections[record.rowId]

        return selected ? (
          <Tag color="blue" style={{ fontSize: UI_TAG_FONT_SIZE }}>
            已人工指定
          </Tag>
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
      render: (_: unknown, record: ProcessedRecord) => {
        const hasCandidates = !!record.matchCandidates?.length
        const hasManual = !!manualMatchSelections[record.rowId]

        if (!hasCandidates && !hasManual) {
          return (
            <Text type="secondary" style={{ fontSize: UI_FONT_SIZE }}>
              无候选
            </Text>
          )
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

  const activeSelectedId = activeRecord
    ? manualMatchSelections[activeRecord.rowId]
    : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="异常筛选">
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

          <Space size={6}>
            <Switch
              checked={onlyNeedManualMatch}
              onChange={setOnlyNeedManualMatch}
            />
            <Text style={{ fontSize: UI_FONT_SIZE }}>只看需人工指定</Text>
          </Space>
        </Space>
      </Card>

      <Card
        title={`异常处理（共 ${filteredRecords.length} 条）`}
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
              <Descriptions
                column={2}
                size="small"
                bordered
                style={{ fontSize: UI_FONT_SIZE }}
              >
                <Descriptions.Item label="行号">
                  {activeRecord.rowId}
                </Descriptions.Item>
                <Descriptions.Item label="年份">
                  {activeRecord.result.year || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="学校">
                  {activeRecord.result.schoolName || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="省份">
                  {activeRecord.result.province || '-'}
                </Descriptions.Item>
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
                        .map(
                          (issue: ValidationIssue) =>
                            `【${getIssueLevelLabel(issue.level)}】${issue.message}`
                        )
                        .join('；')
                    : '当前无问题，保留用于人工回看'}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card
              size="small"
              title={`候选招生计划（${
                activeRecord.matchCandidates?.length || 0
              } 条）`}
              extra={
                <Space>
                  {remarkBestMatch.bestScore >= 45 ? (
                    <Tag color="gold">已按备注/招生类型高亮最相近候选</Tag>
                  ) : null}

                  {activeSelectedId ? (
                    <Button
                      size="small"
                      onClick={() => handleClearManual(activeRecord.rowId)}
                    >
                      清除人工指定
                    </Button>
                  ) : null}

                  <Button
                    size="small"
                    onClick={goPrevRecord}
                    disabled={!prevActionableRecord}
                  >
                    上一条
                  </Button>

                  <Button
                    size="small"
                    type="primary"
                    onClick={goNextRecord}
                    disabled={!nextActionableRecord}
                  >
                    下一条
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
                  onChange={(e) =>
                    handleApplyManual(activeRecord.rowId, e.target.value)
                  }
                >
                  <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    {activeCandidateRows.map(({ candidate, score }) => {
                      const selected = activeSelectedId === candidate.rowId

                      const isBestRemarkMatch =
                        remarkBestMatch.bestScore >= 45 &&
                        remarkBestMatch.bestKey === String(candidate.rowId)

                      const recommendReasons = buildCandidateRecommendReasons(
                        activeRecord,
                        candidate,
                        remarkBestMatch
                      )

                      return (
                        <Card
                          key={candidate.rowId}
                          size="small"
                          hoverable
                          className={
                            selected
                              ? 'candidate-card candidate-selected'
                              : isBestRemarkMatch
                                ? 'candidate-card candidate-best'
                                : 'candidate-card'
                          }
                          onClick={() =>
                            handleApplyManual(
                              activeRecord.rowId,
                              candidate.rowId
                            )
                          }
                          style={{
                            cursor: 'pointer',
                            transition: 'all 0.25s var(--ease-out)',
                          }}
                        >
                          <Radio
                            value={candidate.rowId}
                            style={{ fontSize: UI_FONT_SIZE }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Space wrap>
                              <span
                                style={{
                                  fontWeight: 500,
                                  fontSize: UI_TITLE_FONT_SIZE,
                                }}
                              >
                                {candidate.schoolName || '-'} /{' '}
                                {candidate.majorName || '-'}
                              </span>

                              <Tag color={candidate.groupCode ? 'purple' : 'default'}>
                                专业组代码：{candidate.groupCode || '-'}
                              </Tag>

                              {score > 0 ? (
                                <Tag>相似度 {score}</Tag>
                              ) : null}

                              {isBestRemarkMatch ? (
                                <Tag color="gold">
                                  备注/招生类型最相近 {remarkBestMatch.bestScore}
                                </Tag>
                              ) : null}

                              {selected ? (
                                <Tag color="blue">当前已选</Tag>
                              ) : null}
                            </Space>
                          </Radio>

                          <div
                            style={{
                              marginTop: 8,
                              marginLeft: 24,
                              lineHeight: 1.9,
                              fontSize: UI_FONT_SIZE,
                            }}
                          >
                            <div style={{ marginBottom: 6 }}>
                              推荐原因：
                              <Space wrap size={[4, 4]}>
                                {recommendReasons.map((reason) => (
                                  <Tag
                                    key={reason.label}
                                    color={reason.color}
                                    style={{ fontSize: UI_TAG_FONT_SIZE }}
                                  >
                                    {reason.label}
                                  </Tag>
                                ))}
                              </Space>
                            </div>
                            <div>省份：{candidate.province || '-'}</div>
                            <div>科类：{candidate.subjectCategory || '-'}</div>
                            <div>专业组代码：{candidate.groupCode || '-'}</div>
                            <div>备注：{candidate.majorRemark || '-'}</div>
                            <div>批次：{candidate.batch || '-'}</div>
                            <div>层次：{candidate.level1 || '-'}</div>
                            <div>类型：{candidate.enrollmentType || '-'}</div>
                          </div>
                        </Card>
                      )
                    })}
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