/**
 * 文件名称：高考真题题目截图工具页面
 *
 * 文件作用：
 * - 上传 PDF 真题文件。
 * - 使用 src/modules/questionScreenshot.ts 识别顶层题号并生成裁剪计划。
 * - 展示题号识别结果、大标题边界、导出计划。
 * - 支持预览单题截图。
 * - 支持一键导出全部题目 PNG，并打包为 ZIP。
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  InputNumber,
  Progress,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import { DownloadOutlined, EyeOutlined, InboxOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import {
  DEFAULT_QUESTION_SCREENSHOT_OPTIONS,
  buildQuestionImageFilename,
  downloadBlob,
  exportQuestionsToZip,
  loadQuestionScreenshotProject,
  mergeQuestionScreenshotOptions,
  renderQuestionToBlob,
  type QuestionCropPlan,
  type QuestionScreenshotOptions,
  type QuestionScreenshotProject,
  type QuestionStart,
  type SectionStart,
} from '../../modules/questionScreenshot'
import { confirmToolReset } from '../../utils/toolReset'

const { Dragger } = Upload
const { Paragraph, Text } = Typography

type OptionKey = keyof QuestionScreenshotOptions

type ExportState = {
  exporting: boolean
  current: number
  total: number
  fileName: string
}

function optionNumber(value: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function makeZipFileName(fileName: string) {
  const stem = fileName.replace(/\.pdf$/i, '') || '高考真题题目截图'
  return `${stem}_题目截图.zip`
}

function boundaryKindText(kind: QuestionCropPlan['boundaryKind']) {
  if (kind === 'question') return '下一题'
  if (kind === 'section') return '大标题'
  return '文档结束'
}

function boundaryKindColor(kind: QuestionCropPlan['boundaryKind']) {
  if (kind === 'question') return 'blue'
  if (kind === 'section') return 'orange'
  return 'green'
}

const questionColumns: ColumnsType<QuestionCropPlan> = [
  { title: '题号', dataIndex: 'qno', key: 'qno', width: 90, fixed: 'left' },
  {
    title: '页码',
    key: 'pageRange',
    width: 130,
    render: (_, row) => (row.startPage === row.endPage ? `第 ${row.startPage} 页` : `第 ${row.startPage}-${row.endPage} 页`),
  },
  {
    title: '片段数',
    key: 'segments',
    width: 100,
    render: (_, row) => row.segments.length,
  },
  {
    title: '结束边界',
    dataIndex: 'boundaryKind',
    key: 'boundaryKind',
    width: 120,
    render: (kind: QuestionCropPlan['boundaryKind']) => <Tag color={boundaryKindColor(kind)}>{boundaryKindText(kind)}</Tag>,
  },
  { title: '题号识别文本', dataIndex: 'startText', key: 'startText', width: 520, ellipsis: true },
  { title: '边界文本', dataIndex: 'boundaryText', key: 'boundaryText', width: 360, ellipsis: true },
]

const startColumns: ColumnsType<QuestionStart> = [
  { title: '题号', dataIndex: 'qno', key: 'qno', width: 90 },
  {
    title: '页码',
    dataIndex: 'pageIndex',
    key: 'pageIndex',
    width: 90,
    render: (pageIndex: number) => pageIndex + 1,
  },
  {
    title: 'y',
    dataIndex: 'y',
    key: 'y',
    width: 100,
    render: (y: number) => y.toFixed(1),
  },
  {
    title: 'x',
    dataIndex: 'x',
    key: 'x',
    width: 100,
    render: (x: number) => x.toFixed(1),
  },
  { title: '识别文本', dataIndex: 'text', key: 'text', ellipsis: true },
]

const sectionColumns: ColumnsType<SectionStart> = [
  {
    title: '页码',
    dataIndex: 'pageIndex',
    key: 'pageIndex',
    width: 90,
    render: (pageIndex: number) => pageIndex + 1,
  },
  {
    title: 'y',
    dataIndex: 'y',
    key: 'y',
    width: 100,
    render: (y: number) => y.toFixed(1),
  },
  {
    title: 'x',
    dataIndex: 'x',
    key: 'x',
    width: 100,
    render: (x: number) => x.toFixed(1),
  },
  { title: '大标题文本', dataIndex: 'text', key: 'text', ellipsis: true },
]

function OptionNumberInput({
  label,
  value,
  min,
  max,
  step,
  addonAfter,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  addonAfter?: string
  onChange: (value: number) => void
}) {
  return (
    <Space direction="vertical" size={4}>
      <Text type="secondary">{label}</Text>
      <InputNumber
        value={value}
        min={min}
        max={max}
        step={step}
        addonAfter={addonAfter}
        onChange={(next) => onChange(optionNumber(next))}
      />
    </Space>
  )
}

export default function QuestionScreenshotTool() {
  const [options, setOptions] = useState<QuestionScreenshotOptions>(() => DEFAULT_QUESTION_SCREENSHOT_OPTIONS)
  const [project, setProject] = useState<QuestionScreenshotProject | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [previewQuestion, setPreviewQuestion] = useState<QuestionCropPlan | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>()
  const [exportState, setExportState] = useState<ExportState>({
    exporting: false,
    current: 0,
    total: 0,
    fileName: '',
  })

  const validQuestionCount = useMemo(
    () => project?.questions.filter((question) => question.segments.length > 0).length || 0,
    [project],
  )

  const skippedQuestionCount = useMemo(
    () => project?.questions.filter((question) => question.segments.length === 0).length || 0,
    [project],
  )

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const patchOption = <K extends OptionKey>(key: K, value: QuestionScreenshotOptions[K]) => {
    setOptions((current) => mergeQuestionScreenshotOptions({ ...current, [key]: value }))
  }

  const handleUpload = async (file: File) => {
    setLoading(true)
    setProject(null)
    setPreviewQuestion(null)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(undefined)
    }

    try {
      const nextProject = await loadQuestionScreenshotProject(file, options)
      setProject(nextProject)
      message.success(`已识别 ${nextProject.starts.length} 道题`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'PDF 识别失败')
    } finally {
      setLoading(false)
    }

    return false
  }

  const handleRebuild = async () => {
    message.info('调整裁剪参数后，请重新上传 PDF 以重新生成裁剪计划')
  }

  const handlePreview = async (question: QuestionCropPlan) => {
    if (!project) return
    if (!question.segments.length) {
      message.warning('当前题没有可裁剪内容')
      return
    }

    setPreviewing(true)
    setPreviewQuestion(question)

    try {
      const blob = await renderQuestionToBlob(project, question, options)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(URL.createObjectURL(blob))
    } catch (error) {
      message.error(error instanceof Error ? error.message : '预览生成失败')
    } finally {
      setPreviewing(false)
    }
  }

  const handleExport = async () => {
    if (!project) {
      message.warning('请先上传 PDF')
      return
    }

    setExportState({ exporting: true, current: 0, total: validQuestionCount, fileName: '' })

    try {
      const zipBlob = await exportQuestionsToZip(project, options, (progress) => {
        setExportState({ exporting: true, ...progress })
      })
      downloadBlob(zipBlob, makeZipFileName(project.fileName))
      message.success('题目截图导出完成')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导出失败')
    } finally {
      setExportState({ exporting: false, current: 0, total: 0, fileName: '' })
    }
  }

  const handleResetPage = () => {
    confirmToolReset({
      title: '确认重置高考真题题目截图工具？',
      onReset: () => {
        setOptions(DEFAULT_QUESTION_SCREENSHOT_OPTIONS)
        setProject(null)
        setLoading(false)
        setPreviewing(false)
        setPreviewQuestion(null)
        setExportState({ exporting: false, current: 0, total: 0, fileName: '' })
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl)
          setPreviewUrl(undefined)
        }
      },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        title="高考真题题目截图"
        extra={<Button danger onClick={handleResetPage}>重置</Button>}
       
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="使用前请先把 Word 删除页面页脚，手动另存为 PDF"
            description="本工具按顶层题号 1. / 1． / 1、自动截图，不识别（1）（2）这类小题号。会尽量排除一、选择题、注意事项、试卷头部、单独科目名等公共内容。"
          />

          <Dragger beforeUpload={handleUpload} showUploadList={false} accept=".pdf" disabled={loading || exportState.exporting}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽上传 PDF 真题文件</p>
            <p className="ant-upload-hint">适合由 Word/WPS 转换出来的文档版 PDF；纯扫描 PDF 可能无法识别题号。</p>
          </Dragger>

          <Card size="small" title="裁剪参数">
            <Space wrap align="end" size={16}>
              <OptionNumberInput
                label="清晰度"
                value={options.dpi}
                min={120}
                max={360}
                step={10}
                addonAfter="DPI"
                onChange={(value) => patchOption('dpi', value)}
              />
              <OptionNumberInput
                label="图片四周白边"
                value={options.edgeCm}
                min={0}
                max={3}
                step={0.1}
                addonAfter="cm"
                onChange={(value) => patchOption('edgeCm', value)}
              />
              <OptionNumberInput
                label="跨页拼接间隔"
                value={options.innerGapCm}
                min={0}
                max={1}
                step={0.01}
                addonAfter="cm"
                onChange={(value) => patchOption('innerGapCm', value)}
              />
              <OptionNumberInput
                label="边界前收缩"
                value={options.endBeforeBoundaryPt}
                min={0}
                max={24}
                step={1}
                addonAfter="pt"
                onChange={(value) => patchOption('endBeforeBoundaryPt', value)}
              />
              <OptionNumberInput
                label="忽略页眉高度"
                value={options.ignoreTopCm}
                min={0}
                max={3}
                step={0.1}
                addonAfter="cm"
                onChange={(value) => patchOption('ignoreTopCm', value)}
              />
              <OptionNumberInput
                label="忽略页脚高度"
                value={options.ignoreBottomCm}
                min={0}
                max={3}
                step={0.1}
                addonAfter="cm"
                onChange={(value) => patchOption('ignoreBottomCm', value)}
              />
              <Space direction="vertical" size={4}>
                <Text type="secondary">拆分排除行</Text>
                <Switch
                  checked={options.splitExcludedLines}
                  checkedChildren="开启"
                  unCheckedChildren="关闭"
                  onChange={(checked) => patchOption('splitExcludedLines', checked)}
                />
              </Space>
              <Button onClick={handleRebuild}>参数修改说明</Button>
            </Space>
          </Card>
        </Space>
      </Card>

      {loading ? (
        <Card>
          <Progress percent={60} status="active" showInfo={false} />
          <Paragraph style={{ marginTop: 12, marginBottom: 0 }}>正在解析 PDF 和识别题号...</Paragraph>
        </Card>
      ) : null}

      {project ? (
        <>
          <Space size={16} wrap>
            <Card>
              <Statistic title="PDF 页数" value={project.pageCount} />
            </Card>
            <Card>
              <Statistic title="识别题目" value={project.starts.length} />
            </Card>
            <Card>
              <Statistic title="可导出题目" value={validQuestionCount} />
            </Card>
            <Card>
              <Statistic title="大标题边界" value={project.sections.length} />
            </Card>
            <Card>
              <Statistic title="未生成片段" value={skippedQuestionCount} />
            </Card>
          </Space>

          <Card
            title="导出操作"
            extra={
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                loading={exportState.exporting}
                disabled={!validQuestionCount}
                onClick={handleExport}
              >
                导出全部题目截图 ZIP
              </Button>
            }
           
          >
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="文件名">{project.fileName}</Descriptions.Item>
              <Descriptions.Item label="导出文件名">{makeZipFileName(project.fileName)}</Descriptions.Item>
              <Descriptions.Item label="建议检查">先预览前 1-3 题，确认没有截到下一题第一行后再批量导出。</Descriptions.Item>
              <Descriptions.Item label="当前清晰度">{options.dpi} DPI</Descriptions.Item>
            </Descriptions>

            {exportState.exporting ? (
              <div style={{ marginTop: 16 }}>
                <Progress
                  percent={exportState.total ? Math.round((exportState.current / exportState.total) * 100) : 0}
                  status="active"
                />
                <Text type="secondary">
                  正在生成：{exportState.current}/{exportState.total} {exportState.fileName}
                </Text>
              </div>
            ) : null}
          </Card>

          <Card title="题目截图计划">
            <Table<QuestionCropPlan>
              rowKey="id"
              dataSource={project.questions}
              columns={[
                ...questionColumns,
                {
                  title: '操作',
                  key: 'action',
                  width: 150,
                  fixed: 'right',
                  render: (_, row) => (
                    <Button
                      size="small"
                      icon={<EyeOutlined />}
                      loading={previewing && previewQuestion?.id === row.id}
                      disabled={!row.segments.length}
                      onClick={() => handlePreview(row)}
                    >
                      预览
                    </Button>
                  ),
                },
              ]}
              pagination={{ pageSize: 10 }}
              scroll={{ x: 1400 }}
            />
          </Card>

          <Card title="单题预览">
            {previewQuestion && previewUrl ? (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Descriptions size="small" column={2}>
                  <Descriptions.Item label="题号">题{previewQuestion.qno}</Descriptions.Item>
                  <Descriptions.Item label="图片名">{buildQuestionImageFilename(previewQuestion)}</Descriptions.Item>
                </Descriptions>
                <div
                  style={{
                    overflowX: 'auto',
                    background: '#fafafa',
                    padding: 16,
                    border: '1px solid #f0f0f0',
                    borderRadius: 12,
                  }}
                >
                  <img src={previewUrl} alt="题目截图预览" style={{ maxWidth: '100%', display: 'block' }} />
                </div>
              </Space>
            ) : (
              <Empty description="点击某一道题的“预览”后，这里显示生成效果" />
            )}
          </Card>

          <Card title="识别详情">
            <Tabs
              destroyOnHidden
              items={[
                {
                  key: 'starts',
                  label: '题号识别结果',
                  children: (
                    <Table<QuestionStart>
                      rowKey={(row) => `${row.qno}-${row.pageIndex}-${row.y}`}
                      dataSource={project.starts}
                      columns={startColumns}
                      pagination={{ pageSize: 10 }}
                      scroll={{ x: 900 }}
                    />
                  ),
                },
                {
                  key: 'sections',
                  label: '大标题边界',
                  children: project.sections.length ? (
                    <Table<SectionStart>
                      rowKey={(row) => `${row.pageIndex}-${row.y}-${row.text}`}
                      dataSource={project.sections}
                      columns={sectionColumns}
                      pagination={{ pageSize: 10 }}
                      scroll={{ x: 800 }}
                    />
                  ) : (
                    <Empty description="未识别到大标题边界" />
                  ),
                },
              ]}
            />
          </Card>
        </>
      ) : !loading ? (
        <Card>
          <Empty description="上传 PDF 后，这里显示题号识别结果和导出计划" />
        </Card>
      ) : null}
    </div>
  )
}
