import { Button, Layout, Menu, Modal, Typography } from 'antd'
import { useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  FileTextOutlined,
  FileSearchOutlined,
  AuditOutlined,
  PartitionOutlined,
  ApartmentOutlined,
  TagsOutlined,
  SettingOutlined,
  PictureOutlined,
  ScissorOutlined,
} from '@ant-design/icons'
import readmeText from '../README.md?raw'

import ProfessionalScorePlatform from './pages/ProfessionalScorePlatform'
import RuleCenterPage from './pages/RuleCenterPage'
import CollegeScoreNormalTool from './pages/tools/CollegeScoreNormalTool'
import CollegeScoreArtTool from './pages/tools/CollegeScoreArtTool'
import XueyeqiaoTool from './pages/tools/XueyeqiaoTool'
import SegmentationCheckTool from './pages/tools/SegmentationCheckTool'
import GroupCodeMatchTool from './pages/tools/GroupCodeMatchTool'
import PlanCompareTool from './pages/tools/PlanCompareTool'
import EmploymentReportImageTool from './pages/tools/EmploymentReportImageTool'
import RemarkTypeExtractTool from './pages/tools/RemarkTypeExtractTool'
import QuestionScreenshotTool from './pages/tools/QuestionScreenshotTool'

const { Header, Content, Sider } = Layout
const { Title, Text } = Typography

type MenuKey =
  | 'rule-center'
  | 'professional-score-platform'
  | 'college-score-normal'
  | 'college-score-art'
  | 'xueyeqiao'
  | 'segmentation-check'
  | 'group-code-match'
  | 'employment-report-image'
  | 'plan-compare'
  | 'remark-type-extract'
  | 'question-screenshot'

const README_NAV_ITEMS = [
  { id: 'rule-center', label: '1. 规则中心', keyword: '1. 规则中心' },
  { id: 'professional-score-platform', label: '2. 专业分模板智能填充', keyword: '2. 专业分模板智能填充' },
  { id: 'college-score-normal', label: '3. 院校分提取（普通类）', keyword: '3. 院校分提取（普通类）' },
  { id: 'college-score-art', label: '4. 院校分提取（艺体类）', keyword: '4. 院校分提取（艺体类）' },
  { id: 'xueyeqiao', label: '5. 模版转换工具', keyword: '5. 模版转换工具' },
  { id: 'segmentation-check', label: '6. 一分一段校验', keyword: '6. 一分一段校验' },
  { id: 'group-code-match', label: '7. 专业组代码匹配', keyword: '7. 专业组代码匹配' },
  { id: 'plan-compare', label: '8. 招生计划数据比对', keyword: '8. 招生计划数据比对' },
  { id: 'employment-report-image', label: '9. 就业质量报告图片提取', keyword: '9. 就业质量报告图片提取' },
  { id: 'remark-type-extract', label: '10. 备注处理', keyword: '10. 备注处理' },
  { id: 'question-screenshot', label: '11. 高考真题题目截图', keyword: '11. 高考真题题目截图' },
  { id: 'local-dev', label: '本地运行', keyword: '本地运行' },
  { id: 'deploy', label: '部署说明', keyword: '部署说明' },
  { id: 'notice', label: '数据处理注意事项', keyword: '数据处理注意事项' },
]

export default function App() {
  const [activeKey, setActiveKey] = useState<MenuKey>('rule-center')
  const readmeContentRef = useRef<HTMLDivElement | null>(null)

  const content = useMemo(() => {
    switch (activeKey) {
      case 'rule-center':
        return <RuleCenterPage />
      case 'professional-score-platform':
        return <ProfessionalScorePlatform />
      case 'college-score-normal':
        return <CollegeScoreNormalTool />
      case 'college-score-art':
        return <CollegeScoreArtTool />
      case 'xueyeqiao':
        return <XueyeqiaoTool />
      case 'segmentation-check':
        return <SegmentationCheckTool />
      case 'group-code-match':
        return <GroupCodeMatchTool />
      case 'employment-report-image':
        return <EmploymentReportImageTool />
      case 'plan-compare':
        return <PlanCompareTool />
      case 'remark-type-extract':
        return <RemarkTypeExtractTool />
      case 'question-screenshot':
        return <QuestionScreenshotTool />
      default:
        return <RuleCenterPage />
    }
  }, [activeKey])

  const showReadme = () => {
  const scrollToReadmeSection = (keyword: string) => {
    const container = readmeContentRef.current
    if (!container) return

    const headings = Array.from(
      container.querySelectorAll('h1, h2, h3, h4, h5, h6')
    )

    const target = headings.find((heading) =>
      String(heading.textContent || '').includes(keyword)
    )

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
            borderRight: '1px solid #f0f0f0',
            paddingRight: 12,
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              fontWeight: 600,
              marginBottom: 10,
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
        width={270}
        theme="light"
        style={{
          borderRight: '1px solid #f0f0f0',
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
          <div style={{ padding: 20, borderBottom: '1px solid #f0f0f0' }}>
            <Title level={4} style={{ margin: 0 }}>
              数据处理工具平台
            </Title>
            <Text type="secondary">招生数据处理与校验工具集</Text>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            <Menu
              mode="inline"
              selectedKeys={[activeKey]}
              onClick={(e) => setActiveKey(e.key as MenuKey)}
              style={{ borderRight: 'none', paddingTop: 8 }}
              items={[
                {
                  type: 'group',
                  label: '核心配置',
                  children: [
                    {
                      key: 'rule-center',
                      icon: <SettingOutlined />,
                      label: '规则中心',
                    },
                  ],
                },
                {
                  type: 'divider',
                },
                {
                  type: 'group',
                  label: '独立工具',
                  children: [
                    {
                      key: 'professional-score-platform',
                      icon: <FileTextOutlined />,
                      label: '专业分模板智能填充',
                    },
                    {
                      key: 'college-score-normal',
                      icon: <FileSearchOutlined />,
                      label: '院校分提取（普通类）',
                    },
                    {
                      key: 'college-score-art',
                      icon: <FileSearchOutlined />,
                      label: '院校分提取（艺体类）',
                    },
                    {
                      key: 'xueyeqiao',
                      icon: <AuditOutlined />,
                      label: '模版转换工具',
                    },
                    {
                      key: 'segmentation-check',
                      icon: <PartitionOutlined />,
                      label: '一分一段校验',
                    },
                    {
                      key: 'group-code-match',
                      icon: <ApartmentOutlined />,
                      label: '专业组代码匹配',
                    },
                    {
                      key: 'employment-report-image',
                      icon: <PictureOutlined />,
                      label: '就业质量报告图片提取',
                    },
                    {
                      key: 'plan-compare',
                      icon: <ApartmentOutlined />,
                      label: '招生计划数据比对',
                    },
                    {
                      key: 'remark-type-extract',
                      icon: <TagsOutlined />,
                      label: '备注处理',
                    },
                    {
                      key: 'question-screenshot',
                      icon: <ScissorOutlined />,
                      label: '高考真题题目截图',
                    },
                  ],
                },
              ]}
            />
          </div>

          <div
            style={{
              padding: '12px 16px 18px',
              borderTop: '1px solid #f0f0f0',
              background: '#fff',
            }}
          >
            <Button block type="default" onClick={showReadme}>
              使用规则 / README
            </Button>
          </div>
        </div>
      </Sider>

      <Layout>
        <Header
          style={{
            background: '#fff',
            borderBottom: '1px solid #f0f0f0',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Title level={4} style={{ margin: 0 }}>
            {getPageTitle(activeKey)}
          </Title>
        </Header>

        <Content style={{ padding: 24, background: '#f5f7fa' }}>
          {content}
        </Content>
      </Layout>
    </Layout>
  )
}

function getPageTitle(key: MenuKey) {
  switch (key) {
    case 'rule-center':
      return '规则中心'
    case 'professional-score-platform':
      return '专业分模板智能填充'
    case 'college-score-normal':
      return '院校分提取（普通类）'
    case 'college-score-art':
      return '院校分提取（艺体类）'
    case 'xueyeqiao':
      return '模版转换工具'
    case 'segmentation-check':
      return '一分一段校验'
    case 'group-code-match':
      return '专业组代码匹配'
    case 'employment-report-image':
      return '就业质量报告图片提取'
    case 'plan-compare':
      return '招生计划数据比对'
    case 'remark-type-extract':
      return '备注处理'
    case 'question-screenshot':
      return '高考真题题目处理'
    default:
      return '数据处理工具平台'
  }
}