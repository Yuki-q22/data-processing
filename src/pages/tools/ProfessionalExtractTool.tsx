import { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Descriptions,
  Empty,
  Progress,
  Space,
  Statistic,
  Table,
  Typography,
  Upload,
  message,
} from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import {
  downloadProfessionalExtractResult,
  processProfessionalExtract,
  type ProfessionalExtractPreviewRow,
  type ProfessionalExtractResult,
} from '../../modules/professionalExtract'
import { useLatestTaskGuard } from '../../hooks/useLatestTaskGuard'
import { confirmToolReset } from '../../utils/toolReset'

const { Dragger } = Upload
const { Text } = Typography

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function isXlsxFile(file: File) {
  return /\.xlsx$/i.test(file.name)
}

const PREVIEW_COLUMNS = [
  { title: '行号', dataIndex: 'rowId', key: 'rowId', width: 90 },
  { title: '层次', dataIndex: 'level', key: 'level', width: 140 },
  { title: '专业备注', dataIndex: 'note', key: 'note', width: 420 },
  { title: '提取标准专业', dataIndex: 'extracted', key: 'extracted', width: 320 },
]

export default function ProfessionalExtractTool() {
  const { startTask, isLatestTask, cancelTask } = useLatestTaskGuard()
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [stdFile, setStdFile] = useState<File | null>(null)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('就绪')
  const [logs, setLogs] = useState<string[]>([])
  const [result, setResult] = useState<ProfessionalExtractResult | null>(null)

  const canProcess = Boolean(sourceFile && stdFile && !processing)

  const fileSummary = useMemo(
    () => [
      {
        label: '大类招生表',
        file: sourceFile,
      },
      {
        label: '标准专业表',
        file: stdFile,
      },
    ],
    [sourceFile, stdFile],
  )

  const handleSourceUpload = (file: File) => {
    if (!isXlsxFile(file)) {
      message.error('请选择 .xlsx 文件')
      return false
    }

    setSourceFile(file)
    setResult(null)
    setProgress(0)
    setStatus('就绪')
    message.success(`已选择大类招生表: ${file.name}`)
    return false
  }

  const handleStdUpload = (file: File) => {
    if (!isXlsxFile(file)) {
      message.error('请选择 .xlsx 文件')
      return false
    }

    setStdFile(file)
    setResult(null)
    setProgress(0)
    setStatus('就绪')
    message.success(`已选择标准专业表: ${file.name}`)
    return false
  }

  const handleProcess = async () => {
    if (!sourceFile) {
      message.warning('请选择有效的大类招生表文件')
      return
    }

    if (!stdFile) {
      message.warning('请选择有效的标准专业表文件')
      return
    }

    const taskId = startTask('professional-extract')
    setProcessing(true)
    setResult(null)
    setLogs([])
    setProgress(0)
    setStatus('正在准备...')

    try {
      const processed = await processProfessionalExtract({
        sourceFile,
        stdFile,
        onProgress: ({ progress: nextProgress, status: nextStatus, log }) => {
          if (!isLatestTask('professional-extract', taskId)) return
          setProgress(Math.round(nextProgress))
          setStatus(nextStatus)
          if (log) {
            setLogs((current) => [...current, log])
          }
        },
      })

      if (!isLatestTask('professional-extract', taskId)) return
      setResult(processed)
      setLogs(processed.logs)
      downloadProfessionalExtractResult(processed)
      message.success('专业提取完成')
    } catch (error) {
      if (!isLatestTask('professional-extract', taskId)) return
      const errorMessage = error instanceof Error ? error.message : '处理过程发生错误'
      setStatus(`错误: ${errorMessage}`)
      setLogs((current) => [...current, `错误: ${errorMessage}`])
      message.error(errorMessage)
    } finally {
      if (isLatestTask('professional-extract', taskId)) {
        setProcessing(false)
      }
    }
  }

  const handleExport = () => {
    if (!result) {
      message.warning('请先完成提取')
      return
    }
    downloadProfessionalExtractResult(result)
  }

  const handleReset = () => {
    confirmToolReset({
      title: '确认重置专业提取工具？',
      onReset: () => {
        cancelTask('professional-extract')
        setSourceFile(null)
        setStdFile(null)
        setProcessing(false)
        setProgress(0)
        setStatus('就绪')
        setLogs([])
        setResult(null)
      },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="专业提取工具" extra={<Button danger onClick={handleReset}>重置</Button>}>
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Dragger beforeUpload={handleSourceUpload} showUploadList={false} accept=".xlsx" multiple={false}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">大类招生表 (Excel)</p>
          </Dragger>

          <Dragger beforeUpload={handleStdUpload} showUploadList={false} accept=".xlsx" multiple={false}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">标准专业表 (Excel)</p>
          </Dragger>

          <Descriptions size="small" column={1}>
            {fileSummary.map((item) => (
              <Descriptions.Item key={item.label} label={item.label}>
                {item.file ? `${item.file.name} (${formatFileSize(item.file.size)})` : '-'}
              </Descriptions.Item>
            ))}
            <Descriptions.Item label="状态">{status}</Descriptions.Item>
          </Descriptions>

          <Progress percent={progress} status={processing ? 'active' : result ? 'success' : 'normal'} />

          <Space wrap>
            <Button type="primary" loading={processing} disabled={!canProcess} onClick={handleProcess}>
              开始提取
            </Button>
            <Button disabled={!result} onClick={handleExport}>
              导出结果
            </Button>
          </Space>
        </Space>
      </Card>

      {result ? (
        <>
          <Space size={16} wrap>
            <Card>
              <Statistic title="总行数" value={result.totalRows} />
            </Card>
            <Card>
              <Statistic title="标准专业层次" value={result.standardLevelCount} />
            </Card>
            <Card>
              <Statistic title="命中行数" value={result.matchedRows} />
            </Card>
          </Space>

          <Card title="结果预览">
            {result.previewRows.length > 0 ? (
              <Table<ProfessionalExtractPreviewRow>
                rowKey="rowId"
                dataSource={result.previewRows}
                columns={PREVIEW_COLUMNS}
                scroll={{ x: 1000 }}
                pagination={{ pageSize: 10 }}
              />
            ) : (
              <Empty description="没有提取到标准专业" />
            )}
          </Card>
        </>
      ) : (
        <Card>
          <Empty description="上传并提取后，这里显示提取结果" />
        </Card>
      )}

      {logs.length > 0 ? (
        <Card title="处理日志">
          <Space direction="vertical" style={{ width: '100%' }}>
            {logs.map((log, index) => (
              <Text key={`${log}-${index}`}>{log}</Text>
            ))}
          </Space>
        </Card>
      ) : null}
    </div>
  )
}
