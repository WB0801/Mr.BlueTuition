import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { createContextBack, readContextBack } from '../../../components/navigation/contextNavigation'
import { PageHeader } from '../../../components/shared/PageHeader'

export function FeesShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { pathname } = location
  const source = new URLSearchParams(location.search)
  const scope = new URLSearchParams()
  for (const key of ['studentId', 'classId']) if (source.get(key)) scope.set(key, source.get(key)!)
  const scopeQuery = scope.size ? `?${scope}` : ''
  const isFeesRoot = pathname === '/fees'
  const previous = readContextBack(location.state)
  const previousFees = previous?.to.split('?')[0] === '/fees' ? previous : null

  return (
    <section>
      <PageHeader title="学费" {...(!isFeesRoot && { backTo: '/fees', backLabel: '本月缴费' })} />
      <nav className="fees-nav" aria-label="学费功能">
        <NavLink end to={isFeesRoot ? `${pathname}${location.search}` : previousFees?.to ?? `/fees${scopeQuery}`} state={!isFeesRoot && previousFees ? previousFees.state : location.state}>缴费记录</NavLink>
        <NavLink to={`/fees/receipts${scopeQuery}`} state={pathname === '/fees/receipts' ? location.state : { contextBack: createContextBack(`${pathname}${location.search}`, '缴费记录', location.state) }}>收据处理</NavLink>
      </nav>
      {children}
    </section>
  )
}
