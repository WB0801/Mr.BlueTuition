import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useIsMutating } from '@tanstack/react-query'
import { UNSAFE_DataRouterContext, useBlocker, useLocation, useSearchParams } from 'react-router-dom'
import { consumeCompletedContextOperation, ContextDataState } from './contextDataState'

interface DataSection { id: string; label: string; render: (active: boolean) => ReactNode }

export function ContextDataWorkspace({ label, defaultPanel, sections }: { label: string; defaultPanel: string; sections: DataSection[] }) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const requested = params.get('panel')
  const panel = sections.some(section => section.id === requested) ? requested! : defaultPanel
  const [visited, setVisited] = useState(() => new Set([panel]))
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const setBusy = useCallback((id: string, busy: boolean) => setBusyIds(current => {
    if (current.has(id) === busy) return current
    const next = new Set(current); if (busy) next.add(id); else next.delete(id); return next
  }), [])
  const locked = useIsMutating() > 0 || busyIds.size > 0
  const dataRouter = useContext(UNSAFE_DataRouterContext)
  const positionKey = `data-panel:${location.pathname}:${panel}`
  const content = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const saved = sessionStorage.getItem(positionKey)
    if (saved !== null) {
      const frame = requestAnimationFrame(() => window.scrollTo({ top: Number(saved) || 0, behavior: 'instant' }))
      return () => cancelAnimationFrame(frame)
    }
  }, [positionKey])
  function select(nextPanel: string) {
    if (locked || panel === nextPanel) return
    sessionStorage.setItem(positionKey, String(window.scrollY))
    setVisited(current => new Set([...current, panel, nextPanel]))
    setParams(current => { const next = new URLSearchParams(current); next.set('panel', nextPanel); return next }, { state: location.state })
  }
  return <ContextDataState.Provider value={{ locked, setBusy }}>
    {dataRouter && <PendingNavigationGuard locked={locked} />}
    <div className="context-data-workspace" onClickCapture={event => {
      if (locked && (event.target as HTMLElement).closest('a, summary')) { event.preventDefault(); event.stopPropagation() }
    }}>
      <nav className="context-data-tabs" aria-label={label}>
        {sections.map(section => <button type="button" key={section.id} aria-pressed={panel === section.id} aria-controls={`data-panel-${section.id}`} disabled={locked} onClick={() => select(section.id)}>{section.label}</button>)}
      </nav>
      {locked && <p className="field-hint" role="status">请完成当前操作后再切换。</p>}
      <div ref={content} className="context-data-content">
        {sections.map(section => (visited.has(section.id) || panel === section.id) && <div id={`data-panel-${section.id}`} key={section.id} hidden={panel !== section.id} role="region" aria-label={section.label}>{section.render(panel === section.id)}</div>)}
      </div>
    </div>
  </ContextDataState.Provider>
}

function PendingNavigationGuard({ locked }: { locked: boolean }) {
  const blocker = useBlocker(({ nextLocation }) => locked && !consumeCompletedContextOperation(nextLocation.state))
  useEffect(() => { if (blocker.state === 'blocked') blocker.reset() }, [blocker])
  useEffect(() => {
    if (!locked) return
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [locked])
  return null
}
