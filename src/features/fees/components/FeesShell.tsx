import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { PageHeader } from '../../../components/shared/PageHeader'

export function FeesShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const isFeesRoot = pathname === '/fees'

  return (
    <section>
      <PageHeader title="学费" {...(!isFeesRoot && { backTo: '/fees', backLabel: '本月缴费' })} />
      <nav className="fees-nav" aria-label="学费功能">
        <NavLink end to="/fees">缴费记录</NavLink>
        <NavLink to="/fees/receipts">收据处理</NavLink>
      </nav>
      {children}
    </section>
  )
}
