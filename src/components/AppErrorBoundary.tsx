import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
}

type State = {
  error?: Error
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = {}

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 保留结构化上下文，方便生产环境接入日志服务时直接复用。
    console.error('应用渲染失败', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="app-error-boundary" role="alert">
        <h1>页面加载失败</h1>
        <p>{this.state.error.message || '发生未知错误，请刷新页面后重试。'}</p>
        <button type="button" onClick={() => window.location.reload()}>
          刷新页面
        </button>
      </main>
    )
  }
}
