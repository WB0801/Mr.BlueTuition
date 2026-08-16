import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'default' | 'small'
  leadingIcon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, className = '', leadingIcon, size = 'default', variant = 'primary', ...props },
  ref,
) {
  const classes = [
    'button',
    `button-${variant}`,
    size === 'small' ? 'button-small' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <button className={classes} ref={ref} {...props}>
      {leadingIcon}
      {children}
    </button>
  )
})

export function DangerButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button variant="danger" {...props} />
}

interface IconButtonProps extends Omit<ButtonProps, 'children'> {
  'aria-label': string
  icon: ReactNode
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className = '', icon, variant = 'ghost', ...props },
  ref,
) {
  return <Button className={`icon-button ${className}`.trim()} ref={ref} variant={variant} {...props}>{icon}</Button>
})
