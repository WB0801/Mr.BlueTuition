import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { usePwaUpdateGuard } from '../../features/settings/pwa/updateProtection'

export const ContextDataState = createContext<{ locked: boolean; setBusy: (id: string, busy: boolean) => void } | null>(null)

// A one-use, in-memory permit for navigation from an already successful action.
// It is not serialized into the URL or accepted from restored browser state.
const completedOperations = new WeakSet<object>()
export function completedContextOperation<T extends object>(state: T = {} as T): T {
  completedOperations.add(state)
  return state
}
export function consumeCompletedContextOperation(state: unknown): boolean {
  if (!state || typeof state !== 'object' || !completedOperations.has(state)) return false
  completedOperations.delete(state)
  return true
}

export function useContextDataBusy(busy: boolean) {
  usePwaUpdateGuard(busy)
  const context = useContext(ContextDataState)
  const id = useId()
  const setBusy = context?.setBusy
  useEffect(() => {
    setBusy?.(id, busy)
    return () => setBusy?.(id, false)
  }, [busy, id, setBusy])
}

export function useContextDataLocked() { return useContext(ContextDataState)?.locked ?? false }

export function useRecordParams(prefix: string) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const locked = useContextDataLocked()
  const get = (key: string, fallback = '') => params.get(prefix ? `${prefix}.${key}` : key) ?? fallback
  const detail = get('record')
  const previousDetail = useRef(detail)
  const scrollKey = `data-position:${location.pathname}:${prefix}:${detail}`
  useLayoutEffect(() => {
    const saved = sessionStorage.getItem(scrollKey)
    const previous = previousDetail.current
    previousDetail.current = detail
    const frame = requestAnimationFrame(() => {
      if (saved !== null) window.scrollTo({ top: Number(saved) || 0, behavior: 'instant' })
      const panel = document.getElementById(`data-panel-${prefix}`)
      if (!panel || panel.hidden || previous === detail) return
      const target = detail
        ? [...panel.querySelectorAll<HTMLButtonElement>('.context-back-link')].find(button => !button.closest('[hidden]'))
        : [...panel.querySelectorAll<HTMLButtonElement>('[data-context-record]')].find(button => button.dataset.contextRecord === previous && !button.closest('[hidden]'))
      target?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [scrollKey, detail, prefix])
  const set = (key: string, value: string, push = false) => {
    if (locked) return
    if (key === 'record') sessionStorage.setItem(scrollKey, String(window.scrollY))
    setParams(current => {
      const next = new URLSearchParams(current)
      const name = prefix ? `${prefix}.${key}` : key
      if (key === 'record') next.delete(`${prefix}.receipt`)
      if (value) next.set(name, value)
      else next.delete(name)
      return next
    }, { replace: !push, state: location.state })
  }
  return { get, set, locked }
}
