import type { MouseEvent, ReactNode } from 'react'
import { Link, useLocation, type LinkProps } from 'react-router-dom'
import { createContextBack, scrollPositionKey, type ContextNavigationState } from './contextNavigation'

interface ContextLinkProps extends Omit<LinkProps, 'state'> {
  backLabel: string
  children: ReactNode
  state?: ContextNavigationState
}

export function ContextLink({ backLabel, state, onClick, ...props }: ContextLinkProps) {
  const location = useLocation()
  const sourcePath = `${location.pathname}${location.search}`
  const contextBack = createContextBack(sourcePath, backLabel, location.state)
  const targetState: ContextNavigationState = { ...state, ...(contextBack ? { contextBack } : {}) }

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    try { sessionStorage.setItem(scrollPositionKey(sourcePath), String(window.scrollY)) } catch { /* storage is optional */ }
  }

  return <Link {...props} state={targetState} onClick={handleClick} />
}
