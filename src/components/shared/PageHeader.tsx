import type { ReactNode } from 'react'
import { ContextBackLink } from '../navigation/ContextBackLink'

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
        <ContextBackLink fallbackTo={backTo} fallbackLabel={backLabel === '返回' ? undefined : backLabel} />
        <h1>{title}</h1>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}
