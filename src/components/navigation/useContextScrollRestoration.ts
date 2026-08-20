import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { scrollPositionKey, type ContextNavigationState } from './contextNavigation'

export function useContextScrollRestoration() {
  const location = useLocation()

  useEffect(() => {
    if ((location.state as ContextNavigationState | null)?.restoreContextScroll !== true) return
    const path = `${location.pathname}${location.search}`
    let saved: string | null
    try {
      saved = sessionStorage.getItem(scrollPositionKey(path))
      if (saved !== null) sessionStorage.removeItem(scrollPositionKey(path))
    } catch {
      return
    }
    if (saved === null) return
    const scrollY = Number(saved)
    if (!Number.isFinite(scrollY) || scrollY < 0) return
    const timer = window.setTimeout(() => window.scrollTo({ top: scrollY, behavior: 'auto' }), 80)
    return () => window.clearTimeout(timer)
  }, [location.key, location.pathname, location.search, location.state])
}
