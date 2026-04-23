import { useState } from 'react'
import { Button, Card, Descriptions, Empty, Space, Statistic, Typography, Upload, message } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import { processSegmentationWorkbook } from '../../modules/segmentation'
import { downloadBlob } from '../../modules/xueyeqiao'

const { Dragger } = Upload
const { Paragraph } = Typography

export default function SegmentationCheckTool() {
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

    setProcessing(true)
    try {
      const processed = await processSegmentationWorkbook(file)
      setResult(processed)
      message.success('一分一段校验完成')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '处理失败')
    } finally {
      setProcessing(false)
    }
  }

  const handleExport = () => {
    if (!file || !result) return
    downloadBlob(result.blob, file.name.replace(/\.xlsx$/i, '_校验结果.xlsx'))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="一分一段校验" style={{ borderRadius: 12 }}>
        <Paragraph>
          这个页面会做年份校验、自动补断点、自动补人数，并在表中写入累计人数校验结果与分数校验结果。
        </Paragraph>

        <Dragger beforeUpload={handleUpload} showUploadList={false} accept=".xlsx,.xls">
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">上传一分一段 Excel 文件</p>
        </Dragger>

        {file && (
          <Space style={{ marginTop: 16 }}>
            <Button type="primary" loading={processing} onClick={handleProcess}>
              开始处理
            </Button>
            <Button onClick={handleExport} disabled={!result}>
              下载校验结果
            </Button>
          </Space>
        )}
      </Card>

      {result ? (
        <>
          <Space size={16}>
            <Card>
              <Statistic title="补断点行数" value={result.summary.insertedGapRows} />
            </Card>
            <Card>
              <Statistic title="自动补人数行数" value={result.summary.autoFilledCountRows} />
            </Card>
          </Space>

          <Card title="处理摘要" style={{ borderRadius: 12 }}>
            <Descriptions column={1}>
              <Descriptions.Item label="年份校验结果">
                {result.summary.yearCheck}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </>
      ) : (
        <Card style={{ borderRadius: 12 }}>
          <Empty description="上传并处理后，这里显示一分一段校验摘要" />
        </Card>
      )}
    </div>
  )
}