import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Dashboard, Tile } from './Dashboard.js'

describe('Dashboard/Tile', () => {
  it('renders tiles in a grid and fires tile onClick', async () => {
    const onClick = vi.fn()
    render(
      <Dashboard>
        <Tile title="Продажи за день" value="128 400 ₽" onClick={onClick} />
        <Tile title="Заказов" value="17" tone="accent" />
      </Dashboard>
    )
    expect(screen.getByText('Продажи за день')).toBeInTheDocument()
    expect(screen.getByText('128 400 ₽')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Продажи за день/ }))
    expect(onClick).toHaveBeenCalled()
  })

  // DS-272: форму выбирает присутствие `onClick`.
  it('без onClick — <div class="ds-tile--static">, не кнопка', () => {
    const { container } = render(<Tile title="Заказов" value="17" tone="accent" />)
    const tile = container.querySelector('.ds-tile')!
    expect(tile.tagName).toBe('DIV')
    expect(tile).toHaveClass('ds-tile', 'ds-tile--static', 'ds-tile--accent')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('с onClick — <button type="button"> без модификатора статичной формы', () => {
    const { container } = render(<Tile title="Заказов" value="17" onClick={() => {}} />)
    const tile = container.querySelector('.ds-tile')!
    expect(tile.tagName).toBe('BUTTON')
    expect(tile).toHaveAttribute('type', 'button')
    expect(tile).not.toHaveClass('ds-tile--static')
  })

  it('кнопочный атрибут без onClick — ошибка типов (старая форма ломает компиляцию)', () => {
    type P = React.ComponentProps<typeof Tile>
    // До DS-272 `Tile` наследовал атрибуты `<button>` безусловно, и
    // `disabled` на плитке без обработчика компилировался.
    // @ts-expect-error — disabled есть только у нажимаемой формы
    const _p: P = { title: 'x', value: '1', disabled: true }
    expect(_p).toBeDefined()
    // Та же старая форма в JSX: у неё свой путь проверки лишних свойств.
    // @ts-expect-error — disabled без onClick
    const _el = <Tile title="x" value="1" disabled />
    expect(_el).toBeDefined()
  })

  it.each(['disabled', 'type', 'form'])('%s без onClick через any — бросок с именем атрибута', (attr) => {
    const loose = { title: 'x', [attr]: attr === 'disabled' ? true : 'submit' } as any
    expect(() => render(<Tile {...loose} />)).toThrow(new RegExp('`' + attr + '` без `onClick`'))
  })

  it('те же атрибуты при onClick — не бросок', () => {
    expect(() => render(<Tile title="x" onClick={() => {}} disabled type="button" />)).not.toThrow()
  })
})
