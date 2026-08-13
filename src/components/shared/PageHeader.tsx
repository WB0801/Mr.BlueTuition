import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface PageHeaderProps {
  title: string
  backTo?: string
  backLabel?: string
  actions?: ReactNode
}

export function PageHeader({ title, backTo = '/', backLabel = '返回', actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <Link className="back-link" to={backTo}>← {backLabel}</Link>
        <h1>{title}</h1>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}
