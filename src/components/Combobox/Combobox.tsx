import { useEffect, useId, useRef, useState } from 'react'
import { useDismiss } from '../../internal/useDismiss.js'
import { Caret } from '../../internal/caret.js'
import { usePopupLayer } from '../../internal/usePopupLayer.js'
import { useMergedRef } from '../../internal/useMergedRef.js'
import '../../styles/field-surface.css'
// Обёртка `.ds-field*` и геометрия `.ds-input` (строка поиска в поповере) — в
// общем `field-frame.css`.
import '../../styles/field-frame.css'
import { useDsText } from '../../dictionary/DsText.js'
import './Combobox.css'
import { Icon } from '../../icons/index.js'

export interface ComboboxOption { value: string; label: string; icon?: React.ReactNode }
export interface ComboboxProps {
  options: ComboboxOption[]
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  label?: string
  size?: 'sm' | 'md'
  /** When set, offers a “Создать «…»” row for a query that matches no option. */
  onCreate?: (label: string) => void
  /**
   * Выключение. Не только атрибут на триггере: с открытым списком выключение
   * должно и закрыть поповер — иначе список остаётся живым. Поверхность
   * приглушается той же группой `field-surface.css`, что у остальных полей.
   */
  disabled?: boolean
  /**
   * Сообщение об ошибке — по образцу `NumberField`: вешает `is-error` на
   * поверхность триггера (красная рамка) и рисует `.ds-field__error`, плюс
   * `aria-invalid`/`aria-describedby`.
   */
  error?: string
  className?: string
}

/**
 * Нативные атрибуты и `ref` едут на ТРИГГЕР — `<button>`, на который уводит
 * `<label htmlFor>` и который получает фокус (DS-108). Поиск внутри
 * поповера — деталь реализации, снаружи его адресовать нечем.
 *
 * `id` не спредится, а становится ОСНОВОЙ идентификаторов, как у остальных
 * полей: из него собираются `-trigger`, `-label`, `-err`.
 */
type ComboboxNative = Omit<
  React.ComponentPropsWithRef<'button'>,
  'value' | 'onChange' | 'type' | 'children' | 'disabled' | 'id' | 'className'
>

export function Combobox({
  options, value, onChange, placeholder, label, size = 'md', onCreate,
  disabled, error, className, id, ref, ...rest
}: ComboboxProps & ComboboxNative & { id?: string }) {
  const t = useDsText()
  const [open, setOpen] = useState(false)
  // Выключение гасит открытие целиком: даже если `open` остался true (проп
  // выключили при открытом списке), поповер не рисуется и слои не занимаются.
  const isOpen = open && !disabled
  const zIndex = usePopupLayer(isOpen)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const autoId = useId()
  const baseId = id ?? autoId
  // Свой ref нужен компоненту (возврат фокуса по Esc и по выбору), чужой —
  // потребителю; оба смотрят на триггер.
  const mergedTriggerRef = useMergedRef(triggerRef, ref)
  const triggerId = `${baseId}-trigger`
  const labelId = `${baseId}-label`
  const valueId = `${baseId}-value`
  const listId = `${baseId}-list`
  const createId = `${baseId}-create`
  const errorId = `${baseId}-error`
  const optionId = (i: number) => `${baseId}-opt-${i}`

  const selected = options.find((o) => o.value === value)
  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
  const trimmed = query.trim()
  const canCreate = !!onCreate && trimmed !== '' &&
    !options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase())

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setActiveIndex(0)
    inputRef.current?.focus()
  }, [isOpen])

  // Поповер размонтируется вместе с фокусированным инпутом поиска — без явного
  // возврата фокус достаётся <body>, и клавиатурный пользователь после каждого
  // выбора оказывается в начале страницы. Возвращаем на Esc и на выборе («я
  // закончил здесь»), но НЕ на клике мимо: там фокус уже ушёл туда, куда ткнули,
  // и отбирать его обратно — значит спорить с пользователем.
  function close({ restoreFocus }: { restoreFocus: boolean }) {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  useDismiss({
    enabled: isOpen,
    ref: rootRef,
    onDismiss: (reason) => close({ restoreFocus: reason === 'escape' }),
  })

  function choose(opt: ComboboxOption) {
    onChange?.(opt.value)
    close({ restoreFocus: true })
  }

  function create() {
    onCreate?.(trimmed)
    close({ restoreFocus: true })
  }

  const maxIndex = filtered.length - 1 + (canCreate ? 1 : 0)
  const createActive = canCreate && activeIndex === filtered.length
  const activeId = createActive ? createId : filtered[activeIndex] ? optionId(activeIndex) : undefined

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, maxIndex)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = filtered[activeIndex]
      if (opt) choose(opt)
      else if (canCreate) create()
    }
  }

  const control = (
    <div className={['ds-combobox', `ds-combobox--${size}`, className].filter(Boolean).join(' ')} ref={rootRef}>
      <button
        {...rest}
        ref={mergedTriggerRef}
        type="button"
        id={triggerId}
        className={['ds-combobox__trigger', error && 'is-error'].filter(Boolean).join(' ')}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        // name = label + current value, so the control is announced as “Валюта Рубль”
        aria-labelledby={label ? `${labelId} ${valueId}` : undefined}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => { if (!disabled) setOpen((v) => !v) }}
      >
        {selected?.icon && <Icon className="ds-combobox__icon" aria-hidden="true">{selected.icon}</Icon>}
        <span id={valueId} className={['ds-combobox__value', !selected && 'is-placeholder'].filter(Boolean).join(' ')}>
          {selected ? selected.label : placeholder ?? t['combobox.placeholder']}
        </span>
        <Caret kind="menu" />
      </button>
      {isOpen && (
        <div className="ds-combobox__popover" style={{ zIndex }}>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={listId}
            aria-activedescendant={activeId}
            className="ds-combobox__search ds-input ds-input--sm"
            placeholder={t['combobox.searchPlaceholder']}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0) }}
            onKeyDown={onInputKeyDown}
          />
          <ul className="ds-combobox__list" role="listbox" id={listId}>
            {filtered.length === 0 && !canCreate && <li className="ds-combobox__empty">{t['combobox.empty']}</li>}
            {/*
              Опция — сама кликабельная строка, а не обёртка вокруг <button>.
              Фокус живёт в инпуте поиска, активная строка объявляется через
              aria-activedescendant; фокусируемая кнопка внутри опции завела бы
              вторую модель навигации, которой стрелки не управляют.
            */}
            {filtered.map((o, i) => (
              <li
                key={o.value}
                id={optionId(i)}
                role="option"
                aria-selected={o.value === value}
                className={['ds-combobox__option', i === activeIndex && 'is-active', o.value === value && 'is-selected'].filter(Boolean).join(' ')}
                onClick={() => choose(o)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                {o.icon && <Icon className="ds-combobox__icon" aria-hidden="true">{o.icon}</Icon>}
                <span>{o.label}</span>
              </li>
            ))}
            {canCreate && (
              <li id={createId} role="option" aria-selected={false}
                className={['ds-combobox__option', 'ds-combobox__create', createActive && 'is-active'].filter(Boolean).join(' ')}
                onClick={create} onMouseEnter={() => setActiveIndex(filtered.length)}>
                <span className="ds-combobox__icon" aria-hidden="true">＋</span>
                <span>{t['combobox.create'](trimmed)}</span>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )

  return label || error
    ? (
      <div className="ds-field">
        {label && <label className="ds-field__label" id={labelId} htmlFor={triggerId}>{label}</label>}
        {control}
        {error && <div className="ds-field__error" id={errorId}>{error}</div>}
      </div>
    )
    : control
}
