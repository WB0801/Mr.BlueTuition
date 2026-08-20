import { Link, useLocation } from 'react-router-dom'
import { Icon } from '../ui'
import { resolveBackTarget, type ContextNavigationState } from './contextNavigation'

export function ContextBackLink({ fallbackTo, fallbackLabel }: { fallbackTo?: string; fallbackLabel?: string }) {
  const location = useLocation()
  const target = resolveBackTarget(location.pathname, location.state, fallbackTo, fallbackLabel)
  if (!target) return null
  const sourceState = target.state && typeof target.state === 'object' ? target.state as ContextNavigationState : {}

  return (
    <Link className="back-link" to={target.to} state={{ ...sourceState, restoreContextScroll: true }}>
      <Icon name="arrow-left" size={20} />
      <span>返回{target.label}</span>
    </Link>
  )
}
