import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Textarea } from './Textarea.js'

describe('Textarea', () => {
  it('associates label with the textarea and applies rows', () => {
    render(<Textarea label="Заметка" rows={5} />)
    const el = screen.getByLabelText('Заметка')
    expect(el).toBeInstanceOf(HTMLTextAreaElement)
    expect(el).toHaveAttribute('rows', '5')
  })

  it('shows error text and marks the textarea invalid', () => {
    render(<Textarea label="Описание" error="Обязательное поле" />)
    const el = screen.getByLabelText('Описание')
    expect(el).toHaveClass('is-error')
    expect(el).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Обязательное поле')).toBeInTheDocument()
  })

  it('renders hint when there is no error', () => {
    render(<Textarea label="Комментарий" hint="До 500 символов" />)
    expect(screen.getByText('До 500 символов')).toBeInTheDocument()
  })

  it('shows a live character counter that updates as you type (uncontrolled)', async () => {
    render(<Textarea label="Заметка" maxLength={100} />)
    expect(screen.getByText('0 / 100')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Заметка'), 'Привет')
    expect(screen.getByText('6 / 100')).toBeInTheDocument()
  })

  it('reflects controlled value length in the counter and forwards onChange', async () => {
    const onChange = vi.fn()
    render(<Textarea label="Заметка" maxLength={50} value="abc" onChange={onChange} />)
    expect(screen.getByText('3 / 50')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Заметка'), 'd')
    expect(onChange).toHaveBeenCalled()
  })
})
