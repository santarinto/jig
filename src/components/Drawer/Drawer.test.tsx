import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Drawer } from './Drawer.js'

describe('Drawer', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<Drawer open={false} onClose={() => {}}>Скрыто</Drawer>)
    expect(container.querySelector('.ds-drawer')).toBeNull()
  })

  it('renders a labelled dialog with the side class, title and content', () => {
    render(<Drawer open side="left" title="Фильтр" onClose={() => {}}>Тело</Drawer>)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveClass('ds-drawer--left')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Фильтр')).toBeInTheDocument()
    expect(screen.getByText('Тело')).toBeInTheDocument()
  })

  it('moves initial focus to the first enabled control, skipping a disabled one', () => {
    render(
      <Drawer open onClose={() => {}}>
        <button type="button" disabled>Недоступно</button>
        <button type="button">Применить</button>
      </Drawer>,
    )
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Применить' }))
  })

  it('wraps Tab past disabled controls', async () => {
    render(
      <Drawer open onClose={() => {}}>
        <button type="button" disabled>Недоступно</button>
        <button type="button">Применить</button>
        <button type="button">Сбросить</button>
      </Drawer>,
    )
    screen.getByRole('button', { name: 'Применить' }).focus()
    await userEvent.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Сбросить' }))
  })

  it('монтируется порталом в document.body; container переопределяет цель', () => {
    const { rerender } = render(<Drawer open onClose={() => {}}>тело</Drawer>)
    const overlay = screen.getByRole('dialog').parentElement!
    expect(overlay.parentElement).toBe(document.body)
    const target = document.createElement('div')
    document.body.appendChild(target)
    rerender(<Drawer open onClose={() => {}} container={target}>тело</Drawer>)
    expect(screen.getByRole('dialog').parentElement!.parentElement).toBe(target)
    target.remove()
  })

  it('closes on Escape, close button and overlay click, but not on panel click', async () => {
    const onClose = vi.fn()
    render(<Drawer open title="Ф" onClose={onClose}>Тело</Drawer>)

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(onClose).toHaveBeenCalledTimes(2)

    await userEvent.click(screen.getByText('Тело'))
    expect(onClose).toHaveBeenCalledTimes(2) // panel click does not close

    await userEvent.click(screen.getByRole('dialog').parentElement!)
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('closeOnBackdrop={false}: клик по подложке не зовёт onClose, крестик и Escape работают', async () => {
    const onClose = vi.fn()
    render(<Drawer open onClose={onClose} closeOnBackdrop={false} title="Форма">тело</Drawer>)
    await userEvent.click(screen.getByRole('dialog').parentElement!)
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('closeOnEscape={false}: Escape не зовёт onClose, клик по подложке работает', async () => {
    const onClose = vi.fn()
    render(<Drawer open onClose={onClose} closeOnEscape={false} title="Форма">тело</Drawer>)
    await userEvent.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('dialog').parentElement!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
