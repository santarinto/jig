import { useId, useRef } from 'react'
import '../../styles/field-surface.css'
import { useDsText } from '../../dictionary/DsText.js'
import './CodeInput.css'

/**
 * Нативные атрибуты и `ref` едут на ПЕРВУЮ ячейку — ту, на которую уводит
 * `<label htmlFor>` и которая несёт `autoComplete="one-time-code"`. Раскладывать
 * `name` по шести инпутам было бы неверно: у поля одно значение, а ячейки —
 * способ его ввести (DS-108).
 */
type CodeInputNative = Omit<
  React.ComponentPropsWithRef<'input'>,
  'value' | 'defaultValue' | 'onChange' | 'onPaste' | 'onKeyDown' | 'onFocus'
  | 'type' | 'maxLength' | 'size' | 'inputMode' | 'children'
>

export interface CodeInputProps extends CodeInputNative {
  /** Number of cells. */
  length?: number
  value: string
  onChange: (value: string) => void
  /** Fired once every cell is filled. */
  onComplete?: (value: string) => void
  error?: string
  label?: string
}

export function CodeInput({
  length = 6, value, onChange, onComplete, error, label, disabled, id, className,
  ref, ...rest
}: CodeInputProps) {
  const t = useDsText()
  const autoId = useId()
  const baseId = id ?? autoId
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const cellId = (i: number) => `${baseId}-${i}`
  const cells = Array.from({ length }, (_, i) => value[i] ?? '')

  const focusCell = (i: number) => inputs.current[Math.max(0, Math.min(length - 1, i))]?.focus()

  const emit = (next: string) => {
    const v = next.slice(0, length)
    onChange(v)
    if (v.length === length) onComplete?.(v)
  }

  const onCellChange = (i: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1)
    if (!digit) return
    const arr = cells.slice()
    arr[i] = digit
    emit(arr.join(''))
    if (i < length - 1) focusCell(i + 1)
  }

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const arr = cells.slice()
      if (arr[i]) { arr[i] = ''; emit(arr.join('')) }
      else if (i > 0) { const p = arr.slice(); p[i - 1] = ''; emit(p.join('')); focusCell(i - 1) }
    } else if (e.key === 'ArrowLeft') { e.preventDefault(); focusCell(i - 1) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); focusCell(i + 1) }
  }

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!digits) return
    emit(digits)
    focusCell(Math.min(digits.length, length - 1))
  }

  return (
    <div className={['ds-code', className].filter(Boolean).join(' ')}>
      {/*
        Подпись — настоящий `<label htmlFor>` на первую ячейку: до DS-109
        это был `<span>`, и клик по подписи не делал ничего. `role="group"` и
        `aria-labelledby` остаются — имя нужно ГРУППЕ, у ячейки же своё
        («Цифра 1»), и перебивать его подписью поля было бы враньём: ячейка не
        принимает весь код.
      */}
      {label && (
        <label className="ds-code__label" id={`${baseId}-label`} htmlFor={cellId(0)}>{label}</label>
      )}
      <div className="ds-code__cells" role="group" aria-labelledby={label ? `${baseId}-label` : undefined} aria-invalid={error ? true : undefined}>
        {cells.map((c, i) => (
          <input
            key={i}
            {...(i === 0 ? rest : null)}
            id={cellId(i)}
            ref={(el) => {
              inputs.current[i] = el
              if (i === 0) {
                if (typeof ref === 'function') ref(el)
                else if (ref) ref.current = el
              }
            }}
            className={['ds-code__cell', error && 'is-error'].filter(Boolean).join(' ')}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            value={c}
            disabled={disabled}
            aria-label={t['codeInput.digit'](i + 1)}
            onChange={(e) => onCellChange(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={onPaste}
            onFocus={(e) => e.target.select()}
          />
        ))}
      </div>
      {error && <span className="ds-code__error">{error}</span>}
    </div>
  )
}
