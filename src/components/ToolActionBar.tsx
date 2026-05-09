import { Button, Space } from 'antd'

type ToolActionBarProps = {
  processing?: boolean
  hasResult?: boolean
  onProcess?: () => void
  onExport?: () => void
  onReset?: () => void
  processText?: string
  exportText?: string
}

export function ToolActionBar({
  processing = false,
  hasResult = false,
  onProcess,
  onExport,
  onReset,
  processText = '开始处理',
  exportText = '导出结果',
}: ToolActionBarProps) {
  return (
    <Space wrap>
      {onProcess ? (
        <Button type="primary" loading={processing} onClick={onProcess}>
          {processText}
        </Button>
      ) : null}

      {onExport ? (
        <Button disabled={!hasResult} onClick={onExport}>
          {exportText}
        </Button>
      ) : null}

      {onReset ? (
        <Button danger onClick={onReset}>
          重置当前工具
        </Button>
      ) : null}
    </Space>
  )
}
