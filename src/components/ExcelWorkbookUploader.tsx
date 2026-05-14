import { Button, Card, Select, Space, Typography, Upload } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import type { WorkerLoadedWorkbook } from '../utils/excelWorkerClient'

const { Dragger } = Upload
const { Text } = Typography

type ExcelWorkbookUploaderProps = {
  title: string
  description?: string
  loading?: boolean
  loadedWorkbook?: WorkerLoadedWorkbook | null
  sheetName?: string
  onUpload: (file: File) => Promise<void> | void
  onSheetChange?: (sheetName: string) => void
}

export function ExcelWorkbookUploader({
  title,
  description,
  loading = false,
  loadedWorkbook,
  sheetName,
  onUpload,
  onSheetChange,
}: ExcelWorkbookUploaderProps) {
  return (
    <Card title={title}>
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        {description ? <Text type="secondary">{description}</Text> : null}

        <Dragger
          accept=".xlsx,.xls"
          showUploadList={false}
          disabled={loading}
          beforeUpload={(file) => {
            void onUpload(file)
            return false
          }}
        >
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">点击或拖拽 Excel 文件到此区域</p>
          <p className="ant-upload-hint">支持 .xlsx / .xls</p>
        </Dragger>

        {loadedWorkbook ? (
          <Space wrap>
            <Text>当前文件：{loadedWorkbook.fileName}</Text>
            <Select
              style={{ minWidth: 220 }}
              value={sheetName}
              options={loadedWorkbook.sheetNames.map((name) => ({ label: name, value: name }))}
              onChange={onSheetChange}
            />
          </Space>
        ) : null}

        {loading ? <Button loading>正在读取 Excel</Button> : null}
      </Space>
    </Card>
  )
}
