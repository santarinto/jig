import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Accordion, type AccordionItem } from './Accordion.js'

const items: AccordionItem[] = [
  { id: 'a', title: 'Секция A', content: 'Тело A' },
  { id: 'b', title: 'Секция B', content: 'Тело B' },
  { id: 'c', title: 'Секция C', content: 'Тело C' },
]

describe('Accordion', () => {
  it('opens the section listed in defaultOpenIds', () => {
    render(<Accordion items={items} defaultOpenIds={['b']} />)
    expect(screen.getByRole('button', { name: 'Секция B' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Тело B')).toBeInTheDocument()
    expect(screen.queryByText('Тело A')).toBeNull()
  })

  it('single mode: opening one section closes the previously open one', async () => {
    render(<Accordion items={items} defaultOpenIds={['a']} />)
    await userEvent.click(screen.getByRole('button', { name: 'Секция C' }))
    expect(screen.getByText('Тело C')).toBeInTheDocument()
    expect(screen.queryByText('Тело A')).toBeNull()
  })

  it('multiple mode: sections stay open independently', async () => {
    render(<Accordion items={items} multiple defaultOpenIds={['a']} />)
    await userEvent.click(screen.getByRole('button', { name: 'Секция B' }))
    expect(screen.getByText('Тело A')).toBeInTheDocument()
    expect(screen.getByText('Тело B')).toBeInTheDocument()
  })

  it('uncontrolled: onOpenChange reports the next set on every toggle', async () => {
    const onOpenChange = vi.fn()
    render(<Accordion items={items} multiple defaultOpenIds={['a']} onOpenChange={onOpenChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Секция B' }))
    expect(onOpenChange).toHaveBeenCalledWith(['a', 'b'])
    // и при этом сам открылся — наблюдение состояния не отбирает владение им
    expect(screen.getByText('Тело B')).toBeInTheDocument()
  })

  it('controlled: openIds wins over the click — панель не открывается, пока потребитель не разрешил', async () => {
    const onOpenChange = vi.fn()
    render(<Accordion items={items} openIds={[]} onOpenChange={onOpenChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Секция A' }))
    expect(onOpenChange).toHaveBeenCalledWith(['a'])
    expect(screen.queryByText('Тело A')).toBeNull()
    expect(screen.getByRole('button', { name: 'Секция A' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('controlled: «свернуть всё» снаружи закрывает открытые секции', () => {
    const { rerender } = render(<Accordion items={items} multiple openIds={['a', 'c']} />)
    expect(screen.getByText('Тело A')).toBeInTheDocument()
    expect(screen.getByText('Тело C')).toBeInTheDocument()
    rerender(<Accordion items={items} multiple openIds={[]} />)
    expect(screen.queryByText('Тело A')).toBeNull()
    expect(screen.queryByText('Тело C')).toBeNull()
  })

  it('controlled single: следующий состав — только нажатая секция', async () => {
    const onOpenChange = vi.fn()
    render(<Accordion items={items} openIds={['a']} onOpenChange={onOpenChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Секция C' }))
    expect(onOpenChange).toHaveBeenCalledWith(['c'])
  })

  // Отказ потребителя — не «пока не применил»: состояние, которое владелец не
  // разрешил, нельзя копить у себя, иначе оно всплывёт, как только владения не
  // станет. Это и есть смысл ветки `if (openIds == null)` в toggle.
  it('controlled: отклонённое переключение не оседает во внутреннем состоянии', async () => {
    const { rerender } = render(<Accordion items={items} openIds={[]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Секция A' }))
    rerender(<Accordion items={items} />)
    expect(screen.queryByText('Тело A')).toBeNull()
  })

  it('exposes an aria-labelled region for the open panel', () => {
    render(<Accordion items={items} defaultOpenIds={['a']} />)
    const region = screen.getByRole('region')
    expect(region).toHaveAttribute('aria-labelledby', 'a-header')
  })
})

/**
 * DS-262. ПОРЯДОК УЗЛОВ, а не положение в пикселях: раскладку jsdom не
 * считает, и «слева» здесь проверить нечем. Звено этой проверки — что знак
 * стоит ПЕРВЫМ в заголовке; звено `make measure` («Accordion: знак раскрытия и
 * каретка селекта — на РАЗНЫХ краях») — что первый в потоке действительно
 * оказывается в левой половине, а каретка селекта в правой.
 *
 * Разорви любое: переставь узлы в JSX — покраснеет этот тест; поставь
 * заголовку `flex-direction: row-reverse` — покраснеет замер.
 *
 * Почему это вообще утверждение, а не мелочь: глиф у `Caret` вида `panel` и
 * вида `menu` ОДИН И ТОТ ЖЕ, и справа свёрнутая секция в покое неотличима от
 * селекта — заливка и радиус у `.ds-accordion` и `.ds-input` одни и те же
 * токены, а рамка у секции слабее.
 */
describe('Accordion: знак раскрытия стоит В НАЧАЛЕ заголовка', () => {
  it('знак — первый ребёнок, подпись — после него', () => {
    render(<Accordion items={[{ id: 'a', title: 'Same thing from the CLI', content: 'тело' }]} />)
    const head = screen.getByRole('button', { name: /Same thing/ })
    const kids = [...head.children]
    expect(kids[0]?.classList.contains('ds-caret')).toBe(true)
    expect(kids[1]?.classList.contains('ds-accordion__title')).toBe(true)
  })

  it('знак остаётся первым и когда секция раскрыта', () => {
    render(<Accordion items={[{ id: 'a', title: 'Раскрыт', content: 'тело' }]} defaultOpenIds={['a']} />)
    const head = screen.getByRole('button', { name: 'Раскрыт' })
    expect([...head.children][0]?.classList.contains('ds-caret')).toBe(true)
  })
})
