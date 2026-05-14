import { useState } from 'react'
import {
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  Row,
  Select,
  Space,
  Statistic,
  Typography,
  Upload,
  message,
} from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import { processSegmentationWorkbook, type SegmentationMeta } from '../../modules/segmentation'
import { downloadBlob } from '../../modules/xueyeqiao'
import { confirmToolReset } from '../../utils/toolReset'

const { Dragger } = Upload
const { Paragraph, Text } = Typography

const PROVINCE_OPTIONS = [
  '北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江', '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '广西', '海南', '重庆', '四川', '贵州', '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆',
]

const CATEGORY_OPTIONS = ['综合', '物理类', '历史类', '文科', '理科', '艺术类', '艺术文', '艺术理', '体育类', '体育文', '体育理']
const FIRST_SUBJECT_OPTIONS = ['物理', '历史']
const LEVEL_OPTIONS = ['本科', '高职（专科）', '不分层次']

export default function SegmentationCheckTool() {
  const [form] = Form.useForm<SegmentationMeta>()
  const [file, setFile] = useState<File | null>(null)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<Awaited<ReturnType<typeof processSegmentationWorkbook>> | null>(null)

  const handleUpload = async (nextFile: File) => {
    setFile(nextFile)
    setResult(null)
    message.success(`已选择文件：${nextFile.name}`)
    return false
  }

  const handleProcess = async () => {
    if (!file) {
      message.warning('请先上传文件')
      return
    }

    const meta = form.getFieldsValue()
    setProcessing(true)
    try {
      const processed = await processSegmentationWorkbook(file, meta)
      setResult(processed)
      message.success('一分一段处理完成')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '处理失败')
    } finally {
      setProcessing(false)
    }
  }

  const handleExport = () => {
    if (!file || !result) return
    downloadBlob(result.blob, file.name.replace(/\.(xlsx|xls|pdf)$/i, '_处理结果.xlsx'))
  }

  const handleResetPage = () => {
    confirmToolReset({
      title: '确认重置一分一段处理？',
      onReset: () => {
        setFile(null)
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
          PDF 识别主要适用于吉林、贵州的一分一段文本型 PDF；扫描件或复杂图片型 PDF 建议先转成 Excel 后上传。
        </Paragraph>

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

        <Dragger beforeUpload={handleUpload} showUploadList={false} accept=".xlsx,.xls,.pdf">
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">上传一分一段 Excel / PDF 文件</p>
          <p className="ant-upload-hint">Excel 会直接校验处理；PDF 会先尝试识别并转换为一分一段模板后再处理。</p>
        </Dragger>

        {file && (
          <Space style={{ marginTop: 16 }} wrap>
            <Text type="secondary">当前文件：{file.name}</Text>
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
                {result.summary.sourceType === 'pdf' ? 'PDF 自动识别' : 'Excel 上传'}
              </Descriptions.Item>
              <Descriptions.Item label="识别格式">
                {result.summary.detectedFormat || '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </>
      ) : (
        <Card>
          <Empty description="上传并处理后，这里显示一分一段处理摘要" />
        </Card>
      )}
    </div>
  )
}
