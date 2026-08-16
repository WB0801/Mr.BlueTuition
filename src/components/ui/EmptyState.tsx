import type { ReactNode } from 'react'

interface EmptyStateProps {
  action?: ReactNode
  description?: string
  title: string
}

export function EmptyState({ action, description, title }: EmptyStateProps) {
  return (
    <div className="ui-empty-state">
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action}
    </div>
  )
}
