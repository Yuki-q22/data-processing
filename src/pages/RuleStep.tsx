import { Card, Col, Row, Table, Tabs } from 'antd'
import { useRuleStore } from '../stores/ruleStore'

export default function RuleStep() {
  const {
    provinceRules,
    categoryRules,
    batchRules,
    provinceCurrentBatchDictByYear,
  } = useRuleStore()

  const toDataSource = (obj: Record<string, string>) =>
    Object.entries(obj).map(([from, to]) => ({
      key: from,
      from,
      to,
    }))

  const currentYearBatchData = Object.entries(
    provinceCurrentBatchDictByYear['2025'] || {}
  ).map(([province, batches]) => ({
    key: province,
    province,
    batches: batches.join('、'),
  }))

  const simpleColumns = [
    { title: '原始值', dataIndex: 'from', key: 'from' },
    { title: '目标值', dataIndex: 'to', key: 'to' },
  ]

  const batchColumns = [
    { title: '省份', dataIndex: 'province', key: 'province', width: 120 },
    { title: '当前批次表（2025）', dataIndex: 'batches', key: 'batches' },
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
            label: '科类规则',
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
            label: '现行批次表',
            children: (
              <Table
                columns={batchColumns}
                dataSource={currentYearBatchData}
                pagination={false}
              />
            ),
          },
        ]}
      />

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card size="small" title="说明">
            本页展示省份标准化、科类标准化、批次标准化，以及 2025 年各省现行批次表。
          </Card>
        </Col>
      </Row>
    </Card>
  )
}