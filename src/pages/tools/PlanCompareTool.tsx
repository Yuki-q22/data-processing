import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Empty,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Typography,
  Upload,
  message,
} from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import {
  buildCollegeTemplateRows,
  buildProfessionalTemplateRows,
  downloadBlob,
  exportCollegeCompareTemplate,
  exportProfessionalCompareTemplate,
  processPlanCompare,
  type PlanCollegeCompareRow,
  type PlanCompareResult,
  type PlanScoreCompareRow,
} from '../../modules/planCompare'

const { Dragger } = Upload
const { Paragraph, Text } = Typography

type LoadedWorkbook = {
  fileName: string
  workbook: XLSX.WorkBook
  sheetNames: string[]
}

type MatchFilter = 'all' | 'matched' | 'unmatched' | 'missing_code'

async function loadWorkbook(file: File): Promise<LoadedWorkbook> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  return {
    fileName: file.name,
    workbook,
    sheetNames: workbook.SheetNames,
  }
}

function readSheetRows(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: false,
    defval: '',
  })
}

function getFirstSheetName(loaded: LoadedWorkbook | null) {
  return loaded?.sheetNames?.[0] || ''
}

export default function PlanCompareTool() {
  const [planWorkbook, setPlanWorkbook] = useState<LoadedWorkbook | null>(null)
  const [scoreWorkbook, setScoreWorkbook] = useState<LoadedWorkbook | null>(null)
  const [collegeWorkbook, setCollegeWorkbook] = useState<LoadedWorkbook | null>(null)

  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<PlanCompareResult | null>(null)

  const [provinceFilter, setProvinceFilter] = useState<string>('全部')
  const [scoreFilter, setScoreFilter] = useState<MatchFilter>('all')
  const [collegeFilter, setCollegeFilter] = useState<MatchFilter>('all')

  const handleUploadPlan = async (file: File) => {
    try {
      const loaded = await loadWorkbook(file)
      setPlanWorkbook(loaded)
      setResult(null)
      message.success(`已上传招生计划文件：${file.name}`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '招生计划文件读取失败')
    }
    return false
  }

  const handleUploadScore = async (file: File) => {
    try {
      const loaded = await loadWorkbook(file)
      setScoreWorkbook(loaded)
      setResult(null)
      message.success(`已上传专业分文件：${file.name}`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '专业分文件读取失败')
    }
    return false
  }

  const handleUploadCollege = async (file: File) => {
    try {
      const loaded = await loadWorkbook(file)
      setCollegeWorkbook(loaded)
      setResult(null)
      message.success(`已上传院校分文件：${file.name}`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '院校分文件读取失败')
    }
    return false
  }

  const handleProcess = async () => {
    if (!planWorkbook) {
      message.warning('请先上传招生计划文件')
      return
    }

    setProcessing(true)
    try {
      const planRows = readSheetRows(planWorkbook.workbook, getFirstSheetName(planWorkbook))
      const scoreRows = scoreWorkbook
        ? readSheetRows(scoreWorkbook.workbook, getFirstSheetName(scoreWorkbook))
        : []
      const collegeRows = collegeWorkbook
        ? readSheetRows(collegeWorkbook.workbook, getFirstSheetName(collegeWorkbook))
        : []

      const firstPlanRow = planRows[0] || {}
      const yearValue = String(firstPlanRow['年份'] || '')

      const compareResult = processPlanCompare({
        planRows,
        scoreRows,
        collegeRows,
        yearValue,
      })

      setResult(compareResult)
      setProvinceFilter('全部')
      setScoreFilter('all')
      setCollegeFilter('all')
      message.success('招生计划数据比对完成')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '比对失败')
    } finally {
      setProcessing(false)
    }
  }

  const provinceOptions = useMemo(() => {
    if (!result) return ['全部']
    const all = [
      ...result.planScoreRows.map((item) => item.province),
      ...result.planCollegeRows.map((item) => item.province),
    ].filter(Boolean)
    return ['全部', ...Array.from(new Set(all)).sort()]
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

  const professionalRows = useMemo(() => {
    return result ? buildProfessionalTemplateRows(result.planScoreRows) : []
  }, [result])

  const collegeRows = useMemo(() => {
    return result ? buildCollegeTemplateRows(result.planCollegeRows) : []
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

  const planScoreColumns = [
    { title: '学校', dataIndex: 'school', key: 'school', width: 180 },
    { title: '省份', dataIndex: 'province', key: 'province', width: 100 },
    { title: '科类', dataIndex: 'category', key: 'category', width: 120 },
    { title: '批次', dataIndex: 'batch', key: 'batch', width: 140 },
    { title: '专业', dataIndex: 'major', key: 'major', width: 180 },
    { title: '层次', dataIndex: 'level', key: 'level', width: 140 },
    { title: '专业组代码', dataIndex: 'groupCode', key: 'groupCode', width: 140 },
    { title: '招生代码', dataIndex: 'enrollmentCode', key: 'enrollmentCode', width: 140 },
    {
      title: '是否存在',
      dataIndex: 'exists',
      key: 'exists',
      width: 100,
      render: (value: boolean) => (value ? '是' : '否'),
    },
    { title: '说明', dataIndex: 'reason', key: 'reason', width: 260 },
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
    { title: '说明', dataIndex: 'reason', key: 'reason', width: 280 },
  ]

  const tableFontStyle = { fontSize: 15 }
  const cardTitleStyle = { fontSize: 18 }
  const paragraphStyle = { fontSize: 15, lineHeight: 1.8 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 15 }}>
      <Card title={<span style={cardTitleStyle}>招生计划数据比对与转换</span>} style={{ borderRadius: 12 }}>
        <Paragraph style={paragraphStyle}>
          已按规则文档更新：支持招生计划 vs 专业分、招生计划 vs 院校分两组比对；按文档指定组合键检查是否存在，并将招生计划中未匹配的数据导出为对应模板。专业组选科要求和新高考选科要求会先合并，`^` 符号会先去掉再参与匹配与导出。
        </Paragraph>

        <Space direction="vertical" style={{ width: '100%' }} size={16}>
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
          </Space>

          {(result.missingPlanHeaders.length > 0 ||
            result.missingScoreHeaders.length > 0 ||
            result.missingCollegeHeaders.length > 0) && (
            <Card title={<span style={cardTitleStyle}>字段校验</span>} style={{ borderRadius: 12 }}>
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
              </Space>
            </Card>
          )}

          <Card title={<span style={cardTitleStyle}>筛选</span>} style={{ borderRadius: 12 }}>
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

          <Card title={<span style={cardTitleStyle}>比对结果</span>} style={{ borderRadius: 12 }}>
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
                      scroll={{ x: 1800 }}
                      pagination={{ pageSize: 10 }}
                      style={tableFontStyle}
                    />
                  ) : (
                    <Empty description="暂无数据" />
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
                      pagination={{ pageSize: 10 }}
                      style={tableFontStyle}
                    />
                  ) : (
                    <Empty description="暂无数据" />
                  ),
                },
              ]}
            />
          </Card>

          <Card title={<span style={cardTitleStyle}>导出说明</span>} style={{ borderRadius: 12 }}>
            <Paragraph style={paragraphStyle}>
              <Text strong style={{ fontSize: 15 }}>专业分模板导出：</Text>
              从“招生计划 vs 专业分”中提取未匹配记录，并按文档映射填入专业分模板；其中 `^` 会被去掉，`专科` 会转为 `专科(高职)`，首选科目、选科要求、次选科目按文档规则转换。
            </Paragraph>
            <Paragraph style={{ ...paragraphStyle, marginBottom: 0 }}>
              <Text strong style={{ fontSize: 15 }}>院校分模板导出：</Text>
              从“招生计划 vs 院校分”中提取未匹配记录，并按文档映射填入院校分模板；这里 `层次=专科` 也会写为 `专科(高职)`；若招生代码缺失，会在比对结果里标注重点检查。
            </Paragraph>
          </Card>
        </>
      ) : (
        <Card style={{ borderRadius: 12 }}>
          <Empty description="上传文件并开始比对后，这里显示结果" />
        </Card>
      )}
    </div>
  )
}