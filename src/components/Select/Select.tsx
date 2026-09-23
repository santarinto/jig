import { useId } from 'react'
import { Caret } from '../../internal/caret.js'
import '../../styles/field-surface.css'
// Обёртка поля (`.ds-field`, `.ds-field__label`) — в общем `field-frame.css`.
import '../../styles/field-frame.css'
import './Select.css'

export interface SelectOption { value: string; label: string }
/** `ComponentPropsWithRef` ради `ref` — см. `TextFieldProps` (DS-108). */
export interface SelectProps extends Omit<React.ComponentPropsWithRef<'select'>, 'size'> {
  label?: string
  options: SelectOption[]
  size?: 'sm' | 'md'
  /** Подсказка под контролом. Скрывается, когда пришла `error` (контракт `TextField`). */
  hint?: string
  /**
   * Текст ошибки: красит поверхность (`.is-error` — общий лист `field-surface.css`
   * умел это и до пропа), ставит `aria-invalid` и связывает текст с контролом
   * через `aria-describedby`. Без этого форма со смешанными полями показывала
   * ошибку списка только общим `Alert` над формой, и связь «ошибка ↔ поле»
   * для скринридера терялась (DS-56).
   */
  error?: string
  /**
   * Где метка: `top` (default) — над контролом; `inline` — в строку с контролом
   * (тулбар: Select не выше соседей, единая линия); `hidden` — метки на экране
   * нет, она уходит в `aria-label` (компактный тулбар).
   *
   * Доступное имя есть во всех трёх режимах, но даётся ПО-РАЗНОМУ: при `top`
   * и `inline` — разметкой, `<label htmlFor>`; при `hidden` — `aria-label`, потому
   * что разметки там нет вовсе. До DS-109 `aria-label` стоял всегда и был
   * костылём под корневую метку: без него имя склеивалось из подписи, подсказки
   * и текста ошибки разом.
   */
  labelPosition?: 'top' | 'inline' | 'hidden'
}

export function Select({
  label, options, size = 'md', labelPosition = 'top', hint, error, id, className, ...rest
}: SelectProps) {
  const autoId = useId()
  const selectId = id ?? autoId
  const describedBy = error ? `${selectId}-err` : hint ? `${selectId}-hint` : undefined
  return (
    // Корень — `div`, не `label` (DS-109). При `labelPosition='hidden'`
    // видимой подписи нет вовсе, и имя даёт `aria-label` — это не костыль, а
    // единственный способ назвать контрол без разметки.
    <div className={['ds-field', labelPosition === 'inline' && 'ds-field--inline'].filter(Boolean).join(' ')}>
      {label && labelPosition !== 'hidden' && (
        <label className="ds-field__label" htmlFor={selectId}>{label}</label>
      )}
      <span className="ds-select-wrap">
        <select
          id={selectId}
          className={['ds-select', `ds-select--${size}`, error && 'is-error', className].filter(Boolean).join(' ')}
          aria-label={labelPosition === 'hidden' ? label : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        >
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <Caret kind="menu" className="ds-select__chevron" />
      </span>
      {error
        ? <span id={`${selectId}-err`} className="ds-field__error">{error}</span>
        : hint && <span id={`${selectId}-hint`} className="ds-field__hint">{hint}</span>}
    </div>
  )
}
