import { useEffect, useRef, useState } from 'react'
import { useDsText, useDsLocale } from '../../dictionary/DsText.js'
import { dateFormat } from '../../internal/intl.js'
import { ChartLegend } from '../../internal/ChartLegend.js'
import { Button } from '../Button/index.js'
import { ToggleGroup } from '../ToggleGroup/index.js'
import { assignPaletteSlots } from '../../internal/paletteSlots.js'
import {
  allDayBand, autoScrollStep, dayChips, dayColumns, minutesOf, monthGrid, placeDay, segmentStyle, shiftDay,
  snapMinutes, splitLocal,
  type EventCalendarEvent,
} from './layout.js'
import '../../styles/visually-hidden.css'
import './EventCalendar.css'

export type { EventCalendarEvent }
export type EventCalendarView = 'month' | 'week' | 'day'

/** Календарь как цветовая дорожка: цвет берётся ПОРЯДКОМ в этом списке. */
export interface EventCalendarSource {
  id: string
  title: string
}

export interface EventCalendarProps {
  events: EventCalendarEvent[]
  view: EventCalendarView
  /** ISO-день, курсор. Что показано — считается из него и вида. */
  date: string
  calendars?: EventCalendarSource[]
  hiddenCalendars?: string[]
  onToggleCalendar?: (id: string) => void
  onEventClick?: (id: string) => void
  /** Ручка есть — стрелки есть; без неё навигации не рисуем. */
  onDateChange?: (iso: string) => void
  /**
   * Создание. Сетка слотов существует РАДИ неё: без ручки это был бы пустой
   * таб-стоп на 336 ячеек, который ничего не делает.
   */
  onEventCreate?: (draft: { start: string; end: string }) => void
  /** Шаг сетки и snap жестов. */
  slot?: 15 | 30 | 60
  /**
   * Перенос и растягивание. Уведомление, а не команда: компонент не хранит
   * применённое состояние, поэтому ошибка сервера не оставляет его в неверном
   * виде — до смены `events` на сетке остаётся старое положение.
   */
  onEventChange?: (id: string, next: { start: string; end: string }) => void
  /**
   * События, изменение которых ушло на сервер и ещё не вернулось: приглушены,
   * `aria-busy`, жест на них не начинается. Снаружи этого не нарисовать —
   * событие рисуем мы.
   */
  pendingIds?: string[]
  /** Гасит все жесты. На отдельном событии то же делает его `readOnly`. */
  readOnly?: boolean
  onViewChange?: (view: EventCalendarView) => void
  /**
   * Кнопка «Сегодня». Без аргумента: компонент не знает, какое сегодня, и
   * знать не должен — иначе тест зависит от часов машины. Так же в `Calendar`.
   */
  onToday?: () => void
  /**
   * Рабочие часы: тонирование фона и точка начальной прокрутки. НЕ обрезание —
   * сетка всегда полные сутки. Обрезанный день молча теряет события, не попавшие
   * в окно, и хуже всего это на единственном ночном событии, которого просто нет.
   */
  workHours?: [string, string]
  /** Строк пояса `allDay`; сверх потолка последняя отдаётся счётчику. */
  allDayRows?: number
  /**
   * Чипов в клетке месяца. Потолок фиксированный, а не вычисленный из высоты:
   * замер требует `ResizeObserver`, который в фоновой вкладке не приходит вовсе
   * и оставляет числа монтажными, выглядя при этом правдоподобно.
   */
  monthChips?: number
  formatTime?: (iso: string) => string
  formatDay?: (iso: string) => string
  className?: string
}

const DAY_NAME_OPTS: Intl.DateTimeFormatOptions = {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
}
/** Шапка колонки: день недели коротко, число отдельно — см. `dayHead`. */
const WEEKDAY_OPTS: Intl.DateTimeFormatOptions = { weekday: 'short' }
/** Время НЕ через `Intl`: это срез самой строки ISO, и локаль на него не влияет. */
const defaultFormatTime = (iso: string) => iso.split('T')[1] ?? ''

const MINUTES_IN_DAY = 1440
/** Порог, отделяющий клик от протяжки. То же число, что в `Tree`. */
const DRAG_THRESHOLD = 4
/** Кромка растягивания. Не элемент: кнопка внутри кнопки события упёрлась бы в
 *  `no-nested-interactive`, и по делу — у неё не было бы ни имени, ни клавиатуры. */
const EDGE_PX = 8

type DraftKind = 'move' | 'resize-start' | 'resize-end' | 'create'

interface GestureStart {
  kind: DraftKind
  x: number
  y: number
  started: boolean
  eventId?: string
  at: { day: string; minutes: number }
}

interface Draft {
  eventId?: string
  start: string
  end: string
}

/**
 * Куда жест привёл. Чистая: тестируется через компонент, но не зависит ни от
 * DOM, ни от React — вся арифметика жеста собрана в одном месте.
 */
function draftOf(
  g: GestureStart,
  at: { day: string; minutes: number },
  slot: number,
  byId: Map<string, EventCalendarEvent>,
): Draft | null {
  if (g.kind === 'create') {
    const a = snapMinutes(g.at.minutes, slot)
    const b = snapMinutes(at.minutes, slot)
    const [from, to] = a <= b ? [a, b] : [b, a]
    return {
      start: atMinute(g.at.day, from),
      end: atMinute(g.at.day, Math.max(to, from + slot)),
    }
  }

  const event = byId.get(g.eventId!)
  if (!event) return null
  const [startDay, startMin] = splitLocal(event.start)
  const [, endMin] = splitLocal(event.end)
  const delta = snapMinutes(at.minutes, slot) - snapMinutes(g.at.minutes, slot)

  if (g.kind === 'move') {
    // Длительность сохраняется, а день берётся из колонки под курсором: перенос
    // это перенос, а не растягивание с переездом.
    const dayShift = daysBetween(startDay, at.day)
    return {
      eventId: event.id,
      start: atMinute(shiftDay(startDay, dayShift), startMin + delta),
      end: atMinute(shiftDay(startDay, dayShift), endMin + delta),
    }
  }

  if (g.kind === 'resize-start') {
    // Минимальная длительность — слот: событие нулевой длины невидимо и
    // неотличимо от промаха.
    const start = Math.min(startMin + delta, endMin - slot)
    return { eventId: event.id, start: atMinute(startDay, start), end: event.end }
  }

  const end = Math.max(endMin + delta, startMin + slot)
  return { eventId: event.id, start: event.start, end: atMinute(startDay, end) }
}

/**
 * Ширина уезжает в переменную по той же причине, что и порядок наложения:
 * инлайновое свойство побеждает любое правило листа, и раскрытие события под
 * курсором до правила просто не доходило. `left` остаётся обычным свойством —
 * он и при раскрытии не меняется: событие растёт ВПРАВО.
 */
function eventBox(box: { top: string; height: string; left: string; width: string }) {
  const { width, ...rest } = box
  return { ...rest, ['--ds-eventcal-w' as string]: width }
}

/** `570` → `'09:30'`. Для объявления, где время читается вслух. */
function fmtMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/**
 * Шаг захвата. Стрелка двигает событие целиком, Shift со стрелкой тянет конец —
 * ровно те же два жеста, что у указателя, и с тем же полом в один слот.
 */
function movedGrab(grab: Draft, e: React.KeyboardEvent, slot: number): Draft | null {
  const vertical = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
  const horizontal = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
  if (!vertical && !horizontal) return null

  const [startDay, startMin] = splitLocal(grab.start)
  const [endDay, endMin] = splitLocal(grab.end)

  if (e.shiftKey && vertical) {
    const end = Math.max(endMin + vertical * slot, startMin + slot)
    return { ...grab, end: atMinute(endDay, end) }
  }

  const day = horizontal ? shiftDay(startDay, horizontal) : startDay
  const shift = vertical * slot
  return {
    ...grab,
    start: atMinute(day, startMin + shift),
    end: atMinute(day, endMin + shift),
  }
}

/** Черновик в координатах суток `day`; за их пределами прижимается к краю. */
function draftBox(draft: Draft, day: string): { from: number; to: number } {
  const [startDay, startMin] = splitLocal(draft.start)
  const [endDay, endMin] = splitLocal(draft.end)
  return {
    from: startDay === day ? startMin : 0,
    to: endDay === day ? endMin : MINUTES_IN_DAY,
  }
}

/** Календарная разница в днях. Циклом по дням, а не делением миллисекунд. */
function daysBetween(from: string, to: string): number {
  if (from === to) return 0
  const forward = from < to
  let n = 0
  for (let day = from; day !== to; day = shiftDay(day, forward ? 1 : -1)) {
    n += forward ? 1 : -1
    if (Math.abs(n) > 400) return 0
  }
  return n
}

/** `('2026-09-02', 570)` → `'2026-09-02T09:30'`; минуты сверх суток переносят день. */
function atMinute(day: string, minutes: number): string {
  const carried = Math.floor(minutes / MINUTES_IN_DAY)
  const rest = minutes - carried * MINUTES_IN_DAY
  const hh = String(Math.floor(rest / 60)).padStart(2, '0')
  const mm = String(rest % 60).padStart(2, '0')
  return `${carried ? shiftDay(day, carried) : day}T${hh}:${mm}`
}
const pct = (value: number) => `${Number((value * 100).toFixed(4))}%`

/** Понедельник недели, в которую попал день. */
function weekStart(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const dow = (new Date(y!, m! - 1, d!).getDay() + 6) % 7
  return shiftDay(day, -dow)
}

function visibleDays(view: EventCalendarView, date: string): string[] {
  if (view === 'day') return [date]
  const first = weekStart(date)
  return Array.from({ length: 7 }, (_, i) => shiftDay(first, i))
}

export function EventCalendar({
  events, view, date, calendars = [], hiddenCalendars = [], onToggleCalendar, onEventClick,
  onDateChange, onViewChange, onToday, onEventCreate, onEventChange, slot = 30,
  pendingIds = [], readOnly,
  workHours, allDayRows = 3, monthChips = 3,
  formatTime = defaultFormatTime, formatDay, className,
}: EventCalendarProps) {
  const t = useDsText()
  const locale = useDsLocale()
  // Умолчание перенесено из деструктуризации в тело: оно зависит от локали, а
  // значение по умолчанию в сигнатуре вычисляется вне компонента и хука не
  // видит.
  const dayName = formatDay ?? ((day: string) => {
    const [y, m, d] = day.split('-').map(Number)
    return dateFormat(locale, DAY_NAME_OPTS).format(new Date(y!, m! - 1, d!))
  })
  const hidden = new Set(hiddenCalendars)
  // Скрытый календарь НЕ рендерится, а не прячется `aria-hidden`: иначе список
  // событий читает то, чего на сетке нет.
  const shown = events.filter((e) => !e.calendarId || !hidden.has(e.calendarId))
  const days = visibleDays(view, date)

  // Тот же расчёт, что у графиков и их легенды: календарь без закреплённого
  // слота берёт цвет по порядку, как брал (`chartSeriesVar(index)`), и
  // точка легенды не может разойтись с событием на сетке.
  const calendarColors = assignPaletteSlots(calendars, 'EventCalendar')
  const toneOf = (event: EventCalendarEvent): string =>
    (event.calendarId && calendarColors.get(event.calendarId)) || 'var(--ds-accent)'

  /**
   * Полное имя: название, время, день, календарь. Видимым остаётся название —
   * та же развилка, что в `Calendar`, где имя ячейки полная дата, а текст число.
   * Без дня в имени список событий недели читается как набор безадресных встреч.
   */
  const nameOf = (event: EventCalendarEvent, day: string): string => {
    const source = calendars.find((c) => c.id === event.calendarId)
    const time = event.allDay
      ? t['eventCalendar.allDay']
      : `${formatTime(event.start)}–${formatTime(event.end)}`
    return [event.title, time, dayName(day), source?.title].filter(Boolean).join(', ')
  }

  const byId = new Map(shown.map((e) => [e.id, e]))

  const pending = new Set(pendingIds)

  /**
   * Черновик текущего жеста — ЕДИНСТВЕННОЕ состояние компонента. Живёт от
   * `pointerdown` до `pointerup` и умирает там же: применённое положение
   * приходит пропсами, а не остаётся здесь.
   */
  const [draft, setDraft] = useState<Draft | null>(null)
  const gesture = useRef<GestureStart | null>(null)
  /**
   * Клик, который браузер пришлёт после жеста, надо съесть: `click` приходит и
   * после протяжки через полсетки, и без этого перенос завершался бы ещё и
   * выбором события. Выбор при этом живёт ТОЛЬКО в `onClick` — иначе он звучал
   * бы дважды на каждый обычный клик и ни разу с клавиатуры.
   */
  const swallowClick = useRef(false)
  const gridRef = useRef<HTMLDivElement>(null)
  /** Одна строка состояния на компонент: то, что он сделал сам. */
  const [status, setStatus] = useState('')
  /**
   * Клавиатурный захват: единственная форма, в которой перенос и растягивание
   * вообще существуют без мыши. Держит ЧЕРНОВИК, как и жест указателем, —
   * применённое приходит пропсами.
   */
  const [grab, setGrab] = useState<Draft | null>(null)
  /**
   * Кому вернуть фокус после применения. Событие, переехавшее в другой день,
   * рендерится в другой колонке — React пересоздаёт узел, и фокус уходит в
   * body: клавиатурного пользователя выбрасывает из компонента, а возвращаться
   * ему приходится табом с начала.
   */
  const refocus = useRef<string | null>(null)

  /**
   * Пиксель в координату сетки. День берётся по ПРЯМОУГОЛЬНИКАМ колонок, а не
   * `elementFromPoint`: над колонками лежат ещё два слоя, и попадание всегда
   * достаётся верхнему — вернулся бы слой, а не день.
   *
   * Не делением ширины на число дней, как было: с DS-328 колонки НЕ
   * равны — плотный день шире соседей, — и деление отдавало бы четверг там, где
   * курсор стоит над средой. Левее первой колонки — первая, правее последней —
   * последняя: жест, ушедший за край, прижимается, а не теряется.
   */
  function pointAt(e: React.PointerEvent): { day: string; minutes: number } | null {
    const rect = colsRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return null
    const cols = [...colsRef.current!.querySelectorAll<HTMLElement>('.ds-eventcal__col')]
    // Курсор прижимается к ВИДИМОЙ части порта. Под липкими часами лежат дни,
    // уехавшие влево, и без прижима курсор над часами уводил жест в день,
    // которого не видно: черновик невидим, отпускание переносит туда событие.
    const x = clampToPort(e.clientX)
    const hit = cols.findIndex((c) => x < c.getBoundingClientRect().right)
    const col = hit < 0 ? days.length - 1 : hit
    const minutes = Math.min(MINUTES_IN_DAY, Math.max(0, ((e.clientY - rect.top) / rect.height) * MINUTES_IN_DAY))
    return { day: days[col]!, minutes }
  }

  /** Видимая по горизонтали часть порта: правее липких часов, левее его края. */
  function portSpan(): { left: number; right: number } | null {
    const box = gridRef.current?.getBoundingClientRect()
    if (!box || !box.width) return null
    return { left: box.left + (hoursRef.current?.offsetWidth ?? 0), right: box.right }
  }

  function clampToPort(x: number): number {
    const span = portSpan()
    return span ? Math.min(span.right - 1, Math.max(span.left, x)) : x
  }

  function onPointerDown(e: React.PointerEvent) {
    if (readOnly || e.button !== 0) return
    const at = pointAt(e)
    if (!at) return
    const eventNode = (e.target as HTMLElement).closest<HTMLElement>('.ds-eventcal__event')
    const id = eventNode?.dataset.eventId
    const event = id ? byId.get(id) : undefined

    if (event) {
      if (event.readOnly || pending.has(event.id) || !onEventChange) return
      // Жест выбирается ЗОНОЙ НАЖАТИЯ, а не модификатором: кромка сверху и
      // снизу тянет свой край, остальное тело переносит целиком.
      const box = eventNode!.getBoundingClientRect()
      const edge = Math.min(EDGE_PX, box.height / 3)
      const kind: DraftKind = e.clientY - box.top <= edge ? 'resize-start'
        : box.bottom - e.clientY <= edge ? 'resize-end'
        : 'move'
      gesture.current = { kind, x: e.clientX, y: e.clientY, started: false, eventId: event.id, at }
      e.currentTarget.setPointerCapture?.(e.pointerId)
      return
    }

    if (!onEventCreate) return
    gesture.current = { kind: 'create', x: e.clientX, y: e.clientY, started: false, at }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current
    if (!g) return
    if (!g.started) {
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < DRAG_THRESHOLD) return
      g.started = true
    }
    const at = pointAt(e)
    if (at) setDraft(draftOf(g, at, slot, byId))

    // Шаг считает `layout.ts`, здесь только применение. Цикл на `rAF` тут не
    // нужен вовсе: пока указатель у края, события `pointermove` идут сами, а
    // решения в шаге уже нет — значит и проверять в браузере нечего.
    const box = gridRef.current?.getBoundingClientRect()
    if (box && box.height) {
      // Верх порта занят липкой шапкой: край, у которого начинается прокрутка
      // вверх, — её нижняя кромка, а не верх порта. Иначе тащить вверх
      // пришлось бы ПОВЕРХ шапки дней.
      const top = box.top + (topRef.current?.offsetHeight ?? 0)
      const step = autoScrollStep(e.clientY, { top, bottom: box.bottom })
      if (step !== 0) gridRef.current!.scrollTop += step
    }
    // И вбок (DS-334): на узком экране видно два-три дня, и без
    // этого перенести событие в день за краем было некуда. Тот же шаг, что по
    // вертикали; левый край — кромка липких часов, а не порта.
    const span = portSpan()
    if (span) {
      const side = autoScrollStep(e.clientX, { top: span.left, bottom: span.right })
      if (side !== 0) gridRef.current!.scrollLeft += side
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const g = gesture.current
    gesture.current = null
    setDraft(null)
    if (!g) return
    const at = pointAt(e)
    if (!at) return

    if (!g.started) {
      // Клик, а не протяжка. По событию выбор придёт своим `click` — здесь
      // только создание по пустому месту, длиной в слот: отдельной ручки под
      // это нет намеренно, иначе одно действие называлось бы двумя именами.
      if (g.eventId) return
      if (onEventCreate) {
        const start = snapMinutes(g.at.minutes, slot)
        onEventCreate({ start: atMinute(g.at.day, start), end: atMinute(g.at.day, start + slot) })
      }
      return
    }

    swallowClick.current = true
    const next = draftOf(g, at, slot, byId)
    if (!next) return
    if (next.eventId) onEventChange?.(next.eventId, { start: next.start, end: next.end })
    else onEventCreate?.({ start: next.start, end: next.end })
  }

  /** Черновик один, чей бы он ни был: указателя или клавиатуры. */
  const liveDraft = draft ?? grab

  const placedByDay = new Map(days.map((day) => [day, placeDay(shown, day)]))
  /**
   * Треки дней (DS-328, 334). Каждый не уже `col-min` и не уже
   * `N × min-w`, где N — колонки самого плотного кластера дня: события стоят
   * рядом долей 1/N, и пол ширины события держится здесь, а не наездом. Один
   * шаблон на шапку, пояс, колонки и слоты — иначе полоса пояса и слот сетки
   * разошлись бы с колонкой, как только треки стали неравными.
   *
   * Сумма минимумов едет отдельно: она — ширина полотна, когда треки не влезают
   * в контейнер, и тогда неделя листается вбок в своём порте. Без неё грид
   * вылезал бы из коробки, а липкие шапка и часы липли бы к коробке, не к
   * содержимому.
   */
  const trackMins = days.map((day) =>
    `max(var(--ds-eventcal-col-min), calc(${dayColumns(placedByDay.get(day)!)} * var(--ds-eventcal-min-w)))`)
  const tracks = {
    ['--ds-eventcal-cols' as string]: trackMins.map((min) => `minmax(${min}, 1fr)`).join(' '),
    ['--ds-eventcal-min-total' as string]: `calc(${trackMins.join(' + ')})`,
  }
  /**
   * Якорь таб-порядка — первое событие видимого диапазона. Деривируется, а не
   * хранится: своё состояние здесь разошлось бы с пропсами ровно тогда, когда
   * события сменились под тем же курсором.
   */
  const anchorEventId = days.flatMap((day) => placedByDay.get(day)!)[0]?.eventId
  /** Есть ли в поясе хоть одна полоса: от этого зависит, кому достанется таб-стоп. */
  const bandAnchorDays = view === 'month' ? monthGrid(date)[0]! : days
  const bandHasBars = allDayBand(shown, bandAnchorDays, allDayRows).bars.length > 0
  const rootRef = useRef<HTMLDivElement>(null)
  const colsRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const hoursRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const slotsRef = useRef<HTMLDivElement>(null)

  /**
   * Роуминг по СОБЫТИЯМ — первый из двух таб-стопов. Приём тот же, что в
   * `Calendar`: узлы берутся из DOM, tabIndex деривируется, состояния нет.
   * Порядок обхода — порядок в разметке, то есть день за днём и внутри дня по
   * времени.
   */
  function onEventsKeyDown(e: React.KeyboardEvent) {
    if (grab) {
      e.preventDefault()
      // Тишина на Enter и Esc неотличима от «клавиша не сработала»: тот, кто
      // ведёт календарь с клавиатуры, не видит, что событие встало на место.
      if (e.key === 'Escape') {
        setGrab(null)
        setStatus(t['eventCalendar.cancelled'](byId.get(grab.eventId!)?.title ?? ''))
        return
      }
      if (e.key === 'Enter' || e.key === ' ') {
        onEventChange?.(grab.eventId!, { start: grab.start, end: grab.end })
        refocus.current = grab.eventId!
        setGrab(null)
        setStatus(t['eventCalendar.applied'](byId.get(grab.eventId!)?.title ?? ''))
        return
      }
      const next = movedGrab(grab, e, slot)
      if (!next) return
      setGrab(next)
      const [day, from] = splitLocal(next.start)
      const [, to] = splitLocal(next.end)
      setStatus(t['eventCalendar.at'](fmtMinutes(from), fmtMinutes(to), dayName(day)))
      return
    }

    if (e.key === ' ' || e.key === 'Enter') {
      const id = (e.target as HTMLElement).dataset.eventId
      const event = id ? byId.get(id) : undefined
      // Молчаливый отказ неотличим от сломанной клавиши: тому, кто ведёт
      // календарь с клавиатуры, `aria-busy` при попытке действия не
      // объявляется. Поэтому отказ ГОВОРИТ.
      if (event && (pending.has(event.id) || event.readOnly)) {
        e.preventDefault()
        setStatus(t['eventCalendar.locked'](event.title))
        return
      }
      // Space берёт событие в перенос, Enter оставляем выбору: клавиша,
      // делающая два разных дела, различима только по памяти.
      if (event && e.key === ' ' && onEventChange) {
        e.preventDefault()
        setGrab({ eventId: event.id, start: event.start, end: event.end })
        setStatus(t['eventCalendar.grabbed'](event.title))
        return
      }
    }
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1
      : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    // Полосы пояса и события сетки — ОДИН обход: для того, кто идёт стрелками,
    // это одна лента дел, а не два независимых списка.
    const buttons = rootRef.current?.querySelectorAll<HTMLButtonElement>(
      'button.ds-eventcal__bar, button.ds-eventcal__event')
    if (!buttons?.length) return
    const from = [...buttons].indexOf(e.target as HTMLButtonElement)
    if (from < 0) return
    // Гасим всегда, даже когда идти некуда: иначе стрелка у края прокручивает
    // страницу, и календарь уезжает из поля зрения.
    e.preventDefault()
    const to = from + step
    if (to >= 0 && to < buttons.length) buttons[to]!.focus()
  }

  /**
   * Роуминг по СЛОТАМ — второй таб-стоп. Двумерный: вниз шаг по времени, вбок
   * по дням, `Home`/`End` — край ДНЯ, а не недели: столбец здесь то, что видит
   * глаз, в отличие от `Calendar`, где строка сетки — неделя.
   */
  function onSlotsKeyDown(e: React.KeyboardEvent) {
    const cells = slotsRef.current?.querySelectorAll<HTMLDivElement>('[role="gridcell"]')
    if (!cells?.length) return
    const from = [...cells].indexOf(e.target as HTMLDivElement)
    if (from < 0) return
    const width = days.length
    const rows = Math.floor(MINUTES_IN_DAY / slot)
    const col = from % width

    let to = -1
    switch (e.key) {
      case 'ArrowDown': to = from + width; break
      case 'ArrowUp': to = from - width; break
      case 'ArrowRight': to = col + 1 < width ? from + 1 : -1; break
      case 'ArrowLeft': to = col > 0 ? from - 1 : -1; break
      case 'Home': to = col; break
      case 'End': to = (rows - 1) * width + col; break
      case 'Enter':
      case ' ': {
        e.preventDefault()
        if (!onEventCreate) return
        const day = cells[from]!.dataset.day!
        const minutes = Number(cells[from]!.dataset.minutes)
        onEventCreate({ start: atMinute(day, minutes), end: atMinute(day, minutes + slot) })
        return
      }
      default: return
    }
    e.preventDefault()
    if (to >= 0 && to < cells.length && to !== from) cells[to]!.focus()
  }

  /**
   * Пояс полос — один и тот же и в неделе, и в каждой строке месяца. Месяц
   * рисует ту же ленту семь раз подряд: многодневное событие обязано читаться
   * одной полосой, а не чипом, повторённым в каждой клетке.
   */
  /**
   * Якорь таб-порядка на весь компонент. Пояс идёт в разметке раньше сетки,
   * поэтому якорь — первая полоса, и только если полос нет — первое событие.
   * Иначе пояс на пять полос давал пять лишних таб-стопов: пройти календарь
   * табом до следующего поля формы снова становилось упражнением.
   */
  /**
   * Пояс — ГРИД на том же шаблоне треков, что колонки (`--ds-eventcal-cols`):
   * полоса встаёт `grid-column` от дня до дня, счётчик — в свою строку под
   * полосами. Раньше и то и другое стояло абсолютно по процентам, и счётчик
   * клался в последнюю строку поверх полосы: угол полосы оказывался под «+N
   * ещё» (DS-328). Высота пояса теперь — его строки, а не расчёт.
   */
  const renderBand = (bandDays: string[], isAnchorBand = false) => {
    const band = allDayBand(shown, bandDays, allDayRows)
    const moreRow = band.bars.reduce((max, b) => Math.max(max, b.lane + 1), 0) + 1
    return (
      <div className="ds-eventcal__band">
        {band.bars.map((bar) => {
          const event = byId.get(bar.eventId)!
          return (
            <button
              key={bar.eventId}
              type="button"
              className="ds-eventcal__bar"
              tabIndex={isAnchorBand && bar.lane === 0 && bar.fromIndex === band.bars[0]!.fromIndex
                && bar.eventId === band.bars[0]!.eventId ? 0 : -1}
              data-event-id={bar.eventId}
              style={{
                gridColumn: `${bar.fromIndex + 1} / ${bar.toIndex + 2}`,
                gridRow: String(bar.lane + 1),
                ['--ds-eventcal-tone' as string]: toneOf(event),
              }}
              aria-label={nameOf(event, bar.continuesBefore ? bandDays[0]! : event.start.split('T')[0]!)}
              onClick={() => onEventClick?.(event.id)}
            >
              {event.title}
            </button>
          )
        })}
        {/*
          Счётчик пояса. Без него потолок ПРЯЧЕТ события молча — а молча
          пропавшее событие хуже выдавленной за экран сетки, ради которой
          потолок и заводился: сетку видно, пропажу нет.
        */}
        {band.hidden.map((count, i) => {
          if (count === 0) return null
          const day = bandDays[i]!
          const goToDay = onDateChange && onViewChange
            ? () => { onDateChange(day); onViewChange('day') }
            : undefined
          const style = { gridColumn: String(i + 1), gridRow: String(moreRow) }
          return goToDay
            ? (
              <button key={`more-${day}`} type="button" className="ds-eventcal__band-more" style={style} onClick={goToDay}>
                {t['eventCalendar.more'](count)}
              </button>
            )
            : (
              <span key={`more-${day}`} className="ds-eventcal__band-more" style={style}>
                {t['eventCalendar.more'](count)}
              </span>
            )
        })}
      </div>
    )
  }

  /** Строки пояса: полосы плюс строка счётчика, если он есть. Для высоты порта. */
  const bandLanes = (bandDays: string[]) => {
    const band = allDayBand(shown, bandDays, allDayRows)
    return Math.max(1,
      band.bars.reduce((max, b) => Math.max(max, b.lane + 1), 0) + (band.hidden.some((n) => n > 0) ? 1 : 0))
  }

  /** Высота липкой шапки порта: строка дней, строки пояса и линия под ними (1px, `.ds-eventcal__heads`). */
  const topHeight = `var(--ds-eventcal-dayhead) + ${bandLanes(days)} * var(--ds-eventcal-lane) + 1px`

  /**
   * Шапка дней (DS-334). До неё колонки недели не были подписаны вовсе:
   * семь безымянных столбцов, а в виде дня нигде не сказано, КАКОЙ это день.
   * День недели коротко и число — то, что влезает в узкий трек и отличает
   * колонку; полное имя дня уже несут события и регион.
   */
  const weekday = (day: string) => {
    const [y, m, d] = day.split('-').map(Number)
    return dateFormat(locale, WEEKDAY_OPTS).format(new Date(y!, m! - 1, d!))
  }
  const dayHead = (headDays: string[], withDate: boolean) => (
    <div className="ds-eventcal__dayhead" aria-hidden="true">
      {headDays.map((day) => (
        <span key={day} className="ds-eventcal__dayhead-cell">
          <span className="ds-eventcal__weekday">{weekday(day)}</span>
          {withDate && <span className="ds-eventcal__date">{Number(day.slice(8))}</span>}
        </span>
      ))}
    </div>
  )

  /**
   * Начальная прокрутка к рабочим часам — вторая половина обещания `workHours`.
   * Сетка держит полные сутки намеренно, поэтому без прокрутки она открывается
   * на полуночи, и рабочий день приходится искать руками.
   *
   * `useLayoutEffect` не нужен: прокрутка не влияет на измерения, а мигания на
   * первом кадре нет — порт открыт на нуле и уезжает к утру сразу же.
   */
  useEffect(() => {
    const port = gridRef.current
    if (!port || !workHours) return
    // От высоты ПОЛОТНА, а не `scrollHeight` порта: в порте теперь ещё и липкая
    // шапка. Липкая шапка накрывает ровно свою высоту сверху, поэтому
    // `scrollTop = y` открывает полотно как раз с минуты y.
    const canvas = canvasRef.current?.offsetHeight || port.scrollHeight
    port.scrollTop = (minutesOf(workHours[0]) / MINUTES_IN_DAY) * canvas
    // Дважды не прокручиваем: дальше место выбирает человек, и возврат к утру
    // на каждый ререндер отбирал бы у него это право.
  }, [])

  /**
   * Вбок — к дню курсора (DS-334). Неделя, не влезшая в контейнер,
   * открывалась на понедельнике, а `date` — среда: на 360 курсорный день
   * оказывался за краем, и первое, что человек делал, — искал его. На каждую
   * смену `date`, а не раз: «Следующая неделя» приводит в тот же день недели,
   * и он обязан остаться на экране.
   *
   * `scrollLeft = offsetLeft` колонки внутри грида колонок: липкие часы
   * накрывают ровно свою ширину слева, поэтому колонка встаёт сразу за ними.
   */
  const overflowed = useRef(false)
  useEffect(() => {
    const port = gridRef.current
    if (!port) return
    const toCursor = () => {
      const col = colsRef.current?.querySelector<HTMLElement>(`.ds-eventcal__col[data-day="${date}"]`)
      if (col) port.scrollLeft = col.offsetLeft
    }
    const overflows = () => port.scrollWidth > port.clientWidth
    overflowed.current = overflows()
    if (overflowed.current) toCursor()
    /*
     * И на ПЕРЕХОДЕ «влезала → не влезает» (возврат DS-334 с приёмки
     * 19.09): контейнер сузился живьём — чип ширины, поворот, панель рядом, —
     * а `date` не менялась, и неделя оставалась на понедельнике со средой за
     * краем. Только на переходе, не на каждом ресайзе: пока порт уже
     * переполнен, место вбок выбрал человек, и сдвигать его на каждый пиксель
     * ширины значило бы отбирать прокрутку из-под пальца.
     *
     * В фоновой вкладке наблюдатель молчит — тогда неделя просто остаётся, где
     * была, как до этой правки; ничего другого на нём не держится.
     */
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const now = overflows()
      if (now && !overflowed.current) toCursor()
      overflowed.current = now
    })
    ro.observe(port)
    return () => ro.disconnect()
  }, [date, view])

  useEffect(() => {
    const id = refocus.current
    if (!id) return
    refocus.current = null
    rootRef.current?.querySelector<HTMLElement>(`[data-event-id="${id}"]`)?.focus()
  })

  const work = workHours && {
    top: pct(minutesOf(workHours[0]) / MINUTES_IN_DAY),
    height: pct((minutesOf(workHours[1]) - minutesOf(workHours[0])) / MINUTES_IN_DAY),
  }

  const step = view === 'day' ? 1 : 7
  const stepNames = view === 'day'
    ? { prev: t['eventCalendar.prevDay'], next: t['eventCalendar.nextDay'] }
    : { prev: t['eventCalendar.prevWeek'], next: t['eventCalendar.nextWeek'] }


  const head = (
    <div className="ds-eventcal__head">
      {onDateChange && (
        <>
          <Button size="sm" variant="ghost" onClick={() => onDateChange(shiftDay(date, -step))}>
            {stepNames.prev}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDateChange(shiftDay(date, step))}>
            {stepNames.next}
          </Button>
        </>
      )}
      {onToday && <Button size="sm" variant="ghost" onClick={onToday}>{t['eventCalendar.today']}</Button>}
      {onViewChange && (
        <ToggleGroup
          mode="single"
          size="sm"
          aria-label={t['eventCalendar.viewLabel']}
          value={view}
          onChange={(id) => onViewChange(id as EventCalendarView)}
          items={[
            { id: 'day', label: t['eventCalendar.viewDay'] },
            { id: 'week', label: t['eventCalendar.viewWeek'] },
            { id: 'month', label: t['eventCalendar.viewMonth'] },
          ]}
        />
      )}
    </div>
  )

  /**
   * Одна строка состояния на компонент. Объявляет только то, что компонент
   * сделал САМ: создание он не подтверждает — событие создаёт потребитель, и
   * «создано» было бы враньём.
   */
  const live = <div role="status" className="ds-visually-hidden">{status}</div>

  const legend = calendars.length > 0 && (
    <ChartLegend
      block="ds-eventcal"
      series={calendars.map((c) => ({ id: c.id, label: c.title }))}
      colors={calendarColors}
      hidden={hidden}
      onToggle={(id) => onToggleCalendar?.(id)}
    />
  )

  if (view === 'month') {
    const weeks = monthGrid(date)
    const anchorMonth = date.slice(0, 7)
    return (
      <div
        className={['ds-eventcal', className].filter(Boolean).join(' ')}
        ref={rootRef}
        onKeyDown={onEventsKeyDown}
        role="region"
        aria-label={`${dayName(weeks[0]![0]!)} — ${dayName(weeks[weeks.length - 1]![6]!)}`}
      >
        {head}
        {legend}
        {live}
        <div className="ds-eventcal__month">
          {dayHead(weeks[0]!, false)}
          {weeks.map((week) => (
            <div key={week[0]} className="ds-eventcal__week">
              {/* Без гуттера: колонки часов в месяце нет, и отступ под неё
                  сдвигал бы полосы относительно клеток — «Командировка»
                  начиналась на треть внутрь своего дня и заезжала на чужой. */}
              {renderBand(week, week === weeks[0])}
              <div className="ds-eventcal__cells">
                {week.map((day) => {
                  const { chips, hidden: more } = dayChips(shown, day, monthChips)
                  const goToDay = onDateChange && onViewChange
                    ? () => { onDateChange(day); onViewChange('day') }
                    : undefined
                  return (
                    <div
                      key={day}
                      className={['ds-eventcal__cell', day.slice(0, 7) !== anchorMonth && 'is-out']
                        .filter(Boolean).join(' ')}
                      data-day={day}
                    >
                      <span className="ds-eventcal__daynum">{Number(day.slice(8))}</span>
                      <ul className="ds-eventcal__chips">
                        {chips.map((id) => {
                          const event = byId.get(id)!
                          return (
                            <li key={id}>
                              <button
                                type="button"
                                className="ds-eventcal__chip-event"
                                style={{ ['--ds-eventcal-tone' as string]: toneOf(event) }}
                                aria-label={nameOf(event, day)}
                                onClick={() => onEventClick?.(event.id)}
                              >
                                <span className="ds-eventcal__chip-time">{formatTime(event.start)}</span>
                                <span className="ds-eventcal__chip-title">{event.title}</span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                      {more > 0 && (
                        // Без ручек перехода счётчик остаётся ТЕКСТОМ. Кнопка, которая
                        // никуда не ведёт, обещает действие и не делает его — а в
                        // таб-порядке она при этом стоит.
                        goToDay
                          ? <button type="button" className="ds-eventcal__more" onClick={goToDay}>{t['eventCalendar.more'](more)}</button>
                          : <span className="ds-eventcal__more">{t['eventCalendar.more'](more)}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className={['ds-eventcal', className].filter(Boolean).join(' ')}
      ref={rootRef}
      onKeyDown={onEventsKeyDown}
      role="region"
      aria-label={days.length === 1 ? dayName(days[0]!) : `${dayName(days[0]!)} — ${dayName(days[days.length - 1]!)}`}
    >
      {head}

      {legend}
      {live}

      {/*
        Один порт на обе оси (DS-334): шапка дней и пояс липнут сверху,
        часы — слева. Когда треки не влезают, неделя листается вбок ЦЕЛИКОМ —
        шапка, пояс и колонки одним движением; раздельные порты разъезжались бы.
        Высота — двенадцать часов ПЛЮС шапка: шапка лежит внутри порта и иначе
        съедала бы рабочий день.
      */}
      <div
        className="ds-eventcal__grid"
        ref={gridRef}
        style={{
          ...tracks,
          maxHeight: `calc(12 * var(--ds-eventcal-hour) + ${topHeight})`,
          // Высота липкой шапки — для `scroll-margin-top` целей полотна (см.
          // CSS). `calc()` обязателен: голая сумма с var() проходит разбор и
          // умирает на подстановке — свойство молча становится `auto`.
          ['--ds-eventcal-top' as string]: `calc(${topHeight})`,
        }}
      >
        <div className="ds-eventcal__top" ref={topRef}>
          <div className="ds-eventcal__corner" aria-hidden="true" />
          <div className="ds-eventcal__heads">
            {dayHead(days, true)}
            {renderBand(days, true)}
          </div>
        </div>
        <div className="ds-eventcal__canvas" ref={canvasRef}>
        <div className="ds-eventcal__hours" ref={hoursRef} aria-hidden="true">
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="ds-eventcal__hour" style={{ top: pct(h / 24) }}>
              {String(h).padStart(2, '0')}:00
            </span>
          ))}
        </div>
        <div
          className="ds-eventcal__cols"
          ref={colsRef}
          onKeyDown={onEventsKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {days.map((day) => (
            <div key={day} className="ds-eventcal__col" data-day={day}>
              {work && <div className="ds-eventcal__work" style={work} aria-hidden="true" />}
              {/* Контур на исходном месте: если бы ехал призрак, а оригинал
                  стоял, при отпускании вне зоны нельзя было бы отличить откат
                  от применения. */}
              {liveDraft?.eventId && placedByDay.get(day)!
                .filter((p) => p.eventId === liveDraft.eventId)
                .map((p) => (
                  <div key="ghost" className="ds-eventcal__ghost" style={segmentStyle(p)} aria-hidden="true" />
                ))}
              {liveDraft && liveDraft.start.startsWith(day) && (
                <div
                  className="ds-eventcal__draft"
                  style={segmentStyle({ ...draftBox(liveDraft, day), column: 0, columns: 1 })}
                  aria-hidden="true"
                />
              )}
              <ul className="ds-eventcal__events">
                {placedByDay.get(day)!.map((placed) => {
                  const event = byId.get(placed.eventId)!
                  return (
                    <li key={placed.eventId}>
                      <button
                        type="button"
                        className={['ds-eventcal__event',
                          pending.has(placed.eventId) && 'is-pending',
                          grab?.eventId === placed.eventId && 'is-grabbed',
                          liveDraft?.eventId === placed.eventId && 'is-moving',
                        ].filter(Boolean).join(' ')}
                        data-event-id={placed.eventId}
                        aria-busy={pending.has(placed.eventId) || undefined}
                        tabIndex={!bandHasBars && placed.eventId === anchorEventId ? 0 : -1}
                        style={{
                          // Само событие НЕ подменяется черновиком: при переезде на
                          // другой день его коробка в исходной колонке раздувалась на
                          // полные сутки (draftBox честно отдавал 0…1440 для дня, где
                          // события уже нет), а в целевой не появлялась вовсе.
                          // Черновик рисуется отдельной заготовкой — в том дне, куда
                          // жест ведёт.
                          ...eventBox(segmentStyle(placed)),
                          ['--ds-eventcal-tone' as string]: toneOf(event),
                        }}
                        aria-label={nameOf(event, day)}
                        onClick={() => {
                          if (swallowClick.current) { swallowClick.current = false; return }
                          onEventClick?.(event.id)
                        }}
                      >
                        <span className="ds-eventcal__event-title">{event.title}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          {onEventCreate && (
            /*
             * Слоты идут ПОСЛЕ событий: сначала то, что есть, потом инструмент
             * для того, чего нет. Визуальный порядок держит z-index, а не
             * порядок узлов.
             */
            <div
              className="ds-eventcal__slots"
              role="grid"
              aria-label={t['eventCalendar.slots']}
              ref={slotsRef}
              onKeyDown={onSlotsKeyDown}
            >
              {Array.from({ length: Math.floor(MINUTES_IN_DAY / slot) }, (_, r) => (
                <div key={r} role="row" className="ds-eventcal__slot-row">
                  {days.map((day) => {
                    const minutes = r * slot
                    return (
                      <div
                        key={day}
                        role="gridcell"
                        className="ds-eventcal__slot"
                        tabIndex={r === 0 && day === days[0] ? 0 : -1}
                        data-day={day}
                        data-minutes={minutes}
                        aria-label={`${dayName(day)}, ${atMinute(day, minutes).split('T')[1]}`}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}
