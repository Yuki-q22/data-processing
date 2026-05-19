import { Button, Layout, Menu, Modal, Typography } from 'antd'
import { useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import readmeText from '../README.md?raw'
import {
  DEFAULT_MENU_KEY,
  MENU_GROUPS,
  MENU_KEYS,
  README_NAV_ITEMS,
  TOOL_BY_KEY,
  TOOL_DEFINITIONS,
  type MenuGroupKey,
  type MenuKey,
} from './config/toolRegistry'

const { Header, Content, Sider } = Layout
const { Title, Text } = Typography

export default function App() {
  const [activeKey, setActiveKey] = useState<MenuKey>(DEFAULT_MENU_KEY)
  const [openKeys, setOpenKeys] = useState<MenuGroupKey[]>(['group-core', 'group-tools', 'group-peak'])
  const readmeContentRef = useRef<HTMLDivElement | null>(null)

  const content = useMemo(() => {
    const ActiveComponent = TOOL_BY_KEY[activeKey]?.Component ?? TOOL_BY_KEY[DEFAULT_MENU_KEY].Component
    return <ActiveComponent />
  }, [activeKey])

  const menuItems = useMemo(
    () =>
      MENU_GROUPS.map((group) => ({
        key: group.key,
        label: group.label,
        children: TOOL_DEFINITIONS.filter((tool) => tool.menuGroup === group.key).map((tool) => ({
          key: tool.key,
          icon: tool.icon,
          label: tool.title,
        })),
      })),
    []
  )

  const showReadme = () => {
    const scrollToReadmeSection = (keyword: string) => {
      const container = readmeContentRef.current
      if (!container) return

      const headings = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6'))

      const target = headings.find((heading) => String(heading.textContent || '').includes(keyword))

      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      }
    }

    Modal.info({
      title: '使用规则 / README',
      width: 1100,
      icon: null,
      content: (
        <div
          style={{
            display: 'flex',
            gap: 16,
            height: '72vh',
          }}
        >
          <div
            style={{
              width: 230,
              borderRight: '1px solid var(--divider-color)',
              paddingRight: 12,
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                fontWeight: 600,
                marginBottom: 12,
                color: 'var(--text-primary)',
                fontSize: 14,
              }}
            >
              目录
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {README_NAV_ITEMS.map((item) => (
                <Button
                  key={item.id}
                  type="link"
                  size="small"
                  style={{
                    justifyContent: 'flex-start',
                    padding: 0,
                    height: 'auto',
                    whiteSpace: 'normal',
                    textAlign: 'left',
                  }}
                  onClick={() => scrollToReadmeSection(item.keyword)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>

          <div
            ref={readmeContentRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              paddingRight: 12,
              lineHeight: 1.75,
              fontSize: 13,
            }}
          >
            <ReactMarkdown>{readmeText}</ReactMarkdown>
          </div>
        </div>
      ),
    })
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={300}
        theme="light"
        style={{
          height: '100vh',
          position: 'sticky',
          top: 0,
        }}
      >
        <div
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--divider-color)' }}>
            <Title level={4} style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              数据处理工具平台
            </Title>
            <Text style={{ color: 'var(--text-tertiary)', fontSize: 13, marginTop: 4, display: 'block' }}>
              招生数据处理与校验工具集
            </Text>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            <Menu
              mode="inline"
              selectedKeys={[activeKey]}
              openKeys={openKeys}
              onOpenChange={(keys) => setOpenKeys(keys as MenuGroupKey[])}
              onClick={(e) => {
                if (MENU_KEYS.includes(e.key as MenuKey)) {
                  setActiveKey(e.key as MenuKey)
                }
              }}
              style={{ borderRight: 'none', paddingTop: 8 }}
              items={menuItems}
            />
          </div>

          <div
            style={{
              padding: '14px 20px 20px',
              borderTop: '1px solid var(--divider-color)',
            }}
          >
            <Button block type="default" onClick={showReadme}>
              使用规则 / README
            </Button>
          </div>
        </div>
      </Sider>

      <Layout>
        <Header>
          <Title level={4} style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--text-primary)' }}>
            {TOOL_BY_KEY[activeKey]?.title ?? '数据处理工具平台'}
          </Title>
        </Header>

        <Content style={{ padding: 'var(--space-6) var(--space-8)' }}>{content}</Content>
      </Layout>
    </Layout>
  )
}
