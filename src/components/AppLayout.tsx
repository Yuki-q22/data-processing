import { Layout, Steps, Typography } from 'antd'
import type { ReactNode } from 'react'

const { Header, Sider, Content } = Layout
const { Title, Text } = Typography

type AppLayoutProps = {
  current: number
  onStepChange?: (step: number) => void
  children: ReactNode
}

const items = [
  { title: '上传文件' },
  { title: '字段映射' },
  { title: '规则配置' },
  { title: '处理预览' },
  { title: '异常处理' },
  { title: '导出结果' },
]

export default function AppLayout({ current, children }: AppLayoutProps) {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 24px',
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          专业分模板智能填充平台
        </Title>
        <Text className="muted">React 初始化骨架版</Text>
      </Header>

      <Layout>
        <Sider width={240} theme="light" style={{ borderRight: '1px solid #f0f0f0', padding: 16 }}>
          <Steps direction="vertical" current={current} items={items} />
        </Sider>

        <Content style={{ padding: 24 }}>{children}</Content>
      </Layout>
    </Layout>
  )
}