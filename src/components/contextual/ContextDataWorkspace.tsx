import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useIsMutating } from '@tanstack/react-query'
import { UNSAFE_DataRouterContext, useBlocker, useLocation, useSearchParams } from 'react-router-dom'
import { consumeCompletedContextOperation, ContextDataState, useContextDataBusy, useContextDataUnsaved } from './contextDataState'

interface DataSection { id: string; label: string; render: (active: boolean) => ReactNode }

export function ContextDataWorkspace({ label, defaultPanel, sections, panelParam = 'panel' }: { label: string; defaultPanel: string; sections: DataSection[]; panelParam?: string }) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const requested = params.get(panelParam)
  const panel = sections.some(section => section.id === requested) ? requested! : defaultPanel
  const [visited, setVisited] = useState(() => new Set([panel]))
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [unsaved, setUnsavedMessages] = useState<Map<string, string>>(new Map())
  const setUnsaved = useCallback((id: string, message: string) => setUnsavedMessages(current => {
    if ((current.get(id) ?? '') === message) return current
    const next = new Map(current); if (message) next.set(id, message); else next.delete(id); return next
  }), [])
  const leaveMessage = [...unsaved.values()][0] ?? ''
  useContextDataUnsaved(leaveMessage)
  const setBusy = useCallback((id: string, busy: boolean) => setBusyIds(current => {
    if (current.has(id) === busy) return current
    const next = new Set(current); if (busy) next.add(id); else next.delete(id); return next
  }), [])
  const locked = useIsMutating() > 0 || busyIds.size > 0
  // Nested course workspaces must also protect the surrounding student/class tabs.
  useContextDataBusy(locked)
  const dataRouter = useContext(UNSAFE_DataRouterContext)
  const parentWorkspace = useContext(ContextDataState)
  const positionKey = `data-panel:${location.pathname}:${panelParam}:${panel}`
  const content = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const saved = sessionStorage.getItem(positionKey) ?? (panelParam === 'panel' ? sessionStorage.getItem(`data-panel:${location.pathname}:${panel}`) : null)
    if (saved !== null) {
      const frame = requestAnimationFrame(() => window.scrollTo({ top: Number(saved) || 0, behavior: 'instant' }))
      return () => cancelAnimationFrame(frame)
    }
  }, [positionKey, location.pathname, panelParam, panel])
  function select(nextPanel: string) {
    if (locked || panel === nextPanel) return
    sessionStorage.setItem(positionKey, String(window.scrollY))
    setVisited(current => new Set([...current, panel, nextPanel]))
    setParams(current => { const next = new URLSearchParams(current); next.set(panelParam, nextPanel); return next }, { state: location.state })
  }
  return <ContextDataState.Provider value={{ locked, setBusy, setUnsaved }}>
    {dataRouter && !parentWorkspace && <PendingNavigationGuard locked={locked} leaveMessage={leaveMessage} />}
    <div className="context-data-workspace" onClickCapture={event => {
      if (locked && (event.target as HTMLElement).closest('a, summary')) { event.preventDefault(); event.stopPropagation() }
    }}>
      <nav className="context-data-tabs" aria-label={label}>
        {sections.map(section => <button type="button" key={section.id} aria-pressed={panel === section.id} aria-controls={`data-panel-${panelParam === 'panel' ? '' : `${panelParam}-`}${section.id}`} disabled={locked} onClick={() => select(section.id)}>{section.label}</button>)}
      </nav>
      {locked && <p className="field-hint" role="status">请完成当前操作后再切换。</p>}
      <div ref={content} className="context-data-content">
        {sections.map(section => (visited.has(section.id) || panel === section.id) && <div id={`data-panel-${panelParam === 'panel' ? '' : `${panelParam}-`}${section.id}`} key={section.id} hidden={panel !== section.id} role="region" aria-label={section.label}>{section.render(panel === section.id)}</div>)}
      </div>
    </div>
  </ContextDataState.Provider>
}

function PendingNavigationGuard({ locked, leaveMessage }: { locked: boolean; leaveMessage: string }) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (!locked && (!leaveMessage || currentLocation.pathname === nextLocation.pathname)) return false
    return !consumeCompletedContextOperation(nextLocation.state)
  })
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (!locked && leaveMessage && window.confirm(leaveMessage)) blocker.proceed()
    else blocker.reset()
  }, [blocker, locked, leaveMessage])
  useEffect(() => {
    if (!locked && !leaveMessage) return
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [locked, leaveMessage])
  return null
}
