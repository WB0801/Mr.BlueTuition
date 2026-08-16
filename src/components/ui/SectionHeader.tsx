import type { ReactNode } from 'react'

interface SectionHeaderProps {
  action?: ReactNode
  description?: string
  id?: string
  title: string
}

export function SectionHeader({ action, description, id, title }: SectionHeaderProps) {
  return (
    <header className="ui-section-header">
      <div>
        <h2 id={id}>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  )
}
