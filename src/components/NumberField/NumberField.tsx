import { useEffect, useId, useRef, useState } from 'react'
import '../../styles/field-surface.css'
// Обёртка поля (`.ds-field`, `__label`, `__hint`, `__error`) — в общем
// `field-frame.css`; поверхность — в `field-surface.css`.
import '../../styles/field-frame.css'
import { useDsText } from '../../dictionary/DsText.js'
import './NumberField.css'

/**
 * Нативные атрибуты входа, кроме тех, что компонент трактует по-своему.
 * Составное поле — не повод отбирать у потребителя `name`, `autoComplete`,
 * `aria-*` и `data-*`; закрытый набор пропов был здесь дырой, а не решением
 * (DS-108). `value`/`onChange` свои: значение числовое, а не строковое;
 * `min`/`max`/`step` тоже свои — они участвуют в шаге и в клампе, а не только
 * в валидации браузера.
 */
type NumberFieldNative = Omit<
  React.ComponentPropsWithRef<'input'>,
  'value' | 'defaultValue' | 'onChange' | 'min' | 'max' | 'step' | 'size' | 'type' | 'role' | 'children'
>

export interface NumberFieldProps extends NumberFieldNative {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  label?: string
  hint?: string
  error?: string
  size?: 'sm' | 'md'
}

const decimalsOf = (step: number) => (String(step).split('.')[1] ?? '').length

export function NumberField({
  value, onChange, min, max, step = 1, suffix, label, hint, error, size = 'md', id, className,
  // Свои обработчики компонент не отдаёт наружу целиком, а СОСТАВЛЯЕТ: чужой
  // `onBlur` обязан сработать (react-hook-form через `Controller` передаёт
  // именно его), но после нормализации текста — иначе форма увидела бы
  // недоклампленное значение.
  onBlur: onBlurProp, onFocus: onFocusProp, onKeyDown: onKeyDownProp,
  disabled,
  ...rest
}: NumberFieldProps) {
  const t = useDsText()
  const autoId = useId()
  const inputId = id ?? autoId
  const [text, setText] = useState(String(value))
  const focused = useRef(false)
  const valueRef = useRef(value)
  valueRef.current = value

  // `undefined` передаётся ЯВНО и тип включает его: в React 19 у `useRef` больше
  // нет перегрузки без аргумента, а `ReturnType<typeof setTimeout>` сам по себе
  // не допускает «таймера нет» — а именно это и есть состояние покоя, в которое
  // `stopHold` возвращает поле.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const repeatTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  useEffect(() => { if (!focused.current) setText(String(value)) }, [value])

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
  const round = (n: number) => Number(n.toFixed(decimalsOf(step)))

  const stepBy = (dir: 1 | -1) => {
    const cur = valueRef.current
    const next = clamp(round(cur + dir * step))
    if (next !== cur) { onChange(next); setText(String(next)) }
  }

  const stopHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    if (repeatTimer.current) clearInterval(repeatTimer.current)
    holdTimer.current = undefined
    repeatTimer.current = undefined
  }
  const startHold = (dir: 1 | -1) => {
    stepBy(dir)
    holdTimer.current = setTimeout(() => {
      repeatTimer.current = setInterval(() => stepBy(dir), 80)
    }, 400)
  }
  useEffect(() => {
    const up = () => stopHold()
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mouseup', up); stopHold() }
  }, [])

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = e.target.value
    setText(t)
    const n = Number(t)
    if (t.trim() !== '' && !Number.isNaN(n) && n === clamp(n)) onChange(n)
  }
  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    focused.current = false
    const n = Number(text)
    if (text.trim() === '' || Number.isNaN(n)) setText(String(value))
    else {
      const c = clamp(n)
      onChange(c)
      setText(String(c))
    }
    onBlurProp?.(e)
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); stepBy(1) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); stepBy(-1) }
    onKeyDownProp?.(e)
  }

  const atMin = min !== undefined && value <= min
  const atMax = max !== undefined && value >= max
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined

  return (
    <div className={['ds-field', 'ds-numfield', className].filter(Boolean).join(' ')}>
      {label && <label className="ds-field__label" htmlFor={inputId}>{label}</label>}
      <div className={[
        'ds-numfield__control', `ds-numfield__control--${size}`,
        error && 'is-error', disabled && 'is-disabled',
      ].filter(Boolean).join(' ')}>
        <button
          type="button" className="ds-numfield__btn" aria-label={t['numberField.decrement']} disabled={disabled || atMin}
          onMouseDown={() => startHold(-1)} onMouseUp={stopHold} onMouseLeave={stopHold}
        >−</button>
        <input
          {...rest}
          id={inputId}
          className="ds-numfield__input"
          role="spinbutton"
          inputMode="decimal"
          disabled={disabled}
          value={text}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onFocus={(e) => { focused.current = true; onFocusProp?.(e) }}
          onChange={onInput}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
        {suffix && <span className="ds-numfield__suffix">{suffix}</span>}
        <button
          type="button" className="ds-numfield__btn" aria-label={t['numberField.increment']} disabled={disabled || atMax}
          onMouseDown={() => startHold(1)} onMouseUp={stopHold} onMouseLeave={stopHold}
        >+</button>
      </div>
      {error
        ? <span id={`${inputId}-err`} className="ds-field__error">{error}</span>
        : hint && <span id={`${inputId}-hint`} className="ds-field__hint">{hint}</span>}
    </div>
  )
}
