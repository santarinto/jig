import { useId } from 'react'
import '../../styles/field-surface.css'
import '../../styles/field-frame.css'
import './TextField.css'

/**
 * `ComponentPropsWithRef`, а НЕ `InputHTMLAttributes`: второй не содержит `ref`.
 * В React 19 `ref` — обычный проп, `forwardRef` не нужен и не вводится, но по
 * типам `<TextField ref={r} />` до DS-108 был ошибкой компиляции у ВСЕХ
 * компонентов, включая те, где `...rest` донёс бы его до элемента на рантайме.
 */
export interface TextFieldProps extends Omit<React.ComponentPropsWithRef<'input'>, 'size'> {
  label?: string
  hint?: string
  error?: string
  size?: 'sm' | 'md'
}

export function TextField({ label, hint, error, size = 'md', id, className, ...rest }: TextFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined

  return (
    // Корень — `div`, не `label`: корневая метка ловила клик по подсказке и по
    // тексту ошибки, а её accessible name склеивался из всего содержимого — это
    // и лечил `aria-label` на контроле, ценой того, что имя переставало быть
    // разметкой (звёздочка обязательности, единица, `<abbr>` в имя не попадали).
    // Модель одна на все поля: `div.ds-field` + отдельный `<label htmlFor>`
    // (DS-109).
    <div className="ds-field">
      {label && <label className="ds-field__label" htmlFor={inputId}>{label}</label>}
      <input
        id={inputId}
        className={['ds-input', `ds-input--${size}`, error && 'is-error', className].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {error
        ? <span id={`${inputId}-err`} className="ds-field__error">{error}</span>
        : hint && <span id={`${inputId}-hint`} className="ds-field__hint">{hint}</span>}
    </div>
  )
}
