import { Modal, message } from 'antd'

const PRESERVED_LOCAL_STORAGE_KEY_PATTERNS = [
  /rule.?center/i,
  /firebase/i,
  /auth/i,
]

function shouldPreserveLocalStorageKey(key: string) {
  return PRESERVED_LOCAL_STORAGE_KEY_PATTERNS.some((pattern) => pattern.test(key))
}

export function clearToolRuntimeCache() {
  try {
    sessionStorage.clear()
  } catch (error) {
    console.warn('清理 sessionStorage 失败：', error)
  }

  try {
    const keys = Array.from({ length: localStorage.length }, (_item, index) =>
      localStorage.key(index)
    ).filter((key): key is string => Boolean(key))

    keys.forEach((key) => {
      if (!shouldPreserveLocalStorageKey(key)) {
        localStorage.removeItem(key)
      }
    })
  } catch (error) {
    console.warn('清理 localStorage 工具缓存失败：', error)
  }
}

type ConfirmToolResetOptions = {
  title: string
  content?: string
  successMessage?: string
  onReset: () => void
}

export function confirmToolReset(options: ConfirmToolResetOptions) {
  Modal.confirm({
    title: options.title,
    content:
      options.content ||
      '将清空当前工具已上传文件、处理结果、筛选条件、人工操作记录，并清理浏览器中的工具运行缓存。规则中心规则不会被删除。',
    okText: '确认重置',
    cancelText: '取消',
    okType: 'danger',
    onOk: () => {
      options.onReset()
      clearToolRuntimeCache()
      message.success(options.successMessage || '已重置当前工具数据和运行缓存')
    },
  })
}

export function confirmAndResetTool(
  resetAction: () => void,
  title = '确认重置当前工具？',
) {
  confirmToolReset({
    title,
    onReset: resetAction,
  })
}