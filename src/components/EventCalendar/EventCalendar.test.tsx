import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

describe('EventCalendar — вбок к дню курсора при сужении (DS-334, возврат с приёмки 19.09)', () => {
  // jsdom не раскладывает: геометрию порта и колонки задаём руками, а
  // ResizeObserver подменяем, чтобы дёрнуть его ровно тогда, когда в браузере
  // сузился бы контейнер (чип ширины верстака — живой ресайз, не перемонтаж).
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

  /** Порт с управляемой шириной; колонка среды стоит на 180 от начала полотна. */
  const mount = () => {
    const box = { client: 700, scroll: 700 }
    const { container, rerender } = view()
    const port = container.querySelector('.ds-eventcal__grid') as HTMLElement
    Object.defineProperty(port, 'clientWidth', { configurable: true, get: () => box.client })
    Object.defineProperty(port, 'scrollWidth', { configurable: true, get: () => box.scroll })
    const wed = container.querySelector('.ds-eventcal__col[data-day="2026-09-02"]') as HTMLElement
    Object.defineProperty(wed, 'offsetLeft', { configurable: true, get: () => 180 })
    return { port, box, rerender }
  }

  it('порт перестал вмещать неделю — встаёт на день курсора', () => {
    const { port, box } = mount()
    expect(port.scrollLeft).toBe(0)
    box.client = 304; box.scroll = 686
    fire()
    expect(port.scrollLeft).toBe(180)
  })

  it('уже переполненный порт при следующем ресайзе НЕ отбирает прокрутку у человека', () => {
    const { port, box } = mount()
    box.client = 304; box.scroll = 686
    fire()
    port.scrollLeft = 40
    box.client = 290
    fire()
    expect(port.scrollLeft).toBe(40)
  })

  it('снова влез и снова перестал — это новый переход, якорь срабатывает опять', () => {
    const { port, box } = mount()
    box.client = 304; box.scroll = 686
    fire()
    port.scrollLeft = 40
    box.client = 700; box.scroll = 700
    fire()
    box.client = 304; box.scroll = 686
    fire()
    expect(port.scrollLeft).toBe(180)
  })
})
