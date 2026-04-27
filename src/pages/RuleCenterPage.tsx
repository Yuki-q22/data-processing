import { useEffect, useMemo, useState } from 'react'
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
  Statistic,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import { GoogleOutlined, InboxOutlined } from '@ant-design/icons'
import {
  useRuleCenterStore,
  type RemarkTypeRule,
} from '../stores/ruleCenterStore'
import { auth } from '../lib/firebase'

const { Dragger } = Upload
const { Paragraph, Text, Title } = Typography
const { TextArea, Password } = Input

type PreviewRow = {
  key: string
  value: string
}

export default function RuleCenterPage() {
  console.log('当前UID =', auth.currentUser?.uid)

  const {
    validSchoolNames,
    validMajorCombos,
    schoolRuleFileName,
    majorRuleFileName,
    remarkTypeRules,
    remarkRuleFileName,
    exclusionKeywords,

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

    clearSchoolRules,
    clearMajorRules,

    addRemarkTypeRule,
    updateRemarkTypeRule,
    removeRemarkTypeRule,
    resetRemarkTypeRules,

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

  useEffect(() => {
    setExclusionDraft(exclusionKeywords.join('\n'))
  }, [exclusionKeywords])

  useEffect(() => {
    setRemarkRuleDrafts(remarkTypeRules)
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

  const updateRemarkRuleDraft = (
    id: string,
    patch: Partial<RemarkTypeRule>
  ) => {
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

    if (!hasChanged) return

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

  const remarkColumns = [
    {
      title: '备注查找字段',
      dataIndex: 'keyword',
      key: 'keyword',
      width: 260,
      render: (_: string, record: RemarkTypeRule) => (
        <Input
          disabled={!isAdminUser || savingRemarkRuleIds[record.id]}
          value={record.keyword}
          placeholder="如：国家专项"
          onChange={(e) =>
            updateRemarkRuleDraft(record.id, { keyword: e.target.value })
          }
          onBlur={() => saveRemarkRuleDraft(record.id)}
          onPressEnter={() => saveRemarkRuleDraft(record.id)}
        />
      ),
    },
    {
      title: '输出招生类型',
      dataIndex: 'outputType',
      key: 'outputType',
      width: 260,
      render: (_: string, record: RemarkTypeRule) => (
        <Input
          disabled={!isAdminUser || savingRemarkRuleIds[record.id]}
          value={record.outputType}
          placeholder="如：国家专项计划"
          onChange={(e) =>
            updateRemarkRuleDraft(record.id, { outputType: e.target.value })
          }
          onBlur={() => saveRemarkRuleDraft(record.id)}
          onPressEnter={() => saveRemarkRuleDraft(record.id)}
        />
      ),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 120,
      render: (_: number, record: RemarkTypeRule) => (
        <InputNumber
          disabled={!isAdminUser || savingRemarkRuleIds[record.id]}
          min={1}
          style={{ width: '100%' }}
          value={record.priority}
          onChange={(value) =>
            updateRemarkRuleDraft(record.id, {
              priority: typeof value === 'number' ? value : 9999,
            })
          }
          onBlur={() => saveRemarkRuleDraft(record.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              saveRemarkRuleDraft(record.id)
            }
          }}
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: unknown, record: RemarkTypeRule) => (
        <Button
          danger
          size="small"
          disabled={!isAdminUser || savingRemarkRuleIds[record.id]}
          onClick={() => handleRemoveRemarkRule(record.id)}
        >
          删除
        </Button>
      ),
    },
  ]

  if (!authReady) {
    return (
      <Card style={{ borderRadius: 12 }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card style={{ borderRadius: 12 }}>
        <Title level={3} style={{ marginTop: 0, marginBottom: 8 }}>
          规则中心
        </Title>

        <Paragraph style={{ marginBottom: 8 }}>
          当前页面已切换为{' '}
          <Text strong>Firebase 云端实时共享规则中心</Text>
          。管理员改完规则后，其他在线页面会自动同步，不需要手动刷新。
        </Paragraph>

        {authError ? (
          <Alert
            type="error"
            showIcon
            message={`身份验证异常：${authError}`}
            style={{ marginBottom: 12 }}
          />
        ) : null}

        {currentUserEmail ? (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="当前账号">
                {currentUserEmail}
              </Descriptions.Item>

              <Descriptions.Item label="账号权限">
                {isAdminUser ? (
                  <Tag color="green">管理员</Tag>
                ) : (
                  <Tag color="blue">只读用户</Tag>
                )}

                {syncing ? (
                  <Tag color="processing">同步中</Tag>
                ) : (
                  <Tag color="success">已同步</Tag>
                )}
              </Descriptions.Item>
            </Descriptions>

            <Space wrap>
              <Button onClick={handleLogout}>退出登录</Button>

              {!isAdminUser ? (
                <Text type="secondary">
                  当前账号只有查看权限，若要编辑规则，请把该账号 UID 加入
                  Firebase 的 admins 节点。
                </Text>
              ) : null}
            </Space>
          </Space>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Alert
              type="info"
              showIcon
              message="请使用邮箱密码登录，或使用 Gmail 账号登录"
            />

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
              <Button
                type="primary"
                loading={authSubmitting}
                onClick={handleLogin}
              >
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
        )}
      </Card>

      {currentUserEmail ? (
        <>
          <Row gutter={16}>
            <Col span={6}>
              <Card style={{ borderRadius: 12 }}>
                <Statistic
                  title="学校名称规则数"
                  value={validSchoolNames.length}
                />
              </Card>
            </Col>

            <Col span={6}>
              <Card style={{ borderRadius: 12 }}>
                <Statistic
                  title="招生专业组合数"
                  value={validMajorCombos.length}
                />
              </Card>
            </Col>

            <Col span={6}>
              <Card style={{ borderRadius: 12 }}>
                <Statistic
                  title="备注招生类型规则数"
                  value={remarkTypeRules.length}
                />
              </Card>
            </Col>

            <Col span={6}>
              <Card style={{ borderRadius: 12 }}>
                <Statistic
                  title="需要核查关键词数"
                  value={exclusionKeywords.length}
                />
              </Card>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Card title="学校名称规则" style={{ borderRadius: 12 }}>
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                  <Dragger
                    disabled={!isAdminUser}
                    beforeUpload={handleImportSchoolRules}
                    showUploadList={false}
                    accept=".xlsx,.xls"
                  >
                    <p className="ant-upload-drag-icon">
                      <InboxOutlined />
                    </p>
                    <p className="ant-upload-text">上传学校名称规则文件</p>
                    <p className="ant-upload-hint">文件需包含“学校名称”列</p>
                  </Dragger>

                  <Descriptions size="small" column={1}>
                    <Descriptions.Item label="当前来源">
                      {schoolRuleFileName || '未加载'}
                    </Descriptions.Item>

                    <Descriptions.Item label="学校数量">
                      {validSchoolNames.length}
                    </Descriptions.Item>
                  </Descriptions>

                  <Button
                    danger
                    disabled={!isAdminUser}
                    onClick={handleClearSchoolRules}
                  >
                    清空学校规则
                  </Button>

                  <Divider style={{ margin: '8px 0' }} />

                  <Text strong>预览（前 50 条）</Text>

                  {schoolPreview.length === 0 ? (
                    <Text type="secondary">暂无学校名称规则</Text>
                  ) : (
                    <Table
                      rowKey="key"
                      size="small"
                      pagination={{ pageSize: 10 }}
                      columns={schoolColumns}
                      dataSource={schoolPreview}
                    />
                  )}
                </Space>
              </Card>
            </Col>

            <Col span={12}>
              <Card title="招生专业组合规则" style={{ borderRadius: 12 }}>
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                  <Dragger
                    disabled={!isAdminUser}
                    beforeUpload={handleImportMajorRules}
                    showUploadList={false}
                    accept=".xlsx,.xls"
                  >
                    <p className="ant-upload-drag-icon">
                      <InboxOutlined />
                    </p>
                    <p className="ant-upload-text">上传招生专业组合规则文件</p>
                    <p className="ant-upload-hint">文件需包含“招生专业”列</p>
                  </Dragger>

                  <Descriptions size="small" column={1}>
                    <Descriptions.Item label="当前来源">
                      {majorRuleFileName || '未加载'}
                    </Descriptions.Item>

                    <Descriptions.Item label="专业组合数量">
                      {validMajorCombos.length}
                    </Descriptions.Item>
                  </Descriptions>

                  <Button
                    danger
                    disabled={!isAdminUser}
                    onClick={handleClearMajorRules}
                  >
                    清空专业组合规则
                  </Button>

                  <Divider style={{ margin: '8px 0' }} />

                  <Text strong>预览（前 50 条）</Text>

                  {majorPreview.length === 0 ? (
                    <Text type="secondary">暂无招生专业组合规则</Text>
                  ) : (
                    <Table
                      rowKey="key"
                      size="small"
                      pagination={{ pageSize: 10 }}
                      columns={majorColumns}
                      dataSource={majorPreview}
                    />
                  )}
                </Space>
              </Card>
            </Col>
          </Row>

          <Card title="备注招生类型规则" style={{ borderRadius: 12 }}>
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Row gutter={16}>
                <Col span={12}>
                  <Descriptions size="small" column={1}>
                    <Descriptions.Item label="当前规则来源">
                      {remarkRuleFileName || '未加载'}
                    </Descriptions.Item>

                    <Descriptions.Item label="规则条数">
                      {remarkTypeRules.length}
                    </Descriptions.Item>
                  </Descriptions>
                </Col>

                <Col span={12}>
                  <Space wrap>
                    <Upload
                      disabled={!isAdminUser}
                      beforeUpload={handleImportRemarkRules}
                      showUploadList={false}
                      accept=".xlsx,.xls"
                    >
                      <Button disabled={!isAdminUser}>导入备注规则文件</Button>
                    </Upload>

                    <Button
                      type="primary"
                      disabled={!isAdminUser}
                      onClick={openAddRemarkRuleModal}
                    >
                      新增规则
                    </Button>

                    <Button
                      disabled={!isAdminUser}
                      onClick={handleResetRemarkRules}
                    >
                      恢复默认规则
                    </Button>
                  </Space>
                </Col>
              </Row>

              <Alert
                type="info"
                showIcon
                message="新增规则请点击“新增规则”后在弹窗中填写；已有规则编辑时，输入框失焦或按回车后才会写入云端。"
              />

              <Table
                rowKey="id"
                size="small"
                pagination={false}
                columns={remarkColumns}
                dataSource={remarkRuleDrafts}
                scroll={{ x: 760 }}
              />

              <Divider style={{ margin: '8px 0' }} />

              <div>
                <Text strong>需要核查关键词</Text>

                <Paragraph type="secondary" style={{ marginTop: 4 }}>
                  当前关键词：
                  {exclusionKeywords.length === 0 ? (
                    <Tag style={{ marginLeft: 8 }}>无</Tag>
                  ) : (
                    exclusionKeywords.map((word) => (
                      <Tag key={word} style={{ marginLeft: 8 }}>
                        {word}
                      </Tag>
                    ))
                  )}
                </Paragraph>

                <TextArea
                  disabled={!isAdminUser}
                  rows={4}
                  value={exclusionDraft}
                  onChange={(e) => setExclusionDraft(e.target.value)}
                  placeholder="每行一个关键词，例如：除了"
                />

                <Space style={{ marginTop: 8 }}>
                  <Button
                    type="primary"
                    disabled={!isAdminUser}
                    onClick={handleSaveExclusionKeywords}
                  >
                    保存关键词
                  </Button>
                </Space>
              </div>
            </Space>
          </Card>
        </>
      ) : null}

      <Modal
        title="新增备注招生类型规则"
        open={addRuleOpen}
        onCancel={() => setAddRuleOpen(false)}
        onOk={handleCreateRemarkRule}
        confirmLoading={creatingRemarkRule}
        okText="保存规则"
        cancelText="取消"
        destroyOnClose
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