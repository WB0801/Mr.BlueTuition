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
    phase,
    checking,
    applying,
    checkForUpdate,
  } = usePwa()

  if (needRefresh) {
    return (
      <aside className="pwa-status-prompt pwa-status-update" aria-live="polite" aria-label="App 更新">
        <span><strong>{applying ? '正在更新…' : '有新版本可用'}</strong><small>{statusMessage || '更新后保留当前页面。'}</small></span>
        <div>
          <button className="button button-secondary" disabled={applying} onClick={dismissUpdate} type="button">稍后</button>
          <button className="button button-primary" disabled={applying} onClick={() => void reloadToUpdate()} type="button">{applying ? '更新中…' : '立即更新'}</button>
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

  if (connectionMessage || statusMessage === 'App 已更新。' || phase === 'error' || phase === 'checking' || phase === 'preparing') {
    return (
      <aside className={`pwa-status-prompt ${phase === 'error' ? 'pwa-status-error' : checking ? 'pwa-status-update' : 'pwa-status-success'}`} aria-live="polite">
        <span><strong>{connectionMessage || statusMessage}</strong></span>
        <div>{phase === 'error' && <button className="button button-primary" onClick={() => void checkForUpdate()} type="button">重试</button>}
        <button className="button button-secondary" disabled={checking} onClick={dismissStatus} type="button">知道了</button></div>
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
