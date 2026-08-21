import { useState } from 'react'
import { usePwa } from './pwaContext'

export function PwaUpdatePrompt() {
  const [installDismissed, setInstallDismissed] = useState(false)
  const {
    canInstall,
    connectionMessage,
    dismissStatus,
    dismissUpdate,
    install,
    isInstalled,
    isOnline,
    needRefresh,
    reloadToUpdate,
    statusMessage,
  } = usePwa()

  if (needRefresh) {
    return (
      <aside className="pwa-status-prompt pwa-status-update" aria-live="polite" aria-label="App 更新">
        <span><strong>有新版本可用</strong><small>重新载入即可使用最新版。</small></span>
        <div>
          <button className="button button-secondary" onClick={dismissUpdate} type="button">稍后</button>
          <button className="button button-primary" onClick={() => void reloadToUpdate()} type="button">立即更新</button>
        </div>
      </aside>
    )
  }

  if (!isOnline) {
    return (
      <aside className="pwa-status-prompt pwa-status-offline" aria-live="assertive" aria-label="离线状态">
        <span><strong>目前离线</strong><small>可以查看已载入页面；需要网络的操作请稍后再试。</small></span>
      </aside>
    )
  }

  if (connectionMessage || statusMessage === 'App 已更新至最新版本。') {
    return (
      <aside className="pwa-status-prompt pwa-status-success" aria-live="polite">
        <span><strong>{connectionMessage || statusMessage}</strong></span>
        <button className="button button-secondary" onClick={dismissStatus} type="button">知道了</button>
      </aside>
    )
  }

  if (canInstall && !isInstalled && !installDismissed) {
    return (
      <aside className="pwa-status-prompt pwa-status-install" aria-live="polite" aria-label="安装 App">
        <span><strong>安装蓝老师补习班</strong><small>加入装置后可从主画面快速开启。</small></span>
        <div>
          <button className="button button-secondary" onClick={() => setInstallDismissed(true)} type="button">稍后</button>
          <button className="button button-primary" onClick={() => void install()} type="button">安装</button>
        </div>
      </aside>
    )
  }

  return null
}
