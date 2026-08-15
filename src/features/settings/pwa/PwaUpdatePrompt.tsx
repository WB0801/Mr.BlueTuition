import { usePwa } from './pwaContext'

export function PwaUpdatePrompt() {
  const { needRefresh, reloadToUpdate, dismissUpdate } = usePwa()
  if (!needRefresh) return null

  return (
    <aside className="pwa-update-prompt" aria-live="polite" aria-label="App 更新">
      <span>有新版本可用</span>
      <div>
        <button className="button button-secondary" onClick={dismissUpdate} type="button">稍后</button>
        <button className="button button-primary" onClick={() => void reloadToUpdate()} type="button">重新载入</button>
      </div>
    </aside>
  )
}

