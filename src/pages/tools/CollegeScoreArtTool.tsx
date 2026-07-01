import { useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Empty,
  Select,
  Space,
  Statistic,
  Table,
  Typography,
  Upload,
  message,
} from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import type * as XLSX from 'xlsx'
import {
  downloadBlob,
  exportArtCollegeScoreWorkbook,
  processArtCollegeScoreRows,
  type ArtCollegeScoreProcessResult,
} from '../../modules/collegeScoreArt'
import { useRuleCenterStore } from '../../stores/ruleCenterStore'
import { confirmToolReset } from '../../utils/toolReset'
import { parseWorkbookInWorker, readSheetDataInWorker } from '../../utils/excelWorkerClient'
import { useLatestTaskGuard } from '../../hooks/useLatestTaskGuard'

const { Dragger } = Upload
const { Paragraph } = Typography

type LoadedWorkbook = {
  fileName: string
  workbook: XLSX.WorkBook
  sheetNames: string[]
}

type PreviewRow = {
  学校名称: string
  省份: string
  招生类别: string
  招生批次: string
  专业类别: string
  投档分: number | null
  位次: number | null
  招生代码: string
  专业组: string
  备注: string
  是否校考: string
  学校名称校验结果: string
  专业名称校验结果: string
}

const TABLE_COLUMNS = [
  { title: '学校名称', dataIndex: '学校名称', key: '学校名称', width: 180 },
  { title: '省份', dataIndex: '省份', key: '省份', width: 100 },
  { title: '招生类别', dataIndex: '招生类别', key: '招生类别', width: 120 },
  { title: '招生批次', dataIndex: '招生批次', key: '招生批次', width: 140 },
  { title: '专业类别', dataIndex: '专业类别', key: '专业类别', width: 120 },
  { title: '投档分', dataIndex: '投档分', key: '投档分', width: 100 },
  { title: '位次', dataIndex: '位次', key: '位次', width: 100 },
  { title: '招生代码', dataIndex: '招生代码', key: '招生代码', width: 140 },
  { title: '专业组', dataIndex: '专业组', key: '专业组', width: 140 },
  { title: '备注', dataIndex: '备注', key: '备注', width: 220 },
  { title: '是否校考', dataIndex: '是否校考', key: '是否校考', width: 100 },
  { title: '学校名称校验结果', dataIndex: '学校名称校验结果', key: '学校名称校验结果', width: 150 },
  { title: '专业名称校验结果', dataIndex: '专业名称校验结果', key: '专业名称校验结果', width: 150 },
]

async function loadWorkbook(file: File): Promise<LoadedWorkbook> {
  return parseWorkbookInWorker(file)
}

function buildRowKey(row: PreviewRow) {
  return [
    row.学校名称 || '',
    row.省份 || '',
    row.招生类别 || '',
    row.招生批次 || '',
    row.专业类别 || '',
    row.招生代码 || '',
    row.专业组 || '',
    row.备注 || '',
    row.是否校考 || '',
  ].join('__')
}

type CollegeScoreArtToolProps = {
  embedded?: boolean
}

export default function CollegeScoreArtTool({ embedded = false }: CollegeScoreArtToolProps = {}) {
  const validSchoolNames = useRuleCenterStore((state) => state.validSchoolNames)
  const validMajorCombos = useRuleCenterStore((state) => state.validMajorCombos)
  const { startTask, isLatestTask, cancelTask } = useLatestTaskGuard()

  const [loadedWorkbook, setLoadedWorkbook] = useState<LoadedWorkbook | null>(null)
  const [sheetName, setSheetName] = useState<string>()
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<ArtCollegeScoreProcessResult | null>(null)

  const previewRows = (result?.rows || []) as PreviewRow[]

  const handleUpload = async (file: File) => {
    const taskId = startTask('upload')
    try {
      const loaded = await loadWorkbook(file)
      if (!isLatestTask('upload', taskId)) return false
      setLoadedWorkbook(loaded)
      setSheetName(loaded.sheetNames[0])
      setResult(null)
      message.success(`已上传文件：${file.name}`)
    } catch (error) {
      if (!isLatestTask('upload', taskId)) return false
      message.error(error instanceof Error ? error.message : '文件上传失败')
    }
    return false
  }

  const handleProcess = async () => {
    if (!loadedWorkbook || !sheetName) {
      message.warning('请先上传文件')
      return
    }

    const taskId = startTask('process')
    setProcessing(true)
    try {
      const sheetData = await readSheetDataInWorker(loadedWorkbook.workbook, sheetName, {
        headerRowIndex: 2,
        range: 2,
        cellAddresses: ['B2'],
      })
      if (!isLatestTask('process', taskId)) return

      const processed = processArtCollegeScoreRows({
        rows: sheetData.rows,
        detectedHeaders: sheetData.headers,
        year: sheetData.cells.B2,
        ruleCenterOptions: {
          validSchoolNames,
          validMajorCombos,
        },
      })
      if (!isLatestTask('process', taskId)) return
      setResult(processed)

      if (processed.missingColumns.length > 0) {
        message.warning(`缺少字段：${processed.missingColumns.join('、')}`)
      } else {
        message.success('院校分提取（艺体类）处理完成')
      }
    } catch (error) {
      if (!isLatestTask('process', taskId)) return
      message.error(error instanceof Error ? error.message : '处理失败')
    } finally {
      if (isLatestTask('process', taskId)) {
        setProcessing(false)
      }
    }
  }

  const handleExport = async () => {
    if (!result) {
      message.warning('请先处理数据')
      return
    }

    if (result.missingColumns.length > 0) {
      message.warning('当前文件字段不完整，不能导出')
      return
    }

    try {
      const blob = await exportArtCollegeScoreWorkbook(result)
      downloadBlob(blob, '院校分提取结果_艺体类.xlsx')
      message.success('导出成功')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导出失败')
    }
  }

  const handleResetPage = () => {
    confirmToolReset({
      title: '确认重置院校分提取（艺体类）？',
      onReset: () => {
        setLoadedWorkbook(null)
        setSheetName(undefined)
        cancelTask('process')
        setProcessing(false)
        setResult(null)
      },
    })
  }

  const uploadPanel = (
    <>
      {embedded ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button danger onClick={handleResetPage}>重置</Button>
        </div>
      ) : null}

      <Paragraph>
        已按最新规则更新：从 B2 读取年份、从第 3 行读取正文、校验固定列、按分组规则取最低分代表行，并导出成院校分模板。
      </Paragraph>

      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Dragger beforeUpload={handleUpload} showUploadList={false} accept=".xlsx,.xls">
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽上传艺体类专业分模板</p>
          <p className="ant-upload-hint">默认按第 3 行表头读取，年份从 B2 读取</p>
        </Dragger>

        <Space wrap>
          {loadedWorkbook ? (
            <Select
              value={sheetName}
              onChange={setSheetName}
              style={{ width: 260 }}
              options={loadedWorkbook.sheetNames.map((name) => ({
                label: name,
                value: name,
              }))}
            />
          ) : null}

          <Button type="primary" loading={processing} onClick={handleProcess}>
            开始处理
          </Button>

          <Button
            onClick={handleExport}
            disabled={!result || result.missingColumns.length > 0}
          >
            导出结果
          </Button>
        </Space>
      </Space>
    </>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {embedded ? (
        uploadPanel
      ) : (
        <Card
          title="院校分提取（艺体类）"
          extra={<Button danger onClick={handleResetPage}>重置</Button>}
        >
          {uploadPanel}
        </Card>
      )}

      {result ? (
        <>
          <Space size={16}>
            <Card>
              <Statistic title="读取年份" value={result.year || '-'} />
            </Card>
            <Card>
              <Statistic title="原始记录数" value={result.inputRowCount} />
            </Card>
            <Card>
              <Statistic title="输出记录数" value={result.outputRowCount} />
            </Card>
          </Space>

          <Card title="字段检查">
            {result.missingColumns.length > 0 ? (
              <Alert
                type="warning"
                showIcon
                message="字段不完整"
                description={`缺少字段：${result.missingColumns.join('、')}`}
              />
            ) : (
              <Alert
                type="success"
                showIcon
                message="字段检查通过"
                description={`共识别 ${result.detectedHeaders.length} 个表头字段`}
              />
            )}
          </Card>

          <Card title="处理结果预览">
            {previewRows.length > 0 ? (
              <Table<PreviewRow>
                rowKey={buildRowKey}
                dataSource={previewRows}
                columns={TABLE_COLUMNS}
                scroll={{ x: 1800 }}
                pagination={{ defaultPageSize: 10 }}
              />
            ) : (
              <Empty description="没有可输出的数据" />
            )}
          </Card>
        </>
      ) : (
        <Card>
          <Empty description="上传并处理后，这里显示提取结果预览" />
        </Card>
      )}
    </div>
  )
}
