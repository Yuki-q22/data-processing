import { Button, Card, Steps } from 'antd'
import { useState } from 'react'

import UploadStep from './UploadStep'
import MappingStep from './MappingStep'
import RuleStep from './RuleStep'
import PreviewStep from './PreviewStep'
import ExceptionStep from './ExceptionStep'
import ExportStep from './ExportStep'
import { usePreviewStore } from '../stores/previewStore'
import { useTaskStore } from '../stores/taskStore'
import { confirmToolReset } from '../utils/toolReset'

export default function ProfessionalScorePlatform() {
  const [current, setCurrent] = useState(0)
  const { resetTask } = useTaskStore()
  const { resetPreview } = usePreviewStore()

  const stepItems = [
    { title: '文件上传' },
    { title: '字段映射' },
    { title: '规则查看' },
    { title: '处理预览' },
    { title: '异常处理' },
    { title: '导出结果' },
  ]

  const handleResetPlatform = () => {
    confirmToolReset({
      title: '确认重置专业分模板智能填充？',
      content:
        '将清空当前流程的上传文件、字段映射、处理预览、异常人工匹配记录，并回到第一步。规则中心规则不会被删除。',
      successMessage: '已重置专业分模板智能填充数据和运行缓存',
      onReset: () => {
        resetTask()
        resetPreview()
        setCurrent(0)
      },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card style={{ borderRadius: 12 }} extra={<Button danger onClick={handleResetPlatform}>重置</Button>}>
        <Steps
          current={current}
          onChange={setCurrent}
          items={stepItems}
        />
      </Card>

      {current === 0 && <UploadStep />}
      {current === 1 && <MappingStep />}
      {current === 2 && <RuleStep />}
      {current === 3 && <PreviewStep />}
      {current === 4 && <ExceptionStep />}
      {current === 5 && <ExportStep />}
    </div>
  )
}