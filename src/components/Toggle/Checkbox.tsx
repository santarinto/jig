import { useEffect, useRef } from 'react'
import './Toggle.css'

export interface CheckboxProps extends Omit<React.ComponentPropsWithRef<'input'>, 'type'> {
  label?: string
  indeterminate?: boolean
}

export function Checkbox({ label, indeterminate = false, className, ...rest }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate }, [indeterminate])
  return (
    <label className={['ds-check', className].filter(Boolean).join(' ')}>
      <input ref={ref} type="checkbox" className="ds-check__input" {...rest} />
      <span className="ds-check__box" aria-hidden="true" />
      {label && <span className="ds-check__label">{label}</span>}
    </label>
  )
}
