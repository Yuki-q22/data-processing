import { Alert, Card, Descriptions, Select, Space, Typography, Upload, message } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import { useEffect, useRef } from 'react'
import type { UploadedWorkbook } from '../types/workbook'
import type { UploadValidationResult } from '../modules/uploadValidation'

const { Dragger } = Upload
const { Text } = Typography

type Props = {
  title: string
  workbook?: UploadedWorkbook
  selectedSheet?: string
  validation?: UploadValidationResult
  onSheetChange: (sheetName: string) => void
  onUpload: (file: File) => Promise<void> | void
}

export default function FileUploadCard(props: Props) {
  const { title, workbook, selectedSheet, validation, onSheetChange, onUpload } = props
  const prevWorkbookRef = useRef<UploadedWorkbook | undefined>(undefined)
  const alertRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (workbook && workbook !== prevWorkbookRef.current) {
      // 新上传文件时给 Alert 区域添加进入动画
      if (alertRef.current) {
        alertRef.current.classList.add('animate-pop-in')
        const timer = setTimeout(() => {
          alertRef.current?.classList.remove('animate-pop-in')
        }, 400)
        return () => clearTimeout(timer)
      }
    }
    prevWorkbookRef.current = workbook
  }, [workbook])

  const handleBeforeUpload = async (file: File) => {
    try {
      await onUpload(file)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '上传失败')
    }
    return false
  }

  return (
    <Card title={title} className={workbook ? 'flash-success' : undefined}>
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <Dragger
          beforeUpload={handleBeforeUpload}
          showUploadList={false}
          accept=".xlsx,.xls"
          multiple={false}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ fontSize: 48, color: 'var(--color-primary)', transition: 'transform 0.3s var(--ease-spring)' }} />
          </p>
          <p className="ant-upload-text" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
            点击或拖拽上传 Excel 文件
          </p>
          <p className="ant-upload-hint" style={{ color: 'var(--text-tertiary)' }}>
            支持拖动上传，也支持点击选择文件
          </p>
        </Dragger>

        {workbook && (
          <div ref={alertRef}>
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="文件名">
                {workbook.fileName}
              </Descriptions.Item>
            </Descriptions>

            {workbook.sheets?.length ? (
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                <Text>选择 Sheet</Text>
                <Select
                  value={selectedSheet}
                  onChange={onSheetChange}
                  options={workbook.sheets.map((sheet) => ({
                    label:
                      typeof sheet.rowCount === 'number'
                        ? `${sheet.name}（${sheet.rowCount} 行）`
                        : sheet.name,
                    value: sheet.name,
                  }))}
                  style={{ width: 260 }}
                />
              </Space>
            ) : null}

            {validation ? (
              validation.isValid ? (
                <Alert
                  type="success"
                  showIcon
                  message={`字段校验通过，共识别 ${validation.totalColumns} 个字段`}
                />
              ) : (
                <Alert
                  type="warning"
                  showIcon
                  message={`字段不完整，缺少 ${validation.missingFields.length} 个字段`}
                  description={`缺失字段：${validation.missingFields.join('、')}`}
                />
              )
            ) : null}
          </div>
        )}
      </Space>
    </Card>
  )
}