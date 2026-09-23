import { useId, useState } from 'react'
import '../../styles/field-surface.css'
// Обёртка поля (`.ds-field`, `--block`, `__label`, `__hint`, `__error`) — в общем
// `field-frame.css`; поверхность `.ds-textarea` — в `field-surface.css`.
import '../../styles/field-frame.css'
import './Textarea.css'

/** `ComponentPropsWithRef` ради `ref` — см. `TextFieldProps` (DS-108). */
export interface TextareaProps extends Omit<React.ComponentPropsWithRef<'textarea'>, 'size'> {
  label?: string
  hint?: string
  error?: string
  size?: 'sm' | 'md'
}

export function Textarea({
  label,
  hint,
  error,
  size = 'md',
  id,
  className,
  rows = 3,
  value,
  defaultValue,
  maxLength,
  onChange,
  ...rest
}: TextareaProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined

  const [innerLen, setInnerLen] = useState(String(defaultValue ?? '').length)
  const count = value != null ? String(value).length : innerLen

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (value == null) setInnerLen(e.target.value.length)
    onChange?.(e)
  }

  const showFooter = Boolean(error || hint || maxLength != null)

  return (
    // Корень — `div`: у `Textarea` корневая метка ловила ещё и клик по
    // счётчику символов (DS-109).
    <div className="ds-field ds-field--block">
      {label && <label className="ds-field__label" htmlFor={inputId}>{label}</label>}
      <textarea
        id={inputId}
        className={['ds-textarea', `ds-textarea--${size}`, error && 'is-error', className].filter(Boolean).join(' ')}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        value={value}
        defaultValue={defaultValue}
        maxLength={maxLength}
        onChange={handleChange}
        {...rest}
      />
      {showFooter && (
        <div className="ds-textarea__footer">
          <span className="ds-textarea__msg">
            {error ? (
              <span id={`${inputId}-err`} className="ds-field__error">{error}</span>
            ) : hint ? (
              <span id={`${inputId}-hint`} className="ds-field__hint">{hint}</span>
            ) : null}
          </span>
          {maxLength != null && (
            <span className="ds-textarea__counter">{count} / {maxLength}</span>
          )}
        </div>
      )}
    </div>
  )
}
