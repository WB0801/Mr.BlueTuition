import type { PropsWithChildren } from 'react'
import { Link } from 'react-router-dom'

interface CardProps extends PropsWithChildren {
  className?: string
}

export function Card({ children, className = '' }: CardProps) {
  return <div className={`ui-card ${className}`.trim()}>{children}</div>
}

interface CardLinkProps extends CardProps {
  to: string
  ariaLabel?: string
}

export function CardLink({ children, className = '', to, ariaLabel }: CardLinkProps) {
  return (
    <Link aria-label={ariaLabel} className={`ui-card ui-card-link ${className}`.trim()} to={to}>
      {children}
    </Link>
  )
}
