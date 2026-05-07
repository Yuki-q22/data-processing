/**
 * 文件名称：备注招生类型提取页面
 *
 * 文件作用：
 * - 控制“备注招生类型提取”工具页面
 * - 负责上传文件、选择备注字段、执行提取、展示结果、导出结果
 *
 * 常改位置：
 * - 文件上传
 * - 备注字段选择
 * - 提取按钮
 * - 结果表格
 * - 空备注行是否保留
 *
 * 注意：
 * - 页面显示和上传问题改本文件
 * - 具体提取规则改 src/modules/remarkTypeExtract.ts
 */

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
import { confirmToolReset } from '../../utils/toolReset'

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

function cellToText(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function getRows(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return []

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: true,
  })

  if (!matrix.length) return []

  const headerRow = matrix[0] || []
  const headers = headerRow.map((cell, index) => {
    const header = cellToText(cell)
    return header || `空字段${index + 1}`
  })

  const hasValue = (row: unknown[] | undefined) => {
    if (!row) return false
    return row.some((cell) => cellToText(cell) !== '')
  }

  let lastDataRowIndex = matrix.length - 1
  while (lastDataRowIndex > 0 && !hasValue(matrix[lastDataRowIndex])) {
    lastDataRowIndex -= 1
  }

  if (lastDataRowIndex <= 0) return []

  return matrix.slice(1, lastDataRowIndex + 1).map((row) => {
    const record: Record<string, unknown> = {}
    headers.forEach((header, index) => {
      record[header] = row?.[index] ?? ''
    })
    return record
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

  const handleResetPage = () => {
    confirmToolReset({
      title: '确认重置备注招生类型提取？',
      onReset: () => {
        setLoaded(null)
        setSheetName(undefined)
        setRemarkColumn(undefined)
        setProcessing(false)
        setResult(null)
      },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="备注招生类型提取" extra={<Button danger onClick={handleResetPage}>重置</Button>} style={{ borderRadius: 12 }}>
        <Paragraph>
  这个工具按规则中心里的“备注招生类型规则”和“需要核查关键词”处理备注列。若备注命中“需要核查关键词”，系统只标记需要核查，不再提取招生类型，避免把“不含、除外、没有、除”等否定语境误判为招生类型。
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