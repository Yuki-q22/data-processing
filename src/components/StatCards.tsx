import { Card, Col, Row, Statistic } from 'antd'

type Props = {
  total: number
  success: number
  warning: number
  error: number
}

export default function StatCards({ total, success, warning, error }: Props) {
  return (
    <Row gutter={16}>
      <Col span={6}>
        <Card><Statistic title="总记录数" value={total} /></Card>
      </Col>
      <Col span={6}>
        <Card><Statistic title="成功匹配" value={success} /></Card>
      </Col>
      <Col span={6}>
        <Card><Statistic title="低置信度" value={warning} /></Card>
      </Col>
      <Col span={6}>
        <Card><Statistic title="异常记录" value={error} /></Card>
      </Col>
    </Row>
  )
}