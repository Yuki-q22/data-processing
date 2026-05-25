import type { ComponentType, ExoticComponent, ReactNode } from 'react'
import FileTextOutlined from '@ant-design/icons-svg/es/asn/FileTextOutlined'
import FileSearchOutlined from '@ant-design/icons-svg/es/asn/FileSearchOutlined'
import AuditOutlined from '@ant-design/icons-svg/es/asn/AuditOutlined'
import PartitionOutlined from '@ant-design/icons-svg/es/asn/PartitionOutlined'
import ApartmentOutlined from '@ant-design/icons-svg/es/asn/ApartmentOutlined'
import TagsOutlined from '@ant-design/icons-svg/es/asn/TagsOutlined'
import SettingOutlined from '@ant-design/icons-svg/es/asn/SettingOutlined'
import PictureOutlined from '@ant-design/icons-svg/es/asn/PictureOutlined'
import ScissorOutlined from '@ant-design/icons-svg/es/asn/ScissorOutlined'
import AntIconGlyph from '../components/AntIconGlyph'
import {
  CollegeScoreTool,
  EmploymentReportImageTool,
  GroupCodeMatchTool,
  PlanCompareTool,
  ProfessionalScorePlatform,
  QuestionScreenshotTool,
  RemarkTypeExtractTool,
  RuleCenterPage,
  SegmentationCheckTool,
  XueyeqiaoTool,
} from './toolComponents'

export type MenuKey =
  | 'rule-center'
  | 'professional-score-platform'
  | 'college-score'
  | 'xueyeqiao'
  | 'segmentation-check'
  | 'group-code-match'
  | 'employment-report-image'
  | 'plan-compare'
  | 'remark-type-extract'
  | 'question-screenshot'

export type MenuGroupKey = 'group-core' | 'group-tools' | 'group-peak'

export interface MenuGroupDefinition {
  key: MenuGroupKey
  label: string
}

export interface ReadmeNavItem {
  id: string
  label: string
  keyword: string
}

export type ToolComponent = ComponentType | ExoticComponent

export interface ToolDefinition {
  key: MenuKey
  title: string
  menuGroup: MenuGroupKey
  icon: ReactNode
  Component: ToolComponent
  readme?: ReadmeNavItem
}

export const DEFAULT_MENU_KEY: MenuKey = 'rule-center'

export const MENU_GROUPS: MenuGroupDefinition[] = [
  { key: 'group-core', label: '核心配置' },
  { key: 'group-tools', label: '独立工具' },
  { key: 'group-peak', label: '高峰期数据处理' },
]

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    key: 'rule-center',
    title: '规则中心',
    menuGroup: 'group-core',
    icon: <AntIconGlyph icon={SettingOutlined} />,
    Component: RuleCenterPage,
    readme: { id: 'rule-center', label: '1. 规则中心', keyword: '1. 规则中心' },
  },
  {
    key: 'professional-score-platform',
    title: '专业分模板智能填充',
    menuGroup: 'group-tools',
    icon: <AntIconGlyph icon={FileTextOutlined} />,
    Component: ProfessionalScorePlatform,
    readme: {
      id: 'professional-score-platform',
      label: '2. 专业分模板智能填充',
      keyword: '2. 专业分模板智能填充',
    },
  },
  {
    key: 'college-score',
    title: '院校分提取',
    menuGroup: 'group-tools',
    icon: <AntIconGlyph icon={FileSearchOutlined} />,
    Component: CollegeScoreTool,
    readme: { id: 'college-score', label: '3. 院校分提取', keyword: '3. 院校分提取' },
  },
  {
    key: 'xueyeqiao',
    title: '模版转换工具',
    menuGroup: 'group-tools',
    icon: <AntIconGlyph icon={AuditOutlined} />,
    Component: XueyeqiaoTool,
    readme: { id: 'xueyeqiao', label: '4. 模版转换工具', keyword: '4. 模版转换工具' },
  },
  {
    key: 'group-code-match',
    title: '专业组代码匹配',
    menuGroup: 'group-tools',
    icon: <AntIconGlyph icon={ApartmentOutlined} />,
    Component: GroupCodeMatchTool,
    readme: { id: 'group-code-match', label: '5. 专业组代码匹配', keyword: '5. 专业组代码匹配' },
  },
  {
    key: 'employment-report-image',
    title: '就业质量报告图片提取',
    menuGroup: 'group-tools',
    icon: <AntIconGlyph icon={PictureOutlined} />,
    Component: EmploymentReportImageTool,
    readme: {
      id: 'employment-report-image',
      label: '6. 就业质量报告图片提取',
      keyword: '6. 就业质量报告图片提取',
    },
  },
  {
    key: 'plan-compare',
    title: '招生计划数据比对',
    menuGroup: 'group-tools',
    icon: <AntIconGlyph icon={ApartmentOutlined} />,
    Component: PlanCompareTool,
    readme: { id: 'plan-compare', label: '7. 招生计划数据比对', keyword: '7. 招生计划数据比对' },
  },
  {
    key: 'remark-type-extract',
    title: '备注处理',
    menuGroup: 'group-tools',
    icon: <AntIconGlyph icon={TagsOutlined} />,
    Component: RemarkTypeExtractTool,
    readme: { id: 'remark-type-extract', label: '8. 备注处理', keyword: '8. 备注处理' },
  },
  {
    key: 'question-screenshot',
    title: '高考真题题目处理',
    menuGroup: 'group-tools',
    icon: <AntIconGlyph icon={ScissorOutlined} />,
    Component: QuestionScreenshotTool,
    readme: {
      id: 'question-screenshot',
      label: '9. 高考真题题目截图',
      keyword: '9. 高考真题题目截图',
    },
  },
  {
    key: 'segmentation-check',
    title: '一分一段处理',
    menuGroup: 'group-peak',
    icon: <AntIconGlyph icon={PartitionOutlined} />,
    Component: SegmentationCheckTool,
    readme: { id: 'segmentation-check', label: '10. 一分一段处理', keyword: '10. 一分一段处理' },
  },
]

export const MENU_KEYS: MenuKey[] = TOOL_DEFINITIONS.map((tool) => tool.key)

export const TOOL_BY_KEY = Object.fromEntries(
  TOOL_DEFINITIONS.map((tool) => [tool.key, tool])
) as Record<MenuKey, ToolDefinition>

export const README_NAV_ITEMS: ReadmeNavItem[] = [
  ...TOOL_DEFINITIONS.map((tool) => tool.readme).filter((item): item is ReadmeNavItem => Boolean(item)),
  { id: 'local-dev', label: '本地运行', keyword: '本地运行' },
  { id: 'deploy', label: '部署说明', keyword: '部署说明' },
  { id: 'notice', label: '数据处理注意事项', keyword: '数据处理注意事项' },
]
