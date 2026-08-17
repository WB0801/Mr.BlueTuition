import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../ui'

interface PageHeaderProps {
  title: string
  backTo?: string
  backLabel?: string
  actions?: ReactNode
}

export function PageHeader({ title, backTo, backLabel = '返回', actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        {backTo && <Link className="back-link" to={backTo}><Icon name="arrow-left" size={18} />{backLabel}</Link>}
        <h1>{title}</h1>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}
