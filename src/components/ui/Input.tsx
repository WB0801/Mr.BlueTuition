import { forwardRef, type InputHTMLAttributes } from 'react'
import { Icon } from './Icon'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className = '', ...props },
  ref,
) {
  return <input className={`ui-input ${className}`.trim()} ref={ref} {...props} />
})

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  containerClassName?: string
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { className = '', containerClassName = '', ...props },
  ref,
) {
  return (
    <div className={`ui-search-input ${containerClassName}`.trim()}>
      <Icon className="ui-search-icon" name="search" size={21} />
      <Input className={className} ref={ref} type="search" {...props} />
    </div>
  )
})
