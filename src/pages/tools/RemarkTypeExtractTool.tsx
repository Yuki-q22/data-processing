/**
 * 文件名称：备注处理页面
 *
 * 文件作用：
 * - 在同一个独立工具中提供两个备注相关功能：
 *   1. 备注招生类型提取
 *   2. 备注处理
 * - 负责上传文件、选择 Sheet、选择备注字段、执行处理、展示结果、导出结果
 *
 * 常改位置：
 * - 文件上传
 * - 备注字段选择
 * - 提取 / 处理按钮
 * - 结果表格
 * - 空备注行是否保留
 *
 * 注意：
 * - 页面显示和上传问题改本文件
 * - 备注招生类型提取规则改 src/modules/remarkTypeExtract.ts
 * - 备注处理逻辑复用 src/modules/xueyeqiao.ts 中的 fixRemark
 */

import { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Descriptions,
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
import { useRuleCenterStore } from '../../stores/ruleCenterStore'
import {
  processRemarkTypeExtract,
  exportRemarkTypeExtractWorkbook,
  type RemarkTypeExtractResult,
} from '../../modules/remarkTypeExtract'
import { downloadBlob, fixRemark } from '../../modules/xueyeqiao'
import { confirmToolReset } from '../../utils/toolReset'
import { parseWorkbookInWorker } from '../../utils/excelWorkerClient'
import { useLatestTaskGuard } from '../../hooks/useLatestTaskGuard'

const { Dragger } = Upload
const { Paragraph, Text } = Typography

type LoadedWorkbook = {
  fileName: string
  workbook: XLSX.WorkBook
  sheetNames: string[]
}

type RemarkPreviewRow = {
  rowId: string
  原始备注: string
  修改后的备注: string
  处理结果: string
}

type RemarkProcessResult = {
  inputRowCount: number
  outputRowCount: number
  detectedHeaders: string[]
  remarkField: string
  previewRows: RemarkPreviewRow[]
  exportRows: Record<string, unknown>[]
}

async function loadWorkbook(file: File): Promise<LoadedWorkbook> {
  return parseWorkbookInWorker(file)
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

function getDefaultRemarkField(headers: string[]) {
  return (
    headers.find((header) => header === '专业备注') ||
    headers.find((header) => header === '备注') ||
    headers.find((header) => header.includes('备注')) ||
    headers[0]
  )
}

function buildRemarkRows(rows: Record<string, unknown>[], remarkField: string): RemarkProcessResult {
  const detectedHeaders = rows.length ? Object.keys(rows[0]) : []
  const exportRows: Record<string, unknown>[] = []
  const previewRows = rows.map((row, rowIndex) => {
    const rawRemark = String(row[remarkField] ?? '').trim()
    const fixed = fixRemark(rawRemark)
    const issueText = fixed.issues.join('；')

    exportRows.push({
      ...row,
      修改后的备注: fixed.fixedText,
      备注处理结果: issueText,
    })

    return {
      rowId: String(rowIndex + 1),
      原始备注: rawRemark,
      修改后的备注: fixed.fixedText,
      处理结果: issueText,
    }
  })

  return {
    inputRowCount: rows.length,
    outputRowCount: previewRows.length,
    detectedHeaders,
    remarkField,
    previewRows,
    exportRows,
  }
}

function exportRemarkCleanWorkbook(result: RemarkProcessResult, fileName: string) {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.json_to_sheet(result.exportRows)
  XLSX.utils.book_append_sheet(workbook, worksheet, '备注处理结果')
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const stem = fileName.replace(/\.(xlsx|xls)$/i, '') || '备注处理结果'
  downloadBlob(blob, `${stem}_备注处理结果.xlsx`)
}

const REMARK_TYPE_TABLE_COLUMNS = [
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
]

const REMARK_CLEAN_TABLE_COLUMNS = [
  { title: '行号', dataIndex: 'rowId', key: 'rowId', width: 80 },
  { title: '原始备注', dataIndex: '原始备注', key: '原始备注', width: 360 },
  { title: '修改后的备注', dataIndex: '修改后的备注', key: '修改后的备注', width: 360 },
  { title: '处理结果', dataIndex: '处理结果', key: '处理结果', width: 280 },
]

function RemarkTypeExtractPanel() {
  const remarkTypeRules = useRuleCenterStore((state) => state.remarkTypeRules)
  const exclusionKeywords = useRuleCenterStore((state) => state.exclusionKeywords)
  const { startTask, isLatestTask, cancelTask } = useLatestTaskGuard()

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
    const taskId = startTask('upload')
    try {
      const wb = await loadWorkbook(file)
      if (!isLatestTask('upload', taskId)) return false
      const firstSheet = wb.sheetNames[0]
      const rows = firstSheet ? getRows(wb.workbook, firstSheet) : []
      const headers = rows.length ? Object.keys(rows[0]) : []

      setLoaded(wb)
      setSheetName(firstSheet)
      setRemarkColumn(getDefaultRemarkField(headers))
      setResult(null)
      message.success(`已加载文件：${file.name}`)
    } catch (error) {
      if (!isLatestTask('upload', taskId)) return false
      message.error(error instanceof Error ? error.message : '文件加载失败')
    }
    return false
  }

  const handleSheetChange = (nextSheetName: string) => {
    if (!loaded) return
    const rows = getRows(loaded.workbook, nextSheetName)
    const headers = rows.length ? Object.keys(rows[0]) : []

    setSheetName(nextSheetName)
    setRemarkColumn(getDefaultRemarkField(headers))
    setResult(null)
  }

  const handleProcess = async () => {
    if (!loaded || !sheetName || !remarkColumn) {
      message.warning('请先上传文件并选择备注字段')
      return
    }

    const taskId = startTask('process')
    setProcessing(true)
    try {
      const rows = getRows(loaded.workbook, sheetName)
      const processed = processRemarkTypeExtract({
        rows,
        remarkColumn,
        rules: remarkTypeRules,
        exclusionKeywords,
      })
      if (!isLatestTask('process', taskId)) return
      setResult(processed)
      message.success('备注招生类型提取完成')
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
    if (!result || !loaded) return
    const blob = await exportRemarkTypeExtractWorkbook(result)
    const stem = loaded.fileName.replace(/\.(xlsx|xls)$/i, '') || '备注招生类型提取结果'
    downloadBlob(blob, `${stem}_备注招生类型提取结果.xlsx`)
  }

  const handleResetPage = () => {
    confirmToolReset({
      title: '确认重置备注招生类型提取？',
      onReset: () => {
        setLoaded(null)
        setSheetName(undefined)
        setRemarkColumn(undefined)
        cancelTask('process')
        setProcessing(false)
        setResult(null)
      },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="备注招生类型提取" extra={<Button danger onClick={handleResetPage}>重置</Button>}>
        <Paragraph>
          这个功能按规则中心里的“备注招生类型规则”和“需要核查关键词”处理备注列。若备注命中“需要核查关键词”，系统只标记需要核查，不再提取招生类型，避免把“不含、除外、没有、除”等否定语境误判为招生类型。
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

            <Space wrap>
              <Select
                value={sheetName}
                onChange={handleSheetChange}
                style={{ width: 220 }}
                options={loaded.sheetNames.map((name) => ({ label: name, value: name }))}
              />
              <Select
                value={remarkColumn}
                onChange={setRemarkColumn}
                placeholder="选择备注列"
                style={{ width: 220 }}
                options={columnsInSheet.map((col) => ({ label: col, value: col }))}
                showSearch
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
          <Space size={16} wrap>
            <Card><Statistic title="总行数" value={result.summary.total} /></Card>
            <Card><Statistic title="提取成功" value={result.summary.extracted} /></Card>
            <Card><Statistic title="需要核查" value={result.summary.needReview} /></Card>
          </Space>

          <Card title="结果预览">
            <Table
              rowKey="rowId"
              dataSource={result.rows}
              pagination={{ pageSize: 10 }}
              scroll={{ x: 1000 }}
              columns={REMARK_TYPE_TABLE_COLUMNS}
            />
          </Card>
        </>
      ) : (
        <Card>
          <Empty description="上传并处理后，这里显示备注招生类型提取结果" />
        </Card>
      )}
    </div>
  )
}

function RemarkCleanPanel() {
  const { startTask, isLatestTask, cancelTask } = useLatestTaskGuard()
  const [loadedWorkbook, setLoadedWorkbook] = useState<LoadedWorkbook | null>(null)
  const [sheetName, setSheetName] = useState<string>()
  const [remarkField, setRemarkField] = useState<string>()
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<RemarkProcessResult | null>(null)

  const rowsForFieldOptions = useMemo(() => {
    if (!loadedWorkbook || !sheetName) return []
    return getRows(loadedWorkbook.workbook, sheetName)
  }, [loadedWorkbook, sheetName])

  const fieldOptions = useMemo(() => {
    const headers = rowsForFieldOptions.length ? Object.keys(rowsForFieldOptions[0]) : []
    return headers.map((header) => ({ label: header, value: header }))
  }, [rowsForFieldOptions])

  const handleUpload = async (file: File) => {
    const taskId = startTask('upload')
    try {
      const loaded = await loadWorkbook(file)
      if (!isLatestTask('upload', taskId)) return false
      const firstSheet = loaded.sheetNames[0]
      const rows = firstSheet ? getRows(loaded.workbook, firstSheet) : []
      const headers = rows.length ? Object.keys(rows[0]) : []
      const autoRemarkField = getDefaultRemarkField(headers)

      setLoadedWorkbook(loaded)
      setSheetName(firstSheet)
      setRemarkField(autoRemarkField)
      setResult(null)
      message.success(`已上传文件：${file.name}`)
    } catch (error) {
      if (!isLatestTask('upload', taskId)) return false
      message.error(error instanceof Error ? error.message : '文件上传失败')
    }
    return false
  }

  const handleSheetChange = (nextSheetName: string) => {
    if (!loadedWorkbook) return
    const rows = getRows(loadedWorkbook.workbook, nextSheetName)
    const headers = rows.length ? Object.keys(rows[0]) : []
    const autoRemarkField = getDefaultRemarkField(headers)

    setSheetName(nextSheetName)
    setRemarkField(autoRemarkField)
    setResult(null)
  }

  const handleProcess = async () => {
    if (!loadedWorkbook || !sheetName) {
      message.warning('请先上传文件')
      return
    }

    if (!remarkField) {
      message.warning('请选择备注字段')
      return
    }

    const taskId = startTask('process')
    setProcessing(true)
    try {
      const rows = getRows(loadedWorkbook.workbook, sheetName)
      const processed = buildRemarkRows(rows, remarkField)
      if (!isLatestTask('process', taskId)) return
      setResult(processed)
      message.success('备注处理完成')
    } catch (error) {
      if (!isLatestTask('process', taskId)) return
      message.error(error instanceof Error ? error.message : '处理失败')
    } finally {
      if (isLatestTask('process', taskId)) {
        setProcessing(false)
      }
    }
  }

  const handleExport = () => {
    if (!result || !loadedWorkbook) {
      message.warning('请先处理数据')
      return
    }

    try {
      exportRemarkCleanWorkbook(result, loadedWorkbook.fileName)
      message.success('导出成功')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导出失败')
    }
  }

  const handleResetPage = () => {
    confirmToolReset({
      title: '确认重置备注处理？',
      onReset: () => {
        setLoadedWorkbook(null)
        setSheetName(undefined)
        setRemarkField(undefined)
        cancelTask('process')
        setProcessing(false)
        setResult(null)
      },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="备注处理" extra={<Button danger onClick={handleResetPage}>重置</Button>}>
        <Paragraph>
          单独复用学业桥专业分中的备注处理逻辑，对所选备注字段进行括号修复、错字修正、空括号删除、重复括号内容去重、标点压缩等处理。
        </Paragraph>
        <Paragraph type="secondary">
          导出时保留原始表格字段，并新增 <Text code>修改后的备注</Text>、<Text code>备注处理结果</Text> 两列。
        </Paragraph>

        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Dragger beforeUpload={handleUpload} showUploadList={false} accept=".xlsx,.xls">
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽上传需要处理备注的 Excel 文件</p>
            <p className="ant-upload-hint">可选择任意包含备注字段的 Sheet</p>
          </Dragger>

          <Space wrap>
            {loadedWorkbook ? (
              <Select
                value={sheetName}
                onChange={handleSheetChange}
                style={{ width: 260 }}
                options={loadedWorkbook.sheetNames.map((name) => ({ label: name, value: name }))}
              />
            ) : null}

            {fieldOptions.length > 0 ? (
              <Select
                value={remarkField}
                onChange={setRemarkField}
                style={{ width: 260 }}
                placeholder="选择备注字段"
                options={fieldOptions}
                showSearch
              />
            ) : null}

            <Button type="primary" loading={processing} onClick={handleProcess}>
              开始处理备注
            </Button>

            <Button onClick={handleExport} disabled={!result}>
              导出备注处理结果
            </Button>
          </Space>
        </Space>
      </Card>

      {result ? (
        <>
          <Space size={16} wrap>
            <Card>
              <Statistic title="原始记录数" value={result.inputRowCount} />
            </Card>
            <Card>
              <Statistic title="输出记录数" value={result.outputRowCount} />
            </Card>
            <Card>
              <Statistic title="备注字段" value={result.remarkField} />
            </Card>
          </Space>

          <Card title="字段检查">
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="识别字段数">{result.detectedHeaders.length}</Descriptions.Item>
              <Descriptions.Item label="当前备注字段">{result.remarkField}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="备注处理预览">
            {result.previewRows.length > 0 ? (
              <Table<RemarkPreviewRow>
                rowKey="rowId"
                dataSource={result.previewRows}
                columns={REMARK_CLEAN_TABLE_COLUMNS}
                scroll={{ x: 1100 }}
                pagination={{ pageSize: 10 }}
              />
            ) : (
              <Empty description="没有可输出的数据" />
            )}
          </Card>
        </>
      ) : (
        <Card>
          <Empty description="上传并处理后，这里显示备注处理结果预览" />
        </Card>
      )}
    </div>
  )
}

export default function RemarkTypeExtractTool() {
  return (
    <Tabs
      destroyOnHidden
      items={[
        {
          key: 'remark-type-extract',
          label: '备注招生类型提取',
          children: <RemarkTypeExtractPanel />,
        },
        {
          key: 'remark-clean',
          label: '备注处理',
          children: <RemarkCleanPanel />,
        },
      ]}
    />
  )
}
