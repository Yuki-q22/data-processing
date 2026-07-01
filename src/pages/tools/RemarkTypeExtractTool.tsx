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
import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import { useRuleCenterStore } from '../../stores/ruleCenterStore'
import {
  processRemarkTypeExtract,
  exportRemarkTypeExtractWorkbook,
  type RemarkTypeExtractResult,
} from '../../modules/remarkTypeExtract'
import {
  findRemarkColumn,
  isEmptyRemark,
  processRemark,
  REMARK_COLUMN_NAMES,
} from '../../modules/remarkCheck'
import { downloadBlob } from '../../modules/xueyeqiao'
import { confirmToolReset } from '../../utils/toolReset'
import { parseWorkbookInWorker } from '../../utils/excelWorkerClient'
import { useLatestTaskGuard } from '../../hooks/useLatestTaskGuard'

const { Dragger } = Upload
const { Paragraph, Text } = Typography

type LoadedWorkbook = {
  fileName: string
  sourceFile: File
  workbook: XLSX.WorkBook
  sheetNames: string[]
}

type RemarkPreviewRow = {
  rowId: string
  原始备注: string
  备注问题标注: string
  修改后备注: string
}

type RemarkProcessResult = {
  totalRows: number
  remarkRows: number
  issueRows: number
  fixedRows: number
  detectedHeaders: string[]
  remarkField: string
  previewRows: RemarkPreviewRow[]
  rowResults: Array<{ issues: string; fixed: string }>
}

async function loadWorkbook(file: File): Promise<LoadedWorkbook> {
  const parsed = await parseWorkbookInWorker(file)
  return { ...parsed, sourceFile: file }
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
  return findRemarkColumn(headers)
}

function buildRemarkRows(rows: Record<string, unknown>[], remarkField: string): RemarkProcessResult {
  const detectedHeaders = rows.length ? Object.keys(rows[0]) : []
  const rowResults: Array<{ issues: string; fixed: string }> = []
  let remarkRows = 0
  let issueRows = 0
  let fixedRows = 0
  const previewRows = rows.map((row, rowIndex) => {
    const rawValue = row[remarkField]
    const rawRemark = rawValue === null || rawValue === undefined ? '' : String(rawValue)
    const checked = processRemark(rawValue)
    rowResults.push({ issues: checked.issues, fixed: checked.fixed })
    if (!isEmptyRemark(rawValue)) remarkRows += 1
    if (checked.issues) issueRows += 1
    if (checked.fixed) fixedRows += 1

    return {
      rowId: String(rowIndex + 1),
      原始备注: rawRemark,
      备注问题标注: checked.issues,
      修改后备注: checked.fixed,
    }
  })

  return {
    totalRows: rows.length,
    remarkRows,
    issueRows,
    fixedRows,
    detectedHeaders,
    remarkField,
    previewRows,
    rowResults,
  }
}

async function exportRemarkCleanWorkbook(
  result: RemarkProcessResult,
  loaded: LoadedWorkbook,
  sheetName: string,
) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await loaded.sourceFile.arrayBuffer())
  const worksheet = workbook.getWorksheet(sheetName)
  if (!worksheet) throw new Error(`未找到工作表：${sheetName}`)

  const issueColumnNumber = worksheet.columnCount + 1
  const fixedColumnNumber = issueColumnNumber + 1
  const headerRow = worksheet.getRow(1)
  const issueHeader = headerRow.getCell(issueColumnNumber)
  const fixedHeader = headerRow.getCell(fixedColumnNumber)
  issueHeader.value = '备注问题标注'
  fixedHeader.value = '修改后备注'
  issueHeader.font = { ...issueHeader.font, bold: true }
  fixedHeader.font = { ...fixedHeader.font, bold: true }
  issueHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2F0D9' } }
  fixedHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2F0D9' } }

  result.rowResults.forEach((checked, index) => {
    const row = worksheet.getRow(index + 2)
    const issueCell = row.getCell(issueColumnNumber)
    const fixedCell = row.getCell(fixedColumnNumber)
    issueCell.value = checked.issues
    fixedCell.value = checked.fixed
    issueCell.alignment = { vertical: 'top', wrapText: true }
    fixedCell.alignment = { vertical: 'top', wrapText: true }

    if (checked.issues) {
      const fill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFF2CC' },
      }
      issueCell.fill = fill
      fixedCell.fill = fill
    }
  })

  worksheet.getColumn(issueColumnNumber).width = 48
  worksheet.getColumn(fixedColumnNumber).width = 42

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const stem = loaded.fileName.replace(/\.xlsx$/i, '') || '备注检查结果'
  downloadBlob(blob, `${stem}_备注检查结果.xlsx`)
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
  { title: '备注问题标注', dataIndex: '备注问题标注', key: '备注问题标注', width: 360 },
  { title: '修改后备注', dataIndex: '修改后备注', key: '修改后备注', width: 360 },
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
          这个功能按规则中心里的“备注招生类型规则”和“需要核查关键词”处理备注列。若“需要核查关键词”与命中的招生类型字段处在同一个未被标点或空格切开的备注短语中，系统不提取招生类型；被标点或空格切开的其他命中场景仍会提取招生类型并标记需要核查。
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
              pagination={{ defaultPageSize: 10 }}
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
      if (autoRemarkField) {
        message.success(`已上传文件并识别备注列：${autoRemarkField}`)
      } else {
        message.warning(
          `未自动找到备注列，请手动选择。支持的列名：${REMARK_COLUMN_NAMES.join('、')}`,
        )
      }
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

  const handleExport = async () => {
    if (!result || !loadedWorkbook || !sheetName) {
      message.warning('请先处理数据')
      return
    }

    try {
      await exportRemarkCleanWorkbook(result, loadedWorkbook, sheetName)
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
          检查招生计划备注中的常见错字、重复内容、格式异常、括号不成对和疑似乱码。
          只有确定的问题会自动修正，不确定内容仅提示人工检查。
        </Paragraph>
        <Paragraph type="secondary">
          导出时保留原工作簿和原始字段，在所选 Sheet 最后新增 <Text code>备注问题标注</Text>、
          <Text code>修改后备注</Text> 两列；有问题的结果单元格会标为浅黄色。
        </Paragraph>

        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Dragger beforeUpload={handleUpload} showUploadList={false} accept=".xlsx">
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽上传需要处理备注的 Excel 文件</p>
            <p className="ant-upload-hint">仅支持 .xlsx，可选择任意包含备注字段的 Sheet</p>
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
              <Statistic title="总行数" value={result.totalRows} />
            </Card>
            <Card>
              <Statistic title="有备注行数" value={result.remarkRows} />
            </Card>
            <Card>
              <Statistic title="检测出问题" value={result.issueRows} />
            </Card>
            <Card>
              <Statistic title="自动生成修改后备注" value={result.fixedRows} />
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
                pagination={{ defaultPageSize: 10 }}
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
