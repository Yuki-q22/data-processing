/**
 * 文件名称：招生计划数据比对页面
 *
 * 文件作用：
 * - 控制“招生计划数据比对”工具页面
 * - 负责文件上传、比对按钮、结果展示、导出按钮
 * - 展示招生计划 vs 专业分、招生计划 vs 院校分、专业分缺失组合键
 *
 * 常改位置：
 * - 上传区域
 * - 比对结果表格
 * - 未匹配数据展示
 * - 专业分缺失组合键标注
 * - 导出按钮
 * - 页面提示信息
 *
 * 注意：
 * - 页面展示和交互问题改本文件
 * - 比对规则和导出模板问题改 src/modules/planCompare.ts
 */

import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tabs,
  Typography,
  Upload,
  message,
} from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import type * as XLSX from 'xlsx'
import {
  buildCollegeTemplateRows,
  buildProfessionalTemplateRows,
  downloadBlob,
  exportCollegeCompareTemplate,
  exportProfessionalCompareTemplate,
  processPlanCompare,
  type DifferenceReasonSummaryItem,
  type PlanCollegeCompareRow,
  type PlanCompareResult,
  type PlanScoreCompareRow,
  type PlanScoreMissingKeyRow,
} from '../../modules/planCompare'
import { useRuleCenterStore } from '../../stores/ruleCenterStore'
import { confirmToolReset } from '../../utils/toolReset'
import { parseWorkbookInWorker, sheetToJsonInWorker } from '../../utils/excelWorkerClient'
import { useLatestTaskGuard } from '../../hooks/useLatestTaskGuard'

const { Dragger } = Upload
const { Paragraph, Text } = Typography
const { Search } = Input

type LoadedWorkbook = {
  fileName: string
  workbook: XLSX.WorkBook
  sheetNames: string[]
}

type MatchFilter = 'all' | 'matched' | 'unmatched' | 'missing_code'
async function loadWorkbook(file: File): Promise<LoadedWorkbook> {
  return parseWorkbookInWorker(file)
}

function getFirstSheetName(loaded: LoadedWorkbook | null) {
  return loaded?.sheetNames?.[0] || ''
}

function includesMissingKeyKeyword(row: PlanScoreMissingKeyRow, keyword: string) {
  const text = keyword.trim().toLowerCase()
  if (!text) return true

  return [
    row.school,
    row.province,
    row.category,
    row.batch,
    row.major,
    row.level,
    row.groupCode,
    row.enrollmentCode,
    row.majorCode,
    row.missingKeyText,
    row.matchKey,
  ]
    .join(' ')
    .toLowerCase()
    .includes(text)
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

function getDiffTagColor(tag: string) {
  if (tag === '已匹配') return 'green'
  return 'orange'
}

export default function PlanCompareTool() {
  const validSchoolNames = useRuleCenterStore((state) => state.validSchoolNames)
  const validMajorCombos = useRuleCenterStore((state) => state.validMajorCombos)
  const { startTask, isLatestTask, cancelTask } = useLatestTaskGuard()

  const [planWorkbook, setPlanWorkbook] = useState<LoadedWorkbook | null>(null)
  const [scoreWorkbook, setScoreWorkbook] = useState<LoadedWorkbook | null>(null)
  const [collegeWorkbook, setCollegeWorkbook] = useState<LoadedWorkbook | null>(null)

  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<PlanCompareResult | null>(null)

  const [provinceFilter, setProvinceFilter] = useState<string>('全部')
  const [scoreFilter, setScoreFilter] = useState<MatchFilter>('all')
  const [collegeFilter, setCollegeFilter] = useState<MatchFilter>('all')


  const [missingKeyProvinceFilter, setMissingKeyProvinceFilter] = useState<string>('全部')
  const [missingKeyCategoryFilter, setMissingKeyCategoryFilter] = useState<string>('全部')
  const [missingKeyBatchFilter, setMissingKeyBatchFilter] = useState<string>('全部')
  const [missingKeyKeyword, setMissingKeyKeyword] = useState<string>('')

  const resetFilters = () => {
    setProvinceFilter('全部')
    setScoreFilter('all')
    setCollegeFilter('all')
    setMissingKeyProvinceFilter('全部')
    setMissingKeyCategoryFilter('全部')
    setMissingKeyBatchFilter('全部')
    setMissingKeyKeyword('')
  }

  const handleUploadPlan = async (file: File) => {
    const taskId = startTask('plan-upload')
    try {
      const loaded = await loadWorkbook(file)
      if (!isLatestTask('plan-upload', taskId)) return false
      setPlanWorkbook(loaded)
      setResult(null)
      resetFilters()
      message.success(`已上传招生计划文件：${file.name}`)
    } catch (error) {
      if (!isLatestTask('plan-upload', taskId)) return false
      message.error(error instanceof Error ? error.message : '招生计划文件读取失败')
    }
    return false
  }

  const handleUploadScore = async (file: File) => {
    const taskId = startTask('score-upload')
    try {
      const loaded = await loadWorkbook(file)
      if (!isLatestTask('score-upload', taskId)) return false
      setScoreWorkbook(loaded)
      setResult(null)
      resetFilters()
      message.success(`已上传专业分文件：${file.name}`)
    } catch (error) {
      if (!isLatestTask('score-upload', taskId)) return false
      message.error(error instanceof Error ? error.message : '专业分文件读取失败')
    }
    return false
  }

  const handleUploadCollege = async (file: File) => {
    const taskId = startTask('college-upload')
    try {
      const loaded = await loadWorkbook(file)
      if (!isLatestTask('college-upload', taskId)) return false
      setCollegeWorkbook(loaded)
      setResult(null)
      resetFilters()
      message.success(`已上传院校分文件：${file.name}`)
    } catch (error) {
      if (!isLatestTask('college-upload', taskId)) return false
      message.error(error instanceof Error ? error.message : '院校分文件读取失败')
    }
    return false
  }

  const handleProcess = async () => {
    if (!planWorkbook) {
      message.warning('请先上传招生计划文件')
      return
    }

    const taskId = startTask('process')
    setProcessing(true)
    try {
      const [planRows, scoreRows, collegeRows] = await Promise.all([
        sheetToJsonInWorker(planWorkbook.workbook, getFirstSheetName(planWorkbook)),
        scoreWorkbook ? sheetToJsonInWorker(scoreWorkbook.workbook, getFirstSheetName(scoreWorkbook)) : Promise.resolve([]),
        collegeWorkbook ? sheetToJsonInWorker(collegeWorkbook.workbook, getFirstSheetName(collegeWorkbook)) : Promise.resolve([]),
      ])
      if (!isLatestTask('process', taskId)) return

      const firstPlanRow = planRows[0] || {}
      const yearValue = String(firstPlanRow['年份'] || '')

      const compareResult = processPlanCompare({
        planRows,
        scoreRows,
        collegeRows,
        yearValue,
        validSchoolNames,
        validMajorCombos,
      })

      setResult(compareResult)
      resetFilters()
      message.success('招生计划数据比对完成')
    } catch (error) {
      if (!isLatestTask('process', taskId)) return
      message.error(error instanceof Error ? error.message : '比对失败')
    } finally {
      if (isLatestTask('process', taskId)) {
        setProcessing(false)
      }
    }
  }

  const provinceOptions = useMemo(() => {
    if (!result) return ['全部']
    const all = [
      ...result.planScoreRows.map((item) => item.province),
      ...result.planCollegeRows.map((item) => item.province),
      ...result.planScoreMissingKeyRows.map((item) => item.province),
    ].filter(Boolean)
    return ['全部', ...uniqueSorted(all)]
  }, [result])

  const missingKeyProvinceOptions = useMemo(() => {
    if (!result) return ['全部']
    return ['全部', ...uniqueSorted(result.planScoreMissingKeyRows.map((item) => item.province))]
  }, [result])

  const missingKeyCategoryOptions = useMemo(() => {
    if (!result) return ['全部']
    return ['全部', ...uniqueSorted(result.planScoreMissingKeyRows.map((item) => item.category))]
  }, [result])

  const missingKeyBatchOptions = useMemo(() => {
    if (!result) return ['全部']
    return ['全部', ...uniqueSorted(result.planScoreMissingKeyRows.map((item) => item.batch))]
  }, [result])

  const filteredPlanScoreRows = useMemo(() => {
    if (!result) return []

    return result.planScoreRows.filter((row) => {
      if (provinceFilter !== '全部' && row.province !== provinceFilter) return false
      if (scoreFilter === 'matched' && !row.exists) return false
      if (scoreFilter === 'unmatched' && row.exists) return false
      if (scoreFilter === 'missing_code') return false
      return true
    })
  }, [result, provinceFilter, scoreFilter])

  const filteredPlanCollegeRows = useMemo(() => {
    if (!result) return []

    return result.planCollegeRows.filter((row) => {
      if (provinceFilter !== '全部' && row.province !== provinceFilter) return false
      if (collegeFilter === 'matched' && !row.exists) return false
      if (collegeFilter === 'unmatched' && row.exists) return false
      if (collegeFilter === 'missing_code' && !row.missingEnrollmentCodeFlag) return false
      return true
    })
  }, [result, provinceFilter, collegeFilter])

  const filteredPlanScoreMissingKeyRows = useMemo(() => {
    if (!result) return []

    return result.planScoreMissingKeyRows.filter((row) => {
      if (missingKeyProvinceFilter !== '全部' && row.province !== missingKeyProvinceFilter) return false
      if (missingKeyCategoryFilter !== '全部' && row.category !== missingKeyCategoryFilter) return false
      if (missingKeyBatchFilter !== '全部' && row.batch !== missingKeyBatchFilter) return false
      if (!includesMissingKeyKeyword(row, missingKeyKeyword)) return false
      return true
    })
  }, [result, missingKeyProvinceFilter, missingKeyCategoryFilter, missingKeyBatchFilter, missingKeyKeyword])

  const professionalRows = useMemo(() => {
    return result ? buildProfessionalTemplateRows(result.planScoreRows) : []
  }, [result])

  const collegeRows = useMemo(() => {
    return result ? buildCollegeTemplateRows(result.planCollegeRows, result.yearValue) : []
  }, [result])

  const handleExportProfessional = async () => {
    if (!result) {
      message.warning('请先完成比对')
      return
    }

    try {
      const blob = await exportProfessionalCompareTemplate({
        rows: professionalRows,
        yearValue: result.yearValue,
      })
      downloadBlob(blob, '招生计划未匹配专业分模板.xlsx')
      message.success('专业分模板导出成功')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '专业分模板导出失败')
    }
  }

  const handleExportCollege = async () => {
    if (!result) {
      message.warning('请先完成比对')
      return
    }

    try {
      const blob = await exportCollegeCompareTemplate({
        rows: collegeRows,
        yearValue: result.yearValue,
      })
      downloadBlob(blob, '招生计划未匹配院校分模板.xlsx')
      message.success('院校分模板导出成功')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '院校分模板导出失败')
    }
  }

  const handleResetPage = () => {
    confirmToolReset({
      title: '确认重置招生计划数据比对？',
      onReset: () => {
        setPlanWorkbook(null)
        setScoreWorkbook(null)
        setCollegeWorkbook(null)
        cancelTask('process')
        setProcessing(false)
        setResult(null)
        resetFilters()
      },
    })
  }

  const planScoreColumns = [
    { title: '学校', dataIndex: 'school', key: 'school', width: 180 },
    { title: '省份', dataIndex: 'province', key: 'province', width: 100 },
    { title: '科类', dataIndex: 'category', key: 'category', width: 120 },
    { title: '批次', dataIndex: 'batch', key: 'batch', width: 140 },
    { title: '专业', dataIndex: 'major', key: 'major', width: 180 },
    { title: '层次', dataIndex: 'level', key: 'level', width: 140 },
    { title: '专业组代码', dataIndex: 'groupCode', key: 'groupCode', width: 140 },
    { title: '招生代码', dataIndex: 'enrollmentCode', key: 'enrollmentCode', width: 140 },
    { title: '专业代码', dataIndex: 'majorCode', key: 'majorCode', width: 140 },
    {
      title: '是否存在',
      dataIndex: 'exists',
      key: 'exists',
      width: 100,
      render: (value: boolean) => (value ? '是' : '否'),
    },
    {
      title: '差异原因',
      dataIndex: 'diffReasonTags',
      key: 'diffReasonTags',
      width: 300,
      render: (tags: string[]) => (
        <Space wrap size={[4, 4]}>
          {tags.map((tag) => (
            <Tag key={tag} color={getDiffTagColor(tag)}>{tag}</Tag>
          ))}
        </Space>
      ),
    },
    { title: '说明', dataIndex: 'reason', key: 'reason', width: 320 },
  ]

  const planCollegeColumns = [
    { title: '学校', dataIndex: 'school', key: 'school', width: 180 },
    { title: '省份', dataIndex: 'province', key: 'province', width: 100 },
    { title: '科类', dataIndex: 'category', key: 'category', width: 120 },
    { title: '批次', dataIndex: 'batch', key: 'batch', width: 140 },
    { title: '层次', dataIndex: 'level', key: 'level', width: 140 },
    { title: '专业组代码', dataIndex: 'groupCode', key: 'groupCode', width: 140 },
    { title: '招生代码', dataIndex: 'enrollmentCode', key: 'enrollmentCode', width: 140 },
    {
      title: '无招生代码',
      dataIndex: 'missingEnrollmentCodeFlag',
      key: 'missingEnrollmentCodeFlag',
      width: 120,
      render: (value: boolean) => (value ? '是' : '否'),
    },
    {
      title: '是否存在',
      dataIndex: 'exists',
      key: 'exists',
      width: 100,
      render: (value: boolean) => (value ? '是' : '否'),
    },
    {
      title: '差异原因',
      dataIndex: 'diffReasonTags',
      key: 'diffReasonTags',
      width: 260,
      render: (tags: string[]) => (
        <Space wrap size={[4, 4]}>
          {tags.map((tag) => (
            <Tag key={tag} color={tag === '已匹配' ? 'green' : 'orange'}>{tag}</Tag>
          ))}
        </Space>
      ),
    },
    { title: '说明', dataIndex: 'reason', key: 'reason', width: 280 },
  ]

  const missingKeyColumns = [
    { title: '省份', dataIndex: 'province', key: 'province', width: 100, fixed: 'left' as const },
    { title: '学校', dataIndex: 'school', key: 'school', width: 180, fixed: 'left' as const },
    { title: '科类', dataIndex: 'category', key: 'category', width: 120 },
    { title: '批次', dataIndex: 'batch', key: 'batch', width: 140 },
    { title: '专业', dataIndex: 'major', key: 'major', width: 220 },
    { title: '层次', dataIndex: 'level', key: 'level', width: 130 },
    { title: '专业组代码', dataIndex: 'groupCode', key: 'groupCode', width: 140 },
    { title: '招生代码', dataIndex: 'enrollmentCode', key: 'enrollmentCode', width: 140 },
    { title: '专业代码', dataIndex: 'majorCode', key: 'majorCode', width: 140 },
    {
      title: '招生计划条数',
      dataIndex: 'planCount',
      key: 'planCount',
      width: 130,
      sorter: (a: PlanScoreMissingKeyRow, b: PlanScoreMissingKeyRow) => a.planCount - b.planCount,
    },
    { title: '缺失组合键', dataIndex: 'missingKeyText', key: 'missingKeyText', width: 760 },
    { title: '说明', dataIndex: 'reason', key: 'reason', width: 360 },
  ]

  const differenceReasonColumns = [
    { title: '比对对象', dataIndex: 'target', key: 'target', width: 120 },
    { title: '差异原因', dataIndex: 'reason', key: 'reason', width: 260 },
    {
      title: '数量',
      dataIndex: 'count',
      key: 'count',
      width: 120,
      sorter: (a: DifferenceReasonSummaryItem, b: DifferenceReasonSummaryItem) => a.count - b.count,
    },
  ]

  const tableFontStyle = { fontSize: 15 }
  const cardTitleStyle = { fontSize: 18 }
  const paragraphStyle = { fontSize: 15, lineHeight: 1.8 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, fontSize: 15 }}>
      <Card title={<span style={cardTitleStyle}>招生计划数据比对与转换</span>} extra={<Button danger onClick={handleResetPage}>重置</Button>}>
        <Paragraph style={paragraphStyle}>
          已按规则文档更新：支持招生计划 vs 专业分、招生计划 vs 院校分两组比对；按文档指定组合键检查是否存在，并将招生计划中未匹配的数据导出为对应模板。专业组选科要求和新高考选科要求会先合并，`^` 符号会先去掉再参与匹配与导出。
        </Paragraph>
        <Paragraph style={{ ...paragraphStyle, marginBottom: 0 }}>
          新增“专业分缺失组合键”：当招生计划中的组合键在专业分文件中不存在时，会按省份标明缺失组合键，便于定位哪个省份缺失了哪个组合键。
        </Paragraph>

        <Space direction="vertical" style={{ width: '100%', marginTop: 16 }} size={16}>
          <Dragger beforeUpload={handleUploadPlan} showUploadList={false} accept=".xlsx,.xls">
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text" style={{ fontSize: 16 }}>上传招生计划文件</p>
          </Dragger>

          <Dragger beforeUpload={handleUploadScore} showUploadList={false} accept=".xlsx,.xls">
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text" style={{ fontSize: 16 }}>上传专业分文件</p>
          </Dragger>

          <Dragger beforeUpload={handleUploadCollege} showUploadList={false} accept=".xlsx,.xls">
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text" style={{ fontSize: 16 }}>上传院校分文件</p>
          </Dragger>

          <Space wrap>
            <Button type="primary" loading={processing} onClick={handleProcess}>
              开始比对
            </Button>
            <Button onClick={handleExportProfessional} disabled={!result}>
              导出未匹配专业分模板
            </Button>
            <Button onClick={handleExportCollege} disabled={!result}>
              导出未匹配院校分模板
            </Button>
          </Space>
        </Space>
      </Card>

      {result ? (
        <>
          <Space size={16} wrap>
            <Card>
              <Statistic title="招生计划总数" value={result.planScoreRows.length} />
            </Card>
            <Card>
              <Statistic
                title="招生计划 vs 专业分未匹配"
                value={result.planScoreRows.filter((item) => !item.exists).length}
              />
            </Card>
            <Card>
              <Statistic
                title="专业分缺失组合键"
                value={result.planScoreMissingKeyRows.length}
              />
            </Card>
            <Card>
              <Statistic
                title="招生计划 vs 院校分未匹配"
                value={result.planCollegeRows.filter((item) => !item.exists).length}
              />
            </Card>
            <Card>
              <Statistic
                title="院校分缺招生代码"
                value={result.planCollegeRows.filter((item) => item.missingEnrollmentCodeFlag).length}
              />
            </Card>
            {result.groupCodeWarnings.length > 0 ? (
              <Card style={{ minWidth: 420, maxWidth: 620 }}>
                <Alert
                  type="error"
                  showIcon
                  message="专业组代码缺失提醒"
                  description={
                    <div>
                      {result.groupCodeWarnings.map((item) => (
                        <div key={item.province}>{item.message}</div>
                      ))}
                    </div>
                  }
                />
              </Card>
            ) : null}
          </Space>

          {(result.missingPlanHeaders.length > 0 ||
            result.missingScoreHeaders.length > 0 ||
            result.missingCollegeHeaders.length > 0 ||
            result.enrollmentCodeWarnings.length > 0) && (
            <Card title={<span style={cardTitleStyle}>字段校验</span>}>
              <Space direction="vertical" style={{ width: '100%' }}>
                {result.missingPlanHeaders.length > 0 ? (
                  <Alert
                    type="warning"
                    showIcon
                    message={`招生计划文件缺少字段：${result.missingPlanHeaders.join('、')}`}
                  />
                ) : null}
                {result.missingScoreHeaders.length > 0 ? (
                  <Alert
                    type="warning"
                    showIcon
                    message={`专业分文件缺少字段：${result.missingScoreHeaders.join('、')}`}
                  />
                ) : null}
                {result.missingCollegeHeaders.length > 0 ? (
                  <Alert
                    type="warning"
                    showIcon
                    message={`院校分文件缺少字段：${result.missingCollegeHeaders.join('、')}`}
                  />
                ) : null}
                {result.enrollmentCodeWarnings.length > 0 ? (
                  <Alert
                    type="warning"
                    showIcon
                    message="招生代码缺失提醒"
                    description={
                      <div>
                        {result.enrollmentCodeWarnings.map((item) => (
                          <div key={item.province}>{item.message}</div>
                        ))}
                      </div>
                    }
                  />
                ) : null}
              </Space>
            </Card>
          )}

          <Card title={<span style={cardTitleStyle}>差异原因统计</span>}>
            {result.differenceReasonSummary.length ? (
              <Table<DifferenceReasonSummaryItem>
                rowKey={(row) => `${row.target}_${row.reason}`}
                size="small"
                columns={differenceReasonColumns}
                dataSource={result.differenceReasonSummary}
                pagination={false}
              />
            ) : (
              <Empty description="暂无差异原因统计" />
            )}
          </Card>

          <Card title={<span style={cardTitleStyle}>筛选</span>}>
            <Space wrap>
              <Select
                value={provinceFilter}
                onChange={setProvinceFilter}
                style={{ width: 180 }}
                options={provinceOptions.map((item) => ({ label: item, value: item }))}
              />
              <Select
                value={scoreFilter}
                onChange={(value) => setScoreFilter(value)}
                style={{ width: 180 }}
                options={[
                  { label: '专业分：全部', value: 'all' },
                  { label: '专业分：未匹配', value: 'unmatched' },
                  { label: '专业分：已匹配', value: 'matched' },
                ]}
              />
              <Select
                value={collegeFilter}
                onChange={(value) => setCollegeFilter(value)}
                style={{ width: 220 }}
                options={[
                  { label: '院校分：全部', value: 'all' },
                  { label: '院校分：未匹配', value: 'unmatched' },
                  { label: '院校分：已匹配', value: 'matched' },
                  { label: '院校分：无招生代码', value: 'missing_code' },
                ]}
              />
            </Space>
          </Card>

          <Card title={<span style={cardTitleStyle}>比对结果</span>}>
            <Tabs
              items={[
                {
                  key: 'plan-score',
                  label: `招生计划 vs 专业分（${filteredPlanScoreRows.length}）`,
                  children: filteredPlanScoreRows.length ? (
                    <Table<PlanScoreCompareRow>
                      rowKey={(row) => row.rowId}
                      dataSource={filteredPlanScoreRows}
                      columns={planScoreColumns}
                      scroll={{ x: 2000 }}
                      pagination={{ defaultPageSize: 10 }}
                      style={tableFontStyle}
                    />
                  ) : (
                    <Empty description="暂无数据" />
                  ),
                },
                {
                  key: 'missing-score-key',
                  label: `专业分缺失组合键（${filteredPlanScoreMissingKeyRows.length}）`,
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }} size={16}>
                      <Alert
                        type={result.planScoreMissingKeyRows.length ? 'warning' : 'success'}
                        showIcon
                        message={
                          result.planScoreMissingKeyRows.length
                            ? `发现 ${result.planScoreMissingKeyRows.length} 个专业分缺失组合键`
                            : '未发现专业分缺失组合键'
                        }
                        description="这里按组合键汇总展示：某个招生计划组合键在专业分文件中完全不存在时，会标明缺失省份和完整组合键。"
                      />

                      <Card size="small" title="专业分缺失组合键筛选" style={{ borderRadius: 10 }}>
                        <Space wrap>
                          <Select
                            value={missingKeyProvinceFilter}
                            onChange={setMissingKeyProvinceFilter}
                            style={{ width: 160 }}
                            options={missingKeyProvinceOptions.map((item) => ({ label: item, value: item }))}
                          />
                          <Select
                            value={missingKeyCategoryFilter}
                            onChange={setMissingKeyCategoryFilter}
                            style={{ width: 160 }}
                            options={missingKeyCategoryOptions.map((item) => ({ label: item, value: item }))}
                          />
                          <Select
                            value={missingKeyBatchFilter}
                            onChange={setMissingKeyBatchFilter}
                            style={{ width: 180 }}
                            options={missingKeyBatchOptions.map((item) => ({ label: item, value: item }))}
                          />
                          <Search
                            allowClear
                            placeholder="搜索学校、专业、专业组代码、招生代码、专业代码、组合键"
                            value={missingKeyKeyword}
                            onChange={(event) => setMissingKeyKeyword(event.target.value)}
                            style={{ width: 420 }}
                          />
                          <Button
                            onClick={() => {
                              setMissingKeyProvinceFilter('全部')
                              setMissingKeyCategoryFilter('全部')
                              setMissingKeyBatchFilter('全部')
                              setMissingKeyKeyword('')
                            }}
                          >
                            清空缺失组合键筛选
                          </Button>
                        </Space>
                      </Card>

                      {filteredPlanScoreMissingKeyRows.length ? (
                        <Table<PlanScoreMissingKeyRow>
                          rowKey={(row) => row.rowId}
                          dataSource={filteredPlanScoreMissingKeyRows}
                          columns={missingKeyColumns}
                          scroll={{ x: 2600 }}
                          pagination={{ defaultPageSize: 10, showSizeChanger: true }}
                          style={tableFontStyle}
                        />
                      ) : (
                        <Empty description="暂无专业分缺失组合键" />
                      )}
                    </Space>
                  ),
                },
                {
                  key: 'plan-college',
                  label: `招生计划 vs 院校分（${filteredPlanCollegeRows.length}）`,
                  children: filteredPlanCollegeRows.length ? (
                    <Table<PlanCollegeCompareRow>
                      rowKey={(row) => row.rowId}
                      dataSource={filteredPlanCollegeRows}
                      columns={planCollegeColumns}
                      scroll={{ x: 1900 }}
                      pagination={{ defaultPageSize: 10 }}
                      style={tableFontStyle}
                    />
                  ) : (
                    <Empty description="暂无数据" />
                  ),
                },
              ]}
            />
          </Card>

          <Card title={<span style={cardTitleStyle}>导出说明</span>}>
            <Paragraph style={paragraphStyle}>
              <Text strong style={{ fontSize: 15 }}>专业分模板导出：</Text>
              从“招生计划 vs 专业分”中提取未匹配记录，并按文档映射填入专业分模板；其中 `^` 会被去掉，`专科` 会转为 `专科(高职)`，首选科目、选科要求、次选科目按文档规则转换。
            </Paragraph>
            <Paragraph style={paragraphStyle}>
              <Text strong style={{ fontSize: 15 }}>专业分缺失组合键：</Text>
              单独展示招生计划中存在、专业分文件中不存在的组合键，并按省份、科类、批次和关键词筛选；该页用于定位缺失范围，不改变模板导出逻辑。
            </Paragraph>
            <Paragraph style={{ ...paragraphStyle, marginBottom: 0 }}>
              <Text strong style={{ fontSize: 15 }}>院校分模板导出：</Text>
              从“招生计划 vs 院校分”中提取未匹配记录，并按文档映射填入院校分模板；这里 `层次=专科` 也会写为 `专科(高职)`；若招生代码缺失，会在比对结果里标注重点检查。
            </Paragraph>
          </Card>
        </>
      ) : (
        <Card>
          <Empty description="上传文件并开始比对后，这里显示结果" />
        </Card>
      )}
    </div>
  )
}
