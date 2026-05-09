import { Card, Col, Row, Table, Tabs, Tag } from 'antd'
import { useRuleStore } from '../stores/ruleStore'
import { useRuleCenterStore } from '../stores/ruleCenterStore'

export default function RuleStep() {
  const { provinceRules, categoryRules, batchRules } = useRuleStore()
  const { provinceCategoryBatchRules, controlLineRules } = useRuleCenterStore()

  const toDataSource = (obj: Record<string, string>) =>
    Object.entries(obj).map(([from, to]) => ({
      key: from,
      from,
      to,
    }))

  const provinceBatchData = provinceCategoryBatchRules.map((rule) => ({
    key: `${rule.year}_${rule.province}`,
    year: rule.year,
    province: rule.province,
    categoryType: rule.categoryType,
    batches: rule.batches.join('、'),
  }))

  const controlLineData = controlLineRules.map((rule) => ({
    key: `${rule.year}_${rule.province}`,
    year: rule.year,
    province: rule.province,
    categories: rule.categories.join('、'),
    batches: rule.batches.join('、'),
  }))

  const simpleColumns = [
    { title: '原始值', dataIndex: 'from', key: 'from' },
    { title: '目标值', dataIndex: 'to', key: 'to' },
  ]

  const batchColumns = [
    { title: '年份', dataIndex: 'year', key: 'year', width: 90 },
    { title: '省份', dataIndex: 'province', key: 'province', width: 120 },
    {
      title: '科类制度',
      dataIndex: 'categoryType',
      key: 'categoryType',
      width: 160,
      render: (value: string) => <Tag color="blue">{value}</Tag>,
    },
    { title: '现行批次表', dataIndex: 'batches', key: 'batches' },
  ]

  const controlLineColumns = [
    { title: '年份', dataIndex: 'year', key: 'year', width: 90 },
    { title: '省份', dataIndex: 'province', key: 'province', width: 120 },
    { title: '省控线科类', dataIndex: 'categories', key: 'categories', width: 260 },
    { title: '省控线批次', dataIndex: 'batches', key: 'batches' },
  ]

  return (
    <Card style={{ borderRadius: 12 }}>
      <Tabs
        items={[
          {
            key: 'province',
            label: '省份规则',
            children: (
              <Table
                columns={simpleColumns}
                dataSource={toDataSource(provinceRules)}
                pagination={false}
              />
            ),
          },
          {
            key: 'category',
            label: '科类标准化',
            children: (
              <Table
                columns={simpleColumns}
                dataSource={toDataSource(categoryRules)}
                pagination={false}
              />
            ),
          },
          {
            key: 'batch',
            label: '批次标准化',
            children: (
              <Table
                columns={simpleColumns}
                dataSource={toDataSource(batchRules)}
                pagination={false}
              />
            ),
          },
          {
            key: 'provinceBatch',
            label: '省份科类批次',
            children: (
              <Table
                columns={batchColumns}
                dataSource={provinceBatchData}
                pagination={{ pageSize: 20 }}
              />
            ),
          },
          {
            key: 'controlLine',
            label: '省控线科类批次',
            children: (
              <Table
                columns={controlLineColumns}
                dataSource={controlLineData}
                pagination={{ pageSize: 20 }}
              />
            ),
          },
        ]}
      />

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card size="small" title="说明">
            本页展示省份标准化、科类标准化、批次标准化，以及规则中心当前加载的多年份省份科类批次和省控线科类批次。23、24、25、26 年规则均可通过规则中心导入或恢复内置规则。
          </Card>
        </Col>
      </Row>
    </Card>
  )
}
