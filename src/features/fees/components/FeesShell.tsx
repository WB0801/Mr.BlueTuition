import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { PageHeader } from '../../../components/shared/PageHeader'

export function FeesShell({ children }: { children: ReactNode }) {
  return (
    <section>
      <PageHeader title="学费" backTo="/" backLabel="首页" />
      <nav className="fees-nav" aria-label="学费功能">
        <NavLink end to="/fees">本月缴费</NavLink>
        <NavLink to="/fees/unpaid">未缴名单</NavLink>
        <NavLink to="/fees/receipts">待开收据</NavLink>
        <NavLink to="/fees/history">历史缴费</NavLink>
      </nav>
      {children}
    </section>
  )
}
