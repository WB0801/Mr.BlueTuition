import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps { children: ReactNode }
interface ErrorBoundaryState { hasError: boolean }

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('页面发生未预期错误', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="centered-page">
          <h1>页面暂时无法显示</h1>
          <p className="muted">请重新载入页面。如果问题持续发生，请保留目前资料并检查系统设置。</p>
          <button className="button button-primary" type="button" onClick={() => window.location.reload()}>
            重新载入
          </button>
        </main>
      )
    }

    return this.props.children
  }
}
