import type { PropsWithChildren } from 'react'

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

interface BadgeProps extends PropsWithChildren {
  className?: string
  tone?: BadgeTone
}

export function Badge({ children, className = '', tone = 'neutral' }: BadgeProps) {
  return <span className={`ui-badge ui-badge-${tone} ${className}`.trim()}>{children}</span>
}
