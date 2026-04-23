import { useMemo, useState } from 'react'
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
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import {
  applyManualSelections,
  exportMatchedProfessionalTemplate,
  getManualRequiredRows,
  processGroupCodeMatch,
  type GroupCodeMatchRow,
} from '../../modules/groupCodeMatch'

const { Dragger } = Upload
const { Paragraph, Text } = Typography

type LoadedWorkbook = {
  fileName: string
  workbook: XLSX.WorkBook
  sheetNames: string[]
}

type ManualSelection = {
  candidateId?: string
  manualGroupCode?: string
  manualRequirementMode?: string
  manualSecondSubject?: string
}

async function loadWorkbook(file: File): Promise<LoadedWorkbook> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  return {
    fileName: file.name,
    workbook,
    sheetNames: workbook.SheetNames,
  }
}

function readImportRows(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    range: 2,
    raw: false,
    defval: '',
  })
}

function readPlanRows(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    range: 0,
    raw: false,
    defval: '',
  })
}

function getImportYear(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName]
  const cell = sheet?.B2
  if (!cell) return ''
  if ('w' in cell && cell.w) return String(cell.w).trim()
  return cell?.v ? String(cell.v).trim() : ''
}

function getStatusLabel(status: GroupCodeMatchRow['status']) {
  if (status === 'existing') return '原有代码'
  if (status === 'auto') return '自动匹配'
  if (status === 'manual_done') return '已手动补充'
  if (status === 'manual_required') return '待手动补充'
  return '未匹配到候选'
}

function getStatusColor(status: GroupCodeMatchRow['status']) {
  if (status === 'existing') return 'green'
  if (status === 'auto') return 'cyan'
  if (status === 'manual_done') return 'blue'
  if (status === 'manual_required') return 'gold'
  return 'red'
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function GroupCodeMatchTool() {
  const [importWorkbook, setImportWorkbook] = useState<LoadedWorkbook | null>(null)
  const [planWorkbook, setPlanWorkbook] = useState<LoadedWorkbook | null>(null)
  const [importSheetName, setImportSheetName] = useState<string>()
  const [planSheetName, setPlanSheetName] = useState<string>()
  const [yearValue, setYearValue] = useState('')
  const [processing, setProcessing] = useState(false)
  const [rows, setRows] = useState<GroupCodeMatchRow[]>([])
  const [manualSelections, setManualSelections] = useState<Record<string, ManualSelection>>({})

  const [provinceFilter, setProvinceFilter] = useState<string>('全部')
  const [manualOnly, setManualOnly] = useState(false)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeRowId, setActiveRowId] = useState<string | null>(null)
  const [candidateChoice, setCandidateChoice] = useState('')
  const [manualGroupCode, setManualGroupCode] = useState('')
  const [manualRequirementMode, setManualRequirementMode] = useState('')
  const [manualSecondSubject, setManualSecondSubject] = useState('')

  const resolvedRows = useMemo(() => applyManualSelections(rows, manualSelections), [rows, manualSelections])
  const manualRows = useMemo(() => getManualRequiredRows(resolvedRows), [resolvedRows])

  const provinceOptions = useMemo(() => {
    const values = Array.from(new Set(resolvedRows.map((item) => item.province).filter(Boolean))).sort()
    return ['全部', ...values]
  }, [resolvedRows])

  const filteredRows = useMemo(() => {
    return resolvedRows.filter((row) => {
      if (provinceFilter !== '全部' && row.province !== provinceFilter) {
        return false
      }
      if (manualOnly && !(row.status === 'manual_required' || row.status === 'no_candidate')) {
        return false
      }
      return true
    })
  }, [resolvedRows, provinceFilter, manualOnly])

  const visibleManualRows = useMemo(() => {
    return manualRows.filter((row) => {
      if (provinceFilter !== '全部' && row.province !== provinceFilter) {
        return false
      }
      return true
    })
  }, [manualRows, provinceFilter])

  const activeRow = useMemo(() => {
    return visibleManualRows.find((item) => item.rowId === activeRowId) || null
  }, [visibleManualRows, activeRowId])

  const activeRowPosition = useMemo(() => {
    return visibleManualRows.findIndex((item) => item.rowId === activeRowId)
  }, [visibleManualRows, activeRowId])

  const nextManualRow = activeRowPosition >= 0 ? visibleManualRows[activeRowPosition + 1] : null
  const prevManualRow = activeRowPosition > 0 ? visibleManualRows[activeRowPosition - 1] : null

  const handleUploadImport = async (file: File) => {
    try {
      const loaded = await loadWorkbook(file)
      setImportWorkbook(loaded)
      setImportSheetName(loaded.sheetNames[0])
      setYearValue(getImportYear(loaded.workbook, loaded.sheetNames[0]))
      setRows([])
      setManualSelections({})
      message.success(`已上传专业分模板：${file.name}`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '文件上传失败')
    }
    return false
  }

  const handleUploadPlan = async (file: File) => {
    try {
      const loaded = await loadWorkbook(file)
      setPlanWorkbook(loaded)
      setPlanSheetName(loaded.sheetNames[0])
      setRows([])
      setManualSelections({})
      message.success(`已上传招生计划模板：${file.name}`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '文件上传失败')
    }
    return false
  }

  const handleProcess = async () => {
    if (!importWorkbook || !planWorkbook || !importSheetName || !planSheetName) {
      message.warning('请先上传两份模板')
      return
    }

    setProcessing(true)
    try {
      const importRows = readImportRows(importWorkbook.workbook, importSheetName)
      const planRows = readPlanRows(planWorkbook.workbook, planSheetName)
      const currentYear = yearValue || getImportYear(importWorkbook.workbook, importSheetName)
      const result = processGroupCodeMatch({
        importRows,
        planRows,
        yearValue: currentYear,
      })
      setRows(result.rows)
      setManualSelections({})
      setProvinceFilter('全部')
      setManualOnly(false)
      message.success('专业组代码匹配完成')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '处理失败')
    } finally {
      setProcessing(false)
    }
  }

  const openManualDrawer = (row: GroupCodeMatchRow) => {
    setActiveRowId(row.rowId)
    const saved = manualSelections[row.rowId]
    setCandidateChoice(saved?.candidateId || '')
    setManualGroupCode(saved?.manualGroupCode || row.resolvedGroupCode || '')
    setManualRequirementMode(saved?.manualRequirementMode || row.resolvedRequirementMode || '')
    setManualSecondSubject(saved?.manualSecondSubject || row.resolvedSecondSubject || '')
    setDrawerOpen(true)
  }

  const saveManualSelection = () => {
    if (!activeRow) return

    const nextValue: ManualSelection = {}

    if (candidateChoice) {
      nextValue.candidateId = candidateChoice
    }

    nextValue.manualGroupCode = manualGroupCode
    nextValue.manualRequirementMode = manualRequirementMode
    nextValue.manualSecondSubject = manualSecondSubject

    setManualSelections((prev) => ({
      ...prev,
      [activeRow.rowId]: nextValue,
    }))

    message.success('当前补充内容已保存')
  }

  const saveAndNext = () => {
    saveManualSelection()
    if (nextManualRow) {
      openManualDrawer(nextManualRow)
    }
  }

  const handleExport = async () => {
    if (!resolvedRows.length) {
      message.warning('请先完成匹配')
      return
    }

    try {
      const blob = await exportMatchedProfessionalTemplate({
        rows: resolvedRows,
        yearValue,
      })
      downloadBlob(blob, '专业组代码匹配结果.xlsx')
      message.success('导出成功')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导出失败')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="专业组代码匹配" style={{ borderRadius: 12 }}>
        <Paragraph>
          已按最新规则更新：按“学校名称 + 省份 + 一级层次 + 招生科类 + 招生批次 + 招生专业”构造组合键进行匹配；任一文件存在重复项则进入手动补充；2025 年及以后仅对河北、辽宁、山东、浙江、重庆、贵州、青海这些新高考但无专业组代码的省份同步转换选科要求与次选科目。
        </Paragraph>

        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Dragger beforeUpload={handleUploadImport} showUploadList={false} accept=".xlsx,.xls">
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">上传专业分模板</p>
            <p className="ant-upload-hint">默认按第 3 行表头读取</p>
          </Dragger>

          <Dragger beforeUpload={handleUploadPlan} showUploadList={false} accept=".xlsx,.xls">
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">上传招生计划模板</p>
            <p className="ant-upload-hint">默认按第 1 行表头读取；会自动去掉专业组代码和选科字段中的 ^</p>
          </Dragger>

          <Space wrap>
            {importWorkbook ? (
              <Select
                value={importSheetName}
                onChange={(value) => {
                  setImportSheetName(value)
                  setYearValue(getImportYear(importWorkbook.workbook, value))
                }}
                style={{ width: 260 }}
                options={importWorkbook.sheetNames.map((name) => ({
                  label: `专业分：${name}`,
                  value: name,
                }))}
              />
            ) : null}

            {planWorkbook ? (
              <Select
                value={planSheetName}
                onChange={setPlanSheetName}
                style={{ width: 260 }}
                options={planWorkbook.sheetNames.map((name) => ({
                  label: `招生计划：${name}`,
                  value: name,
                }))}
              />
            ) : null}

            <Input
              value={yearValue}
              onChange={(event) => setYearValue(event.target.value)}
              placeholder="招生年"
              style={{ width: 160 }}
            />

            <Button type="primary" loading={processing} onClick={handleProcess}>
              开始匹配
            </Button>

            <Button onClick={handleExport} disabled={!resolvedRows.length}>
              导出结果
            </Button>
          </Space>
        </Space>
      </Card>

      {resolvedRows.length > 0 ? (
        <>
          <Space size={16} wrap>
            <Card>
              <Statistic title="总记录数" value={resolvedRows.length} />
            </Card>
            <Card>
              <Statistic title="自动匹配" value={resolvedRows.filter((item) => item.status === 'auto').length} />
            </Card>
            <Card>
              <Statistic title="原有代码" value={resolvedRows.filter((item) => item.status === 'existing').length} />
            </Card>
            <Card>
              <Statistic title="待手动补充" value={manualRows.length} />
            </Card>
            <Card>
              <Statistic title="已手动补充" value={resolvedRows.filter((item) => item.status === 'manual_done').length} />
            </Card>
          </Space>

          <Card title="筛选" style={{ borderRadius: 12 }}>
            <Space wrap>
              <Select
                value={provinceFilter}
                onChange={setProvinceFilter}
                style={{ width: 180 }}
                options={provinceOptions.map((item) => ({ label: item, value: item }))}
              />
              <Space>
                <Switch checked={manualOnly} onChange={setManualOnly} />
                <Text>仅看需要人工补充</Text>
              </Space>
            </Space>
          </Card>

          <Card title="匹配结果预览" style={{ borderRadius: 12 }}>
            <Table<GroupCodeMatchRow>
              rowKey={(row) => row.rowId}
              dataSource={filteredRows}
              scroll={{ x: 2800 }}
              pagination={{ pageSize: 10 }}
              columns={[
                { title: '学校名称', dataIndex: 'schoolName', key: 'schoolName', width: 180, fixed: 'left' },
                { title: '省份', dataIndex: 'province', key: 'province', width: 100, fixed: 'left' },
                { title: '一级层次', dataIndex: 'level1', key: 'level1', width: 120, fixed: 'left' },
                { title: '招生科类', dataIndex: 'subjectCategory', key: 'subjectCategory', width: 120 },
                { title: '招生批次', dataIndex: 'batch', key: 'batch', width: 140 },
                { title: '招生专业', dataIndex: 'majorName', key: 'majorName', width: 180 },
                { title: '专业备注', dataIndex: 'majorRemark', key: 'majorRemark', width: 180 },
                { title: '招生类型', dataIndex: 'enrollmentType', key: 'enrollmentType', width: 140 },
                { title: '原专业组代码', dataIndex: 'originalGroupCode', key: 'originalGroupCode', width: 150 },
                { title: '最终专业组代码', dataIndex: 'resolvedGroupCode', key: 'resolvedGroupCode', width: 160 },
                { title: '最终选科要求', dataIndex: 'resolvedRequirementMode', key: 'resolvedRequirementMode', width: 180 },
                { title: '最终次选科目', dataIndex: 'resolvedSecondSubject', key: 'resolvedSecondSubject', width: 140 },
                {
                  title: '状态',
                  dataIndex: 'status',
                  key: 'status',
                  width: 140,
                  render: (value: GroupCodeMatchRow['status']) => (
                    <Tag color={getStatusColor(value)}>{getStatusLabel(value)}</Tag>
                  ),
                },
                { title: '处理说明', dataIndex: 'reason', key: 'reason', width: 280 },
                {
                  title: '操作',
                  key: 'action',
                  width: 120,
                  fixed: 'right',
                  render: (_value: unknown, row: GroupCodeMatchRow) => {
                    if (row.status === 'manual_required' || row.status === 'no_candidate') {
                      return (
                        <Button size="small" onClick={() => openManualDrawer(row)}>
                          去补充
                        </Button>
                      )
                    }
                    return '-'
                  },
                },
              ]}
            />
          </Card>
        </>
      ) : (
        <Card style={{ borderRadius: 12 }}>
          <Empty description="上传并处理后，这里显示匹配结果" />
        </Card>
      )}

      <Drawer
        title="手动补充专业组代码"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={980}
      >
        {activeRow ? (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Card size="small" title="当前专业分记录">
              <Descriptions column={2} bordered size="small">
                <Descriptions.Item label="学校名称">{activeRow.schoolName || '-'}</Descriptions.Item>
                <Descriptions.Item label="省份">{activeRow.province || '-'}</Descriptions.Item>
                <Descriptions.Item label="一级层次">{activeRow.level1 || '-'}</Descriptions.Item>
                <Descriptions.Item label="招生科类">{activeRow.subjectCategory || '-'}</Descriptions.Item>
                <Descriptions.Item label="招生批次">{activeRow.batch || '-'}</Descriptions.Item>
                <Descriptions.Item label="招生专业">{activeRow.majorName || '-'}</Descriptions.Item>
                <Descriptions.Item label="专业备注（选填）">{activeRow.majorRemark || '-'}</Descriptions.Item>
                <Descriptions.Item label="招生类型（选填）">{activeRow.enrollmentType || '-'}</Descriptions.Item>
                <Descriptions.Item label="处理说明" span={2}>
                  {activeRow.reason || '无'}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card
              size="small"
              title={`候选招生计划记录（${activeRow.candidates.length} 条）`}
              extra={
                <Space>
                  <Button
                    size="small"
                    onClick={() => prevManualRow && openManualDrawer(prevManualRow)}
                    disabled={!prevManualRow}
                  >
                    上一条
                  </Button>
                  <Button
                    size="small"
                    onClick={() => nextManualRow && openManualDrawer(nextManualRow)}
                    disabled={!nextManualRow}
                  >
                    下一条
                  </Button>
                </Space>
              }
            >
              {activeRow.candidates.length > 0 ? (
                <Radio.Group
                  value={candidateChoice}
                  onChange={(event) => setCandidateChoice(event.target.value)}
                  style={{ width: '100%' }}
                >
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {activeRow.candidates.map((candidate) => (
                      <Card key={candidate.candidateId} size="small">
                        <Radio value={candidate.candidateId}>选择该招生计划记录</Radio>
                        <div style={{ marginTop: 10, marginLeft: 24, lineHeight: 1.8 }}>
                          <div>学校名称：{candidate.schoolName || '-'}</div>
                          <div>省份：{candidate.province || '-'}</div>
                          <div>一级层次：{candidate.level1 || '-'}</div>
                          <div>招生科类：{candidate.subjectCategory || '-'}</div>
                          <div>招生批次：{candidate.batch || '-'}</div>
                          <div>招生专业：{candidate.majorName || '-'}</div>
                          <div>专业备注（选填）：{candidate.majorRemark || '-'}</div>
                          <div>招生类型（选填）：{candidate.enrollmentType || '-'}</div>
                          <div>专业组代码：{candidate.groupCode || '-'}</div>
                          <div>原始选科要求：{candidate.electiveRaw || '-'}</div>
                          <div>转换后选科要求：{candidate.convertedRequirementMode || '-'}</div>
                          <div>转换后次选科目：{candidate.convertedSecondSubject || '-'}</div>
                        </div>
                      </Card>
                    ))}
                  </Space>
                </Radio.Group>
              ) : (
                <Empty description="当前没有候选招生计划记录，请手动补充" />
              )}
            </Card>

            <Card size="small" title="手动补充内容">
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                <Input
                  value={manualGroupCode}
                  onChange={(event) => setManualGroupCode(event.target.value)}
                  placeholder="手动输入专业组代码"
                />

                <Select
                  value={manualRequirementMode}
                  onChange={setManualRequirementMode}
                  placeholder="手动选择选科要求"
                  style={{ width: '100%' }}
                  options={[
                    { label: '不限科目专业组', value: '不限科目专业组' },
                    { label: '单科、多科均需选考', value: '单科、多科均需选考' },
                    { label: '多门选考', value: '多门选考' },
                  ]}
                  allowClear
                />

                <Input
                  value={manualSecondSubject}
                  onChange={(event) => setManualSecondSubject(event.target.value)}
                  placeholder="手动输入次选科目"
                />

                <Text type="secondary">
                  对于 2025 年及以后河北、辽宁、山东、浙江、重庆、贵州、青海这些新高考但无专业组代码的省份，可以只补充选科要求和次选科目。
                </Text>

                <Space>
                  <Button type="primary" onClick={saveManualSelection}>
                    保存当前
                  </Button>
                  <Button onClick={saveAndNext}>保存并下一条</Button>
                </Space>
              </Space>
            </Card>
          </Space>
        ) : (
          <Empty description="没有选中的待补充记录" />
        )}
      </Drawer>
    </div>
  )
}