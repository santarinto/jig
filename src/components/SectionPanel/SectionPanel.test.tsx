import { render, screen, fireEvent, createEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { SectionPanel } from './SectionPanel.js'

const sections = [
  { id: 'sales', label: 'Продажи' },
  { id: 'buy', label: 'Закупки' },
]

describe('SectionPanel', () => {
  it('marks the active section and fires onSelect', async () => {
    const onSelect = vi.fn()
    render(<SectionPanel sections={sections} selectedId="sales" onSelect={onSelect} />)
    const active = screen.getByRole('tab', { name: 'Продажи' })
    expect(active).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByRole('tab', { name: 'Закупки' }))
    expect(onSelect).toHaveBeenCalledWith('buy')
  })

  it('roving tabindex + ArrowDown moves selection to the next section', async () => {
    const onSelect = vi.fn()
    render(<SectionPanel sections={sections} selectedId="sales" onSelect={onSelect} />)
    const active = screen.getByRole('tab', { name: 'Продажи' })
    expect(active).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Закупки' })).toHaveAttribute('tabindex', '-1')
    active.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(onSelect).toHaveBeenCalledWith('buy')
  })
})

/**
 * Выключенный раздел появился в 1.42.0 вместе с общей математикой roving
 * (`src/internal/roving.ts`). До неё пропуска не было ни здесь, ни у FormTabs —
 * а `Tabs` его умел: одна и та же полоса вела себя по-разному в зависимости от
 * того, каким компонентом нарисована.
 */
describe('SectionPanel · выключенный раздел', () => {
  const withDisabled = [
    { id: 'sales', label: 'Продажи' },
    { id: 'buy', label: 'Закупки', disabled: true },
    { id: 'stock', label: 'Склад' },
  ]

  it('стрелка перешагивает выключенный раздел, а не встаёт на него', async () => {
    const onSelect = vi.fn()
    render(<SectionPanel sections={withDisabled} selectedId="sales" onSelect={onSelect} />)
    screen.getByRole('tab', { name: 'Продажи' }).focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(onSelect).toHaveBeenCalledWith('stock')
  })

  it('End идёт на последний доступный, а не на последний', async () => {
    const onSelect = vi.fn()
    const tail = [...withDisabled.slice(0, 2), { id: 'stock', label: 'Склад', disabled: true }]
    render(<SectionPanel sections={tail} selectedId="sales" onSelect={onSelect} />)
    screen.getByRole('tab', { name: 'Продажи' }).focus()
    await userEvent.keyboard('{End}')
    expect(onSelect).toHaveBeenCalledWith('sales')
  })

  it('чужую клавишу полоса не гасит — иначе съедает Tab и ввод', () => {
    render(<SectionPanel sections={withDisabled} selectedId="sales" />)
    const strip = screen.getByRole('tablist')
    const foreign = createEvent.keyDown(strip, { key: 'Tab' })
    fireEvent(strip, foreign)
    expect(foreign.defaultPrevented).toBe(false)
    // Сосед с заведомо известным значением: своя клавиша обязана гаситься.
    // Не гасится — значит событие вообще не доехало, и вывод выше ничего не стоит.
    const own = createEvent.keyDown(strip, { key: 'ArrowDown' })
    fireEvent(strip, own)
    expect(own.defaultPrevented).toBe(true)
  })

  it('выключенный помечен aria-disabled, не берёт таб-стоп и не выбирается кликом', async () => {
    const onSelect = vi.fn()
    render(<SectionPanel sections={withDisabled} selectedId="buy" onSelect={onSelect} />)
    const off = screen.getByRole('tab', { name: 'Закупки' })
    expect(off).toHaveAttribute('aria-disabled', 'true')
    // Активный и выключенный одновременно — таб-стопа всё равно нет: иначе
    // фокус уезжает на то, что не активируется.
    expect(off).toHaveAttribute('tabindex', '-1')
    await userEvent.click(off)
    expect(onSelect).not.toHaveBeenCalled()
  })

  // Горизонтальная ориентация не покрывалась (DS-12): в ней своя клавиша —
  // ArrowRight, а ArrowDown становится «не нашей» и событие трогать нельзя.
  it('горизонталь: ArrowRight ведёт к следующему, ArrowDown — не наша клавиша', () => {
    const onSelect = vi.fn()
    render(<SectionPanel orientation="horizontal" sections={sections} selectedId="sales" onSelect={onSelect} />)
    const strip = screen.getByRole('tablist')
    expect(strip).toHaveAttribute('aria-orientation', 'horizontal')
    const right = createEvent.keyDown(strip, { key: 'ArrowRight' })
    fireEvent(strip, right)
    expect(right.defaultPrevented).toBe(true)
    expect(onSelect).toHaveBeenCalledWith('buy')
    const down = createEvent.keyDown(strip, { key: 'ArrowDown' })
    fireEvent(strip, down)
    expect(down.defaultPrevented).toBe(false)
  })

  it('Home и End прыгают на первый и последний раздел', () => {
    const three = [{ id: 'a', label: 'А' }, { id: 'b', label: 'Б' }, { id: 'c', label: 'В' }]
    const onSelect = vi.fn()
    render(<SectionPanel sections={three} selectedId="b" onSelect={onSelect} />)
    const strip = screen.getByRole('tablist')
    fireEvent(strip, createEvent.keyDown(strip, { key: 'End' }))
    expect(onSelect).toHaveBeenLastCalledWith('c')
    fireEvent(strip, createEvent.keyDown(strip, { key: 'Home' }))
    expect(onSelect).toHaveBeenLastCalledWith('a')
  })
})

/**
 * ЛЕНТА ЛИСТАЕТСЯ, ТОЛЬКО КОГДА НЕ ВЛЕЗАЕТ (DS-305). jsdom раскладки не
 * считает, поэтому ширины подставлены в прототип; сама раскладка на 360 держит
 * гейт `overflow`. Утверждение парное: одна и та же разметка при разном
 * соотношении ширин обязана ДАТЬ РАЗНЫЙ класс, иначе класс, стоящий всегда (или
 * никогда), прошёл бы любую половину.
 */
describe('SectionPanel · прокрутка горизонтальной ленты', () => {
  const withWidths = (scroll: number, client: number, fn: () => void) => {
    const sw = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth')
    const cw = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => scroll })
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => client })
    try { fn() } finally {
      if (sw) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', sw)
      if (cw) Object.defineProperty(HTMLElement.prototype, 'clientWidth', cw)
    }
  }

  it('не влезает — is-scrollable; влезает — нет', () => {
    withWidths(600, 300, () => {
      const { unmount } = render(<SectionPanel sections={sections} selectedId="sales" orientation="horizontal" />)
      expect(screen.getByRole('tablist')).toHaveClass('is-scrollable')
      unmount()
    })
    withWidths(300, 300, () => {
      render(<SectionPanel sections={sections} selectedId="sales" orientation="horizontal" />)
      expect(screen.getByRole('tablist')).not.toHaveClass('is-scrollable')
    })
  })

  it('вертикальной ленте вбок листать нечего — класса нет и при нехватке', () => {
    withWidths(600, 300, () => {
      render(<SectionPanel sections={sections} selectedId="sales" />)
      expect(screen.getByRole('tablist')).not.toHaveClass('is-scrollable')
    })
  })
})
