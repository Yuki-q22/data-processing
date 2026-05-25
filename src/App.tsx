import { Suspense, useMemo, useRef, useState } from 'react'
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

export default function App() {
  const [activeKey, setActiveKey] = useState<MenuKey>(DEFAULT_MENU_KEY)
  const [openKeys, setOpenKeys] = useState<MenuGroupKey[]>(['group-core', 'group-tools', 'group-peak'])
  const readmeContentRef = useRef<HTMLDivElement | null>(null)

  const content = useMemo(() => {
    const ActiveComponent = TOOL_BY_KEY[activeKey]?.Component ?? TOOL_BY_KEY[DEFAULT_MENU_KEY].Component
    return (
      <Suspense
        fallback={
          <div className="app-loading">
            <span className="app-loading-dot" />
            <span>正在加载工具...</span>
          </div>
        }
      >
        <ActiveComponent />
      </Suspense>
    )
  }, [activeKey])

  const menuItems = useMemo(
    () =>
      MENU_GROUPS.map((group) => ({
        ...group,
        tools: TOOL_DEFINITIONS.filter((tool) => tool.menuGroup === group.key),
      })),
    []
  )

  const toggleGroup = (groupKey: MenuGroupKey) => {
    setOpenKeys((current) =>
      current.includes(groupKey)
        ? current.filter((key) => key !== groupKey)
        : [...current, groupKey]
    )
  }

  const showReadme = async () => {
    const [{ default: Modal }, { default: ReactMarkdown }, { default: readmeText }] = await Promise.all([
      import('antd/es/modal'),
      import('react-markdown'),
      import('../README.md?raw'),
    ])

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
        <div className="readme-modal-layout">
          <div className="readme-modal-nav">
            <div className="readme-modal-nav-title">
              目录
            </div>

            <div className="readme-modal-nav-list">
              {README_NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  className="readme-modal-nav-button"
                  type="button"
                  onClick={() => scrollToReadmeSection(item.keyword)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div
            ref={readmeContentRef}
            className="readme-modal-content"
          >
            <ReactMarkdown>{readmeText}</ReactMarkdown>
          </div>
        </div>
      ),
    })
  }

  return (
    <div className="app-shell">
      <aside className="app-sider">
        <div className="app-sider-inner">
          <div className="app-brand">
            <h1 className="app-brand-title">
              数据处理工具平台
            </h1>
            <p className="app-brand-subtitle">
              招生数据处理与校验工具集
            </p>
          </div>

          <div className="app-menu-scroll">
            <nav className="app-menu" aria-label="工具菜单">
              {menuItems.map((group) => {
                const isOpen = openKeys.includes(group.key)

                return (
                  <div className="app-menu-group" key={group.key}>
                    <button
                      className="app-menu-group-button"
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => toggleGroup(group.key)}
                    >
                      <span>{group.label}</span>
                      <span className="app-menu-group-arrow">{isOpen ? '−' : '+'}</span>
                    </button>

                    {isOpen ? (
                      <div className="app-menu-items">
                        {group.tools.map((tool) => (
                          <button
                            key={tool.key}
                            className={`app-menu-item${activeKey === tool.key ? ' is-active' : ''}`}
                            type="button"
                            onClick={() => {
                              if (MENU_KEYS.includes(tool.key)) {
                                setActiveKey(tool.key)
                              }
                            }}
                          >
                            <span className="app-menu-item-icon">{tool.icon}</span>
                            <span className="app-menu-item-label">{tool.title}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </nav>
          </div>

          <div className="app-sidebar-footer">
            <button className="app-readme-button" type="button" onClick={() => void showReadme()}>
              使用规则 / README
            </button>
          </div>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-header">
          <h2 className="app-header-title">
            {TOOL_BY_KEY[activeKey]?.title ?? '数据处理工具平台'}
          </h2>
        </header>

        <section className="app-content">{content}</section>
      </main>
    </div>
  )
}
