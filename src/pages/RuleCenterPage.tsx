/**
 * 文件名称：规则中心页面
 *
 * 文件作用：
 * - 控制规则中心页面
 * - 管理学校名称规则、招生专业组合规则、备注招生类型规则
 * - 控制新增、编辑、删除规则的弹框和表格
 * - 支持备注招生类型规则上下拖动排序
 *
 * 常改位置：
 * - 新增规则弹框
 * - 输入框
 * - 保存按钮
 * - 规则表格
 * - 规则分类
 * - SortableRemarkRuleRow：备注规则拖拽行
 *
 * 注意：
 * - 如果输入框输入一个字就失焦，优先检查本文件中的弹框和表单状态
 * - 如果规则保存后刷新丢失，检查 src/stores/ruleCenterStore.ts 或 Firebase 服务
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Input,
  InputNumber,
  Modal,
  Row,
  Space,
  Select,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import {
  GoogleOutlined,
  HolderOutlined,
} from '@ant-design/icons'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  useRuleCenterStore,
  type RemarkTypeRule,
  type ProvinceCategoryBatchRule,
  type ControlLineRule,
} from '../stores/ruleCenterStore'

const { Paragraph, Text, Title } = Typography
const { TextArea, Password } = Input


type PreviewRow = {
  key: string
  value: string
}

export default function RuleCenterPage() {
  const {
    validSchoolNames,
    validMajorCombos,
    schoolRuleFileName,
    majorRuleFileName,
    remarkTypeRules,
    remarkRuleFileName,
    exclusionKeywords,
    provinceCategoryBatchRules,
    provinceCategoryBatchRuleFileName,
    controlLineRules,
    controlLineRuleFileName,

    currentUserEmail,
    isAdminUser,
    authReady,
    syncing,
    authError,

    login,
    loginWithGoogle,
    logout,

    importSchoolRuleFile,
    importMajorRuleFile,
    importRemarkRuleFile,
    importProvinceCategoryBatchRuleFile,
    importControlLineRuleFile,

    clearSchoolRules,
    clearMajorRules,
    resetProvinceCategoryBatchRules,
    resetControlLineRules,

    addRemarkTypeRule,
    updateRemarkTypeRule,
    removeRemarkTypeRule,
    resetRemarkTypeRules,
    reorderRemarkTypeRules,

    setExclusionKeywords,
  } = useRuleCenterStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authSubmitting, setAuthSubmitting] = useState(false)

  const [exclusionDraft, setExclusionDraft] = useState(
    exclusionKeywords.join('\n')
  )

  /**
   * 备注招生类型规则本地草稿。
   * 已有规则编辑时，输入过程只改这里，不直接写 Firebase。
   */
  const [remarkRuleDrafts, setRemarkRuleDrafts] = useState<RemarkTypeRule[]>([])

  /**
   * 正在保存的规则 ID。
   */
  const [savingRemarkRuleIds, setSavingRemarkRuleIds] = useState<
    Record<string, boolean>
  >({})

  /**
   * 正在拖拽保存排序。
   */
  const [reorderingRemarkRules, setReorderingRemarkRules] = useState(false)

  /**
   * 已在页面上修改、但还没有保存到 Firebase 的规则 ID。
   * 用 ref 防止 Firebase 实时回流覆盖用户正在输入的内容。
   */
  const dirtyRemarkRuleIdsRef = useRef<Set<string>>(new Set())
  const [dirtyRemarkRuleIds, setDirtyRemarkRuleIds] = useState<
    Record<string, boolean>
  >({})

  /**
   * 新增规则弹窗。
   * 新增规则不再先插入表格空行，避免 Firebase 实时同步导致输入框中断。
   */
  const [addRuleOpen, setAddRuleOpen] = useState(false)
  const [creatingRemarkRule, setCreatingRemarkRule] = useState(false)
  const [newRemarkRuleDraft, setNewRemarkRuleDraft] = useState({
    keyword: '',
    outputType: '',
    priority: 1,
  })

  /**
   * 多年份规则预览筛选。
   * 默认查看 2025 年，便于核对当前最常用年份；如没有 2025，则回退到全部。
   */
  const [provinceCategoryBatchYearFilter, setProvinceCategoryBatchYearFilter] =
    useState('2025')
  const [controlLineYearFilter, setControlLineYearFilter] = useState('2025')

  /**
   * 科类批次规则查看筛选。
   * 只影响页面展示，不影响规则本身。
   */
  const [activeWorkspace, setActiveWorkspace] = useState<
    'batch' | 'validation' | 'remark'
  >('remark')
  const [rulePanelTab, setRulePanelTab] = useState<'provinceBatch' | 'controlLine'>(
    'provinceBatch'
  )
  const [provinceCategoryTypeFilter, setProvinceCategoryTypeFilter] =
    useState('全部')
  const [provinceCategoryBatchKeyword, setProvinceCategoryBatchKeyword] =
    useState('')
  const [controlLineKeyword, setControlLineKeyword] = useState('')
  const [provinceCategoryBatchDetail, setProvinceCategoryBatchDetail] =
    useState<ProvinceCategoryBatchRule | null>(null)
  const [controlLineDetail, setControlLineDetail] =
    useState<ControlLineRule | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    })
  )

  useEffect(() => {
    setExclusionDraft(exclusionKeywords.join('\n'))
  }, [exclusionKeywords])

  useEffect(() => {
    setRemarkRuleDrafts((prevDrafts) => {
      if (!prevDrafts.length) return remarkTypeRules

      const prevDraftMap = new Map(prevDrafts.map((rule) => [rule.id, rule]))

      return remarkTypeRules.map((cloudRule) => {
        const dirtyDraft = prevDraftMap.get(cloudRule.id)

        if (dirtyDraft && dirtyRemarkRuleIdsRef.current.has(cloudRule.id)) {
          return dirtyDraft
        }

        return cloudRule
      })
    })
  }, [remarkTypeRules])

  const schoolPreview = useMemo<PreviewRow[]>(
    () =>
      validSchoolNames.slice(0, 50).map((name, idx) => ({
        key: `school_${idx}_${name}`,
        value: name,
      })),
    [validSchoolNames]
  )

  const majorPreview = useMemo<PreviewRow[]>(
    () =>
      validMajorCombos.slice(0, 50).map((value, idx) => ({
        key: `major_${idx}_${value}`,
        value,
      })),
    [validMajorCombos]
  )

  const provinceCategoryBatchYears = useMemo(
    () =>
      Array.from(new Set(provinceCategoryBatchRules.map((rule) => rule.year)))
        .filter(Boolean)
        .sort((a, b) => Number(b) - Number(a)),
    [provinceCategoryBatchRules]
  )

  const controlLineYears = useMemo(
    () =>
      Array.from(new Set(controlLineRules.map((rule) => rule.year)))
        .filter(Boolean)
        .sort((a, b) => Number(b) - Number(a)),
    [controlLineRules]
  )

  const provinceCategoryTypeOptions = useMemo(
    () =>
      Array.from(
        new Set(provinceCategoryBatchRules.map((rule) => rule.categoryType))
      )
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [provinceCategoryBatchRules]
  )

  const provinceCategoryBatchFiltered = useMemo(() => {
    const keyword = provinceCategoryBatchKeyword.trim()

    return provinceCategoryBatchRules.filter((rule) => {
      if (
        provinceCategoryBatchYearFilter !== '全部' &&
        rule.year !== provinceCategoryBatchYearFilter
      ) {
        return false
      }

      if (
        provinceCategoryTypeFilter !== '全部' &&
        rule.categoryType !== provinceCategoryTypeFilter
      ) {
        return false
      }

      if (!keyword) return true

      return [
        rule.year,
        rule.province,
        rule.categoryType,
        ...rule.categories,
        ...rule.batches,
      ]
        .join(' ')
        .includes(keyword)
    })
  }, [
    provinceCategoryBatchRules,
    provinceCategoryBatchYearFilter,
    provinceCategoryTypeFilter,
    provinceCategoryBatchKeyword,
  ])

  const controlLineFiltered = useMemo(() => {
    const keyword = controlLineKeyword.trim()

    return controlLineRules.filter((rule) => {
      if (controlLineYearFilter !== '全部' && rule.year !== controlLineYearFilter) {
        return false
      }

      if (!keyword) return true

      return [rule.year, rule.province, ...rule.categories, ...rule.batches]
        .join(' ')
        .includes(keyword)
    })
  }, [controlLineRules, controlLineYearFilter, controlLineKeyword])

  const provinceCategoryBatchSummary = useMemo(
    () => buildYearSummary(provinceCategoryBatchFiltered),
    [provinceCategoryBatchFiltered]
  )

  const controlLineSummary = useMemo(
    () => buildYearSummary(controlLineFiltered),
    [controlLineFiltered]
  )

  useEffect(() => {
    if (provinceCategoryBatchYearFilter === '全部') return
    if (provinceCategoryBatchYears.includes(provinceCategoryBatchYearFilter)) return

    setProvinceCategoryBatchYearFilter(
      provinceCategoryBatchYears.includes('2025') ? '2025' : '全部'
    )
  }, [provinceCategoryBatchYearFilter, provinceCategoryBatchYears])

  useEffect(() => {
    if (controlLineYearFilter === '全部') return
    if (controlLineYears.includes(controlLineYearFilter)) return

    setControlLineYearFilter(controlLineYears.includes('2025') ? '2025' : '全部')
  }, [controlLineYearFilter, controlLineYears])


  const getAuthErrorMessage = (error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error)

    if (msg.includes('auth/network-request-failed')) {
      return 'Firebase 网络连接失败：请检查当前网络是否能访问 Firebase / Google 服务，或检查 Edge 是否开启了严格跟踪防护'
    }

    if (msg.includes('auth/unauthorized-domain')) {
      return '当前域名未加入 Firebase 授权域名，请到 Firebase Authentication 的 Authorized domains 中添加 Cloudflare 域名'
    }

    return msg || '登录失败'
  }

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      message.warning('请输入邮箱和密码')
      return
    }

    setAuthSubmitting(true)

    try {
      await login(email, password)
      message.success('登录成功')
      setPassword('')
    } catch (error) {
      message.error(getAuthErrorMessage(error))
    } finally {
      setAuthSubmitting(false)
    }
  }

  const handleGoogleLogin = async () => {
    setAuthSubmitting(true)

    try {
      await loginWithGoogle()
      message.success('Gmail 登录成功')
    } catch (error) {
      message.error(getAuthErrorMessage(error))
    } finally {
      setAuthSubmitting(false)
    }
  }

  const handleLogout = async () => {
    try {
      await logout()
      message.success('已退出登录')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '退出登录失败')
    }
  }

  const handleImportSchoolRules = async (file: File) => {
    try {
      await importSchoolRuleFile(file)
      message.success(`学校名称规则已上传到云端：${file.name}`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '学校名称规则导入失败')
    }

    return false
  }

  const handleImportMajorRules = async (file: File) => {
    try {
      await importMajorRuleFile(file)
      message.success(`招生专业组合规则已上传到云端：${file.name}`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '招生专业组合规则导入失败')
    }

    return false
  }

  const handleImportRemarkRules = async (file: File) => {
    try {
      await importRemarkRuleFile(file)
      message.success(`备注招生类型规则已上传到云端：${file.name}`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '备注招生类型规则导入失败')
    }

    return false
  }


  const handleImportProvinceCategoryBatchRules = async (file: File) => {
    try {
      await importProvinceCategoryBatchRuleFile(file)
      message.success(`省份科类批次规则已上传到云端：${file.name}`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '省份科类批次规则导入失败')
    }

    return false
  }

  const handleImportControlLineRules = async (file: File) => {
    try {
      await importControlLineRuleFile(file)
      message.success(`省控线科类批次规则已上传到云端：${file.name}`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '省控线科类批次规则导入失败')
    }

    return false
  }

  const handleResetProvinceCategoryBatchRules = async () => {
    try {
      await resetProvinceCategoryBatchRules()
      message.success('已恢复内置省份科类批次规则')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '恢复省份科类批次规则失败')
    }
  }

  const handleResetControlLineRules = async () => {
    try {
      await resetControlLineRules()
      message.success('已恢复内置省控线科类批次规则')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '恢复省控线科类批次规则失败')
    }
  }

  const handleClearSchoolRules = async () => {
    try {
      await clearSchoolRules()
      message.success('学校名称规则已清空')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '清空学校规则失败')
    }
  }

  const handleClearMajorRules = async () => {
    try {
      await clearMajorRules()
      message.success('招生专业组合规则已清空')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '清空专业组合规则失败')
    }
  }

  const openAddRemarkRuleModal = () => {
    const nextPriority =
      Math.max(
        0,
        ...remarkRuleDrafts.map((rule) =>
          typeof rule.priority === 'number' ? rule.priority : 0
        )
      ) + 1

    setNewRemarkRuleDraft({
      keyword: '',
      outputType: '',
      priority: nextPriority,
    })

    setAddRuleOpen(true)
  }

  const handleCreateRemarkRule = async () => {
    const keyword = newRemarkRuleDraft.keyword.trim()
    const outputType = newRemarkRuleDraft.outputType.trim()
    const priority =
      typeof newRemarkRuleDraft.priority === 'number' &&
      !Number.isNaN(newRemarkRuleDraft.priority)
        ? newRemarkRuleDraft.priority
        : 9999

    if (!keyword) {
      message.warning('请输入备注查找字段')
      return
    }

    if (!outputType) {
      message.warning('请输入输出招生类型')
      return
    }

    setCreatingRemarkRule(true)

    try {
      await addRemarkTypeRule({
        keyword,
        outputType,
        priority,
      })

      message.success('已新增备注招生类型规则')
      setAddRuleOpen(false)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '新增规则失败')
    } finally {
      setCreatingRemarkRule(false)
    }
  }

  const handleResetRemarkRules = async () => {
    try {
      await resetRemarkTypeRules()
      message.success('已恢复默认备注招生类型规则')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '恢复默认规则失败')
    }
  }

  const handleRemoveRemarkRule = async (id: string) => {
    try {
      await removeRemarkTypeRule(id)
      message.success('规则已删除')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除规则失败')
    }
  }

  const clearDirtyRemarkRule = (id: string) => {
    dirtyRemarkRuleIdsRef.current.delete(id)

    setDirtyRemarkRuleIds((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const updateRemarkRuleDraft = (
    id: string,
    patch: Partial<RemarkTypeRule>
  ) => {
    dirtyRemarkRuleIdsRef.current.add(id)

    setDirtyRemarkRuleIds((prev) => ({
      ...prev,
      [id]: true,
    }))

    setRemarkRuleDrafts((prev) =>
      prev.map((rule) =>
        rule.id === id
          ? {
              ...rule,
              ...patch,
            }
          : rule
      )
    )
  }

  const saveRemarkRuleDraft = async (id: string) => {
    if (!isAdminUser) return
    if (savingRemarkRuleIds[id]) return

    const draft = remarkRuleDrafts.find((rule) => rule.id === id)
    const original = remarkTypeRules.find((rule) => rule.id === id)

    if (!draft || !original) return

    const nextKeyword = draft.keyword.trim()
    const nextOutputType = draft.outputType.trim()
    const nextPriority =
      typeof draft.priority === 'number' && !Number.isNaN(draft.priority)
        ? draft.priority
        : 9999

    const hasChanged =
      nextKeyword !== original.keyword ||
      nextOutputType !== original.outputType ||
      nextPriority !== original.priority

    if (!hasChanged) {
      clearDirtyRemarkRule(id)
      return
    }

    if (!nextKeyword) {
      message.warning('备注查找字段不能为空')
      return
    }

    if (!nextOutputType) {
      message.warning('输出招生类型不能为空')
      return
    }

    setSavingRemarkRuleIds((prev) => ({
      ...prev,
      [id]: true,
    }))

    try {
      await updateRemarkTypeRule(id, {
        keyword: nextKeyword,
        outputType: nextOutputType,
        priority: nextPriority,
      })

      clearDirtyRemarkRule(id)
      message.success('规则已保存')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新规则失败')
    } finally {
      setSavingRemarkRuleIds((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }

  const handleRemarkRuleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (!isAdminUser) return
    if (!over || active.id === over.id) return

    if (Object.keys(dirtyRemarkRuleIds).length > 0) {
      message.warning('当前有未保存的规则，请先保存后再拖动排序')
      return
    }

    const activeId = String(active.id)
    const overId = String(over.id)

    const oldIndex = remarkRuleDrafts.findIndex((rule) => rule.id === activeId)
    const newIndex = remarkRuleDrafts.findIndex((rule) => rule.id === overId)

    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return

    const previousDrafts = remarkRuleDrafts
    const nextDrafts = arrayMove(remarkRuleDrafts, oldIndex, newIndex).map(
      (rule, index) => ({
        ...rule,
        priority: index + 1,
      })
    )

    setRemarkRuleDrafts(nextDrafts)
    setReorderingRemarkRules(true)

    try {
      await reorderRemarkTypeRules(activeId, overId)
      message.success('规则顺序已更新')
    } catch (error) {
      setRemarkRuleDrafts(previousDrafts)
      message.error(error instanceof Error ? error.message : '规则排序失败')
    } finally {
      setReorderingRemarkRules(false)
    }
  }

  const handleSaveExclusionKeywords = async () => {
    try {
      await setExclusionKeywords(
        exclusionDraft
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean)
      )
      message.success('需要核查关键词已保存到云端')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存关键词失败')
    }
  }

  const schoolColumns = [
    {
      title: '学校名称',
      dataIndex: 'value',
      key: 'value',
    },
  ]

  const majorColumns = [
    {
      title: '招生专业组合',
      dataIndex: 'value',
      key: 'value',
    },
  ]

  if (!authReady) {
    return (
      <Card>
        <Title level={3} style={{ marginTop: 0, marginBottom: 8 }}>
          规则中心
        </Title>
        <Paragraph style={{ marginBottom: 0 }}>
          正在初始化 Firebase 身份状态和云端规则，请稍候...
        </Paragraph>
      </Card>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        background: 'var(--bg-base)',
        padding: 4,
      }}
    >
      <Card
        style={{ border: '1px solid var(--border-color)' }}
        bodyStyle={{ padding: 20 }}
      >
        <Row gutter={[16, 16]} align="middle" justify="space-between">
          <Col flex="auto">
            <Title level={3} style={{ margin: 0 }}>
              规则中心
            </Title>
            <Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
              统一维护学校、专业、备注招生类型、省份科类批次和省控线规则。
            </Paragraph>
          </Col>

          {currentUserEmail ? (
            <Col>
              <Space direction="vertical" size={6} align="end">
                <Space wrap>
                  <Tag color={isAdminUser ? 'green' : 'blue'}>
                    {isAdminUser ? '管理员' : '只读用户'}
                  </Tag>
                  <Tag color={syncing ? 'processing' : 'success'}>
                    {syncing ? '同步中' : '已同步'}
                  </Tag>
                </Space>
                <Text type="secondary">{currentUserEmail}</Text>
                <Button size="small" onClick={handleLogout}>
                  退出登录
                </Button>
              </Space>
            </Col>
          ) : null}
        </Row>

        {authError ? (
          <Alert
            type="error"
            showIcon
            message={`身份验证异常：${authError}`}
            style={{ marginTop: 14 }}
          />
        ) : null}

        {currentUserEmail && !isAdminUser ? (
          <Alert
            type="info"
            showIcon
            message="当前账号只有查看权限，规则导入、清空、新增、编辑和恢复默认规则需要管理员权限。"
            style={{ marginTop: 14 }}
          />
        ) : null}

        {!currentUserEmail ? (
          <Card
            size="small"
            style={{ marginTop: 16, background: 'var(--color-info-bg)' }}
          >
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Alert type="info" showIcon message="请登录后查看和管理云端共享规则" />
              <Input
                value={email}
                placeholder="请输入邮箱"
                onChange={(e) => setEmail(e.target.value)}
              />
              <Password
                value={password}
                placeholder="请输入密码"
                onChange={(e) => setPassword(e.target.value)}
              />
              <Space wrap>
                <Button type="primary" loading={authSubmitting} onClick={handleLogin}>
                  登录
                </Button>
                <Button
                  icon={<GoogleOutlined />}
                  loading={authSubmitting}
                  onClick={handleGoogleLogin}
                >
                  Gmail 登录
                </Button>
              </Space>
            </Space>
          </Card>
        ) : null}
      </Card>

      {currentUserEmail ? (
        <>
          <Row gutter={[12, 12]}>
            <Col xs={12} lg={6}>
              <RuleMetricCard title="学校名称规则" value={validSchoolNames.length} />
            </Col>
            <Col xs={12} lg={6}>
              <RuleMetricCard title="专业组合规则" value={validMajorCombos.length} />
            </Col>
            <Col xs={12} lg={6}>
              <RuleMetricCard title="备注招生类型" value={remarkTypeRules.length} />
            </Col>
            <Col xs={12} lg={6}>
              <RuleMetricCard
                title="科类 / 批次规则"
                value={provinceCategoryBatchRules.length + controlLineRules.length}
                hint="含省份规则和省控线规则"
              />
            </Col>
          </Row>

          <Card
            style={{ border: '1px solid var(--border-color)' }}
            bodyStyle={{ padding: 0 }}
          >
            <Row gutter={0} align="stretch">
              <Col xs={24} lg={6} xl={5}>
                <div
                  style={{
                    height: '100%',
                    padding: 16,
                    borderRight: '1px solid var(--border-color)',
                    background: 'var(--color-info-bg)',
                    borderRadius: '18px 0 0 18px',
                  }}
                >
                  <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        规则工作台
                      </Text>
                      <Title level={4} style={{ margin: '4px 0 0' }}>
                        选择要维护的规则
                      </Title>
                    </div>

                    <RuleTypeCard
                      active={activeWorkspace === 'remark'}
                      title="备注招生类型"
                      description="根据备注关键词提取招生类型。"
                      count={remarkTypeRules.length}
                      source={remarkRuleFileName || '云端默认规则'}
                      onClick={() => setActiveWorkspace('remark')}
                      />
                    <RuleTypeCard
                      active={activeWorkspace === 'batch'}
                      title="科类 / 批次"
                      description="省份科类批次、省控线科类批次。"
                      count={provinceCategoryBatchRules.length + controlLineRules.length}
                      source="按年份、省份管理"
                      onClick={() => setActiveWorkspace('batch')}
                      />
                    <RuleTypeCard
                      active={activeWorkspace === 'validation'}
                      title="学校 / 专业"
                      description="用于导出前校验学校名称和专业组合。"
                      count={validSchoolNames.length + validMajorCombos.length}
                      source="Excel 导入维护"
                      onClick={() => setActiveWorkspace('validation')}
                      />

                    <Divider style={{ margin: '4px 0' }} />

                    <Space direction="vertical" size={6} style={{ width: '100%' }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        当前数据量
                      </Text>
                      <Space wrap size={[6, 6]}>
                        <Tag>学校 {validSchoolNames.length}</Tag>
                        <Tag>专业 {validMajorCombos.length}</Tag>
                        <Tag>备注 {remarkTypeRules.length}</Tag>
                        <Tag>批次 {provinceCategoryBatchRules.length}</Tag>
                        <Tag>省控线 {controlLineRules.length}</Tag>
                      </Space>
                    </Space>
                  </Space>
                </div>
              </Col>

              <Col xs={24} lg={18} xl={19}>
                <div style={{ padding: 18 }}>
                  {activeWorkspace === 'batch' ? (
                    <Space direction="vertical" style={{ width: '100%' }} size={14}>
                      <Row gutter={[12, 12]} align="middle" justify="space-between">
                        <Col>
                          <Title level={4} style={{ margin: 0 }}>
                            科类 / 批次规则
                          </Title>
                          <Text type="secondary">
                            默认只看一种规则，先选规则类型，再筛年份、省份、科类或批次。
                          </Text>
                        </Col>
                        <Col>
                          <Space.Compact>
                            <Button
                              type={rulePanelTab === 'provinceBatch' ? 'primary' : 'default'}
                              onClick={() => setRulePanelTab('provinceBatch')}
                            >
                              省份科类批次
                            </Button>
                            <Button
                              type={rulePanelTab === 'controlLine' ? 'primary' : 'default'}
                              onClick={() => setRulePanelTab('controlLine')}
                            >
                              省控线规则
                            </Button>
                          </Space.Compact>
                        </Col>
                      </Row>

                      <Row gutter={[12, 12]}>
                        <Col xs={24} md={8}>
                          <RuleMetricCard
                            title="当前规则"
                            value={
                              rulePanelTab === 'provinceBatch'
                                ? provinceCategoryBatchRules.length
                                : controlLineRules.length
                            }
                            hint={rulePanelTab === 'provinceBatch' ? '省份科类批次' : '省控线科类批次'}
                          />
                        </Col>
                        <Col xs={24} md={8}>
                          <RuleMetricCard
                            title="当前筛选"
                            value={
                              rulePanelTab === 'provinceBatch'
                                ? provinceCategoryBatchFiltered.length
                                : controlLineFiltered.length
                            }
                            hint="表格展示数量"
                          />
                        </Col>
                        <Col xs={24} md={8}>
                          <RuleMetricCard
                            title="规则来源"
                            value={
                              rulePanelTab === 'provinceBatch'
                                ? provinceCategoryBatchRuleFileName
                                  ? '云端'
                                  : '内置'
                                : controlLineRuleFileName
                                  ? '云端'
                                  : '内置'
                            }
                            hint={
                              rulePanelTab === 'provinceBatch'
                                ? provinceCategoryBatchRuleFileName || '内置默认规则'
                                : controlLineRuleFileName || '内置默认规则'
                            }
                          />
                        </Col>
                      </Row>

                      <Card
                        size="small"
                        style={{ background: 'var(--bg-sunken)' }}
                        bodyStyle={{ padding: 12 }}
                      >
                        {rulePanelTab === 'provinceBatch' ? (
                          <Row gutter={[10, 10]} align="middle">
                            <Col xs={24} md={5}>
                              <Select
                                style={{ width: '100%' }}
                                value={provinceCategoryBatchYearFilter}
                                onChange={setProvinceCategoryBatchYearFilter}
                                options={[
                                  { label: '全部年份', value: '全部' },
                                  ...provinceCategoryBatchYears.map((year) => ({
                                    label: `${year} 年`,
                                    value: year,
                                  })),
                                ]}
                              />
                            </Col>
                            <Col xs={24} md={6}>
                              <Select
                                style={{ width: '100%' }}
                                value={provinceCategoryTypeFilter}
                                onChange={setProvinceCategoryTypeFilter}
                                options={[
                                  { label: '全部科类制度', value: '全部' },
                                  ...provinceCategoryTypeOptions.map((item) => ({
                                    label: item,
                                    value: item,
                                  })),
                                ]}
                              />
                            </Col>
                            <Col xs={24} md={7}>
                              <Input.Search
                                allowClear
                                value={provinceCategoryBatchKeyword}
                                placeholder="搜索省份、科类、批次"
                                onChange={(e) => setProvinceCategoryBatchKeyword(e.target.value)}
                              />
                            </Col>
                            <Col xs={24} md={6}>
                              <Space wrap style={{ justifyContent: 'flex-end', width: '100%' }}>
                                <Upload
                                  disabled={!isAdminUser}
                                  beforeUpload={handleImportProvinceCategoryBatchRules}
                                  showUploadList={false}
                                  accept=".xlsx,.xls"
                                >
                                  <Button disabled={!isAdminUser}>导入</Button>
                                </Upload>
                                <Button
                                  disabled={!isAdminUser}
                                  onClick={handleResetProvinceCategoryBatchRules}
                                >
                                  恢复内置
                                </Button>
                              </Space>
                            </Col>
                          </Row>
                        ) : (
                          <Row gutter={[10, 10]} align="middle">
                            <Col xs={24} md={5}>
                              <Select
                                style={{ width: '100%' }}
                                value={controlLineYearFilter}
                                onChange={setControlLineYearFilter}
                                options={[
                                  { label: '全部年份', value: '全部' },
                                  ...controlLineYears.map((year) => ({
                                    label: `${year} 年`,
                                    value: year,
                                  })),
                                ]}
                              />
                            </Col>
                            <Col xs={24} md={11}>
                              <Input.Search
                                allowClear
                                value={controlLineKeyword}
                                placeholder="搜索省份、科类、批次"
                                onChange={(e) => setControlLineKeyword(e.target.value)}
                              />
                            </Col>
                            <Col xs={24} md={8}>
                              <Space wrap style={{ justifyContent: 'flex-end', width: '100%' }}>
                                <Upload
                                  disabled={!isAdminUser}
                                  beforeUpload={handleImportControlLineRules}
                                  showUploadList={false}
                                  accept=".xlsx,.xls"
                                >
                                  <Button disabled={!isAdminUser}>导入</Button>
                                </Upload>
                                <Button
                                  disabled={!isAdminUser}
                                  onClick={handleResetControlLineRules}
                                >
                                  恢复内置
                                </Button>
                              </Space>
                            </Col>
                          </Row>
                        )}
                      </Card>

                      {rulePanelTab === 'provinceBatch' ? (
                        <>
                          <RuleYearSummary title="年份分布" data={provinceCategoryBatchSummary} />
                          <Table
                            rowKey={(row) => `${row.year}_${row.province}_${row.categoryType}`}
                            size="small"
                            pagination={{ pageSize: 12, showSizeChanger: true }}
                            dataSource={provinceCategoryBatchFiltered}
                            rowClassName={(_, index) => `table-row-animate table-row-delay-${Math.min(index % 8, 7)}`}
                            columns={[
                              { title: '年份', dataIndex: 'year', key: 'year', width: 78 },
                              { title: '省份', dataIndex: 'province', key: 'province', width: 90 },
                              {
                                title: '科类制度',
                                dataIndex: 'categoryType',
                                key: 'categoryType',
                                width: 130,
                                render: (value: string) => <Tag color="blue">{value}</Tag>,
                              },
                              {
                                title: '科类',
                                key: 'categories',
                                render: (_, row) => <RuleTagList items={row.categories} max={5} />,
                              },
                              {
                                title: '批次',
                                key: 'batches',
                                render: (_, row) => <RuleTagList items={row.batches} max={5} />,
                              },
                              {
                                title: '操作',
                                key: 'action',
                                width: 84,
                                render: (_, row) => (
                                  <Button size="small" onClick={() => setProvinceCategoryBatchDetail(row)}>
                                    详情
                                  </Button>
                                ),
                              },
                            ]}
                            scroll={{ x: 900 }}
                          />
                        </>
                      ) : (
                        <>
                          <RuleYearSummary title="年份分布" data={controlLineSummary} />
                          <Table
                            rowKey={(row) => `${row.year}_${row.province}`}
                            size="small"
                            pagination={{ pageSize: 12, showSizeChanger: true }}
                            dataSource={controlLineFiltered}
                            rowClassName={(_, index) => `table-row-animate table-row-delay-${Math.min(index % 8, 7)}`}
                            columns={[
                              { title: '年份', dataIndex: 'year', key: 'year', width: 78 },
                              { title: '省份', dataIndex: 'province', key: 'province', width: 90 },
                              {
                                title: '省控线科类',
                                key: 'categories',
                                render: (_, row) => <RuleTagList items={row.categories} max={6} />,
                              },
                              {
                                title: '省控线批次',
                                key: 'batches',
                                render: (_, row) => <RuleTagList items={row.batches} max={6} />,
                              },
                              {
                                title: '操作',
                                key: 'action',
                                width: 84,
                                render: (_, row) => (
                                  <Button size="small" onClick={() => setControlLineDetail(row)}>
                                    详情
                                  </Button>
                                ),
                              },
                            ]}
                            scroll={{ x: 780 }}
                          />
                        </>
                      )}
                    </Space>
                  ) : null}

                  {activeWorkspace === 'validation' ? (
                    <Space direction="vertical" style={{ width: '100%' }} size={14}>
                      <div>
                        <Title level={4} style={{ margin: 0 }}>
                          学校 / 专业校验规则
                        </Title>
                        <Text type="secondary">
                          只保留上传入口、当前来源和前 50 条预览，减少页面噪音。
                        </Text>
                      </div>

                      <Row gutter={[14, 14]}>
                        <Col xs={24} lg={12}>
                          <Card title="学校名称规则">
                            <Space direction="vertical" style={{ width: '100%' }} size={12}>
                              <Upload
                                disabled={!isAdminUser}
                                beforeUpload={handleImportSchoolRules}
                                showUploadList={false}
                                accept=".xlsx,.xls"
                              >
                                <Button disabled={!isAdminUser} type="primary">
                                  上传学校规则
                                </Button>
                              </Upload>
                              <Descriptions size="small" column={1} bordered>
                                <Descriptions.Item label="当前来源">
                                  {schoolRuleFileName || '未加载'}
                                </Descriptions.Item>
                                <Descriptions.Item label="学校数量">
                                  {validSchoolNames.length}
                                </Descriptions.Item>
                              </Descriptions>
                              <Button danger disabled={!isAdminUser} onClick={handleClearSchoolRules}>
                                清空学校规则
                              </Button>
                              <Table
                                rowKey="key"
                                size="small"
                                pagination={{ pageSize: 10 }}
                                columns={schoolColumns}
                                dataSource={schoolPreview}
                                rowClassName={(_, index) => `table-row-animate table-row-delay-${Math.min(index % 8, 7)}`}
                              />
                            </Space>
                          </Card>
                        </Col>

                        <Col xs={24} lg={12}>
                          <Card title="招生专业组合规则">
                            <Space direction="vertical" style={{ width: '100%' }} size={12}>
                              <Upload
                                disabled={!isAdminUser}
                                beforeUpload={handleImportMajorRules}
                                showUploadList={false}
                                accept=".xlsx,.xls"
                              >
                                <Button disabled={!isAdminUser} type="primary">
                                  上传专业规则
                                </Button>
                              </Upload>
                              <Descriptions size="small" column={1} bordered>
                                <Descriptions.Item label="当前来源">
                                  {majorRuleFileName || '未加载'}
                                </Descriptions.Item>
                                <Descriptions.Item label="专业组合数量">
                                  {validMajorCombos.length}
                                </Descriptions.Item>
                              </Descriptions>
                              <Button danger disabled={!isAdminUser} onClick={handleClearMajorRules}>
                                清空专业组合规则
                              </Button>
                              <Table
                                rowKey="key"
                                size="small"
                                pagination={{ pageSize: 10 }}
                                columns={majorColumns}
                                dataSource={majorPreview}
                                rowClassName={(_, index) => `table-row-animate table-row-delay-${Math.min(index % 8, 7)}`}
                              />
                            </Space>
                          </Card>
                        </Col>
                      </Row>
                    </Space>
                  ) : null}

                  {activeWorkspace === 'remark' ? (
                    <Space direction="vertical" style={{ width: '100%' }} size={14}>
                      <Row gutter={[12, 12]} align="middle" justify="space-between">
                        <Col>
                          <Title level={4} style={{ margin: 0 }}>
                            备注招生类型规则
                          </Title>
                          <Text type="secondary">
                            编辑后按行保存；拖动左侧图标可调整优先级。
                          </Text>
                        </Col>
                        <Col>
                          <Space wrap>
                            <Upload
                              disabled={!isAdminUser}
                              beforeUpload={handleImportRemarkRules}
                              showUploadList={false}
                              accept=".xlsx,.xls"
                            >
                              <Button disabled={!isAdminUser}>导入备注规则</Button>
                            </Upload>
                            <Button type="primary" disabled={!isAdminUser} onClick={openAddRemarkRuleModal}>
                              新增规则
                            </Button>
                            <Button disabled={!isAdminUser} onClick={handleResetRemarkRules}>
                              恢复默认
                            </Button>
                          </Space>
                        </Col>
                      </Row>

                      <Card size="small" style={{ background: 'var(--bg-sunken)' }}>
                        <Descriptions size="small" column={{ xs: 1, md: 3 }}>
                          <Descriptions.Item label="当前来源">
                            {remarkRuleFileName || '未加载'}
                          </Descriptions.Item>
                          <Descriptions.Item label="规则数量">
                            {remarkRuleDrafts.length}
                          </Descriptions.Item>
                          <Descriptions.Item label="核查关键词">
                            {exclusionKeywords.length}
                          </Descriptions.Item>
                        </Descriptions>
                      </Card>

                      <div
                        className="rule-list-container"
                        style={{
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-lg)',
                          overflow: 'hidden',
                          opacity: reorderingRemarkRules ? 0.7 : 1,
                          background: 'var(--bg-surface)',
                          transition: 'opacity 0.25s var(--ease-out)',
                        }}
                      >
                        <Row
                          gutter={12}
                          align="middle"
                          style={{
                            padding: '10px 12px',
                            background: 'var(--bg-sunken)',
                            borderBottom: '1px solid var(--divider-color)',
                            fontWeight: 600,
                            fontSize: 13,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <Col flex="40px">拖动</Col>
                          <Col span={7}>备注查找字段</Col>
                          <Col span={7}>输出招生类型</Col>
                          <Col span={3}>优先级</Col>
                          <Col span={5}>操作</Col>
                        </Row>

                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={handleRemarkRuleDragEnd}
                        >
                          <SortableContext
                            items={remarkRuleDrafts.map((rule) => rule.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            {remarkRuleDrafts.map((rule) => (
                              <SortableRemarkRuleRow
                                key={rule.id}
                                rule={rule}
                                isAdminUser={isAdminUser}
                                isSaving={Boolean(savingRemarkRuleIds[rule.id])}
                                isDirty={Boolean(dirtyRemarkRuleIds[rule.id])}
                                isReordering={reorderingRemarkRules}
                                onKeywordChange={(value) =>
                                  updateRemarkRuleDraft(rule.id, { keyword: value })
                                }
                                onOutputTypeChange={(value) =>
                                  updateRemarkRuleDraft(rule.id, { outputType: value })
                                }
                                onPriorityChange={(value) =>
                                  updateRemarkRuleDraft(rule.id, {
                                    priority: typeof value === 'number' ? value : 9999,
                                  })
                                }
                                onSave={() => saveRemarkRuleDraft(rule.id)}
                                onDelete={() => handleRemoveRemarkRule(rule.id)}
                              />
                            ))}
                          </SortableContext>
                        </DndContext>

                        {remarkRuleDrafts.length === 0 ? (
                          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                            暂无备注招生类型规则
                          </div>
                        ) : null}
                      </div>

                      <Card title="需要核查关键词" size="small">
                        <Paragraph type="secondary" style={{ marginTop: 0 }}>
                          {exclusionKeywords.length === 0 ? (
                            <Tag>无</Tag>
                          ) : (
                            exclusionKeywords.map((word) => <Tag key={word}>{word}</Tag>)
                          )}
                        </Paragraph>
                        <TextArea
                          disabled={!isAdminUser}
                          rows={4}
                          value={exclusionDraft}
                          onChange={(e) => setExclusionDraft(e.target.value)}
                          placeholder="每行一个关键词，例如：除了"
                        />
                        <Button
                          type="primary"
                          disabled={!isAdminUser}
                          onClick={handleSaveExclusionKeywords}
                          style={{ marginTop: 8 }}
                        >
                          保存关键词
                        </Button>
                      </Card>
                    </Space>
                  ) : null}
                </div>
              </Col>
            </Row>
          </Card>
        </>
      ) : null}

      <RuleDetailModal
        title="省份科类批次规则详情"
        open={Boolean(provinceCategoryBatchDetail)}
        year={provinceCategoryBatchDetail?.year}
        province={provinceCategoryBatchDetail?.province}
        categoryType={provinceCategoryBatchDetail?.categoryType}
        categories={provinceCategoryBatchDetail?.categories || []}
        batches={provinceCategoryBatchDetail?.batches || []}
        onCancel={() => setProvinceCategoryBatchDetail(null)}
      />

      <RuleDetailModal
        title="省控线科类批次规则详情"
        open={Boolean(controlLineDetail)}
        year={controlLineDetail?.year}
        province={controlLineDetail?.province}
        categories={controlLineDetail?.categories || []}
        batches={controlLineDetail?.batches || []}
        onCancel={() => setControlLineDetail(null)}
      />

      <Modal
        title="新增备注招生类型规则"
        open={addRuleOpen}
        onCancel={() => setAddRuleOpen(false)}
        onOk={handleCreateRemarkRule}
        confirmLoading={creatingRemarkRule}
        okText="保存规则"
        cancelText="取消"
        destroyOnClose
        maskClosable={false}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div>
            <Text strong>备注查找字段</Text>
            <Input
              value={newRemarkRuleDraft.keyword}
              placeholder="如：国家专项"
              style={{ marginTop: 6 }}
              autoFocus
              onChange={(e) =>
                setNewRemarkRuleDraft((prev) => ({
                  ...prev,
                  keyword: e.target.value,
                }))
              }
            />
          </div>
          <div>
            <Text strong>输出招生类型</Text>
            <Input
              value={newRemarkRuleDraft.outputType}
              placeholder="如：国家专项计划"
              style={{ marginTop: 6 }}
              onChange={(e) =>
                setNewRemarkRuleDraft((prev) => ({
                  ...prev,
                  outputType: e.target.value,
                }))
              }
            />
          </div>
          <div>
            <Text strong>优先级</Text>
            <InputNumber
              min={1}
              value={newRemarkRuleDraft.priority}
              style={{ width: '100%', marginTop: 6 }}
              onChange={(value) =>
                setNewRemarkRuleDraft((prev) => ({
                  ...prev,
                  priority: typeof value === 'number' ? value : 9999,
                }))
              }
            />
          </div>
          <Alert
            type="info"
            showIcon
            message="新增规则会在点击“保存规则”后一次性写入云端，不会边输入边同步。"
          />
        </Space>
      </Modal>
    </div>
  )

}



function RuleMetricCard({
  title,
  value,
  hint,
}: {
  title: string
  value: number | string
  hint?: string
}) {
  return (
    <Card
      size="small"
      style={{
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-sm)',
      }}
      bodyStyle={{ padding: '14px 16px' }}
    >
      <Text type="secondary" style={{ fontSize: 12 }}>
        {title}
      </Text>
      <div style={{ marginTop: 6, fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>
        {value}
      </div>
      {hint ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {hint}
        </Text>
      ) : null}
    </Card>
  )
}

function RuleTypeCard({
  active,
  title,
  description,
  count,
  source,
  onClick,
}: {
  active: boolean
  title: string
  description: string
  count: number
  source: string
  onClick: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onClick()
      }}
      className={active ? 'rule-type-card rule-type-card-active' : 'rule-type-card'}
      style={{
        padding: 14,
        cursor: 'pointer',
        border: active ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
        background: active ? 'var(--color-primary-light)' : 'var(--bg-surface)',
        boxShadow: active ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: 'all 0.25s var(--ease-out)',
      }}
    >
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Text strong>{title}</Text>
          <Tag color={active ? 'blue' : 'default'}>{count} 条</Tag>
        </Space>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {description}
        </Text>
        <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
          来源：{source || '内置默认规则'}
        </Text>
      </Space>
    </div>
  )
}

type RuleSummaryItem = {
  key: string
  year: string
  count: number
}

function buildYearSummary<T extends { year: string }>(rules: T[]): RuleSummaryItem[] {
  const map = new Map<string, number>()

  rules.forEach((rule) => {
    const year = rule.year || '未知年份'
    map.set(year, (map.get(year) || 0) + 1)
  })

  return Array.from(map.entries())
    .map(([year, count]) => ({
      key: year,
      year,
      count,
    }))
    .sort((a, b) => Number(b.year) - Number(a.year))
}

function RuleYearSummary({
  title,
  data,
}: {
  title: string
  data: RuleSummaryItem[]
}) {
  if (data.length === 0) {
    return <Text type="secondary">暂无匹配规则</Text>
  }

  return (
    <div>
      <Text strong>{title}</Text>
      <Space wrap style={{ marginTop: 8, display: 'flex' }}>
        {data.map((item) => (
          <Tag key={item.key} color="processing">
            {item.year} 年：{item.count} 条
          </Tag>
        ))}
      </Space>
    </div>
  )
}

function RuleTagList({ items, max = 8 }: { items: string[]; max?: number }) {
  const visibleItems = items.slice(0, max)
  const restCount = items.length - visibleItems.length

  if (!items.length) {
    return <Text type="secondary">空</Text>
  }

  return (
    <Space size={[0, 4]} wrap>
      {visibleItems.map((item) => (
        <Tag key={item}>{item}</Tag>
      ))}
      {restCount > 0 ? <Tag color="default">+{restCount}</Tag> : null}
    </Space>
  )
}

type RuleDetailModalProps = {
  title: string
  open: boolean
  year?: string
  province?: string
  categoryType?: string
  categories: string[]
  batches: string[]
  onCancel: () => void
}

function RuleDetailModal({
  title,
  open,
  year,
  province,
  categoryType,
  categories,
  batches,
  onCancel,
}: RuleDetailModalProps) {
  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      footer={null}
      width={760}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <Descriptions size="small" bordered column={1}>
          <Descriptions.Item label="年份">{year || '-'}</Descriptions.Item>
          <Descriptions.Item label="省份">{province || '-'}</Descriptions.Item>
          {categoryType ? (
            <Descriptions.Item label="科类制度">{categoryType}</Descriptions.Item>
          ) : null}
        </Descriptions>

        <div>
          <Text strong>科类</Text>
          <div style={{ marginTop: 8 }}>
            <RuleTagList items={categories} max={999} />
          </div>
        </div>

        <div>
          <Text strong>批次</Text>
          <div style={{ marginTop: 8 }}>
            <RuleTagList items={batches} max={999} />
          </div>
        </div>
      </Space>
    </Modal>
  )
}

type SortableRemarkRuleRowProps = {
  rule: RemarkTypeRule
  isAdminUser: boolean
  isSaving: boolean
  isDirty: boolean
  isReordering: boolean
  onKeywordChange: (value: string) => void
  onOutputTypeChange: (value: string) => void
  onPriorityChange: (value: number | null) => void
  onSave: () => void
  onDelete: () => void
}

function SortableRemarkRuleRow({
  rule,
  isAdminUser,
  isSaving,
  isDirty,
  isReordering,
  onKeywordChange,
  onOutputTypeChange,
  onPriorityChange,
  onSave,
  onDelete,
}: SortableRemarkRuleRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: rule.id,
    disabled: !isAdminUser || isSaving || isReordering,
  })

  const rowStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    background: isDirty ? 'var(--color-warning-bg)' : 'var(--bg-surface)',
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
    padding: '10px 12px',
    borderBottom: '1px solid var(--divider-color)',
  }

  return (
    <Row ref={setNodeRef} gutter={12} align="middle" style={rowStyle}>
      <Col flex="40px">
        <Button
          type="text"
          size="small"
          icon={<HolderOutlined />}
          disabled={!isAdminUser || isSaving || isReordering}
          style={{ cursor: isAdminUser ? 'grab' : 'not-allowed' }}
          {...attributes}
          {...listeners}
        />
      </Col>

      <Col span={7}>
        <Input
          disabled={!isAdminUser || isSaving || isReordering}
          value={rule.keyword}
          placeholder="如：国家专项"
          onChange={(e) => onKeywordChange(e.target.value)}
        />
      </Col>

      <Col span={7}>
        <Input
          disabled={!isAdminUser || isSaving || isReordering}
          value={rule.outputType}
          placeholder="如：国家专项计划"
          onChange={(e) => onOutputTypeChange(e.target.value)}
        />
      </Col>

      <Col span={3}>
        <InputNumber
          disabled={!isAdminUser || isSaving || isReordering}
          min={1}
          style={{ width: '100%' }}
          value={rule.priority}
          onChange={onPriorityChange}
        />
      </Col>

      <Col span={5}>
        <Space size={8}>
          <Button
            size="small"
            loading={isSaving}
            disabled={!isAdminUser || !isDirty || isReordering}
            onClick={onSave}
            style={{
              background: isDirty ? 'var(--color-success)' : 'var(--bg-sunken)',
              borderColor: isDirty ? 'var(--color-success)' : 'var(--border-color-strong)',
              color: isDirty ? '#fff' : 'var(--text-tertiary)',
              fontWeight: 500,
            }}
          >
            保存
          </Button>

          <Button
            danger
            size="small"
            disabled={!isAdminUser || isSaving || isReordering}
            onClick={onDelete}
            ghost={!isAdminUser}
          >
            删除
          </Button>
        </Space>
      </Col>
    </Row>
  )
}