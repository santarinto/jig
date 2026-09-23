import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { rovingTarget } from '../../internal/roving.js'
import '../../styles/disabled-item.css'
import './SectionPanel.css'
import { Icon } from '../../icons/index.js'

export interface Section {
  id: string
  label: string
  icon?: React.ReactNode
  /**
   * Раздел виден, но недоступен. Как у `Tabs`: помечается `aria-disabled` и
   * пропускается стрелками, а не убирается из полосы — исчезнувший раздел
   * меняет нумерацию для скринридера («2 из 5» вдруг про другой раздел).
   */
  disabled?: boolean
}
export interface SectionPanelProps {
  sections: Section[]
  selectedId: string
  onSelect?: (id: string) => void
  orientation?: 'vertical' | 'horizontal'
}

/** Ширина затухания края, в em ленты. Та же величина стоит в `SectionPanel.css`. */
const FADE_EM = 1.5

export function SectionPanel({ sections, selectedId, onSelect, orientation = 'vertical' }: SectionPanelProps) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const listRef = useRef<HTMLDivElement>(null)
  const activeIndex = sections.findIndex((s) => s.id === selectedId)

  /**
   * ЛЕНТА ЛИСТАЕТСЯ САМА, КОГДА РАЗДЕЛЫ НЕ ВЛЕЗАЮТ (DS-305). Приём тот
   * же, что у `Tabs` (`updateOverflow`): замер `scrollWidth > clientWidth` на
   * самой ленте и класс `is-scrollable`, а не постоянный `overflow: auto` —
   * тот резал бы кольцо фокуса и там, где листать нечего. Без этого узкий
   * горизонтальный ряд разделов отдавал лишнее документу: +229 на кадре 360
   * при шкале 1. Вертикальной ленте нечего листать вбок — замер не ставится.
   *
   * Обратной связи нет: `is-scrollable` меняет только `overflow`, ширины
   * содержимого он не трогает, и `scrollWidth` от него не зависит.
   */
  const [scrollable, setScrollable] = useState(false)
  /**
   * ГДЕ ЛЕНТА СЕЙЧАС (DS-313). Полоса прокрутки — не единственный знак
   * «за краем есть ещё»: на системе с плавающими полосами (macOS по умолчанию)
   * в покое её нет вовсе, и решение 305 там не выполняется. Поэтому край, за
   * которым скрыты разделы, затухает (`mask-image` в CSS), а какой именно край —
   * знает только замер положения: у начала ленты затухает правый, в конце —
   * левый, в середине — оба.
   */
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)
  const horizontal = orientation === 'horizontal'
  const updateOverflow = useCallback(() => {
    const el = listRef.current
    if (!el) return
    setScrollable(el.scrollWidth > el.clientWidth + 1)
    // Допуск в пиксель: на дробном масштабе `scrollLeft` в конце не доходит до
    // `scrollWidth − clientWidth` ровно.
    setAtStart(el.scrollLeft <= 1)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)
  }, [])

  /**
   * АКТИВНЫЙ РАЗДЕЛ — В ВИДИМОЙ ЧАСТИ ЛЕНТЫ (313). Выбранный раздел за краем
   * читается как «ничего не выбрано». Не `scrollIntoView`: с любым `block` он
   * вправе прокрутить и СТРАНИЦУ, если лента вне экрана по вертикали, — а
   * вопрос только про ленту. Сдвиг считается сам и с запасом на ширину
   * затухания, иначе раздел встал бы ровно под погашенный край.
   */
  useLayoutEffect(() => {
    const el = listRef.current
    const item = btnRefs.current[activeIndex]
    if (!horizontal || !scrollable || !el || !item) return
    const fade = (parseFloat(getComputedStyle(el).fontSize) || 0) * FADE_EM
    // От бокса ленты, а не `offsetLeft`: тот считается от `offsetParent`, и у
    // позиционированной ленты давал бы координату в другой системе.
    const left = item.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft
    const right = left + item.getBoundingClientRect().width
    if (left - fade < el.scrollLeft) el.scrollLeft = Math.max(0, left - fade)
    else if (right + fade > el.scrollLeft + el.clientWidth) el.scrollLeft = right + fade - el.clientWidth
    updateOverflow()
  }, [horizontal, scrollable, activeIndex, updateOverflow])
  useLayoutEffect(() => {
    if (!horizontal) { setScrollable(false); return }
    updateOverflow()
    const el = listRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(updateOverflow)
    ro.observe(el)
    // И сами разделы: догрузка шрифта или смена подписи меняет ширину
    // СОДЕРЖИМОГО при той же ширине ленты, и наблюдатель на одной ленте молчал бы.
    for (const item of el.children) ro.observe(item)
    return () => ro.disconnect()
  }, [horizontal, updateOverflow, sections])

  function onKeyDown(e: React.KeyboardEvent) {
    const ni = rovingTarget(sections, activeIndex, e.key, orientation)
    if (ni === null) return
    e.preventDefault()
    const next = sections[ni]
    if (!next) return
    onSelect?.(next.id)
    btnRefs.current[ni]?.focus()
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-orientation={orientation}
      className={[
        'ds-sections', `ds-sections--${orientation}`,
        scrollable && 'is-scrollable', scrollable && atStart && 'is-start', scrollable && atEnd && 'is-end',
      ].filter(Boolean).join(' ')}
      onKeyDown={onKeyDown}
      onScroll={horizontal ? updateOverflow : undefined}
    >
      {sections.map((s, i) => {
        const active = s.id === selectedId
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={active}
            {...(s.disabled ? { 'aria-disabled': true as const } : {})}
            // Как в Tabs: таб-стоп получает активный раздел, выключенный —
            // никогда, даже будучи активным.
            tabIndex={active && !s.disabled ? 0 : -1}
            ref={(el) => { btnRefs.current[i] = el }}
            className={['ds-sections__item', active && 'is-active'].filter(Boolean).join(' ')}
            onClick={s.disabled ? undefined : () => onSelect?.(s.id)}
          >
            {s.icon && <Icon className="ds-sections__icon" aria-hidden="true">{s.icon}</Icon>}
            <span className="ds-sections__label">{s.label}</span>
          </button>
        )
      })}
    </div>
  )
}
