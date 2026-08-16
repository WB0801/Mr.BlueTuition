import type { PropsWithChildren } from 'react'

interface NoticeProps extends PropsWithChildren {
  tone?: 'info' | 'success' | 'warning' | 'danger'
}

export function Notice({ children, tone = 'info' }: NoticeProps) {
  return <div className={`ui-notice ui-notice-${tone}`}>{children}</div>
}
