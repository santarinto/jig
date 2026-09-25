import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { EventCalendar } from './EventCalendar.js'
import type { EventCalendarEvent } from './layout.js'

const WEEK: EventCalendarEvent[] = [
  { id: 'plan', title: 'Планёрка', start: '2026-09-02T09:30', end: '2026-09-02T11:00', calendarId: 'work' },
  { id: 'call', title: 'Созвон', start: '2026-09-02T10:00', end: '2026-09-02T12:00', calendarId: 'duty' },
  { id: 'trip', title: 'Командировка', start: '2026-09-03T00:00', end: '2026-09-05T00:00', allDay: true },
]

const CALENDARS = [{ id: 'work', title: 'Работа' }, { id: 'duty', title: 'Дежурства' }]

const view = (props: Partial<React.ComponentProps<typeof EventCalendar>> = {}) =>
  render(<EventCalendar events={WEEK} view="week" date="2026-09-02" calendars={CALENDARS} {...props} />)

describe('EventCalendar — неделя', () => {
  it('имя события несёт название, время, день и календарь', () => {
    view()
    expect(screen.getByRole('button', { name: /Планёрка, 09:30–11:00.*2 сентября.*Работа/ })).toBeTruthy()
  })

  it('геометрия события — проценты от суток и от ширины недели', () => {
    view()
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    expect(plan.style.top).toBe('39.5833%')
    expect(plan.style.height).toBe('6.25%')
  })

  it('пересекающиеся события делят колонку дня пополам', () => {
    view()
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    const call = screen.getByRole('button', { name: /Созвон/ })
    expect(plan.style.width).toBe(call.style.width)
    expect(plan.style.left).not.toBe(call.style.left)
  })

  it('соседи по кластеру стоят РЯДОМ, а не лесенкой: левый край второго — правый первого', () => {
    // DS-328: лесенка клала угол события под соседа, и клик по нижнему
    // краю одного открывал другое. Пол ширины держит трек дня, не наезд.
    view()
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    const call = screen.getByRole('button', { name: /Созвон/ })
    expect([plan.style.left, call.style.left]).toEqual(['0%', '50%'])
    expect(plan.style.getPropertyValue('--ds-eventcal-z')).toBe('')
  })

  it('трек дня не уже N × min-w: плотный день шире соседей, соседи не платят', () => {
    const { container } = view()
    const cols = (container.querySelector('.ds-eventcal__grid') as HTMLElement)
      .style.getPropertyValue('--ds-eventcal-cols')
    const tracks = cols.split(/ (?=minmax)/)
    expect(tracks).toHaveLength(7)
    // Среда (2 сентября) — кластер из двух: «Планёрка» и «Созвон».
    expect(tracks[2]).toBe('minmax(max(var(--ds-eventcal-col-min), calc(2 * var(--ds-eventcal-min-w))), 1fr)')
    expect(tracks[0]).toBe('minmax(max(var(--ds-eventcal-col-min), calc(1 * var(--ds-eventcal-min-w))), 1fr)')
  })

  it('у недели есть шапка дней: день недели и число над каждой колонкой', () => {
    const { container } = view()
    const cells = [...container.querySelectorAll('.ds-eventcal__top .ds-eventcal__dayhead-cell')]
    expect(cells).toHaveLength(7)
    expect(cells.map((c) => c.querySelector('.ds-eventcal__date')?.textContent))
      .toEqual(['31', '1', '2', '3', '4', '5', '6'])
  })

  it('цвет календаря берётся из палитры, а не из пропа потребителя', () => {
    view()
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    expect(plan.style.getPropertyValue('--ds-eventcal-tone')).toBe('var(--ds-chart-1)')
  })

  it('многодневное событие уходит в пояс, а не в сетку часов', () => {
    view()
    const trip = screen.getByRole('button', { name: /Командировка/ })
    expect(trip.closest('.ds-eventcal__band')).toBeTruthy()
  })

  it('скрытый календарь не рендерится вовсе', () => {
    view({ hiddenCalendars: ['duty'] })
    expect(screen.queryByRole('button', { name: /Созвон/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Планёрка/ })).toBeTruthy()
  })

  it('клик по событию отдаёт id', async () => {
    const onEventClick = vi.fn()
    view({ onEventClick })
    await userEvent.click(screen.getByRole('button', { name: /Планёрка/ }))
    expect(onEventClick).toHaveBeenCalledWith('plan')
  })

  it('вид дня показывает одну колонку', () => {
    const { container } = view({ view: 'day' })
    expect(container.querySelectorAll('.ds-eventcal__col')).toHaveLength(1)
  })

  it('вид недели показывает семь колонок', () => {
    const { container } = view()
    expect(container.querySelectorAll('.ds-eventcal__col')).toHaveLength(7)
  })

  it('рабочие часы отмечены, остальные нет', () => {
    const { container } = view({ workHours: ['08:00', '20:00'] })
    const band = container.querySelector('.ds-eventcal__work')
    expect(band).toBeTruthy()
    expect((band as HTMLElement).style.top).toBe('33.3333%')
  })

  it('легенда календарей переключается', async () => {
    const onToggleCalendar = vi.fn()
    view({ onToggleCalendar })
    await userEvent.click(screen.getByRole('button', { name: 'Дежурства' }))
    expect(onToggleCalendar).toHaveBeenCalledWith('duty')
  })
})

describe('EventCalendar — навигация', () => {
  it('вперёд в виде недели двигает курсор на семь дней', async () => {
    const onDateChange = vi.fn()
    view({ onDateChange })
    await userEvent.click(screen.getByRole('button', { name: 'Следующая неделя' }))
    expect(onDateChange).toHaveBeenCalledWith('2026-09-09')
  })

  it('назад в виде дня двигает курсор на один день', async () => {
    const onDateChange = vi.fn()
    view({ view: 'day', onDateChange })
    await userEvent.click(screen.getByRole('button', { name: 'Предыдущий день' }))
    expect(onDateChange).toHaveBeenCalledWith('2026-09-01')
  })

  it('переключатель вида отдаёт выбранный вид', async () => {
    const onViewChange = vi.fn()
    view({ onViewChange })
    await userEvent.click(screen.getByRole('radio', { name: 'День' }))
    expect(onViewChange).toHaveBeenCalledWith('day')
  })

  it('без onDateChange стрелок нет: ручка есть — жест есть', () => {
    view()
    expect(screen.queryByRole('button', { name: 'Следующая неделя' })).toBeNull()
  })

  it('«Сегодня» показывается только с ручкой и зовёт её', async () => {
    const onToday = vi.fn()
    view({ onToday })
    await userEvent.click(screen.getByRole('button', { name: 'Сегодня' }))
    expect(onToday).toHaveBeenCalled()
  })
})

describe('EventCalendar — месяц', () => {
  const busy: EventCalendarEvent[] = [
    ...['09:00', '10:00', '11:00', '12:00'].map((t, i) => ({
      id: `e${i}`, title: `Встреча ${i}`, start: `2026-09-02T${t}`, end: `2026-09-02T${t.replace(':00', ':30')}`,
    })),
    { id: 'trip', title: 'Командировка', start: '2026-09-03T00:00', end: '2026-09-05T00:00', allDay: true },
  ]
  const month = (props: Partial<React.ComponentProps<typeof EventCalendar>> = {}) =>
    render(<EventCalendar events={busy} view="month" date="2026-09-15" monthChips={3} {...props} />)

  it('сетка месяца выкладывается неделями по семь клеток', () => {
    const { container } = month()
    expect(container.querySelectorAll('.ds-eventcal__cell').length % 7).toBe(0)
    expect(container.querySelectorAll('.ds-eventcal__week').length).toBeGreaterThan(3)
  })

  it('дни чужого месяца помечены', () => {
    const { container } = month()
    const first = container.querySelector('.ds-eventcal__cell') as HTMLElement
    expect(first.dataset.day).toBe('2026-08-31')
    expect(first.className).toContain('is-out')
  })

  it('чипы дня показываются до потолка, остальное — счётчиком', () => {
    month({ onDateChange: vi.fn(), onViewChange: vi.fn() })
    expect(screen.getAllByRole('button', { name: /Встреча/ })).toHaveLength(3)
    expect(screen.getByRole('button', { name: '+1 ещё' })).toBeTruthy()
  })

  it('счётчик ведёт в день этой даты', async () => {
    const onDateChange = vi.fn()
    const onViewChange = vi.fn()
    month({ onDateChange, onViewChange })
    await userEvent.click(screen.getByRole('button', { name: '+1 ещё' }))
    expect(onDateChange).toHaveBeenCalledWith('2026-09-02')
    expect(onViewChange).toHaveBeenCalledWith('day')
  })

  it('без ручек перехода счётчик остаётся текстом, а не мёртвой кнопкой', () => {
    month()
    expect(screen.queryByRole('button', { name: '+1 ещё' })).toBeNull()
    expect(screen.getByText('+1 ещё')).toBeTruthy()
  })

  it('многодневное событие идёт полосой недели, а не чипом в каждой клетке', () => {
    const { container } = month()
    const bars = container.querySelectorAll('.ds-eventcal__bar')
    expect(bars).toHaveLength(1)
    // Две клетки из семи — от дня до дня по шаблону треков, не процентом.
    expect((bars[0] as HTMLElement).style.gridColumn).toBe('4 / 6')
  })
})

describe('EventCalendar — клавиатура', () => {
  /** Сетка слотов существует ради создания: без ручки её нет, как и стрелок. */
  const grid = (props: Partial<React.ComponentProps<typeof EventCalendar>> = {}) =>
    view({ onEventCreate: vi.fn(), ...props })

  it('якорь таб-порядка один на весь компонент и достаётся поясу, если он есть', () => {
    // Переписано после приёмки: пояс идёт в разметке раньше сетки, и пять полос
    // давали пять лишних таб-стопов. Обход теперь общий, якорь один.
    const { container } = view()
    const stops = [...container.querySelectorAll<HTMLElement>('.ds-eventcal__bar, .ds-eventcal__event')]
      .filter((el) => el.tabIndex === 0)
    expect(stops).toHaveLength(1)
    expect(stops[0]!.className).toContain('ds-eventcal__bar')
  })

  it('без полос в поясе якорь достаётся первому событию', () => {
    const { container } = view({ events: WEEK.filter((e) => e.id !== 'trip') })
    const stops = [...container.querySelectorAll<HTMLElement>('.ds-eventcal__bar, .ds-eventcal__event')]
      .filter((el) => el.tabIndex === 0)
    expect(stops).toHaveLength(1)
    expect(stops[0]!.getAttribute('data-event-id')).toBe('plan')
  })

  it('стрелка вниз ведёт к следующему событию по времени', async () => {
    view()
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    plan.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Созвон/ }))
  })

  it('стрелка вверх с первого элемента обхода никуда не уводит', async () => {
    // Первый теперь полоса пояса: обход начинается там же, где начинается
    // разметка. С Планёрки вверх уводит на неё — и это не дефект, а порядок.
    const { container } = view()
    const first = container.querySelector('.ds-eventcal__bar') as HTMLElement
    first.focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(first)
  })

  it('сетка слотов — настоящий grid с именем ячейки', () => {
    grid()
    expect(screen.getByRole('grid')).toBeTruthy()
    expect(screen.getByRole('gridcell', { name: /2 сентября 2026 г., 09:30/ })).toBeTruthy()
  })

  it('в таб-порядке одна ячейка сетки', () => {
    grid()
    const cells = screen.getAllByRole('gridcell')
    expect(cells.filter((c) => c.tabIndex === 0)).toHaveLength(1)
  })

  it('стрелка вниз в сетке идёт на слот вперёд, вправо — на день', async () => {
    grid()
    const cell = screen.getByRole('gridcell', { name: /2 сентября 2026 г., 09:30/ })
    cell.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(screen.getByRole('gridcell', { name: /2 сентября 2026 г., 10:00/ }))
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(screen.getByRole('gridcell', { name: /3 сентября 2026 г., 10:00/ }))
  })

  it('Home и End — край ДНЯ, а не недели', async () => {
    grid()
    screen.getByRole('gridcell', { name: /2 сентября 2026 г., 09:30/ }).focus()
    await userEvent.keyboard('{Home}')
    expect(document.activeElement).toBe(screen.getByRole('gridcell', { name: /2 сентября 2026 г., 00:00/ }))
    await userEvent.keyboard('{End}')
    expect(document.activeElement).toBe(screen.getByRole('gridcell', { name: /2 сентября 2026 г., 23:30/ }))
  })

  it('Enter на слоте создаёт событие длиной в слот', async () => {
    const onEventCreate = vi.fn()
    view({ onEventCreate })
    screen.getByRole('gridcell', { name: /2 сентября 2026 г., 09:30/ }).focus()
    await userEvent.keyboard('{Enter}')
    expect(onEventCreate).toHaveBeenCalledWith({ start: '2026-09-02T09:30', end: '2026-09-02T10:00' })
  })

  it('без ручки создания сетка слотов не рисуется вовсе', () => {
    view()
    expect(screen.queryAllByRole('gridcell')).toHaveLength(0)
  })

  it('шаг слота меняет и число ячеек, и длину создаваемого события', async () => {
    const onEventCreate = vi.fn()
    view({ onEventCreate, slot: 60 })
    screen.getByRole('gridcell', { name: /2 сентября 2026 г., 09:00/ }).focus()
    await userEvent.keyboard('{Enter}')
    expect(onEventCreate).toHaveBeenCalledWith({ start: '2026-09-02T09:00', end: '2026-09-02T10:00' })
  })
})

describe('EventCalendar — пояс сверх потолка', () => {
  /** Пять суточных событий на одну колонку при потолке в три строки. */
  const crowded: EventCalendarEvent[] = [1, 2, 3, 4, 5].map((n) => ({
    id: `b${n}`, title: `Отпуск ${n}`, start: '2026-09-02T00:00', end: '2026-09-03T00:00', allDay: true,
  }))
  const band = (props: Partial<React.ComponentProps<typeof EventCalendar>> = {}) =>
    render(<EventCalendar events={crowded} view="week" date="2026-09-02" allDayRows={3} {...props} />)

  it('события сверх потолка не исчезают молча: пояс говорит, сколько их', () => {
    band()
    expect(screen.getByText('+3 ещё')).toBeTruthy()
  })

  it('под потолком счётчика нет', () => {
    band({ allDayRows: 6 })
    expect(screen.queryByText(/ещё/)).toBeNull()
  })

  it('счётчик пояса ведёт в день этой даты, когда есть чем', async () => {
    const onDateChange = vi.fn()
    const onViewChange = vi.fn()
    band({ onDateChange, onViewChange })
    await userEvent.click(screen.getByRole('button', { name: '+3 ещё' }))
    expect(onDateChange).toHaveBeenCalledWith('2026-09-02')
    expect(onViewChange).toHaveBeenCalledWith('day')
  })
})

describe('EventCalendar — находки приёмки в браузере', () => {
  it('порядок наложения не приходит инлайном: он бил бы правило раскрытия', () => {
    // Инлайновый z-index побеждал CSS-правило `:hover { z-index }`: событие
    // под курсором оставалось под соседями, и «читается целиком» не работало.
    view()
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    expect(plan.style.zIndex).toBe('')
  })

  it('ширина события тоже приходит переменной: инлайн бил правило раскрытия', () => {
    view()
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    expect(plan.style.width).toBe('')
    expect(plan.style.getPropertyValue('--ds-eventcal-w')).toBe('50%')
  })

  it('в неделе пояс лежит в шапке порта, правее угла над часами', () => {
    // Отступа под часы у пояса больше нет: угол над часами — свой узел шапки.
    const { container } = view()
    const band = container.querySelector('.ds-eventcal__band') as HTMLElement
    expect(band.parentElement!.className).toBe('ds-eventcal__heads')
    expect(container.querySelector('.ds-eventcal__top > .ds-eventcal__corner')).toBeTruthy()
  })

  it('порт вмещает двенадцать часов ПЛЮС шапку по числу занятых дорожек пояса', () => {
    // Шапка лежит в порте: не посчитай её, она съедала бы рабочий день. Когда
    // полосы стояли абсолютно, пояс без расчёта свисал на сетку и накрывал метки.
    const crowded: EventCalendarEvent[] = [1, 2, 3].map((n) => ({
      id: `b${n}`, title: `Отпуск ${n}`, start: '2026-09-02T00:00', end: '2026-09-04T00:00', allDay: true,
    }))
    const { container } = render(
      <EventCalendar events={crowded} view="week" date="2026-09-02" allDayRows={4} />,
    )
    const grid = container.querySelector('.ds-eventcal__grid') as HTMLElement
    expect(grid.style.maxHeight).toBe(
      'calc(12 * var(--ds-eventcal-hour) + var(--ds-eventcal-dayhead) + 3 * var(--ds-eventcal-lane) + 1px)')
  })

  it('счётчик пояса — СВОЯ строка под полосами, а не поверх последней', () => {
    const crowded: EventCalendarEvent[] = [1, 2, 3, 4, 5].map((n) => ({
      id: `b${n}`, title: `Отпуск ${n}`, start: '2026-09-02T00:00', end: '2026-09-04T00:00', allDay: true,
    }))
    const { container } = render(
      <EventCalendar events={crowded} view="week" date="2026-09-02" allDayRows={3} />,
    )
    // DS-328: счётчик лежал абсолютно в последней строке, и угол полосы
    // оказывался под ним. Теперь строки полос и строка счётчика не совпадают.
    const rows = (sel: string) =>
      [...container.querySelectorAll<HTMLElement>(sel)].map((el) => Number(el.style.gridRow))
    expect(Math.max(...rows('.ds-eventcal__bar'))).toBe(2)
    expect(new Set(rows('.ds-eventcal__band-more'))).toEqual(new Set([3]))
    expect((container.querySelector('.ds-eventcal__grid') as HTMLElement).style.maxHeight)
      .toContain('+ 3 * var(--ds-eventcal-lane) + 1px')
  })

  it('высота липкой шапки едет calc(): голая сумма с var() молча становится auto', () => {
    // Она — `scroll-margin-top` событий и слотов: без него `scrollIntoView`
    // (фокус стрелками) ставил событие ПОД шапку. Голая сумма проходит разбор
    // и умирает на подстановке, не сообщая.
    const { container } = view()
    expect((container.querySelector('.ds-eventcal__grid') as HTMLElement).style.getPropertyValue('--ds-eventcal-top'))
      .toBe('calc(var(--ds-eventcal-dayhead) + 1 * var(--ds-eventcal-lane) + 1px)')
  })

  it('полосы пояса и события — ОДИН таб-стоп, а не по стопу на полосу', () => {
    const many: EventCalendarEvent[] = [1, 2, 3].map((n) => ({
      id: `b${n}`, title: `Отпуск ${n}`, start: '2026-09-02T00:00', end: '2026-09-04T00:00', allDay: true,
    }))
    const { container } = render(
      <EventCalendar events={[...many, ...WEEK]} view="week" date="2026-09-02" allDayRows={5} />,
    )
    const stops = [...container.querySelectorAll<HTMLElement>('.ds-eventcal__bar, .ds-eventcal__event')]
      .filter((el) => el.tabIndex === 0)
    expect(stops).toHaveLength(1)
  })

  it('стрелка ведёт из пояса в сетку: обход у них общий', async () => {
    const { container } = render(
      <EventCalendar events={WEEK} view="week" date="2026-09-02" />,
    )
    const bar = container.querySelector('.ds-eventcal__bar') as HTMLElement
    bar.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).not.toBe(bar)
    expect((document.activeElement as HTMLElement).className).toContain('ds-eventcal__event')
  })
})

// Геометрия — из токенов EventCalendar.css, не хардкод. Пол трека дня —
// `--ds-eventcal-col-min` (5.625rem), колонка часов — `--ds-eventcal-gutter`
// (3.5rem); rem = 16. Сверено с CSS санитаром ниже.
const REM = 16
const COL_MIN_REM = 5.625
const GUTTER_REM = 3.5
const dayW = (scale: number) => COL_MIN_REM * REM * scale
const gutterW = (scale: number) => GUTTER_REM * REM * scale
// «Обвязка» и полоса скролла — не токен компонента (каркас страницы и системная
// полоса), источник: EventCalendar.css, коммент к `--ds-eventcal-col-min`
// (замер 22.09.2026): кадр 440 даёт кромку порта 365 (обвязка 440 − 365 = 75) и
// видимую часть 350 (кромка 365 − полоса 15).
const OBVYAZKA = 75
const SCROLLBAR = 15
const clientAt = (frame: number) => frame - OBVYAZKA - SCROLLBAR
// Неделя от 2026-08-31: пн, вт, СР(курсор, 2026-09-02) — третья колонка (индекс 2).

describe('EventCalendar — якорь недели: условие А, «меньше трёх дней и курсор скрыт» (JIG-9)', () => {
  // jsdom не раскладывает: геометрию порта и колонок задаём руками, а
  // ResizeObserver подменяем, чтобы дёрнуть его ровно тогда, когда в браузере
  // сработал бы наблюдатель (живой ресайз, не перемонтаж).
  let fire: () => void = () => {}
  beforeEach(() => {
    class RO {
      constructor(private cb: () => void) {}
      observe() { fire = () => act(() => this.cb()) }
      unobserve() {}
      disconnect() { fire = () => {} }
    }
    vi.stubGlobal('ResizeObserver', RO)
  })
  afterEach(() => { vi.unstubAllGlobals(); fire = () => {} })

  /**
   * Порт со scrollLeft и живыми rect колонок. Часы занимают `[0, gutter]` и не
   * двигаются со scrollLeft (липкие); колонка i (0 — понедельник) стоит от
   * `gutter + i×day − scrollLeft` до `+day`. Это МОДЕЛЬ, не точная формула
   * реального DOM: `day` здесь — пол трека `5.625rem × scale`
   * (`--ds-eventcal-col-min`), а в среде недели этого файла (WEEK) стоят две
   * наложенные встречи, и её реальный трек шире пола —
   * `max(5.625rem, 2 × 3rem)` (`--ds-eventcal-min-w`, раздвижка треков
   * наложенными событиями). Смещение самой колонки среды (180/270 на шкале
   * 1/1.5) от этого не зависит — она первая после часов и её левая граница
   * считается от пола, а не от своей ширины; колонки ПРАВЕЕ среды в реальном
   * DOM сдвинуты на разницу треков и здесь не смоделированы.
   * `offsetLeft` колонки не включает gutter, потому что offsetParent —
   * `.ds-eventcal__cols`, а не `.ds-eventcal__canvas`.
   *
   * Первый `fire()` в тесте моделирует ПЕРВОЕ применение условия А. В jsdom
   * layout не считается: на монтаже все rect нулевые, и эффект на них не
   * срабатывает (мока ещё нет — его ставит этот хелпер уже ПОСЛЕ рендера). В
   * браузере это не проблема: `apply()` читает уже посчитанный layout что на
   * монтаже, что на первом колбэке `ResizeObserver` (тот стреляет сразу же при
   * `observe()`) — это один и тот же код с одной и той же геометрией.
   */
  const mount = (scale: number, frame: number, scrollLeft = 0) => {
    const day = dayW(scale)
    const gutter = gutterW(scale)
    const box = { client: clientAt(frame), scrollLeft }
    const { container, rerender } = render(
      <EventCalendar events={WEEK} view="week" date="2026-09-02" calendars={CALENDARS} />,
    )
    const port = container.querySelector('.ds-eventcal__grid') as HTMLElement
    const hours = container.querySelector('.ds-eventcal__hours') as HTMLElement
    const cols = [...container.querySelectorAll<HTMLElement>('.ds-eventcal__col')]
    Object.defineProperty(port, 'clientWidth', { configurable: true, get: () => box.client })
    Object.defineProperty(port, 'getBoundingClientRect', {
      configurable: true, value: () => ({ left: 0, right: box.client }) as DOMRect,
    })
    Object.defineProperty(port, 'scrollLeft', {
      configurable: true, get: () => box.scrollLeft, set: (v: number) => { box.scrollLeft = v },
    })
    // Не читается условием А (оно смотрит на rect колонок, не на scrollWidth) —
    // мок нужен только мутации M1 (JIG-9), которая временно возвращает
    // старую защёлку на `scrollWidth > clientWidth`.
    Object.defineProperty(port, 'scrollWidth', { configurable: true, get: () => gutter + 7 * day })
    Object.defineProperty(hours, 'getBoundingClientRect', {
      configurable: true, value: () => ({ left: 0, right: gutter }) as DOMRect,
    })
    cols.forEach((col, i) => {
      Object.defineProperty(col, 'offsetLeft', { configurable: true, get: () => i * day })
      Object.defineProperty(col, 'getBoundingClientRect', {
        configurable: true,
        value: () => {
          const left = gutter + i * day - box.scrollLeft
          return { left, right: left + day } as DOMRect
        },
      })
    })
    return { port, box, cols, rerender }
  }

  it('санитар: пол трека дня и гаттер в тесте совпадают с токенами EventCalendar.css', () => {
    // Держит связь между этим файлом и CSS: подними `--ds-eventcal-col-min`
    // молча (мутация M3) — здесь загорится КОНКРЕТНОЕ число, а не «тест
    // сломался», и падение случая 1 ниже (см. отчёт задачи) станет понятным.
    const css = readFileSync(resolve(__dirname, 'EventCalendar.css'), 'utf8')
    const colMin = css.match(/--ds-eventcal-col-min:\s*calc\(([\d.]+)rem \* var\(--ds-ui-scale\)\)/)
    const gutter = css.match(/--ds-eventcal-gutter:\s*calc\(([\d.]+)rem \* var\(--ds-ui-scale\)\)/)
    expect(colMin?.[1]).toBe(String(COL_MIN_REM))
    expect(gutter?.[1]).toBe(String(GUTTER_REM))
  })

  it('монтаж, шкала 1, кадр 440: курсор виден с самого начала — якорь не трогает прокрутку', () => {
    // Гаттер 56, день 90: пн/вт/СР целиком видны уже на scrollLeft=0 (n=3),
    // курсорный день (СР) в их числе. До JIG-9 монтаж прыгал на 180
    // БЕЗУСЛОВНО, если неделя вообще не влезала целиком, — то есть двигал
    // прокрутку, даже когда курсор уже был виден.
    const { port } = mount(1, 440)
    fire()
    expect(port.scrollLeft).toBe(0)
  })

  it('монтаж, шкала 1.5, кадр 440: курсор скрыт — якорь встаёт сразу (разведка 25.09.2026: sl 270)', () => {
    // Гаттер 84, день 135: на scrollLeft=0 целиком виден только понедельник
    // (n=1), курсор (СР, 2×135=270 от начала колонок) скрыт целиком.
    const { port } = mount(1.5, 440)
    fire()
    expect(port.scrollLeft).toBe(270)
  })

  it('1. переполненный порт (шкала 1.5, кадр 1024) сужается до 440 — якорь ставит курсор сразу за часы', () => {
    // Разведка 25.09.2026: до этой правки scrollLeft оставался 103 (защёлка
    // «первый переход» уже сработала на 1024 и больше не срабатывает) —
    // целиком виден один вторник, среда обрезана. 103 — число разведки, взято
    // как есть: воспроизводит застрявшую позицию старого кода.
    const { port, box } = mount(1.5, 1024, 103)
    // Первый fire() на 1024 — не часть сценария, а СБРОС jsdom-артефакта: у
    // мутации M1 (старая защёлка `overflowed`) начальное значение защёлки
    // всегда false (реальный mount видел нулевую jsdom-геометрию, а не нашу
    // мокнутую), и без этого вызова любой ПЕРВЫЙ fire() в тесте — уже
    // «переход», и старый код совпал бы с новым случайно. Порт на 1024
    // реально переполнен (1029 > 934), поэтому этот fire() старую защёлку
    // взводит; scrollLeft после него неважен — переписываем его явно на 103,
    // чтобы получить ИМЕННО застрявшую позицию разведки, а не то, что решит
    // взвести защёлка.
    fire()
    box.scrollLeft = 103
    box.client = clientAt(440)
    fire()
    expect(port.scrollLeft).toBe(270) // 2 × 135 — колонка среды, сразу за часами
  })

  it('2. курсор виден целиком — scrollLeft не меняется, даже если n < 3', () => {
    // Шкала 1.5, узкий порт (день 135 + гаттер 84 + запас 10 = 229): целиком
    // влезает только курсорная колонка (n=1 < 3), но она и есть та, что нужна
    // — трогать нечего. scrollLeft НАРОЧНО не 270 (= offsetLeft колонки среды):
    // ветку «курсор виден — не трогать» не держит ни один тест, если ничего
    // не менять якорь и без изменений всё равно ставит ту же 270 — мутация
    // `if (n < 3 && cursorCol)` (без `!cursorVisible`) прошла бы зелёной.
    // Колонка среды при 265 стоит на [89, 224], целиком видна (часы до 84,
    // видимая часть порта до 229) — и отличима от 270, которую поставил бы
    // якорь, сработай он здесь по ошибке.
    const { port, box } = mount(1.5, 440)
    box.client = 229
    box.scrollLeft = 265
    fire()
    expect(port.scrollLeft).toBe(265)
  })

  it('край часов, не граница дня: курсор наполовину под часами — якорь всё равно срабатывает', () => {
    // Шкала 1: без этого случая все scrollLeft в файле кратны дню (90), и
    // левую границу «видимости» условие А могло бы мерить от чего угодно —
    // ни один существующий случай это не различает (мутация hoursRight →
    // port.left проходила бы зелёной). Здесь scrollLeft = 210 не кратен 90:
    // колонка среды [26, 116] торчит из-под часов (их правый край — 56)
    // ровно наполовину, видна не целиком; чт [116,206] и пт [206,296] видны
    // целиком в порте до 300 — n = 2.
    const { port, box } = mount(1, 440)
    box.client = 300
    box.scrollLeft = 210
    fire()
    expect(port.scrollLeft).toBe(180) // 2 × 90 — вернулся на среду
  })

  it('3. n ≥ 3 и курсор не виден — scrollLeft не меняется (рука листает свободно)', () => {
    // Шкала 1, рука отлистала на пт/сб/вс (n=3, целиком видны), среда (курсор)
    // ушла за часы влево — трогать нечего, пока целых дней три и больше.
    const { port, box } = mount(1, 440)
    box.client = 330
    box.scrollLeft = 360 // 4 × 90 — колонка пятницы встаёт к часам
    fire()
    expect(port.scrollLeft).toBe(360)
  })

  it('n ровно 2 (не 1 и не 3) и курсор скрыт — якорь всё равно срабатывает', () => {
    // Отдельно от случая 3: там n=3 и якорь молчит, здесь n=2 и он обязан
    // сработать — иначе порог «< 3» неотличим от «< 2» (мутация M2).
    const { port, box } = mount(1, 440)
    box.client = 236
    box.scrollLeft = 360 // видны целиком пт (index4) и сб (index5), n=2; среда скрыта
    fire()
    expect(port.scrollLeft).toBe(180) // 2 × 90 — вернулся на среду
  })

  it('4. рука увела курсор, n < 3 — якорь возвращает его (цена условия А)', () => {
    const { port, box } = mount(1.5, 440)
    fire()
    expect(port.scrollLeft).toBe(270)
    box.scrollLeft = 500 // рука увела прокрутку далеко — курсор снова скрыт, n остаётся 1
    fire()
    expect(port.scrollLeft).toBe(270)
  })

  it('5. вид «день» — якорь ничего не делает (единственная колонка и так вмещается)', () => {
    const day = dayW(1)
    const gutter = gutterW(1)
    const { container } = render(
      <EventCalendar events={WEEK} view="day" date="2026-09-02" calendars={CALENDARS} />,
    )
    const port = container.querySelector('.ds-eventcal__grid') as HTMLElement
    const hours = container.querySelector('.ds-eventcal__hours') as HTMLElement
    const col = container.querySelector('.ds-eventcal__col') as HTMLElement
    const box = { client: day + gutter + 40, scrollLeft: 0 }
    Object.defineProperty(port, 'clientWidth', { configurable: true, get: () => box.client })
    Object.defineProperty(port, 'getBoundingClientRect', {
      configurable: true, value: () => ({ left: 0, right: box.client }) as DOMRect,
    })
    Object.defineProperty(port, 'scrollLeft', {
      configurable: true, get: () => box.scrollLeft, set: (v: number) => { box.scrollLeft = v },
    })
    Object.defineProperty(hours, 'getBoundingClientRect', {
      configurable: true, value: () => ({ left: 0, right: gutter }) as DOMRect,
    })
    Object.defineProperty(col, 'offsetLeft', { configurable: true, get: () => 0 })
    Object.defineProperty(col, 'getBoundingClientRect', {
      configurable: true, value: () => ({ left: gutter - box.scrollLeft, right: gutter - box.scrollLeft + day }) as DOMRect,
    })
    fire()
    expect(port.scrollLeft).toBe(0)
  })

  it('смена даты курсора — условие проверяется заново, с новой датой', () => {
    // Шкала 1, порт на два полных дня (250): после первого fire() курсор
    // (СР) один в кадре, вместе со вторником слева. Смена даты на пятницу
    // (2026-09-04, четвёртая колонка) на том же эффекте — без него якорь
    // остался бы приколот к среде.
    const { port, box, rerender } = mount(1, 440)
    box.client = 250
    fire()
    expect(port.scrollLeft).toBe(180) // 2 × 90

    rerender(<EventCalendar events={WEEK} view="week" date="2026-09-04" calendars={CALENDARS} />)
    expect(port.scrollLeft).toBe(360) // 4 × 90 — эффект зависит от `date`, применился сразу на новой
  })

  it('наблюдатель следит и за треком колонок (colsRef), не только за портом', () => {
    // Ширина `.ds-eventcal__cols` меняется вместе с треками дней, когда
    // `events` раздвигает плотный день, а ширина ПОРТА при этом не меняется
    // вовсе — наблюдатель только на порте такую смену не увидит, и условие А
    // не пересчитается. RO этого блока (`beforeEach`) не различает цели
    // `observe()`, поэтому здесь своя, точечная — с записью узлов.
    const observed: Element[] = []
    class RO {
      constructor(private cb: () => void) {}
      observe(el: Element) { observed.push(el); fire = () => act(() => this.cb()) }
      unobserve() {}
      disconnect() { fire = () => {} }
    }
    vi.stubGlobal('ResizeObserver', RO)

    const { port, box, cols } = mount(1.5, 440)
    const colsEl = cols[0].parentElement as HTMLElement
    expect(colsEl.classList.contains('ds-eventcal__cols')).toBe(true)
    expect(observed).toContain(port)
    expect(observed).toContain(colsEl)

    // И колбэк, привязанный к обоим узлам, — тот же `apply()`, что и на
    // порте: срабатывание пересчитывает условие А по-настоящему, а не просто
    // регистрирует наблюдение вхолостую.
    box.scrollLeft = 500
    fire()
    expect(port.scrollLeft).toBe(270)
  })
})

describe('EventCalendar — якорь: настоящий монтаж, геометрия ДО render (JIG-9, п.3 ревью)', () => {
  // Блок выше (`mount()`) ставит моки геометрии уже ПОСЛЕ рендера, поэтому
  // первый `apply()` внутри эффекта монтажа (тот, что идёт ДО
  // `ro.observe(...)`, ещё без всякого `fire()`) видит нулевой jsdom-layout
  // и ничего не делает — эта ветка не проверена ни одним тестом выше. Здесь
  // геометрия стоит на ПРОТОТИПЕ элементов и существует уже к моменту, когда
  // React создаёт узлы, — значит и в момент первого `apply()`, до всякой
  // ручной подмены на инстансе.
  const DAY_INDEX: Record<string, number> = {
    '2026-08-31': 0, '2026-09-01': 1, '2026-09-02': 2, '2026-09-03': 3,
    '2026-09-04': 4, '2026-09-05': 5, '2026-09-06': 6,
  }
  let rectSpy: ReturnType<typeof vi.spyOn> | undefined
  let offsetLeftDesc: PropertyDescriptor | undefined
  let clientWidthDesc: PropertyDescriptor | undefined
  let scrollWidthDesc: PropertyDescriptor | undefined

  afterEach(() => {
    rectSpy?.mockRestore()
    if (offsetLeftDesc) Object.defineProperty(HTMLElement.prototype, 'offsetLeft', offsetLeftDesc)
    if (clientWidthDesc) Object.defineProperty(Element.prototype, 'clientWidth', clientWidthDesc)
    if (scrollWidthDesc) Object.defineProperty(Element.prototype, 'scrollWidth', scrollWidthDesc)
  })

  /** ResizeObserver в этом блоке НЕ стабится нарочно: jsdom его не даёт, и
   * эффект возвращается сразу после первого `apply()` (см. `if (typeof
   * ResizeObserver === 'undefined') return` в EventCalendar.tsx) — то есть
   * тест смотрит РОВНО на прямой вызов на монтаже, без единого `fire()`. */
  const stubGeometry = (scale: number, frame: number) => {
    const day = dayW(scale)
    const gutter = gutterW(scale)
    const client = clientAt(frame)
    rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const el = this as HTMLElement
      if (el.classList?.contains('ds-eventcal__hours')) return { left: 0, right: gutter } as DOMRect
      if (el.classList?.contains('ds-eventcal__grid')) return { left: 0, right: client } as DOMRect
      if (el.classList?.contains('ds-eventcal__col')) {
        const i = DAY_INDEX[el.dataset.day ?? ''] ?? 0
        const left = gutter + i * day
        return { left, right: left + day } as DOMRect
      }
      return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 } as DOMRect
    })
    offsetLeftDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetLeft')
    Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains('ds-eventcal__col') ? (DAY_INDEX[this.dataset.day ?? ''] ?? 0) * day : 0
      },
    })
    clientWidthDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')
    Object.defineProperty(Element.prototype, 'clientWidth', {
      configurable: true,
      get(this: Element) { return this.classList.contains('ds-eventcal__grid') ? client : 0 },
    })
    scrollWidthDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth')
    Object.defineProperty(Element.prototype, 'scrollWidth', {
      configurable: true,
      get(this: Element) { return this.classList.contains('ds-eventcal__grid') ? gutter + 7 * day : 0 },
    })
  }

  it('шкала 1, кадр 440: курсор виден с первого apply() — прокрутка остаётся нулевой', () => {
    // Гаттер 56, день 90: пн/вт/ср целиком видны уже на scrollLeft=0 (n=3),
    // курсор (ср) в их числе — трогать нечего.
    stubGeometry(1, 440)
    const { container } = render(
      <EventCalendar events={WEEK} view="week" date="2026-09-02" calendars={CALENDARS} />,
    )
    const port = container.querySelector('.ds-eventcal__grid') as HTMLElement
    expect(port.scrollLeft).toBe(0)
  })

  it('шкала 1.5, кадр 440: курсор скрыт — первый apply() ставит его сразу за часы', () => {
    // Гаттер 84, день 135: на scrollLeft=0 целиком виден только понедельник
    // (n=1), курсор (ср, 2×135=270 от начала колонок) скрыт целиком.
    stubGeometry(1.5, 440)
    const { container } = render(
      <EventCalendar events={WEEK} view="week" date="2026-09-02" calendars={CALENDARS} />,
    )
    const port = container.querySelector('.ds-eventcal__grid') as HTMLElement
    expect(port.scrollLeft).toBe(270)
  })
})
