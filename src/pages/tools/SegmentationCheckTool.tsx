import { useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Typography,
  Upload,
  message,
} from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import { processSegmentationText, processSegmentationWorkbook, type SegmentationMeta } from '../../modules/segmentation'
import { downloadBlob } from '../../modules/xueyeqiao'
import { confirmToolReset } from '../../utils/toolReset'

const { Dragger } = Upload
const { Paragraph, Text } = Typography
const { TextArea } = Input

type InputMode = 'file' | 'paste'

const PROVINCE_OPTIONS = [
  '北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江', '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '广西', '海南', '重庆', '四川', '贵州', '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆',
]

const CATEGORY_OPTIONS = ['综合', '物理类', '历史类', '文科', '理科', '艺术类', '艺术文', '艺术理', '体育类', '体育文', '体育理']
const FIRST_SUBJECT_OPTIONS = ['物理', '历史']
const LEVEL_OPTIONS = ['本科', '高职（专科）', '不分层次']

function getSourceTypeName(sourceType: Awaited<ReturnType<typeof processSegmentationWorkbook>>['summary']['sourceType']) {
  if (sourceType === 'pdf') return 'PDF 文本识别'
  if (sourceType === 'paste') return '粘贴表格 / OCR 结果'
  return 'Excel 上传'
}

export default function SegmentationCheckTool() {
  const [form] = Form.useForm<SegmentationMeta>()
  const [inputMode, setInputMode] = useState<InputMode>('file')
  const [file, setFile] = useState<File | null>(null)
  const [pastedText, setPastedText] = useState('')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<Awaited<ReturnType<typeof processSegmentationWorkbook>> | null>(null)

  const handleUpload = async (nextFile: File) => {
    setFile(nextFile)
    setResult(null)
    message.success(`已选择文件：${nextFile.name}`)
    return false
  }

  const handleProcess = async () => {
    const meta = form.getFieldsValue()

    if (inputMode === 'file' && !file) {
      message.warning('请先上传文件')
      return
    }

    if (inputMode === 'paste' && !pastedText.trim()) {
      message.warning('请先粘贴表格文本或 OCR 识别结果')
      return
    }

    setProcessing(true)
    try {
      const processed = inputMode === 'paste'
        ? await processSegmentationText(pastedText, meta)
        : await processSegmentationWorkbook(file as File, meta)
      setResult(processed)
      message.success('一分一段处理完成')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '处理失败')
    } finally {
      setProcessing(false)
    }
  }

  const handleExport = () => {
    if (!result) return
    const filename = inputMode === 'paste'
      ? '一分一段_粘贴处理结果.xlsx'
      : file?.name.replace(/\.(xlsx|xls|csv|pdf)$/i, '_处理结果.xlsx') || '一分一段_处理结果.xlsx'
    downloadBlob(result.blob, filename)
  }

  const handleResetPage = () => {
    confirmToolReset({
      title: '确认重置一分一段处理？',
      onReset: () => {
        setInputMode('file')
        setFile(null)
        setPastedText('')
        setProcessing(false)
        setResult(null)
        form.resetFields()
      },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="一分一段处理" extra={<Button danger onClick={handleResetPage}>重置</Button>}>
        <Paragraph>
          这个页面会做年份校验、自动补断点、自动补人数，并在表中写入累计人数校验结果与分数校验结果。
          本次改造增加了稳定的“表格文本 / OCR 结果粘贴”入口，不在前端直接做图片 OCR。
        </Paragraph>

        <Alert
          showIcon
          type="info"
          style={{ marginBottom: 16 }}
          message="处理方案"
          description="网页表格可直接复制粘贴；图片型 PDF、扫描型 PDF 请先用 WPS、微信、Adobe 等工具识别为表格文本，再粘贴到本页面处理。工具会把单组三列、多组三列、吉林矩阵、贵州横向表等格式统一转换为标准的分数 / 人数 / 累计人数后，再执行原有分数处理逻辑。"
        />

        <Form form={form} layout="vertical" initialValues={{ year: '2026' }}>
          <Row gutter={16}>
            <Col xs={24} md={8} lg={5}>
              <Form.Item label="年份" name="year">
                <Input placeholder="可不填，默认读取表格 B2" allowClear />
              </Form.Item>
            </Col>

            <Col xs={24} md={8} lg={5}>
              <Form.Item label="省份" name="province">
                <Select
                  allowClear
                  showSearch
                  placeholder="可不填"
                  options={PROVINCE_OPTIONS.map((item) => ({ label: item, value: item }))}
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={8} lg={5}>
              <Form.Item label="科类" name="category">
                <Select
                  allowClear
                  showSearch
                  placeholder="可不填"
                  options={CATEGORY_OPTIONS.map((item) => ({ label: item, value: item }))}
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={8} lg={4}>
              <Form.Item label="首选科目" name="firstSubject">
                <Select
                  allowClear
                  placeholder="可不填"
                  options={FIRST_SUBJECT_OPTIONS.map((item) => ({ label: item, value: item }))}
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={8} lg={5}>
              <Form.Item label="层次" name="level">
                <Select
                  allowClear
                  placeholder="可不填"
                  options={LEVEL_OPTIONS.map((item) => ({ label: item, value: item }))}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        <Card size="small" title="数据来源" style={{ marginBottom: 16 }}>
          <Radio.Group
            value={inputMode}
            onChange={(event) => {
              setInputMode(event.target.value)
              setResult(null)
            }}
          >
            <Radio.Button value="file">上传 Excel / 文本型 PDF</Radio.Button>
            <Radio.Button value="paste">粘贴表格文本 / OCR 结果</Radio.Button>
          </Radio.Group>
        </Card>

        {inputMode === 'file' ? (
          <Dragger beforeUpload={handleUpload} showUploadList={false} accept=".xlsx,.xls,.csv,.pdf">
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">上传一分一段 Excel / 文本型 PDF 文件</p>
            <p className="ant-upload-hint">
              Excel 支持标准模板、单组三列、多组三列、吉林矩阵、贵州横向表等结构。图片型 / 扫描型 PDF 请先 OCR 后粘贴。
            </p>
          </Dragger>
        ) : (
          <TextArea
            value={pastedText}
            onChange={(event) => {
              setPastedText(event.target.value)
              setResult(null)
            }}
            autoSize={{ minRows: 12, maxRows: 24 }}
            placeholder={`可粘贴网页表格、Excel 复制内容、WPS/微信/Adobe OCR 识别后的表格文本，例如：\n分数\t本分人数\t累计人数\n704分以上\t2\t12\n703\t3\t15\n\n也支持多组三列：\n分数\t本分人数\t累计人数\t分数\t本分人数\t累计人数\n704分以上\t2\t12\t561\t465\t24667`}
          />
        )}

        {(file || inputMode === 'paste') && (
          <Space style={{ marginTop: 16 }} wrap>
            {inputMode === 'file' && file ? <Text type="secondary">当前文件：{file.name}</Text> : null}
            {inputMode === 'paste' ? <Text type="secondary">当前来源：粘贴表格文本 / OCR 结果</Text> : null}
            <Button type="primary" loading={processing} onClick={handleProcess}>
              开始处理
            </Button>
            <Button onClick={handleExport} disabled={!result}>
              下载处理结果
            </Button>
          </Space>
        )}
      </Card>

      {result ? (
        <>
          <Space size={16} wrap>
            <Card>
              <Statistic title="补断点行数" value={result.summary.insertedGapRows} />
            </Card>
            <Card>
              <Statistic title="自动补人数行数" value={result.summary.autoFilledCountRows} />
            </Card>
            <Card>
              <Statistic title="识别/读取记录数" value={result.summary.extractedRows} />
            </Card>
          </Space>

          <Card title="处理摘要">
            <Descriptions column={1}>
              <Descriptions.Item label="年份校验结果">
                {result.summary.yearCheck}
              </Descriptions.Item>
              <Descriptions.Item label="文件来源">
                {getSourceTypeName(result.summary.sourceType)}
              </Descriptions.Item>
              <Descriptions.Item label="识别格式">
                {result.summary.detectedFormat || '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </>
      ) : (
        <Card>
          <Empty description="上传或粘贴并处理后，这里显示一分一段处理摘要" />
        </Card>
      )}
    </div>
  )
}
