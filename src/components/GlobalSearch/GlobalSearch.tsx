import { useEffect, useId, useState } from 'react'
import { usePopupLayer } from '../../internal/usePopupLayer.js'
// Строка поиска — `.ds-input`: поверхность в `field-surface.css`, геометрия в
// `field-frame.css`; без них одиночная установка компонента даёт голое поле.
import '../../styles/field-surface.css'
import '../../styles/field-frame.css'
import { useDsText } from '../../dictionary/DsText.js'
import './GlobalSearch.css'

export interface SearchResult { id: string; label: string; group?: string }

/**
 * Нативные атрибуты строки поиска; `ref` смотрит на `<input>` (DS-108).
 * До этого у компонента не было даже `className` и `id`: закрытый набор пропов
 * был дырой, а не решением. Клавиатуру и роль компонент держит сам, поэтому
 * `onKeyDown` и `role` наружу не отдаются.
 */
type GlobalSearchNative = Omit<
  React.ComponentPropsWithRef<'input'>,
  'value' | 'defaultValue' | 'onChange' | 'onKeyDown' | 'role' | 'type' | 'size' | 'children'
  // Два имени заняты нативным вводом под другое: `results` у `<input>` — это
  // число совпадений в поиске Safari, `onSelect` — выделение текста
  // курсором. Здесь это выдача и выбор строки выдачи.
  | 'results' | 'onSelect'
>

export interface GlobalSearchProps extends GlobalSearchNative {
  value: string
  onChange: (v: string) => void
  results?: SearchResult[]
  onSelect?: (id: string) => void
  placeholder?: string
  /**
   * Видимая подпись. До DS-109 подписи не было как пропа: строка поиска
   * именовалась только `aria-label` потребителя. Без подписи обёртка не
   * рисуется — в шапке приложения её обычно и не нужно.
   */
  label?: string
}

export function GlobalSearch({
  value, onChange, results = [], onSelect, placeholder,
  label, id, className, ...rest
}: GlobalSearchProps) {
  const t = useDsText()
  const open = results.length > 0
  const zIndex = usePopupLayer(open)
  const [activeIndex, setActiveIndex] = useState(0)
  const autoId = useId()
  const baseId = id ?? autoId
  const inputId = `${baseId}-input`
  const listId = `${baseId}-list`
  const optionId = (i: number) => `${baseId}-opt-${i}`

  // Новая выдача — активная строка снова первая. Иначе после набора ещё одной
  // буквы Enter выбрал бы третий результат из прошлого списка: индекс пережил
  // бы данные, под которыми он что-то значил.
  useEffect(() => { setActiveIndex(0) }, [results])

  const active = results[activeIndex]

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)) }
    // Home/End НЕ перехватываются: это `<input type="search">` с живым текстом,
    // и каретка принадлежит полю. С `preventDefault` пользователь не мог
    // перевести каретку в начало запроса, чтобы дописать слово спереди
    // (DS-110). У `Combobox` этих клавиш нет по той же причине —
    // выравнивали ВНИЗ, а не досыпали их второму виджету.
    else if (e.key === 'Enter' && active) { e.preventDefault(); onSelect?.(active.id) }
  }

  const bar = (
    <div className={['ds-gsearch', className].filter(Boolean).join(' ')}>
      <input
        {...rest}
        id={inputId}
        type="search"
        // combobox, а не searchbox: поле управляет всплывающим списком, и
        // aria-expanded/aria-controls/aria-activedescendant осмысленны только
        // при этой роли. `role="searchbox"` обещал одинокое поле ввода — то
        // есть описывал не тот виджет, который на экране.
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active ? optionId(activeIndex) : undefined}
        aria-autocomplete="list"
        className="ds-gsearch__input ds-input ds-input--sm"
        value={value} placeholder={placeholder ?? t['globalSearch.placeholder']}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul className="ds-gsearch__menu" role="listbox" id={listId} style={{ zIndex }}>
          {/*
            Строка результата кликабельна сама, а не оборачивает <button>.
            Фокус остаётся в поле поиска, активная строка объявляется через
            aria-activedescendant; фокусируемая кнопка внутри `role="option"`
            завела бы вторую модель навигации — ту же, что убрана из Combobox
            в 1.32.0.
          */}
          {results.map((r, i) => (
            <li
              key={r.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIndex}
              className={['ds-gsearch__option', i === activeIndex && 'is-active'].filter(Boolean).join(' ')}
              onClick={() => onSelect?.(r.id)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="ds-gsearch__label">{r.label}</span>
              {r.group && <span className="ds-gsearch__group">{r.group}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  // Обёртка появляется только вместе с подписью — как у `SearchBar`.
  return label
    ? (
      <div className="ds-field">
        <label className="ds-field__label" htmlFor={inputId}>{label}</label>
        {bar}
      </div>
    )
    : bar
}
