import { Button, Space, Steps, message } from 'antd'
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
  const {
    resetTask,
    scoreWorkbook,
    scoreSheetName,
    planWorkbook,
    planSheetName,
  } = useTaskStore()
  const {
    resetPreview,
    scoreMappings,
    planMappings,
    processedRecords,
  } = usePreviewStore()

  const stepItems = [
    { title: '文件上传' },
    { title: '字段映射' },
    { title: '规则查看' },
    { title: '处理预览' },
    { title: '异常处理' },
    { title: '导出结果' },
  ]

  const hasUploadedFiles =
    !!scoreWorkbook && !!scoreSheetName && !!planWorkbook && !!planSheetName

  const hasMappings =
    scoreMappings.some((item) => !item.ignored && item.targetField) &&
    planMappings.some((item) => !item.ignored && item.targetField)

  const hasProcessedRecords = processedRecords.length > 0

  const validateStepEnter = (targetStep: number) => {
    if (targetStep >= 1 && !hasUploadedFiles) {
      message.warning('请先上传原始专业分文件和招生计划文件，并选择 Sheet')
      return false
    }

    if (targetStep >= 3 && !hasMappings) {
      message.warning('请先在第二步确认字段映射，并点击“应用当前映射”')
      return false
    }

    if (targetStep >= 3 && !hasProcessedRecords) {
      message.warning('请先在第二步点击“应用当前映射”，生成处理预览')
      return false
    }

    return true
  }

  const changeStep = (targetStep: number) => {
    if (!validateStepEnter(targetStep)) return
    setCurrent(targetStep)
  }

  const handlePrev = () => {
    setCurrent((prev) => Math.max(prev - 1, 0))
  }

  const handleNext = () => {
    const next = Math.min(current + 1, stepItems.length - 1)
    changeStep(next)
  }

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 400 }}>
          <Steps current={current} onChange={changeStep} items={stepItems} />
        </div>
        <Space>
          <Button disabled={current === 0} onClick={handlePrev}>
            上一步
          </Button>
          <Button
            type="primary"
            disabled={current === stepItems.length - 1}
            onClick={handleNext}
          >
            下一步
          </Button>
          <Button danger onClick={handleResetPlatform}>
            重置
          </Button>
        </Space>
      </div>

      <div key={current} className="animate-enter">
        {current === 0 && <UploadStep />}
        {current === 1 && <MappingStep />}
        {current === 2 && <RuleStep />}
        {current === 3 && <PreviewStep />}
        {current === 4 && <ExceptionStep />}
        {current === 5 && <ExportStep />}
      </div>
    </div>
  )
}
