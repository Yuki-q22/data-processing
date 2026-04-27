import { useMemo, useState } from 'react'
import { Button, Card, Descriptions, Empty, Select, Space, Statistic, Table, Typography, Upload, message } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import { useRuleCenterStore } from '../../stores/ruleCenterStore'
import {
  processRemarkTypeExtract,
  exportRemarkTypeExtractWorkbook,
  type RemarkTypeExtractResult,
} from '../../modules/remarkTypeExtract'
import { downloadBlob } from '../../modules/xueyeqiao'

const { Dragger } = Upload
const { Paragraph } = Typography

type LoadedWorkbook = {
  fileName: string
  workbook: XLSX.WorkBook
  sheetNames: string[]
}

async function loadWorkbook(file: File): Promise<LoadedWorkbook> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  return { fileName: file.name, workbook, sheetNames: workbook.SheetNames }
}

function getRows(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  })
}

export default function RemarkTypeExtractTool() {
  const { remarkTypeRules, exclusionKeywords } = useRuleCenterStore()

  const [loaded, setLoaded] = useState<LoadedWorkbook | null>(null)
  const [sheetName, setSheetName] = useState<string>()
  const [remarkColumn, setRemarkColumn] = useState<string>()
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<RemarkTypeExtractResult | null>(null)

  const columnsInSheet = useMemo(() => {
    if (!loaded || !sheetName) return []
    const rows = getRows(loaded.workbook, sheetName)
    if (!rows.length) return []
    return Object.keys(rows[0])
  }, [loaded, sheetName])

  const handleUpload = async (file: File) => {
    try {
      const wb = await loadWorkbook(file)
      setLoaded(wb)
      setSheetName(wb.sheetNames[0])
      setRemarkColumn(undefined)
      setResult(null)
      message.success(`已加载文件：${file.name}`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '文件加载失败')
    }
    return false
  }

  const handleProcess = async () => {
    if (!loaded || !sheetName || !remarkColumn) {
      message.warning('请先上传文件并选择备注字段')
      return
    }

    setProcessing(true)
    try {
      const rows = getRows(loaded.workbook, sheetName)
      const processed = processRemarkTypeExtract({
        rows,
        remarkColumn,
        rules: remarkTypeRules,
        exclusionKeywords,
      })
      setResult(processed)
      message.success('备注招生类型提取完成')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '处理失败')
    } finally {
      setProcessing(false)
    }
  }

  const handleExport = async () => {
    if (!result || !loaded) return
    const blob = await exportRemarkTypeExtractWorkbook(result)
    downloadBlob(blob, loaded.fileName.replace(/\.xlsx$/i, '_备注提取结果.xlsx'))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="备注招生类型提取" style={{ borderRadius: 12 }}>
        <Paragraph>
          这个工具按规则中心里的“备注招生类型规则”和“需要核查关键词”处理备注列。原工具也是按关键词命中与优先级提取招生类型，并对包含“除了、不含、除外、没有、除”的记录标记需要核查。
        </Paragraph>

        <Dragger beforeUpload={handleUpload} showUploadList={false} accept=".xlsx,.xls">
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">上传需要提取备注招生类型的 Excel 文件</p>
        </Dragger>

        {loaded && (
          <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="文件名">{loaded.fileName}</Descriptions.Item>
              <Descriptions.Item label="规则条数">{remarkTypeRules.length}</Descriptions.Item>
            </Descriptions>

            <Space>
              <Select
                value={sheetName}
                onChange={setSheetName}
                style={{ width: 220 }}
                options={loaded.sheetNames.map((name) => ({ label: name, value: name }))}
              />
              <Select
                value={remarkColumn}
                onChange={setRemarkColumn}
                placeholder="选择备注列"
                style={{ width: 220 }}
                options={columnsInSheet.map((col) => ({ label: col, value: col }))}
              />
              <Button type="primary" loading={processing} onClick={handleProcess}>
                开始处理
              </Button>
              <Button onClick={handleExport} disabled={!result}>
                导出结果
              </Button>
            </Space>
          </Space>
        )}
      </Card>

      {result ? (
        <>
          <Space size={16}>
            <Card><Statistic title="总行数" value={result.summary.total} /></Card>
            <Card><Statistic title="提取成功" value={result.summary.extracted} /></Card>
            <Card><Statistic title="需要核查" value={result.summary.needReview} /></Card>
          </Space>

          <Card title="结果预览" style={{ borderRadius: 12 }}>
            <Table
              rowKey="rowId"
              dataSource={result.rows}
              pagination={{ pageSize: 10 }}
              scroll={{ x: 1000 }}
              columns={[
  { title: '行号', dataIndex: 'rowId', key: 'rowId', width: 80 },
  { title: '备注', dataIndex: '备注', key: '备注', width: 420 },
  { title: '招生类型', dataIndex: '招生类型', key: '招生类型', width: 180 },
  { title: '需要核查', dataIndex: '需要核查', key: '需要核查', width: 120 },
  {
    title: '命中核查关键词',
    dataIndex: '命中核查关键词',
    key: '命中核查关键词',
    width: 180,
  },
]}
            />
          </Card>
        </>
      ) : (
        <Card style={{ borderRadius: 12 }}>
          <Empty description="上传并处理后，这里显示备注招生类型提取结果" />
        </Card>
      )}
    </div>
  )
}