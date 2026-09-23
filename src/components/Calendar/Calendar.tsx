import { useRef } from 'react'
import { useDsText, useDsLocale } from '../../dictionary/DsText.js'
import { dateFormat, capitalizeFirst } from '../../internal/intl.js'
import './Calendar.css'

export type CalendarMarkTone = 'accent' | 'success' | 'warning' | 'error'

export interface CalendarProps {
  year: number
  month: number // 0-based — anchor month; with months>1 this is the centre month
  selectedId?: string
  onSelect?: (iso: string) => void
  /** ISO lower/upper bounds; days outside are disabled. */
  min?: string
  max?: string
  /** When provided, the header shows year + month dropdowns and ‹ › arrows. */
  onNavigate?: (year: number, month: number) => void
  /** When provided, a "Сегодня" button is shown under the grid. */
  onToday?: () => void
  /** ISO dates with a dot mark (default accent tone). */
  markedDates?: string[]
  /** Per-day mark tone; overrides markedDates for the same key. */
  marks?: Record<string, CalendarMarkTone>
  /** How many months to show; 3 = previous, anchor, next. Default 1. */
  months?: 1 | 2 | 3
  /**
   * Drops the panel chrome — border, shadow, padding — and lets the calendar be
   * the width of its place. For a calendar that already sits inside a `Card`,
   * where the standalone panel reads as a frame inside a frame.
   */
  embedded?: boolean
  /** View-only: no selection, no hover highlight. */
  readOnly?: boolean
  /**
   * Доступное имя ячейки дня. По умолчанию — полная дата через `Intl`
   * («воскресенье, 15 марта 2026 г.»). Видимым остаётся число: меняется имя, а
   * не текст.
   *
   * Локаль берётся из `<DsText locale>` (DS-184), а не прибита к `ru-RU`
   * и не спрашивается у браузера. Своя таблица месяцев тут не годится вдвойне:
   * имени нужен родительный («15 марта», не «15 март»), и `Intl` его знает для
   * каждого языка. Проп — для СВОЕГО формата, а не для смены языка;
   * симметрично `formatDay` у Timeline.
   */
  formatDay?: (iso: string) => string
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

const DAY_NAME_OPTS: Intl.DateTimeFormatOptions = {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
}
const MONTH_OPTS: Intl.DateTimeFormatOptions = { month: 'long' }
const WEEKDAY_OPTS: Intl.DateTimeFormatOptions = { weekday: 'short' }

/**
 * Названия месяцев и дней недели СЧИТАЮТСЯ, а не лежат таблицей (DS-184).
 *
 * До этой задачи в файле было два русских литеральных списка. Они пережили бы
 * смену локали молча: подпись дня поехала бы за `Intl`, а шапка и селект
 * остались бы русскими — то есть правка локали СОЗДАЛА бы раскол внутри одного
 * компонента вместо того, чтобы его закрыть.
 *
 * Опорные даты выбраны так, чтобы не зависеть от текущего дня: 2024-01-01 —
 * понедельник, поэтому неделя набирается прибавлением суток и порядок
 * Пн…Вс держится сам. Месяц берётся 15-м числом: у первого и последнего числа
 * есть шанс уехать в соседний месяц на сдвиге пояса, у середины его нет.
 *
 * Первая буква поднимается: `Intl` отдаёт «январь» и «пн» строчными, потому что
 * так они пишутся В ТЕКСТЕ, а здесь стоят заголовком и пунктом списка.
 */
const MONDAY_2024 = Date.UTC(2024, 0, 1)
function monthNames(locale: string): string[] {
  const fmt = dateFormat(locale, MONTH_OPTS)
  return Array.from({ length: 12 }, (_, m) =>
    capitalizeFirst(fmt.format(new Date(Date.UTC(2024, m, 15))), locale))
}
function weekdayNames(locale: string): string[] {
  const fmt = dateFormat(locale, WEEKDAY_OPTS)
  return Array.from({ length: 7 }, (_, i) =>
    capitalizeFirst(fmt.format(new Date(MONDAY_2024 + i * 86_400_000)), locale))
}

interface Cell { y: number; m: number; d: number; out: boolean; weekend: boolean }

function buildCells(year: number, month: number): Cell[] {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7 // 0=Mon
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevDays = new Date(year, month, 0).getDate()
  const cells: Cell[] = []
  const push = (y: number, m: number, d: number, out: boolean) => {
    const dow = new Date(y, m, d).getDay()
    cells.push({ y, m, d, out, weekend: dow === 0 || dow === 6 })
  }
  for (let i = 0; i < firstDow; i++) {
    const d = prevDays - firstDow + 1 + i
    const pm = month === 0 ? 11 : month - 1
    const py = month === 0 ? year - 1 : year
    push(py, pm, d, true)
  }
  for (let d = 1; d <= daysInMonth; d++) push(year, month, d, false)
  return cells
}

function monthOffsets(count: 1 | 2 | 3): number[] {
  if (count === 1) return [0]
  if (count === 2) return [-1, 0]
  return [-1, 0, 1]
}

function shiftMonth(year: number, month: number, delta: number): [number, number] {
  const dt = new Date(year, month + delta, 1)
  return [dt.getFullYear(), dt.getMonth()]
}

function markTone(
  id: string,
  markedDates?: string[],
  marks?: Record<string, CalendarMarkTone>,
): CalendarMarkTone | undefined {
  if (marks?.[id]) return marks[id]
  if (markedDates?.includes(id)) return 'accent'
  return undefined
}

interface MonthGridProps {
  year: number
  month: number
  selectedId?: string
  onSelect?: (iso: string) => void
  min?: string
  max?: string
  markedDates?: string[]
  marks?: Record<string, CalendarMarkTone>
  readOnly?: boolean
  showLabel?: boolean
  formatDay: (iso: string) => string
}

function MonthGrid({
  year, month, selectedId, onSelect, min, max, markedDates, marks, readOnly, showLabel, formatDay,
}: MonthGridProps) {
  const locale = useDsLocale()
  const cells = buildCells(year, month)
  const gridRef = useRef<HTMLDivElement>(null)

  const enabled = (c: Cell) => {
    const id = iso(c.y, c.m, c.d)
    return !((min !== undefined && id < min) || (max !== undefined && id > max))
  }
  // Ровно один таб-стоп на сетку: 42 кнопки — это 42 таб-стопа на месяц и 126
  // при months={3}, то есть пройти календарь табом до следующего поля формы
  // было отдельным упражнением. Клавиатурная модель сетки обратная: внутрь
  // ведёт один Tab, дальше стрелки. В порядке табуляции — выбранный день, а
  // если выбора нет, первый доступный.
  const selectedIndex = cells.findIndex((c) => iso(c.y, c.m, c.d) === selectedId && enabled(c))
  const tabIndexAt = selectedIndex >= 0 ? selectedIndex : cells.findIndex(enabled)

  /**
   * Стрелки двигают фокус по сетке. Недоступный день — стена, а не препятствие
   * для перешагивания, и это не упрощение, а факт про `min`/`max`: они гасят
   * непрерывный префикс и суффикс, поэтому за недоступным днём в сторону шага
   * доступного не бывает никогда. Дыры в середине сетки этим API не собрать.
   *
   * Первая версия честно шагала циклом «пока не найдём доступный». Мутация
   * «цикл → один шаг» не уронила ни одного теста — и правильно: цикл не мог
   * закончиться иначе, чем один шаг. Это был не пробел в проверках, а код,
   * которого не должно быть.
   */
  function onGridKeyDown(e: React.KeyboardEvent) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1
      : e.key === 'ArrowDown' ? 7 : e.key === 'ArrowUp' ? -7 : 0
    const buttons = gridRef.current?.querySelectorAll<HTMLButtonElement>('button.ds-cal__day')
    if (!buttons?.length) return
    const from = [...buttons].indexOf(e.target as HTMLButtonElement)
    if (from < 0) return

    let to = -1
    if (step !== 0) {
      const next = from + step
      if (next >= 0 && next < buttons.length && !buttons[next]!.disabled) to = next
    } else if (e.key === 'Home' || e.key === 'End') {
      // Неделя, а не месяц: строка сетки — это то, что видит глаз.
      const weekStart = from - (from % 7)
      const range = e.key === 'Home'
        ? [...Array(7).keys()].map((i) => weekStart + i)
        : [...Array(7).keys()].map((i) => weekStart + 6 - i)
      to = range.find((i) => i < buttons.length && !buttons[i]!.disabled) ?? -1
    } else return

    // Гасим всегда, даже когда идти некуда: иначе ArrowDown у края сетки
    // прокручивает страницу, и календарь уезжает из поля зрения.
    e.preventDefault()
    if (to >= 0 && to !== from) buttons[to]!.focus()
  }

  return (
    <div className="ds-cal__month">
      {showLabel && (
        <div className="ds-cal__month-label">{monthNames(locale)[month]} {year}</div>
      )}
      <div className="ds-cal__grid" ref={gridRef} onKeyDown={readOnly ? undefined : onGridKeyDown}>
        {weekdayNames(locale).map((w, i) => (
          <span key={w} className={['ds-cal__dow', i >= 5 && 'ds-cal__dow--weekend'].filter(Boolean).join(' ')}>{w}</span>
        ))}
        {cells.map((c, i) => {
          const id = iso(c.y, c.m, c.d)
          const isSel = id === selectedId
          const disabled = (min !== undefined && id < min) || (max !== undefined && id > max)
          const tone = markTone(id, markedDates, marks)
          const classes = [
            'ds-cal__day',
            c.out && 'ds-cal__day--out',
            c.weekend && 'ds-cal__day--weekend',
            isSel && 'is-selected',
            tone && `ds-cal__day--mark-${tone}`,
          ].filter(Boolean).join(' ')

          const content = (
            <>
              <span className="ds-cal__day-num">{c.d}</span>
              {tone && <span className="ds-cal__mark" aria-hidden="true" />}
            </>
          )

          const key = `${c.m}-${c.d}-${c.y}`

          // Имя — полная дата, текст — число. Без этого скринридер объявляет
          // «15, кнопка»: ни месяца, ни года, а в режиме months={3} на экране
          // три пятнадцатых подряд, и различить их на слух нельзя вовсе.
          const label = formatDay(id)

          if (readOnly) {
            return (
              <div key={key} className={classes} aria-label={label} aria-current={isSel ? 'date' : undefined}>
                {content}
              </div>
            )
          }

          return (
            <button
              type="button"
              key={key}
              className={classes}
              aria-label={label}
              aria-pressed={isSel}
              tabIndex={i === tabIndexAt ? 0 : -1}
              disabled={disabled}
              onClick={() => onSelect?.(id)}
            >{content}</button>
          )
        })}
      </div>
    </div>
  )
}

export function Calendar({
  year, month, selectedId, onSelect, min, max, onNavigate, onToday,
  markedDates, marks, months = 1, readOnly = false, embedded = false,
  formatDay,
}: CalendarProps) {
  const t = useDsText()
  const locale = useDsLocale()
  // Умолчание перенесено из деструктуризации в тело: оно зависит от локали, а
  // значение по умолчанию в сигнатуре вычисляется вне компонента и хука не
  // видит.
  const dayName = formatDay ?? ((id: string) => {
    const [y, m, d] = id.split('-').map(Number)
    return dateFormat(locale, DAY_NAME_OPTS).format(new Date(y!, m! - 1, d!))
  })
  const months12 = monthNames(locale)
  const years: number[] = []
  const minY = min ? Number(min.slice(0, 4)) : year - 10
  const maxY = max ? Number(max.slice(0, 4)) : year + 10
  for (let y = Math.min(minY, year); y <= Math.max(maxY, year); y++) years.push(y)

  const go = (y: number, m: number) => onNavigate?.(y, m)
  const shift = (delta: number) => {
    const [y, m] = shiftMonth(year, month, delta)
    go(y, m)
  }

  const offsets = monthOffsets(months)
  const panels = offsets.map((off) => {
    const [y, m] = shiftMonth(year, month, off)
    return { y, m }
  })

  return (
    <div className={['ds-cal', readOnly && 'ds-cal--readonly',
      embedded && 'ds-cal--embedded'].filter(Boolean).join(' ')}>
      {/* Пустая шапка всё равно держала margin-bottom — лишние ~16px над
          подписями месяцев там, где показывать в ней нечего. */}
      {(onNavigate || months === 1) && (
      <div className="ds-cal__header">
        {onNavigate ? (
          <>
            <select
              className="ds-cal__select" aria-label={t['calendar.year']} value={year}
              onChange={(e) => go(Number(e.target.value), month)}
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select
              className="ds-cal__select" aria-label={t['calendar.month']} value={month}
              onChange={(e) => go(year, Number(e.target.value))}
            >
              {months12.map((mn, i) => <option key={mn} value={i}>{mn}</option>)}
            </select>
            <span className="ds-cal__spacer" />
            <button type="button" className="ds-cal__nav" aria-label={t['calendar.prevMonth']} onClick={() => shift(-1)}>‹</button>
            <button type="button" className="ds-cal__nav" aria-label={t['calendar.nextMonth']} onClick={() => shift(1)}>›</button>
          </>
        ) : (
          <span className="ds-cal__title">{months12[month]} {year}</span>
        )}
      </div>
      )}

      {months === 1 ? (
        <MonthGrid
          year={year}
          month={month}
          selectedId={selectedId}
          onSelect={onSelect}
          min={min}
          max={max}
          markedDates={markedDates}
          marks={marks}
          readOnly={readOnly}
          formatDay={dayName}
        />
      ) : (
        <div className="ds-cal__months">
          {panels.map(({ y, m }) => (
            <MonthGrid
              key={`${y}-${m}`}
              year={y}
              month={m}
              selectedId={selectedId}
              onSelect={onSelect}
              min={min}
              max={max}
              markedDates={markedDates}
              marks={marks}
              readOnly={readOnly}
              formatDay={dayName}
              showLabel
            />
          ))}
        </div>
      )}

      {onToday && (
        <button type="button" className="ds-cal__today" onClick={onToday}>{t['calendar.today']}</button>
      )}
    </div>
  )
}
