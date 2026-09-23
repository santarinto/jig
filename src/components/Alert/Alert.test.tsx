import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Alert } from './Alert.js'

describe('Alert', () => {
  it('renders title and content with the tone class', () => {
    render(<Alert tone="success" title="Проведено">Документ проведён.</Alert>)
    const el = screen.getByRole('status')
    expect(el).toHaveClass('ds-alert--success')
    expect(screen.getByText('Проведено')).toBeInTheDocument()
    expect(screen.getByText('Документ проведён.')).toBeInTheDocument()
  })

  it('uses role="alert" for error and warning tones', () => {
    const { rerender } = render(<Alert tone="error">Ошибка</Alert>)
    expect(screen.getByRole('alert')).toHaveClass('ds-alert--error')
    rerender(<Alert tone="warning">Внимание</Alert>)
    expect(screen.getByRole('alert')).toHaveClass('ds-alert--warning')
  })

  it('shows a close button only when onClose is given, and fires it', async () => {
    const onClose = vi.fn()
    const { rerender } = render(<Alert tone="info">Инфо</Alert>)
    expect(screen.queryByRole('button', { name: 'Закрыть' })).toBeNull()
    rerender(<Alert tone="info" onClose={onClose}>Инфо</Alert>)
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
