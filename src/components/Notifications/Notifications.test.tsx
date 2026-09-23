import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Toast, NotificationCenter } from './Notifications.js'

describe('Notifications', () => {
  it('Toast shows message with tone class and closes', async () => {
    const onClose = vi.fn()
    render(<Toast tone="error" onClose={onClose}>Не удалось провести</Toast>)
    // `alert`, а не `status`: с DS-157 срочность — свойство ТОНА.
    // `status` уходит вежливо, дожидаясь очереди, и ошибка, объявленная им,
    // доезжает до слушателя после всего остального.
    const toast = screen.getByRole('alert')
    expect(toast).toHaveClass('ds-toast--error')
    expect(toast).toHaveTextContent('Не удалось провести')
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('NotificationCenter lists items and dismisses by id', async () => {
    const onDismiss = vi.fn()
    render(<NotificationCenter items={[
      { id: 'n1', tone: 'info', title: 'Обновление', text: 'Доступна новая версия' },
      { id: 'n2', tone: 'success', title: 'Проведено' },
    ]} onDismiss={onDismiss} />)
    expect(screen.getByText('Обновление')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Скрыть Проведено' }))
    expect(onDismiss).toHaveBeenCalledWith('n2')
  })
})
