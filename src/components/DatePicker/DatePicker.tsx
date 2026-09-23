import { useEffect, useId, useRef, useState } from 'react'
import { Calendar } from '../Calendar/index.js'
import { useDismiss } from '../../internal/useDismiss.js'
import { useMergedRef } from '../../internal/useMergedRef.js'
import { usePopupLayer } from '../../internal/usePopupLayer.js'
// Поле даты — это `.ds-input` с календарём: поверхность `.ds-input` — в
// `field-surface.css`, геометрия `.ds-input`, обёртка `.ds-field*` и
// `.ds-field--block` — в общем `field-frame.css`. Без них компонент,
// импортированный в одиночку, приезжает к потребителю голым.
import '../../styles/field-surface.css'
import '../../styles/field-frame.css'
import { useDsText } from '../../dictionary/DsText.js'
import './DatePicker.css'

/**
 * Нативные атрибуты поля даты. `ref` смотрит на ТЕКСТОВЫЙ ВВОД — тот, на
 * который уводит `<label htmlFor>`, — а не на корень и не на кнопку календаря
 * (DS-108). `value`/`onChange` свои: значение — ISO-строка, а не событие;
 * `min`/`max` свои: это границы календаря, а не валидация браузера; `type` не
 * даётся, ввод намеренно текстовый (`type="date"` рисует нативный календарь).
 */
type DatePickerNative = Omit<
  React.ComponentPropsWithRef<'input'>,
  'value' | 'defaultValue' | 'onChange' | 'min' | 'max' | 'size' | 'type' | 'children'
>

export interface DatePickerProps extends DatePickerNative {
  /** Selected date as ISO `YYYY-MM-DD` ('' when empty). */
  value: string
  onChange: (iso: string) => void
  label?: string
  hint?: string
  error?: string
  min?: string
  max?: string
  size?: 'sm' | 'md'
  placeholder?: string
}

const isoToText = (iso: string) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

const textToIso = (txt: string): string | null => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(txt.trim())
  if (!m) return null
  const d = +m[1], mo = +m[2], y = +m[3]
  if (mo < 1 || mo > 12) return null
  if (d < 1 || d > new Date(y, mo, 0).getDate()) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

const viewOf = (iso: string) => {
  const d = iso ? new Date(iso + 'T00:00:00') : new Date()
  return { y: d.getFullYear(), m: d.getMonth() }
}

export function DatePicker({
  value, onChange, label, hint, error, min, max, size = 'md', placeholder, id, className,
  // `disabled` вынут из `...rest` НАМЕРЕННО: через `...rest` он садится только
  // на `<input>`, а «Очистить» и «Открыть календарь» остаются живыми — крестик
  // зовёт `onChange('')` у поля, менять которое запрещено (DS-133).
  // Раздаётся руками каждому интерактивному узлу; гейт `field-disabled` следит.
  disabled,
  // Свой `onBlur` нормализует текст; чужой зовётся после — см. `NumberField`.
  onBlur: onBlurProp, ref, ...rest
}: DatePickerProps) {
  const t = useDsText()
  const autoId = useId()
  const inputId = id ?? autoId
  const [open, setOpen] = useState(false)
  // Как у `Combobox`: выключение ЗАКРЫВАЕТ список, а не просто запрещает его
  // открыть. Иначе поле, выключенное с открытым календарём, оставляет на экране
  // рабочий выбор даты.
  const isOpen = open && !disabled
  const zIndex = usePopupLayer(isOpen)
  const [text, setText] = useState(isoToText(value))
  const [view, setView] = useState(() => viewOf(value))
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Свой ref нужен компоненту (возврат фокуса по Esc, фокус после выбора даты),
  // чужой — потребителю. Обе ссылки смотрят на один и тот же текстовый ввод.
  const mergedInputRef = useMergedRef(inputRef, ref)

  useEffect(() => { setText(isoToText(value)) }, [value])

  useDismiss({
    enabled: isOpen,
    ref: rootRef,
    onDismiss: (r) => {
      setOpen(false)
      if (r === 'escape') inputRef.current?.focus()
    },
  })

  const inRange = (iso: string) =>
    (min === undefined || iso >= min) && (max === undefined || iso <= max)

  const openPopup = () => { setView(viewOf(value)); setOpen(true) }

  const commitFromText = (v: string) => {
    setText(v)
    const iso = textToIso(v)
    if (iso && inRange(iso)) onChange(iso)
  }

  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (text.trim() === '') { if (value) onChange('') }
    else {
      const iso = textToIso(text)
      if (!iso || !inRange(iso)) setText(isoToText(value)) // revert invalid input
    }
    onBlurProp?.(e)
  }

  const pick = (iso: string) => {
    onChange(iso)
    setText(isoToText(iso))
    setOpen(false)
    inputRef.current?.focus()
  }

  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined

  return (
    <div
      ref={rootRef}
      className={['ds-field', 'ds-field--block', 'ds-datepicker', className].filter(Boolean).join(' ')}
    >
      {label && <label className="ds-field__label" htmlFor={inputId}>{label}</label>}

      <div className="ds-datepicker__control">
        <input
          {...rest}
          ref={mergedInputRef}
          id={inputId}
          className={['ds-input', `ds-input--${size}`, 'ds-datepicker__input', error && 'is-error'].filter(Boolean).join(' ')}
          value={text}
          placeholder={placeholder ?? t['datePicker.placeholder']}
          disabled={disabled}
          inputMode="numeric"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => commitFromText(e.target.value)}
          onBlur={onBlur}
        />
        {value && (
          <button
            type="button"
            className="ds-datepicker__clear"
            aria-label={t['datePicker.clear']}
            disabled={disabled}
            onClick={() => { onChange(''); setText('') }}
          >×</button>
        )}
        <button
          type="button"
          className="ds-datepicker__btn"
          aria-label={t['datePicker.open']}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          onClick={() => (isOpen ? setOpen(false) : openPopup())}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </button>
      </div>

      {error
        ? <span id={`${inputId}-err`} className="ds-field__error">{error}</span>
        : hint && <span id={`${inputId}-hint`} className="ds-field__hint">{hint}</span>}

      {isOpen && (
        <div className="ds-datepicker__popup" role="dialog" aria-label={t['datePicker.dialog']} style={{ zIndex }}>
          <Calendar
            year={view.y}
            month={view.m}
            selectedId={value || undefined}
            min={min}
            max={max}
            onSelect={pick}
            onNavigate={(y, m) => setView({ y, m })}
            onToday={() => setView(viewOf(''))}
          />
        </div>
      )}
    </div>
  )
}
