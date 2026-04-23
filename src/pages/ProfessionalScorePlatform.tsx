import { Card, Steps } from 'antd'
import { useState } from 'react'

import UploadStep from './UploadStep'
import MappingStep from './MappingStep'
import RuleStep from './RuleStep'
import PreviewStep from './PreviewStep'
import ExceptionStep from './ExceptionStep'
import ExportStep from './ExportStep'

export default function ProfessionalScorePlatform() {
  const [current, setCurrent] = useState(0)

  const stepItems = [
    { title: '文件上传' },
    { title: '字段映射' },
    { title: '规则查看' },
    { title: '处理预览' },
    { title: '异常处理' },
    { title: '导出结果' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card style={{ borderRadius: 12 }}>
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