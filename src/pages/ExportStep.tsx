import { Button, Card, Space, Typography, message } from 'antd'
import { usePreviewStore } from '../stores/previewStore'
import { useTaskStore } from '../stores/taskStore'
import {
  exportProfessionalScoreTemplate,
  getExportableRecords,
} from '../modules/templateExport'

const { Paragraph, Text } = Typography

export default function ExportStep() {
  const { processedRecords } = usePreviewStore()
  const { year } = useTaskStore()

  const exportable = getExportableRecords(processedRecords)
  const blocked = processedRecords.length - exportable.length

  const handleExport = async () => {
    if (!processedRecords.length) {
      message.warning('请先生成预览数据')
      return
    }

    if (!exportable.length) {
      message.warning('没有通过校验的数据可导出')
      return
    }

    try {
      await exportProfessionalScoreTemplate(year, processedRecords)
      message.success('模板导出成功')
    } catch (error) {
      console.error(error)
      message.error('模板导出失败')
    }
  }

  return (
    <Card title="导出结果" style={{ borderRadius: 12 }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Paragraph style={{ marginBottom: 0 }}>
          导出时仅导出通过校验的数据（不包含 error 级别问题的数据）。
        </Paragraph>

        <Text>总记录数：{processedRecords.length}</Text>
        <Text>可导出记录数：{exportable.length}</Text>
        <Text>被拦截记录数：{blocked}</Text>

        <Button type="primary" onClick={handleExport}>
          导出专业分模板
        </Button>
      </Space>
    </Card>
  )
}