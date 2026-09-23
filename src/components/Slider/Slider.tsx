import { useId } from 'react'
// Подпись слайдера — общая типографика поля (`.ds-field__label` из
// `field-frame.css`), а не своя: у `.ds-slider__label` были ровно те же кегль и
// цвет, то есть отдельная жизнь без отличий (DS-109).
import '../../styles/field-frame.css'
import './Slider.css'

/**
 * Нативные атрибуты ползунка; `ref` смотрит на `<input type="range">` — тот, на
 * который уводит `<label htmlFor>` (DS-108). `value`/`onChange` свои
 * (число, а не событие), `min`/`max`/`step` свои — по ним же считается заливка.
 */
type SliderNative = Omit<
  React.ComponentPropsWithRef<'input'>,
  'value' | 'defaultValue' | 'onChange' | 'min' | 'max' | 'step' | 'type' | 'size' | 'children'
>

export interface SliderProps extends SliderNative {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  label?: string
  /** Unit shown next to the current value (e.g. "%", "кг"). */
  suffix?: string
  /** Show the current value on the right (default true). */
  showValue?: boolean
}

export function Slider({
  value, onChange, min = 0, max = 100, step = 1, label, suffix, showValue = true, disabled, id, className,
  style, ...rest
}: SliderProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const pct = max === min ? 0 : Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
  const fill = `linear-gradient(to right, var(--ds-accent) ${pct}%, var(--ds-border) ${pct}%)`

  return (
    <div className={['ds-slider', disabled && 'is-disabled', className].filter(Boolean).join(' ')}>
      {(label || showValue) && (
        <div className="ds-slider__top">
          {label && <label className="ds-field__label" htmlFor={inputId}>{label}</label>}
          {showValue && <span className="ds-slider__value">{value}{suffix ? ` ${suffix}` : ''}</span>}
        </div>
      )}
      <input
        {...rest}
        id={inputId}
        type="range"
        className="ds-slider__input"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        // Заливка едет ПЕРЕМЕННОЙ, а не свойством: красит её трек
        // (`::-webkit-slider-runnable-track`), а не коробка инпута. Коробка
        // теперь 24px — это ЦЕЛЬ клика (SC 2.5.8), и покрась её заливка, полоса
        // стала бы вшестеро толще. Тот же шов, что у `Badge brand`: значение
        // отдаётся, решение «что им красить» остаётся в листе.
        style={{ ...style, '--ds-slider-fill': fill } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}
