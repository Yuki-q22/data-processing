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
import * as XLSX from 'xlsx'
import {
  downloadBlob,
  exportNormalCollegeScoreWorkbook,
  processNormalCollegeScoreWorkbook,
  type NormalCollegeScoreProcessResult,
} from '../../modules/collegeScoreNormal'

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
  招生类型: string
  选测等级: string
  最高分: number | null
  最低分: number | null
  平均分: number | null
  最高位次: number | null
  最低位次: number | null
  平均位次: number | null
  录取人数: number | null
  招生人数: number | null
  数据来源: string
  省控线科类: string
  省控线批次: string
  省控线备注: string
  专业组代码: string
  首选科目: string
  院校招生代码: string
}

const TABLE_COLUMNS = [
  { title: '学校名称', dataIndex: '学校名称', key: '学校名称', width: 180 },
  { title: '省份', dataIndex: '省份', key: '省份', width: 100 },
  { title: '招生类别', dataIndex: '招生类别', key: '招生类别', width: 120 },
  { title: '招生批次', dataIndex: '招生批次', key: '招生批次', width: 140 },
  { title: '招生类型', dataIndex: '招生类型', key: '招生类型', width: 140 },
  { title: '最高分', dataIndex: '最高分', key: '最高分', width: 100 },
  { title: '最低分', dataIndex: '最低分', key: '最低分', width: 100 },
  { title: '平均分', dataIndex: '平均分', key: '平均分', width: 100 },
  { title: '最低位次', dataIndex: '最低位次', key: '最低位次', width: 120 },
  { title: '录取人数', dataIndex: '录取人数', key: '录取人数', width: 100 },
  { title: '招生人数', dataIndex: '招生人数', key: '招生人数', width: 100 },
  { title: '数据来源', dataIndex: '数据来源', key: '数据来源', width: 120 },
  { title: '专业组代码', dataIndex: '专业组代码', key: '专业组代码', width: 140 },
  { title: '首选科目', dataIndex: '首选科目', key: '首选科目', width: 100 },
  { title: '院校招生代码', dataIndex: '院校招生代码', key: '院校招生代码', width: 140 },
]

async function loadWorkbook(file: File): Promise<LoadedWorkbook> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  return {
    fileName: file.name,
    workbook,
    sheetNames: workbook.SheetNames,
  }
}

function buildRowKey(row: PreviewRow) {
  return [
    row.学校名称 || '',
    row.省份 || '',
    row.招生类别 || '',
    row.招生批次 || '',
    row.招生类型 || '',
    row.专业组代码 || '',
    row.院校招生代码 || '',
  ].join('__')
}

export default function CollegeScoreNormalTool() {
  const [loadedWorkbook, setLoadedWorkbook] = useState<LoadedWorkbook | null>(null)
  const [sheetName, setSheetName] = useState<string>()
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<NormalCollegeScoreProcessResult | null>(null)

  const previewRows = (result?.rows || []) as PreviewRow[]

  const handleUpload = async (file: File) => {
    try {
      const loaded = await loadWorkbook(file)
      setLoadedWorkbook(loaded)
      setSheetName(loaded.sheetNames[0])
      setResult(null)
      message.success(`已上传文件：${file.name}`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '文件上传失败')
    }
    return false
  }

  const handleProcess = async () => {
    if (!loadedWorkbook || !sheetName) {
      message.warning('请先上传文件')
      return
    }

    setProcessing(true)
    try {
      const processed = processNormalCollegeScoreWorkbook(loadedWorkbook.workbook, sheetName)
      setResult(processed)

      if (processed.missingColumns.length > 0) {
        message.warning(`缺少字段：${processed.missingColumns.join('、')}`)
      } else {
        message.success('院校分提取（普通类）处理完成')
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '处理失败')
    } finally {
      setProcessing(false)
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
      const blob = await exportNormalCollegeScoreWorkbook(result)
      downloadBlob(blob, '院校分提取结果_普通类.xlsx')
      message.success('导出成功')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导出失败')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="院校分提取（普通类）" style={{ borderRadius: 12 }}>
        <Paragraph>
          已按最新规则更新：从 B2 读取年份、从第 3 行读取正文、校验固定列、按分组规则取最低分代表行、组内取最高分最大值，并将招生人数和录取人数按组求和后导出。
        </Paragraph>

        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Dragger beforeUpload={handleUpload} showUploadList={false} accept=".xlsx,.xls">
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽上传普通类专业分模板</p>
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
      </Card>

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

          <Card title="字段检查" style={{ borderRadius: 12 }}>
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

          <Card title="处理结果预览" style={{ borderRadius: 12 }}>
            {previewRows.length > 0 ? (
              <Table<PreviewRow>
                rowKey={buildRowKey}
                dataSource={previewRows}
                columns={TABLE_COLUMNS}
                scroll={{ x: 2200 }}
                pagination={{ pageSize: 10 }}
              />
            ) : (
              <Empty description="没有可输出的数据" />
            )}
          </Card>
        </>
      ) : (
        <Card style={{ borderRadius: 12 }}>
          <Empty description="上传并处理后，这里显示提取结果预览" />
        </Card>
      )}
    </div>
  )
}