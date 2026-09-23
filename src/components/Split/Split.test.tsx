import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Split } from './Split.js'

const panes: [React.ReactNode, React.ReactNode] = [<div key="a">A</div>, <div key="b">B</div>]

describe('Split', () => {
  it('разделитель — separator с ориентацией и value-атрибутами', () => {
    render(<Split defaultSize={200} min={100} max={400}>{panes}</Split>)
    const sep = screen.getByRole('separator')
    // row → линия разделителя вертикальна
    expect(sep).toHaveAttribute('aria-orientation', 'vertical')
    expect(sep).toHaveAttribute('aria-valuenow', '200')
    expect(sep).toHaveAttribute('aria-valuemin', '100')
    expect(sep).toHaveAttribute('aria-valuemax', '400')
    expect(sep).toHaveAttribute('tabindex', '0')
  })

  it('column → горизонтальная ориентация', () => {
    render(<Split direction="column" defaultSize={150}>{panes}</Split>)
    expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'horizontal')
  })

  it('ArrowRight в controlled зовёт onSizeChange с шагом', () => {
    const onSizeChange = vi.fn()
    render(<Split size={200} min={0} max={400} onSizeChange={onSizeChange}>{panes}</Split>)
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' })
    expect(onSizeChange).toHaveBeenCalledWith(216)
  })

  it('ArrowLeft уменьшает на шаг', () => {
    const onSizeChange = vi.fn()
    render(<Split size={200} min={0} max={400} onSizeChange={onSizeChange}>{panes}</Split>)
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowLeft' })
    expect(onSizeChange).toHaveBeenCalledWith(184)
  })

  it('column: ArrowDown увеличивает, ArrowUp уменьшает', () => {
    const onSizeChange = vi.fn()
    render(<Split direction="column" size={150} min={0} max={400} onSizeChange={onSizeChange}>{panes}</Split>)
    const sep = screen.getByRole('separator')
    fireEvent.keyDown(sep, { key: 'ArrowDown' })
    expect(onSizeChange).toHaveBeenLastCalledWith(166)
    fireEvent.keyDown(sep, { key: 'ArrowUp' })
    expect(onSizeChange).toHaveBeenLastCalledWith(134)
  })

  it('клэмп по max', () => {
    const onSizeChange = vi.fn()
    render(<Split size={396} min={0} max={400} onSizeChange={onSizeChange}>{panes}</Split>)
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' })
    expect(onSizeChange).toHaveBeenCalledWith(400)
  })

  it('клэмп по min', () => {
    const onSizeChange = vi.fn()
    render(<Split size={90} min={80} max={400} onSizeChange={onSizeChange}>{panes}</Split>)
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowLeft' })
    expect(onSizeChange).toHaveBeenCalledWith(80)
  })

  it('Home → min, End → max', () => {
    const onSizeChange = vi.fn()
    render(<Split size={200} min={100} max={400} onSizeChange={onSizeChange}>{panes}</Split>)
    const sep = screen.getByRole('separator')
    fireEvent.keyDown(sep, { key: 'Home' })
    expect(onSizeChange).toHaveBeenLastCalledWith(100)
    fireEvent.keyDown(sep, { key: 'End' })
    expect(onSizeChange).toHaveBeenLastCalledWith(400)
  })

  it('uncontrolled: ArrowRight двигает valuenow сам', () => {
    render(<Split defaultSize={200} min={0} max={400}>{panes}</Split>)
    const sep = screen.getByRole('separator')
    fireEvent.keyDown(sep, { key: 'ArrowRight' })
    expect(sep).toHaveAttribute('aria-valuenow', '216')
  })

  it('collapsible: двойной клик сворачивает первый пейн и разворачивает обратно', () => {
    render(<Split defaultSize={200} collapsible>{panes}</Split>)
    const sep = screen.getByRole('separator')
    fireEvent.doubleClick(sep)
    expect(sep).toHaveAttribute('aria-valuenow', '0')
    fireEvent.doubleClick(sep)
    expect(sep).toHaveAttribute('aria-valuenow', '200')
  })

  it('оба пейна отрендерены', () => {
    render(<Split defaultSize={200}>{panes}</Split>)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })
})

describe('Split: сохранение размеров (storageKey)', () => {
  beforeEach(() => localStorage.clear())

  it('пишет размер в localStorage при ресайзе', () => {
    render(<Split storageKey="pane" defaultSize={200} min={0} max={400}>{panes}</Split>)
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' })
    expect(localStorage.getItem('ds-split:pane')).toBe('216')
  })

  it('берёт начальный размер из localStorage вместо defaultSize', () => {
    localStorage.setItem('ds-split:pane', '160')
    render(<Split storageKey="pane" defaultSize={200} min={0} max={400}>{panes}</Split>)
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '160')
  })

  it('сохранённое значение клэмпится по min/max', () => {
    localStorage.setItem('ds-split:pane', '999')
    render(<Split storageKey="pane" defaultSize={200} min={100} max={400}>{panes}</Split>)
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '400')
  })

  it('мусор в хранилище игнорируется — берётся defaultSize', () => {
    localStorage.setItem('ds-split:pane', 'не число')
    render(<Split storageKey="pane" defaultSize={200}>{panes}</Split>)
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '200')
  })

  it('без storageKey ничего не пишет', () => {
    render(<Split defaultSize={200} min={0} max={400}>{panes}</Split>)
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' })
    expect(localStorage.length).toBe(0)
  })

  it('свёрнутое состояние тоже сохраняется, а разворот из хранилища идёт в defaultSize', () => {
    localStorage.setItem('ds-split:pane', '0')
    render(<Split storageKey="pane" defaultSize={200} collapsible>{panes}</Split>)
    const sep = screen.getByRole('separator')
    expect(sep).toHaveAttribute('aria-valuenow', '0')
    fireEvent.doubleClick(sep)
    expect(sep).toHaveAttribute('aria-valuenow', '200')
    expect(localStorage.getItem('ds-split:pane')).toBe('200')
  })
})

// Перетаскивание и шкала (DS-343). Где встал разделитель, судит случай
// `measure` в настоящем chromium — jsdom `calc` не вычисляет. Здесь быстрая
// половина: какое ЧИСЛО уходит потребителю в `onSizeChange`.
describe('Split: ход мыши приходит в px, размер живёт в единицах шкалы', () => {
  afterEach(() => { vi.restoreAllMocks() })

  // Шкала подставляется в ОТВЕТ `getComputedStyle`, а не стилем на обёртке:
  // jsdom не наследует пользовательские свойства — переменная, заданная
  // предку, до разделителя не доходит, и тест на 1.5 получал шкалу 1 (замер:
  // 260 вместо 240). Каскад настоящий проверяет `measure`; здесь — разбор
  // строки и деление.
  function drag(scale: string | null, dx: number) {
    const onSizeChange = vi.fn()
    const real = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
      const cs = real(el, pseudo)
      return new Proxy(cs, {
        get: (t, k) => k === 'getPropertyValue'
          ? (name: string) => (name === '--ds-ui-scale' ? scale ?? '' : t.getPropertyValue(name))
          : Reflect.get(t, k),
      })
    })
    render(<Split size={200} min={0} onSizeChange={onSizeChange}>{panes}</Split>)
    const sep = screen.getByRole('separator')
    // `MouseEvent` с именем указателя, а не `fireEvent.pointerDown`: в jsdom нет
    // `PointerEvent`, и тот собирает голый `Event` без `clientX` — старт хода
    // выходит `undefined`, размер `NaN`, и тест краснеет не о том.
    fireEvent(sep, new MouseEvent('pointerdown', { bubbles: true, clientX: 300 }))
    fireEvent(window, new MouseEvent('pointermove', { clientX: 300 + dx }))
    fireEvent(window, new MouseEvent('pointerup', { clientX: 300 + dx }))
    return onSizeChange
  }

  it('на шкале 1.5 ход +60 px — это +40 единиц размера, а не +60', () => {
    expect(drag('1.5', 60)).toHaveBeenLastCalledWith(240)
  })

  it('на шкале 1 ход идёт как есть', () => {
    expect(drag('1', 60)).toHaveBeenLastCalledWith(260)
  })

  it('без переменной вовсе шкала считается равной 1', () => {
    expect(drag(null, -60)).toHaveBeenLastCalledWith(140)
  })

  // Делить на такое нельзя: ноль дал бы Infinity, строка — NaN, и оба молча
  // ушли бы потребителю размером.
  it.each(['0', '-1', 'calc(1 * 1.5)', 'мусор'])('шкала «%s» не разбирается в число — считается равной 1', (bad) => {
    expect(drag(bad, 60)).toHaveBeenLastCalledWith(260)
  })
})

/**
 * Конец жеста (DS-348). Найдено ЧТЕНИЕМ КОДА субагентом-ревьюером на
 * DS-343: слушатели снимались только по `pointerup`.
 *
 * Механизм. На таче браузер забирает жест под прокрутку и шлёт `pointercancel`
 * вместо `pointerup`. `pointermove` остаётся висеть на `window` — и следующий
 * проход указателя двигает разделитель БЕЗ единого нажатия, причём от старого
 * `startPos`, то есть скачком. От шкалы не зависит.
 *
 * ЧТО ЗДЕСЬ ДОКАЗАНО И ЧТО НЕТ, чтобы зелёный не читался шире, чем он есть.
 * Доказана УТЕЧКА: слушатель пережил конец жеста. Это наш код, и это то, что
 * двигает разделитель. НЕ доказано, что chromium на настоящем касании шлёт
 * именно `pointercancel`, — это поведение браузера, оно в спецификации, и
 * проверять его нашим гейтом значило бы проверять не нас. `touch-action: none`
 * снимает ПОВОД (браузеру нечего забирать), утечку чинит `end`; порознь каждая
 * половина оставляет дыру, поэтому едут обе.
 */
describe('Split: перетаскивание кончается на любом из трёх концов (DS-348)', () => {
  /** Нажать на разделитель и вернуть шпиона: ход после конца жеста не считается. */
  function grab() {
    const onSizeChange = vi.fn()
    render(<Split size={200} min={0} onSizeChange={onSizeChange}>{panes}</Split>)
    const sep = screen.getByRole('separator')
    // `MouseEvent` с именем указателя — в jsdom нет `PointerEvent` (см. `drag` выше).
    fireEvent(sep, new MouseEvent('pointerdown', { bubbles: true, clientX: 300 }))
    return { sep, onSizeChange }
  }

  const ends: [string, (sep: HTMLElement) => void][] = [
    ['pointerup', () => { fireEvent(window, new MouseEvent('pointerup', { clientX: 300 })) }],
    ['pointercancel', () => { fireEvent(window, new MouseEvent('pointercancel', { clientX: 300 })) }],
    ['lostpointercapture', (sep) => { fireEvent(sep, new MouseEvent('lostpointercapture', { bubbles: true })) }],
  ]

  it.each(ends)('после `%s` ход указателя разделитель не двигает', (_name, finish) => {
    const { sep, onSizeChange } = grab()
    finish(sep)
    onSizeChange.mockClear()

    fireEvent(window, new MouseEvent('pointermove', { clientX: 400 }))

    expect(onSizeChange, 'слушатель пережил конец жеста — разделитель поедет без нажатия')
      .not.toHaveBeenCalled()
  })

  it('до конца жеста ход ДВИГАЕТ — иначе зелёное выше значит «не работает вовсе»', () => {
    // Пара к предыдущему. Без неё проверка проходила бы и на компоненте, который
    // не слушает `pointermove` ни при каких условиях.
    const { onSizeChange } = grab()

    fireEvent(window, new MouseEvent('pointermove', { clientX: 400 }))

    expect(onSizeChange).toHaveBeenLastCalledWith(300)
  })

  it('второе нажатие после отмены считает ход от СВОЕГО старта, а не от прошлого', () => {
    // Утечка двигала разделитель не просто «без нажатия», а скачком: висящий
    // `move` помнил `startPos` прерванного жеста. Случай ловит именно скачок.
    const { sep, onSizeChange } = grab()
    fireEvent(window, new MouseEvent('pointercancel', { clientX: 300 }))
    fireEvent(sep, new MouseEvent('pointerdown', { bubbles: true, clientX: 500 }))
    onSizeChange.mockClear()

    fireEvent(window, new MouseEvent('pointermove', { clientX: 520 }))

    expect(onSizeChange).toHaveBeenCalledTimes(1)
    expect(onSizeChange).toHaveBeenLastCalledWith(220)
  })
})
