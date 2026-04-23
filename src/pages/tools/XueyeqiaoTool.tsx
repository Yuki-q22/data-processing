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
  Typography,
  Upload,
  message,
} from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import { useRuleCenterStore } from '../../stores/ruleCenterStore'
import {
  downloadBlob,
  exportXueyeqiaoWorkbook,
  processXueyeqiaoData,
  type XueyeqiaoProcessResult,
} from '../../modules/xueyeqiao'

const { Dragger } = Upload
const { Paragraph } = Typography

type LoadedWorkbook = {
  fileName: string
  workbook: XLSX.WorkBook
  sheetNames: string[]
}

type PreviewRow = {
  rowId: string
  学校名称: string
  学校名称匹配: string
  数据是否有问题: string
  问题列表: string
  招生年份: string
  省份: string
  原始科类: string
  招生科类: string
  一级层次: string
  招生批次: string
  '招生类型（选填）': string
  招生专业: string
  专业代码: string
  招生代码: string
  专业组代码: string
  首选科目: string
  选科要求: string
  次选科目: string
  最高分: number | null
  最低分: number | null
  平均分: number | null
  '最低分位次（选填）': number | null
  '招生人数（选填）': number | null
  '录取人数（选填）': number | null
  原始报考要求: string
  原始备注: string
  修改后的备注: string
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

function readRows(workbook: XLSX.WorkBook, selectedSheetName: string) {
  const sheet = workbook.Sheets[selectedSheetName]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  })
}

function buildRowKey(row: PreviewRow) {
  return [
    row.rowId || '',
    row.学校名称 || '',
    row.省份 || '',
    row.招生年份 || '',
    row.招生科类 || '',
    row.招生批次 || '',
    row.招生代码 || '',
    row.专业组代码 || '',
    row.专业代码 || '',
  ].join('__')
}

const TABLE_COLUMNS = [
  { title: '学校名称', dataIndex: '学校名称', key: '学校名称', width: 180 },
  { title: '学校匹配', dataIndex: '学校名称匹配', key: '学校名称匹配', width: 120 },
  { title: '数据是否有问题', dataIndex: '数据是否有问题', key: '数据是否有问题', width: 130 },
  { title: '问题列表', dataIndex: '问题列表', key: '问题列表', width: 280 },
  { title: '招生年份', dataIndex: '招生年份', key: '招生年份', width: 100 },
  { title: '省份', dataIndex: '省份', key: '省份', width: 100 },
  { title: '原始科类', dataIndex: '原始科类', key: '原始科类', width: 120 },
  { title: '招生科类', dataIndex: '招生科类', key: '招生科类', width: 120 },
  { title: '一级层次', dataIndex: '一级层次', key: '一级层次', width: 120 },
  { title: '招生批次', dataIndex: '招生批次', key: '招生批次', width: 140 },
  { title: '招生类型', dataIndex: '招生类型（选填）', key: '招生类型（选填）', width: 140 },
  { title: '招生专业', dataIndex: '招生专业', key: '招生专业', width: 180 },
  { title: '专业代码', dataIndex: '专业代码', key: '专业代码', width: 140 },
  { title: '招生代码', dataIndex: '招生代码', key: '招生代码', width: 140 },
  { title: '专业组代码', dataIndex: '专业组代码', key: '专业组代码', width: 160 },
  { title: '首选科目', dataIndex: '首选科目', key: '首选科目', width: 100 },
  { title: '选科要求', dataIndex: '选科要求', key: '选科要求', width: 160 },
  { title: '次选科目', dataIndex: '次选科目', key: '次选科目', width: 120 },
  { title: '最高分', dataIndex: '最高分', key: '最高分', width: 100 },
  { title: '最低分', dataIndex: '最低分', key: '最低分', width: 100 },
  { title: '平均分', dataIndex: '平均分', key: '平均分', width: 100 },
  { title: '最低位次', dataIndex: '最低分位次（选填）', key: '最低分位次（选填）', width: 120 },
  { title: '招生人数', dataIndex: '招生人数（选填）', key: '招生人数（选填）', width: 100 },
  { title: '录取人数', dataIndex: '录取人数（选填）', key: '录取人数（选填）', width: 100 },
  { title: '原始报考要求', dataIndex: '原始报考要求', key: '原始报考要求', width: 180 },
  { title: '原始备注', dataIndex: '原始备注', key: '原始备注', width: 220 },
  { title: '修改后的备注', dataIndex: '修改后的备注', key: '修改后的备注', width: 220 },
]

export default function XueyeqiaoTool() {
  const { validSchoolNames } = useRuleCenterStore()

  const [loadedWorkbook, setLoadedWorkbook] = useState<LoadedWorkbook | null>(null)
  const [sheetName, setSheetName] = useState<string>()
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<XueyeqiaoProcessResult | null>(null)

  const previewRows = useMemo(() => {
    return (result?.previewRows || []) as PreviewRow[]
  }, [result])

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
      const rows = readRows(loadedWorkbook.workbook, sheetName)
      const processed = processXueyeqiaoData({
        rows,
        validSchoolNames,
      })
      setResult(processed)

      if (processed.missingColumns.length > 0) {
        message.warning(`缺少字段：${processed.missingColumns.join('、')}`)
      } else {
        message.success('学业桥专业分处理完成')
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
      const blob = await exportXueyeqiaoWorkbook({
        exportRows: result.exportRows,
        yearValue: result.yearValue,
      })
      downloadBlob(blob, '学业桥专业分处理结果.xlsx')
      message.success('导出成功')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导出失败')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="学业桥专业分处理" style={{ borderRadius: 12 }}>
        <Paragraph>
          已按规则文档更新：按第一行表头读取学业桥数据，校验字段、处理学校名称规则、按批次和学校名称推断一级层次、解析报考要求、生成专业组代码、处理备注，并导出成专业分模板。
        </Paragraph>

        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Dragger beforeUpload={handleUpload} showUploadList={false} accept=".xlsx,.xls">
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽上传学业桥 Excel 文件</p>
            <p className="ant-upload-hint">默认按第一行表头读取</p>
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
              <Statistic title="招生年份" value={result.yearValue || '-'} />
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
                scroll={{ x: 4000 }}
                pagination={{ pageSize: 10 }}
              />
            ) : (
              <Empty description="没有可输出的数据" />
            )}
          </Card>
        </>
      ) : (
        <Card style={{ borderRadius: 12 }}>
          <Empty description="上传并处理后，这里显示转换结果预览" />
        </Card>
      )}
    </div>
  )
}