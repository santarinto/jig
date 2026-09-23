import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { EventCalendar } from './EventCalendar.js'
import type { EventCalendarEvent } from './layout.js'

/**
 * Жесты мышью. jsdom не считает раскладку, поэтому прямоугольники подставляются
 * — и это ровно та причина, по которой геометрия живёт в процентах: подменяется
 * ОДИН прямоугольник контейнера, а проверяется настоящая арифметика перевода
 * пикселя в минуту и в день.
 *
 * Сутки высотой 1440 px выбраны намеренно: один пиксель равен одной минуте, и
 * ожидание в тесте читается без пересчёта.
 */

const DAY_H = 1440
const COL_W = 100
const DAYS = 7

const EVENTS: EventCalendarEvent[] = [
  { id: 'plan', title: 'Планёрка', start: '2026-09-02T09:30', end: '2026-09-02T11:00' },
  { id: 'fixed', title: 'Ревизия', start: '2026-09-02T14:00', end: '2026-09-02T15:00', readOnly: true },
]

/**
 * Прямоугольники: контейнер колонок, каждая колонка и каждое событие по его же
 * процентам. Колонки — отдельно: день под курсором берётся по ИХ правым краям
 * (треки неравны с DS-328), а не делением ширины контейнера.
 */
function layoutRects(container: HTMLElement) {
  const cols = container.querySelector('.ds-eventcal__cols') as HTMLElement
  vi.spyOn(cols, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: COL_W * DAYS, height: DAY_H, right: COL_W * DAYS, bottom: DAY_H, x: 0, y: 0,
  } as DOMRect)
  container.querySelectorAll<HTMLElement>('.ds-eventcal__col').forEach((col, i) => {
    vi.spyOn(col, 'getBoundingClientRect').mockReturnValue({
      left: i * COL_W, top: 0, width: COL_W, height: DAY_H, right: (i + 1) * COL_W, bottom: DAY_H, x: i * COL_W, y: 0,
    } as DOMRect)
  })
  for (const el of container.querySelectorAll<HTMLElement>('.ds-eventcal__event')) {
    const top = parseFloat(el.style.top) / 100 * DAY_H
    const height = parseFloat(el.style.height) / 100 * DAY_H
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0, top, width: COL_W, height, right: COL_W, bottom: top + height, x: 0, y: top,
    } as DOMRect)
  }
  return cols
}

function setup(props: Partial<React.ComponentProps<typeof EventCalendar>> = {}) {
  const onEventChange = vi.fn()
  const onEventCreate = vi.fn()
  const onEventClick = vi.fn()
  const { container } = render(
    <EventCalendar
      events={EVENTS} view="week" date="2026-09-02"
      onEventChange={onEventChange} onEventCreate={onEventCreate} onEventClick={onEventClick}
      {...props}
    />,
  )
  const cols = layoutRects(container)
  return { container, cols, onEventChange, onEventCreate, onEventClick }
}

/** Колонка 2 сентября — среда, третья в неделе с понедельника. */
const X_WED = COL_W * 2 + 10
const X_THU = COL_W * 3 + 10

/**
 * Указатель через `MouseEvent`, а НЕ через `fireEvent.pointerDown`.
 *
 * jsdom не реализует `PointerEvent`, и RTL в этом случае конструирует голый
 * `Event`: поля `MouseEventInit` — `clientX`, `clientY`, `button` — до
 * обработчика не доезжают вовсе. Жест при этом «происходит», координаты
 * приходят `undefined`, и тест оказывается не про раскладку, а про NaN.
 * `MouseEvent` их несёт, а React выбирает обработчик по ИМЕНИ события.
 */
function pointer(type: string, target: Element, x: number, y: number) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })
  Object.defineProperty(e, 'pointerId', { value: 1 })
  fireEvent(target, e)
}

/**
 * Браузер шлёт `click` ПОСЛЕ `pointerup` всегда — в том числе когда указатель
 * проехал полсетки. Поэтому его шлёт и этот помощник: без него тест не увидел
 * бы, что перенос завершается ещё и выбором события.
 */
function drag(target: HTMLElement, from: [number, number], to: [number, number]) {
  pointer('pointerdown', target, from[0], from[1])
  pointer('pointermove', target, to[0], to[1])
  pointer('pointerup', target, to[0], to[1])
  fireEvent.click(target, { bubbles: true })
}

beforeEach(() => {
  // jsdom не знает про захват указателя, а без него жест теряется за краем.
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
})

describe('перенос события', () => {
  it('вниз на час сдвигает обе границы, длительность сохраняется', () => {
    const { cols, onEventChange } = setup()
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    drag(plan, [X_WED, 600], [X_WED, 660])
    expect(onEventChange).toHaveBeenCalledWith('plan', { start: '2026-09-02T10:30', end: '2026-09-02T12:00' })
    void cols
  })

  it('вбок меняет день, время остаётся', () => {
    const { onEventChange } = setup()
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    drag(plan, [X_WED, 600], [X_THU, 600])
    expect(onEventChange).toHaveBeenCalledWith('plan', { start: '2026-09-03T09:30', end: '2026-09-03T11:00' })
  })

  it('день под курсором — по краям КОЛОНОК, а не делением: плотная среда шире соседей', () => {
    // DS-328: трек плотного дня шире. Среда здесь 200…500, всего 900;
    // деление дало бы на x=480 четверг (480 / (900 / 7) = 3.7), а курсор над средой.
    const { container, onEventChange } = setup()
    const widths = [100, 100, 300, 100, 100, 100, 100]
    let left = 0
    container.querySelectorAll<HTMLElement>('.ds-eventcal__col').forEach((col, i) => {
      const w = widths[i]!
      vi.spyOn(col, 'getBoundingClientRect').mockReturnValue({
        left, top: 0, width: w, height: DAY_H, right: left + w, bottom: DAY_H, x: left, y: 0,
      } as DOMRect)
      left += w
    })
    vi.spyOn(container.querySelector('.ds-eventcal__cols')!, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 900, height: DAY_H, right: 900, bottom: DAY_H, x: 0, y: 0,
    } as DOMRect)
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    drag(plan, [250, 600], [480, 660])
    expect(onEventChange).toHaveBeenCalledWith('plan', { start: '2026-09-02T10:30', end: '2026-09-02T12:00' })
  })

  it('курсор над липкими часами не уводит жест в день, спрятанный под ними', () => {
    // Порт прокручен вбок на 150: понедельник и половина вторника — под часами
    // (60 px). Курсор над часами обязан прижаться к первому ВИДИМОМУ дню — среде,
    // а не отдать вторник, которого на экране нет.
    const { container, onEventChange } = setup()
    container.querySelectorAll<HTMLElement>('.ds-eventcal__col').forEach((col, i) => {
      const left = i * COL_W - 150
      vi.spyOn(col, 'getBoundingClientRect').mockReturnValue({
        left, top: 0, width: COL_W, height: DAY_H, right: left + COL_W, bottom: DAY_H, x: left, y: 0,
      } as DOMRect)
    })
    const grid = container.querySelector('.ds-eventcal__grid') as HTMLElement
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 300, height: DAY_H, right: 300, bottom: DAY_H, x: 0, y: 0,
    } as DOMRect)
    Object.defineProperty(container.querySelector('.ds-eventcal__hours')!, 'offsetWidth', { value: 60 })
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    drag(plan, [100, 600], [20, 660])
    expect(onEventChange).toHaveBeenCalledWith('plan', { start: '2026-09-02T10:30', end: '2026-09-02T12:00' })
  })

  it('движение меньше порога — это клик, а не перенос', () => {
    const { onEventChange, onEventClick } = setup()
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    drag(plan, [X_WED, 600], [X_WED, 602])
    expect(onEventChange).not.toHaveBeenCalled()
    expect(onEventClick).toHaveBeenCalledWith('plan')
  })

  it('readOnly-событие не двигается, но кликается', () => {
    const { onEventChange, onEventClick } = setup()
    const fixed = screen.getByRole('button', { name: /Ревизия/ })
    drag(fixed, [X_WED, 850], [X_WED, 950])
    expect(onEventChange).not.toHaveBeenCalled()
    expect(onEventClick).toHaveBeenCalledWith('fixed')
  })

  it('перенос не завершается выбором: клик после жеста подавлен', () => {
    const { onEventChange, onEventClick } = setup()
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    drag(plan, [X_WED, 600], [X_WED, 660])
    expect(onEventChange).toHaveBeenCalled()
    expect(onEventClick).not.toHaveBeenCalled()
  })

  it('событие «в полёте» не двигается', () => {
    const { onEventChange } = setup({ pendingIds: ['plan'] })
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    drag(plan, [X_WED, 600], [X_WED, 700])
    expect(onEventChange).not.toHaveBeenCalled()
  })

  it('без ручки изменения жест не начинается вовсе', () => {
    const { onEventChange } = setup({ onEventChange: undefined })
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    drag(plan, [X_WED, 600], [X_WED, 700])
    expect(onEventChange).not.toHaveBeenCalled()
  })
})

describe('растягивание за кромку', () => {
  it('нижняя кромка двигает только конец', () => {
    const { onEventChange } = setup()
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    drag(plan, [X_WED, 657], [X_WED, 720])
    expect(onEventChange).toHaveBeenCalledWith('plan', { start: '2026-09-02T09:30', end: '2026-09-02T12:00' })
  })

  it('верхняя кромка двигает только начало', () => {
    const { onEventChange } = setup()
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    drag(plan, [X_WED, 573], [X_WED, 540])
    expect(onEventChange).toHaveBeenCalledWith('plan', { start: '2026-09-02T09:00', end: '2026-09-02T11:00' })
  })

  it('короче слота не тянется', () => {
    const { onEventChange } = setup()
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    drag(plan, [X_WED, 657], [X_WED, 400])
    expect(onEventChange).toHaveBeenCalledWith('plan', { start: '2026-09-02T09:30', end: '2026-09-02T10:00' })
  })
})

describe('создание протяжкой', () => {
  it('протяжка по пустому месту создаёт событие от и до', () => {
    const { cols, onEventCreate } = setup()
    drag(cols, [X_THU, 780], [X_THU, 900])
    expect(onEventCreate).toHaveBeenCalledWith({ start: '2026-09-03T13:00', end: '2026-09-03T15:00' })
  })

  it('протяжка вверх нормализуется: начало раньше конца', () => {
    const { cols, onEventCreate } = setup()
    drag(cols, [X_THU, 900], [X_THU, 780])
    expect(onEventCreate).toHaveBeenCalledWith({ start: '2026-09-03T13:00', end: '2026-09-03T15:00' })
  })

  it('клик по пустому месту создаёт событие длиной в слот', () => {
    const { cols, onEventCreate } = setup()
    drag(cols, [X_THU, 780], [X_THU, 781])
    expect(onEventCreate).toHaveBeenCalledWith({ start: '2026-09-03T13:00', end: '2026-09-03T13:30' })
  })

  it('без ручки создания протяжка ничего не делает', () => {
    const { cols, onEventCreate } = setup({ onEventCreate: undefined })
    drag(cols, [X_THU, 780], [X_THU, 900])
    expect(onEventCreate).not.toHaveBeenCalled()
  })
})

describe('что видно во время жеста', () => {
  it('заготовка встаёт на новое место, событие остаётся на старом и гаснет', () => {
    // Переписано после приёмки в браузере. Раньше подменялась коробка САМОГО
    // события — и на переезде в другой день она раздувалась на полные сутки в
    // исходной колонке, а в целевой не появлялась. Теперь едет заготовка, а
    // событие остаётся там, где оно всё ещё есть, приглушённым.
    const { container } = setup()
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    pointer('pointerdown', plan, X_WED, 600)
    pointer('pointermove', plan, X_WED, 660)

    const draft = container.querySelector('.ds-eventcal__draft') as HTMLElement
    expect(draft.style.top).toBe('43.75%')
    expect(screen.getByRole('button', { name: /Планёрка/ }).style.top).toBe('39.5833%')
    expect(screen.getByRole('button', { name: /Планёрка/ }).className).toContain('is-moving')
    const ghost = container.querySelector('.ds-eventcal__ghost') as HTMLElement
    expect(ghost, 'контур на исходном месте').toBeTruthy()
    expect(ghost.style.top).toBe('39.5833%')
  })

  it('протяжка по пустому месту рисует заготовку', () => {
    const { container, cols } = setup()
    pointer('pointerdown', cols, X_THU, 780)
    pointer('pointermove', cols, X_THU, 900)
    const draft = container.querySelector('.ds-eventcal__draft') as HTMLElement
    expect(draft).toBeTruthy()
    expect(draft.style.height).toBe('8.3333%')
  })

  it('черновик умирает на отпускании', () => {
    const { container, cols } = setup()
    pointer('pointerdown', cols, X_THU, 780)
    pointer('pointermove', cols, X_THU, 900)
    pointer('pointerup', cols, X_THU, 900)
    expect(container.querySelector('.ds-eventcal__draft')).toBeNull()
  })
})

describe('событие «в полёте»', () => {
  it('помечено aria-busy и приглушено', () => {
    setup({ pendingIds: ['plan'] })
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    expect(plan.getAttribute('aria-busy')).toBe('true')
    expect(plan.className).toContain('is-pending')
  })

  it('клавиатурный захват на нём не открывается и объясняет почему', () => {
    setup({ pendingIds: ['plan'] })
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    plan.focus()
    fireEvent.keyDown(plan, { key: ' ' })
    expect(screen.getByRole('status').textContent).toMatch(/Планёрка/)
  })
})

describe('автопрокрутка у края', () => {
  it('движение к нижнему краю прокручивает сетку вниз', () => {
    const { container } = setup()
    const grid = container.querySelector('.ds-eventcal__grid') as HTMLElement
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 700, height: 600, right: 700, bottom: 600, x: 0, y: 0,
    } as DOMRect)
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    pointer('pointerdown', plan, X_WED, 600)
    pointer('pointermove', plan, X_WED, 596)
    expect(grid.scrollTop).toBeGreaterThan(0)
  })

  it('движение к правому краю листает неделю вбок', () => {
    // DS-334: на узком экране видно два-три дня; без шага вбок день
    // за краем для переноса недостижим.
    const { container } = setup()
    const grid = container.querySelector('.ds-eventcal__grid') as HTMLElement
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 300, height: 600, right: 300, bottom: 600, x: 0, y: 0,
    } as DOMRect)
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    pointer('pointerdown', plan, 150, 300)
    pointer('pointermove', plan, 296, 300)
    expect(grid.scrollLeft).toBeGreaterThan(0)
    expect(grid.scrollTop).toBe(0)
  })

  it('в середине не прокручивает', () => {
    const { container } = setup()
    const grid = container.querySelector('.ds-eventcal__grid') as HTMLElement
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 700, height: 600, right: 700, bottom: 600, x: 0, y: 0,
    } as DOMRect)
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    pointer('pointerdown', plan, X_WED, 600)
    pointer('pointermove', plan, X_WED, 300)
    expect(grid.scrollTop).toBe(0)
  })
})

describe('режим захвата с клавиатуры', () => {
  const grab = () => {
    const r = setup()
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    plan.focus()
    fireEvent.keyDown(plan, { key: ' ' })
    return { ...r, plan }
  }

  it('Space входит в режим и говорит, что теперь можно', () => {
    const { plan } = grab()
    expect(plan.className).toContain('is-grabbed')
    expect(screen.getByRole('status').textContent).toMatch(/Планёрка/)
  })

  it('стрелка вниз двигает на слот и объявляет время ЦЕЛИКОМ, а не дельту', () => {
    const { plan } = grab()
    fireEvent.keyDown(plan, { key: 'ArrowDown' })
    const said = screen.getByRole('status').textContent!
    expect(said).toContain('10:00')
    expect(said).toContain('11:30')
    expect(said).not.toMatch(/30 минут|позже/)
  })

  it('стрелка вбок двигает по дням', () => {
    const { plan } = grab()
    fireEvent.keyDown(plan, { key: 'ArrowRight' })
    expect(screen.getByRole('status').textContent).toMatch(/3 сентября/)
  })

  it('Shift со стрелкой тянет конец, не двигая начало', () => {
    const { plan, onEventChange } = grab()
    fireEvent.keyDown(plan, { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(plan, { key: 'Enter' })
    expect(onEventChange).toHaveBeenCalledWith('plan', { start: '2026-09-02T09:30', end: '2026-09-02T11:30' })
  })

  it('Enter применяет и закрывает режим', () => {
    const { plan, onEventChange } = grab()
    fireEvent.keyDown(plan, { key: 'ArrowDown' })
    fireEvent.keyDown(plan, { key: 'Enter' })
    expect(onEventChange).toHaveBeenCalledWith('plan', { start: '2026-09-02T10:00', end: '2026-09-02T11:30' })
    expect(screen.getByRole('button', { name: /Планёрка/ }).className).not.toContain('is-grabbed')
  })

  it('Esc откатывает: ручка не звучит вовсе', () => {
    const { plan, onEventChange } = grab()
    fireEvent.keyDown(plan, { key: 'ArrowDown' })
    fireEvent.keyDown(plan, { key: 'Escape' })
    expect(onEventChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Планёрка/ }).className).not.toContain('is-grabbed')
  })

  it('в режиме захвата стрелка не уводит фокус на соседнее событие', () => {
    const { plan } = grab()
    fireEvent.keyDown(plan, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Планёрка/ }))
  })

  it('короче слота не тянется и с клавиатуры', () => {
    const { plan, onEventChange } = grab()
    for (let i = 0; i < 5; i++) fireEvent.keyDown(plan, { key: 'ArrowUp', shiftKey: true })
    fireEvent.keyDown(plan, { key: 'Enter' })
    expect(onEventChange).toHaveBeenCalledWith('plan', { start: '2026-09-02T09:30', end: '2026-09-02T10:00' })
  })
})

describe('находки приёмки: перенос через день и озвучка', () => {
  it('черновик переезда рисуется в ЦЕЛЕВОЙ колонке, а не раздувается в исходной', () => {
    // В браузере при переносе на другой день коробка события становилась
    // top:0/height:100% в исходной колонке и в целевой не появлялась вовсе:
    // draftBox для дня, где события уже нет, честно отдавал полные сутки.
    const { container } = setup()
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    pointer('pointerdown', plan, X_WED, 600)
    pointer('pointermove', plan, X_THU, 660)

    const target = container.querySelector('[data-day="2026-09-03"] .ds-eventcal__draft') as HTMLElement
    expect(target, 'заготовка в целевом дне').toBeTruthy()
    expect(target.style.top).toBe('43.75%')
    expect(target.style.height).toBe('6.25%')
    expect(container.querySelector('[data-day="2026-09-02"] .ds-eventcal__ghost')).toBeTruthy()
  })

  it('после переезда в другой день фокус возвращается на событие, а не в body', () => {
    // Событие переезжает в другую колонку, React пересоздаёт узел — фокус уходил
    // в body, и клавиатурного пользователя выбрасывало из компонента.
    const events = [{ id: 'plan', title: 'Планёрка', start: '2026-09-02T09:30', end: '2026-09-02T11:00' }]
    function Live() {
      const [list, setList] = useState(events)
      return (
        <EventCalendar
          events={list} view="week" date="2026-09-02"
          onEventChange={(id, next) => setList((prev) => prev.map((e) => (e.id === id ? { ...e, ...next } : e)))}
        />
      )
    }
    render(<Live />)
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    plan.focus()
    fireEvent.keyDown(plan, { key: ' ' })
    fireEvent.keyDown(plan, { key: 'ArrowRight' })
    fireEvent.keyDown(plan, { key: 'Enter' })
    expect(document.activeElement).not.toBe(document.body)
    expect((document.activeElement as HTMLElement).dataset.eventId).toBe('plan')
  })

  it('Enter подтверждает вслух, Esc сообщает об отмене', () => {
    setup()
    const plan = screen.getByRole('button', { name: /Планёрка/ })
    plan.focus()
    fireEvent.keyDown(plan, { key: ' ' })
    fireEvent.keyDown(plan, { key: 'ArrowDown' })
    fireEvent.keyDown(plan, { key: 'Enter' })
    expect(screen.getByRole('status').textContent).toMatch(/применён/)

    fireEvent.keyDown(plan, { key: ' ' })
    fireEvent.keyDown(plan, { key: 'ArrowDown' })
    fireEvent.keyDown(plan, { key: 'Escape' })
    expect(screen.getByRole('status').textContent).toMatch(/отменён/)
  })
})
