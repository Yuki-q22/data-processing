import { Button, Layout, Menu, Modal, Typography } from 'antd'
import { useMemo, useState } from 'react'
import {
  FileTextOutlined,
  FileSearchOutlined,
  AuditOutlined,
  PartitionOutlined,
  ApartmentOutlined,
  TagsOutlined,
  SettingOutlined,
  PictureOutlined,
} from '@ant-design/icons'

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

export default function App() {
  const [activeKey, setActiveKey] = useState<MenuKey>('rule-center')

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
      default:
        return <RuleCenterPage />
    }
  }, [activeKey])

  const showReadme = () => {
    Modal.info({
      title: '使用规则 / README',
      width: 760,
      content: (
        <div style={{ lineHeight: 1.8 }}>
          <p>
            1. 使用前建议先在“规则中心”上传学校名称规则、招生专业组合规则和备注招生类型规则。
          </p>
          <p>
            2. 学校名称规则用于校验各工具导出结果中的学校名称是否在规则中心范围内。
          </p>
          <p>
            3. 招生专业组合规则建议使用“专业名称 + 层次”的形式，例如：临床医学本科(普通)、大数据技术专科(高职)。
          </p>
          <p>
            4. 专业分模板智能填充需要先上传原始专业分数据和招生计划数据，再在第二步完成字段映射。
          </p>
          <p>
            5. 专业分模板智能填充、院校分提取、学业桥专业分处理、专业组代码匹配、招生计划数据比对等工具，导出结果最后会追加“学校名称校验结果”和“专业名称校验结果”。
          </p>
          <p>
            6. 学业桥专业分处理的专业校验按专业名称匹配，会自动忽略本科(普通)、本科(职业)、专科(高职)这些层次后缀。
          </p>
          <p>
            7. 各工具中的“重置”按钮只清空当前工具上传文件、处理结果、筛选条件、人工操作记录和临时缓存，不会删除规则中心规则。
          </p>
          <p>
            8. 如果导出结果中出现“未匹配”，需要优先检查规则中心规则文件中的学校名称、专业名称、层次写法是否和业务数据一致。
          </p>
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
                      label: '学业桥专业分处理',
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
                      label: '备注招生类型提取',
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
      return '学业桥专业分处理'
    case 'segmentation-check':
      return '一分一段校验'
    case 'group-code-match':
      return '专业组代码匹配'
    case 'employment-report-image':
      return '就业质量报告图片提取'
    case 'plan-compare':
      return '招生计划数据比对'
    case 'remark-type-extract':
      return '备注招生类型提取'
    default:
      return '数据处理工具平台'
  }
}