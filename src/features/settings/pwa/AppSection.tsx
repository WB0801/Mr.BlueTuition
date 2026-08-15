import { usePwa } from './pwaContext'

export function AppSection() {
  const { isSupported, isInstalled, canInstall, isOfflineReady, statusMessage, install, checkForUpdate } = usePwa()
  const installationStatus = isInstalled
    ? '已安装'
    : canInstall
      ? '可以安装'
      : isSupported
        ? '可从浏览器加入主画面'
        : '此浏览器不支持安装'

  return (
    <section className="content-section settings-section" aria-labelledby="app-heading">
      <div>
        <h2 id="app-heading">App</h2>
        <dl className="settings-app-details">
          <div><dt>App 名称</dt><dd>蓝老师补习班</dd></div>
          <div><dt>当前版本</dt><dd>V1</dd></div>
          <div><dt>安装状态</dt><dd>{installationStatus}</dd></div>
          <div><dt>App 启动</dt><dd>{isOfflineReady ? '已准备' : isSupported ? '准备中' : '需网络开启'}</dd></div>
        </dl>
      </div>
      <div className="settings-app-actions">
        {canInstall && !isInstalled && <button className="button button-secondary" onClick={() => void install()} type="button">安装 App</button>}
        <button className="button button-secondary" disabled={!isSupported} onClick={() => void checkForUpdate()} type="button">检查更新</button>
      </div>
      {statusMessage && <p className="settings-note" role="status">{statusMessage}</p>}
    </section>
  )
}

