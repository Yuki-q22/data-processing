import { Card, Table, Tabs, Typography } from 'antd'
import { useRuleStore } from '../stores/ruleStore'

const { Paragraph } = Typography

export default function RuleStep() {
  const provinceRules = useRuleStore((state) => state.provinceRules)
  const categoryRules = useRuleStore((state) => state.categoryRules)

  const toDataSource = (obj: Record<string, string>) =>
    Object.entries(obj).map(([from, to]) => ({
      key: from,
      from,
      to,
    }))

  const simpleColumns = [
    { title: '原始值', dataIndex: 'from', key: 'from' },
    { title: '目标值', dataIndex: 'to', key: 'to' },
  ]

  return (
    <Card>
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
        ]}
      />

      <Card size="small" title="说明" style={{ marginTop: 16 }}>
        <Paragraph style={{ marginBottom: 0 }}>
          本页只展示专业分模板智能填充流程中仍需在本地查看的省份标准化和科类标准化规则。
          批次标准化、省份科类批次、省控线科类批次已统一移到左侧“规则中心”维护，避免同一规则在两个入口重复展示。
        </Paragraph>
      </Card>
    </Card>
  )
}
