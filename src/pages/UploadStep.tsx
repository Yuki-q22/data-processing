import { useMemo } from 'react'
import { Alert, Card, Col, Input, Row, Select, Space, Switch, Typography, message } from 'antd'
import * as XLSX from 'xlsx'
import FileUploadCard from '../components/FileUploadCard'
import { validateUploadedHeaders } from '../modules/uploadValidation'
import { useRuleStore } from '../stores/ruleStore'
import { useTaskStore } from '../stores/taskStore'
import type { UploadedWorkbook } from '../types/workbook'

const { Paragraph, Text } = Typography

const DATA_SOURCE_OPTIONS = [
  '官方考试院',
  '大红本数据',
  '学校官网',
  '销售',
  '抓取',
  '圣达信',
  '优志愿',
  '学业桥',
]

const YEAR_OPTIONS = ['2025', '2026', '2027']

const REQUIRED_SCORE_FIELDS = [
  '学校名称',
  '省份',
  '招生科类',
  '招生专业',
  '最低分',
]

const REQUIRED_PLAN_FIELDS = [
  '招生年份',
  '省份',
  '学校名称',
  '招生科类',
  '招生批次',
  '招生专业',
  '一级层次',
]

const RECOMMENDED_PLAN_FIELDS = [
  '招生类型',
  '专业方向',
  '专业备注',
  '招生人数',
  '招生代码',
  '专业代码',
  '专业组代码',
  '专业组选科要求',
  '专业选科要求',
  '数据来源',
]

function normalizeHeader(value: unknown) {
  return String(value ?? '').trim()
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

function getSheetHeaders(workbook?: UploadedWorkbook, selectedSheet?: string): string[] {
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

function getSuggestedMissingFields(
  headers: string[],
  suggestedFields: string[],
  fieldAliases: Record<string, string[]>
) {
  if (!headers.length) return []

  const validation = validateUploadedHeaders(headers, suggestedFields, fieldAliases)
  return validation.missingFields
}

export default function UploadStep() {
  const { fieldAliases } = useRuleStore()

  const {
    taskName,
    year,
    defaultDataSource,
    enableFuzzyMatch,
    manualSchoolName,
    scoreWorkbook,
    scoreSheetName,
    planWorkbook,
    planSheetName,
    setTaskMeta,
    setWorkbook,
    setSheetName,
  } = useTaskStore()

  const scoreHeaders = useMemo(
    () => getSheetHeaders(scoreWorkbook, scoreSheetName),
    [scoreWorkbook, scoreSheetName]
  )

  const planHeaders = useMemo(
    () => getSheetHeaders(planWorkbook, planSheetName),
    [planWorkbook, planSheetName]
  )

  const scoreValidation = useMemo(() => {
    if (!scoreHeaders.length) return undefined
    return validateUploadedHeaders(scoreHeaders, REQUIRED_SCORE_FIELDS, fieldAliases)
  }, [scoreHeaders, fieldAliases])

  const planValidation = useMemo(() => {
    if (!planHeaders.length) return undefined
    return validateUploadedHeaders(planHeaders, REQUIRED_PLAN_FIELDS, fieldAliases)
  }, [planHeaders, fieldAliases])

  const recommendedPlanMissingFields = useMemo(() => {
    if (!planHeaders.length) return []
    return getSuggestedMissingFields(planHeaders, RECOMMENDED_PLAN_FIELDS, fieldAliases)
  }, [planHeaders, fieldAliases])

  const handleScoreUpload = async (file: File) => {
    const uploaded = await parseUploadedWorkbook(file)
    setWorkbook('score', uploaded)

    const firstSheetName = uploaded.sheets?.[0]?.name
    if (firstSheetName) {
      setSheetName('score', firstSheetName)
      const headers = getSheetHeaders(uploaded, firstSheetName)
      const validation = validateUploadedHeaders(headers, REQUIRED_SCORE_FIELDS, fieldAliases)

      if (validation.isValid) {
        message.success(`原始专业分文件已上传，字段校验通过：${file.name}`)
      } else {
        message.warning(
          `原始专业分文件已上传，但缺少字段：${validation.missingFields.join('、')}`
        )
      }
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
      const validation = validateUploadedHeaders(headers, REQUIRED_PLAN_FIELDS, fieldAliases)
      const suggestedMissingFields = getSuggestedMissingFields(
        headers,
        RECOMMENDED_PLAN_FIELDS,
        fieldAliases
      )

      if (validation.isValid) {
        if (suggestedMissingFields.length) {
          message.success(
            `招生计划文件已上传，关键字段校验通过。建议补充字段：${suggestedMissingFields.join('、')}`
          )
        } else {
          message.success(`招生计划文件已上传，字段校验通过：${file.name}`)
        }
      } else {
        message.warning(
          `招生计划文件已上传，但缺少字段：${validation.missingFields.join('、')}`
        )
      }
    } else {
      message.warning(`招生计划文件已上传，但未识别到 Sheet：${file.name}`)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="基础信息" style={{ borderRadius: 12 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Space direction="vertical" style={{ width: '100%' }} size={6}>
              <Text>任务名称</Text>
              <Input
                value={taskName}
                onChange={(e) => setTaskMeta({ taskName: e.target.value })}
                placeholder="请输入任务名称"
              />
            </Space>
          </Col>

          <Col span={4}>
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

          <Col span={5}>
            <Space direction="vertical" style={{ width: '100%' }} size={6}>
              <Text>默认数据来源</Text>
              <Select
                value={defaultDataSource}
                onChange={(value) => setTaskMeta({ defaultDataSource: value })}
                options={DATA_SOURCE_OPTIONS.map((item) => ({
                  label: item,
                  value: item,
                }))}
              />
            </Space>
          </Col>

          <Col span={4}>
            <Space direction="vertical" style={{ width: '100%' }} size={6}>
              <Text>学校名称（选填）</Text>
              <Input
                value={manualSchoolName}
                onChange={(e) => setTaskMeta({ manualSchoolName: e.target.value })}
                placeholder="原始文件无学校名时可手填"
              />
            </Space>
          </Col>

          <Col span={3}>
            <Space direction="vertical" style={{ width: '100%' }} size={6}>
              <Text>启用模糊匹配</Text>
              <Switch
                checked={enableFuzzyMatch}
                onChange={(checked) => setTaskMeta({ enableFuzzyMatch: checked })}
              />
            </Space>
          </Col>
        </Row>

        <div style={{ marginTop: 12 }}>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            模糊匹配用于在学校名称、专业名称、备注存在轻微差异时辅助匹配，但仍建议优先保证原始字段尽量标准。
          </Paragraph>
        </div>
      </Card>

      <Row gutter={16}>
        <Col span={12}>
          <FileUploadCard
            title="原始专业分数据上传"
            workbook={scoreWorkbook}
            selectedSheet={scoreSheetName}
            validation={scoreValidation}
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
          {scoreValidation ? (
            scoreValidation.isValid ? (
              <Alert
                type="success"
                showIcon
                message="原始专业分数据字段校验通过"
                description={`已识别 ${scoreValidation.totalColumns} 个字段，关键字段完整。`}
              />
            ) : (
              <Alert
                type="warning"
                showIcon
                message="原始专业分数据字段不完整"
                description={`缺失字段：${scoreValidation.missingFields.join('、')}`}
              />
            )
          ) : (
            <Alert type="info" showIcon message="尚未上传原始专业分数据" />
          )}

          {planValidation ? (
            planValidation.isValid ? (
              <>
                <Alert
                  type="success"
                  showIcon
                  message="招生计划数据关键字段校验通过"
                  description={`已识别 ${planValidation.totalColumns} 个字段，必需字段完整。`}
                />
                {recommendedPlanMissingFields.length ? (
                  <Alert
                    type="info"
                    showIcon
                    message="招生计划数据建议补充字段"
                    description={`建议补充字段：${recommendedPlanMissingFields.join('、')}`}
                  />
                ) : null}
              </>
            ) : (
              <Alert
                type="warning"
                showIcon
                message="招生计划数据字段不完整"
                description={`缺失字段：${planValidation.missingFields.join('、')}`}
              />
            )
          ) : (
            <Alert type="info" showIcon message="尚未上传招生计划数据" />
          )}
        </Space>
      </Card>
    </div>
  )
}