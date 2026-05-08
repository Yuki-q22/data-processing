import { useMemo } from 'react'
import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Col,
  Input,
  Row,
  Select,
  Space,
  Typography,
  message,
} from 'antd'
import * as XLSX from 'xlsx'
import FileUploadCard from '../components/FileUploadCard'
import { validateUploadedHeaders } from '../modules/uploadValidation'
import { useTaskStore } from '../stores/taskStore'
import { usePreviewStore } from '../stores/previewStore'
import { useRuleCenterStore } from '../stores/ruleCenterStore'
import { confirmToolReset } from '../utils/toolReset'
import type { UploadedWorkbook } from '../types/workbook'

const { Paragraph, Text } = Typography

const DATA_SOURCE_OPTIONS = [
  '官方考试院',
  '大红本数据',
  '学校官网',
  '销售',
  '学业桥',
  '学业桥非普通',
]

const YEAR_OPTIONS = ['2025', '2026', '2027']

const REQUIRED_PLAN_FIELDS = [
  '年份',
  '省份',
  '学校',
  '科类',
  '批次',
  '招生类型',
  '专业',
  '层次',
  '方向',
  '备注',
  '招生人数',
  '招生代码',
  '专业代码',
  '专业组代码',
  '专业组选科要求',
  '专业选科要求(新高考专业省份)',
  '数据来源',
]

function normalizeHeader(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeSchoolSearchText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, '').trim()
}

async function parseUploadedWorkbook(file: File): Promise<UploadedWorkbook> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName]

    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    })

    const previewHeaders = (aoa[0] || [])
      .map((value) => normalizeHeader(value))
      .filter(Boolean)
      .slice(0, 20)

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
    })

    return {
      name: sheetName,
      rowCount: rows.length,
      previewHeaders,
    }
  })

  return {
    fileName: file.name,
    workbook,
    sheets,
  }
}

function getSheetHeaders(
  workbook?: UploadedWorkbook,
  selectedSheet?: string
): string[] {
  if (!workbook || !selectedSheet) return []

  const sheet = workbook.workbook.Sheets[selectedSheet]

  if (!sheet) return []

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  })

  return (aoa[0] || []).map(normalizeHeader).filter(Boolean)
}

export default function UploadStep() {
  const {
    taskName,
    year,
    defaultDataSource,
    manualSchoolName,
    scoreWorkbook,
    scoreSheetName,
    planWorkbook,
    planSheetName,
    setTaskMeta,
    setWorkbook,
    setSheetName,
    resetTask,
  } = useTaskStore()

  const { resetPreview } = usePreviewStore()
  const { validSchoolNames } = useRuleCenterStore()

  const schoolNameOptions = useMemo(() => {
    const keyword = normalizeSchoolSearchText(manualSchoolName)

    return validSchoolNames
      .filter((name) => {
        const cleanName = normalizeSchoolSearchText(name)

        return !keyword || cleanName.includes(keyword)
      })
      .slice(0, 30)
      .map((name) => ({
        value: name,
        label: name,
      }))
  }, [manualSchoolName, validSchoolNames])

  const scoreHeaders = useMemo(
    () => getSheetHeaders(scoreWorkbook, scoreSheetName),
    [scoreWorkbook, scoreSheetName]
  )

  const planHeaders = useMemo(
    () => getSheetHeaders(planWorkbook, planSheetName),
    [planWorkbook, planSheetName]
  )

  const planValidation = useMemo(() => {
    if (!planHeaders.length) return undefined

    return validateUploadedHeaders(planHeaders, REQUIRED_PLAN_FIELDS)
  }, [planHeaders])

  const handleScoreUpload = async (file: File) => {
    const uploaded = await parseUploadedWorkbook(file)

    setWorkbook('score', uploaded)

    const firstSheetName = uploaded.sheets?.[0]?.name

    if (firstSheetName) {
      setSheetName('score', firstSheetName)
      message.success(
        `原始专业分文件已上传：${file.name}。该文件不强制校验固定字段，请在第二步完成字段映射。`
      )
    } else {
      message.warning(`原始专业分文件已上传，但未识别到 Sheet：${file.name}`)
    }
  }

  const handlePlanUpload = async (file: File) => {
    const uploaded = await parseUploadedWorkbook(file)

    setWorkbook('plan', uploaded)

    const firstSheetName = uploaded.sheets?.[0]?.name

    if (firstSheetName) {
      setSheetName('plan', firstSheetName)

      const headers = getSheetHeaders(uploaded, firstSheetName)
      const validation = validateUploadedHeaders(headers, REQUIRED_PLAN_FIELDS)

      if (validation.isValid) {
        message.success(`招生计划文件已上传，字段校验通过：${file.name}`)
      } else {
        message.warning(
          `招生计划文件已上传，但缺少字段：${validation.missingFields.join('、')}`
        )
      }
    } else {
      message.warning(`招生计划文件已上传，但未识别到 Sheet：${file.name}`)
    }
  }

  const handleResetPage = () => {
    confirmToolReset({
      title: '确认重置专业分模板智能填充？',
      content:
        '将清空已上传文件、Sheet 选择、字段映射、处理预览和异常人工匹配记录，并清理工具运行缓存。规则中心规则不会被删除。',
      successMessage: '已重置专业分模板智能填充数据和运行缓存',
      onReset: () => {
        resetTask()
        resetPreview()
      },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        title="基础信息"
        extra={
          <Button danger onClick={handleResetPage}>
            重置
          </Button>
        }
        style={{ borderRadius: 12 }}
      >
        <Row gutter={16}>
          <Col span={7}>
            <Space direction="vertical" style={{ width: '100%' }} size={6}>
              <Text>任务名称</Text>
              <Input
                value={taskName}
                onChange={(e) => setTaskMeta({ taskName: e.target.value })}
                placeholder="请输入任务名称"
              />
            </Space>
          </Col>

          <Col span={3}>
            <Space direction="vertical" style={{ width: '100%' }} size={6}>
              <Text>招生年份</Text>
              <Select
                value={year}
                onChange={(value) => setTaskMeta({ year: value })}
                options={YEAR_OPTIONS.map((item) => ({
                  label: item,
                  value: item,
                }))}
              />
            </Space>
          </Col>

          <Col span={6}>
            <Space direction="vertical" style={{ width: '100%' }} size={6}>
              <Text>默认数据来源</Text>
              <Select
                value={defaultDataSource}
                onChange={(value) => setTaskMeta({ defaultDataSource: value })}
                style={{ width: '100%' }}
                popupMatchSelectWidth={false}
                options={DATA_SOURCE_OPTIONS.map((item) => ({
                  label: item,
                  value: item,
                }))}
              />
            </Space>
          </Col>

          <Col span={8}>
            <Space direction="vertical" style={{ width: '100%' }} size={6}>
              <Text>学校名称（选填）</Text>
              <AutoComplete
                value={manualSchoolName}
                options={schoolNameOptions}
                onChange={(value) => setTaskMeta({ manualSchoolName: value })}
                onSelect={(value) => setTaskMeta({ manualSchoolName: value })}
                filterOption={false}
                placeholder="输入学校关键词"
                style={{ width: '100%' }}
              />
            </Space>
          </Col>

        </Row>

        <div style={{ marginTop: 12 }}>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            原始专业分数据支持随机表头，不要求直接符合最终导出模板。请先上传文件，再在第二步“字段映射”中完成原始字段与目标字段的对应关系。
          </Paragraph>
        </div>
      </Card>

      <Row gutter={16}>
        <Col span={12}>
          <FileUploadCard
            title="原始专业分数据上传"
            workbook={scoreWorkbook}
            selectedSheet={scoreSheetName}
            onSheetChange={(sheetName) => setSheetName('score', sheetName)}
            onUpload={handleScoreUpload}
          />
        </Col>

        <Col span={12}>
          <FileUploadCard
            title="招生计划数据上传"
            workbook={planWorkbook}
            selectedSheet={planSheetName}
            validation={planValidation}
            onSheetChange={(sheetName) => setSheetName('plan', sheetName)}
            onUpload={handlePlanUpload}
          />
        </Col>
      </Row>

      <Card title="上传结果检查" style={{ borderRadius: 12 }}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          {scoreWorkbook ? (
            <Alert
              type="success"
              showIcon
              message="原始专业分数据已上传"
              description={`已识别 ${scoreHeaders.length} 个表头字段。原始专业分来源随机性较强，不做固定字段强校验，请在第二步字段映射中选择对应关系。`}
            />
          ) : (
            <Alert
              type="info"
              showIcon
              message="尚未上传原始专业分数据"
            />
          )}

          {planValidation ? (
            planValidation.isValid ? (
              <Alert
                type="success"
                showIcon
                message="招生计划数据字段校验通过"
                description={`已识别 ${planValidation.totalColumns} 个字段，关键字段完整。`}
              />
            ) : (
              <Alert
                type="warning"
                showIcon
                message="招生计划数据字段不完整"
                description={`缺失字段：${planValidation.missingFields.join('、')}`}
              />
            )
          ) : (
            <Alert
              type="info"
              showIcon
              message="尚未上传招生计划数据"
            />
          )}
        </Space>
      </Card>
    </div>
  )
}