import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { Modal } from './Modal.js'

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(<Modal open={false} onClose={() => {}}>тело</Modal>)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders when open; overlay + close + Escape fire onClose, dialog click does not', async () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} title="Подтверждение">Удалить документ?</Modal>)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Удалить документ?'))
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('clicking the overlay backdrop fires onClose', async () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} title="Подтверждение">тело</Modal>)
    const overlay = screen.getByRole('dialog').parentElement!
    await userEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('links the dialog to its title via aria-labelledby and moves focus inside on open', () => {
    render(<Modal open onClose={() => {}} title="Подтверждение">тело</Modal>)
    const dialog = screen.getByRole('dialog')
    const id = dialog.getAttribute('aria-labelledby')
    expect(id).toBeTruthy()
    expect(document.getElementById(id!)).toHaveTextContent('Подтверждение')
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('moves initial focus to the first enabled control, skipping a disabled one', () => {
    render(
      <Modal open onClose={() => {}}>
        <button type="button" disabled>Недоступно</button>
        <button type="button">Записать</button>
      </Modal>,
    )
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Записать' }))
  })

  it('wraps Tab past disabled controls', async () => {
    render(
      <Modal open onClose={() => {}}>
        <button type="button" disabled>Недоступно</button>
        <button type="button">Записать</button>
        <button type="button">Отмена</button>
      </Modal>,
    )
    screen.getByRole('button', { name: 'Записать' }).focus()
    await userEvent.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Отмена' }))
  })

  it('монтируется порталом в document.body; container переопределяет цель', () => {
    const { rerender } = render(<Modal open onClose={() => {}}>тело</Modal>)
    const overlay = screen.getByRole('dialog').parentElement!
    expect(overlay.parentElement).toBe(document.body)
    const target = document.createElement('div')
    document.body.appendChild(target)
    rerender(<Modal open onClose={() => {}} container={target}>тело</Modal>)
    expect(screen.getByRole('dialog').parentElement!.parentElement).toBe(target)
    target.remove()
  })

  it('closeOnBackdrop={false}: клик по подложке не зовёт onClose, крестик и Escape работают', async () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} closeOnBackdrop={false} title="Форма">тело</Modal>)
    await userEvent.click(screen.getByRole('dialog').parentElement!)
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('closeOnEscape={false}: Escape не зовёт onClose, клик по подложке работает', async () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} closeOnEscape={false} title="Форма">тело</Modal>)
    await userEvent.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('dialog').parentElement!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('restores focus to the opener when closed', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Открыть</button>
          <Modal open={open} onClose={() => setOpen(false)} title="Диалог">тело</Modal>
        </>
      )
    }
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Открыть' })
    opener.focus()
    await userEvent.click(opener)
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    await userEvent.keyboard('{Escape}')
    expect(document.activeElement).toBe(opener)
  })
})
