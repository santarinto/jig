import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TextField } from './TextField.js'

describe('TextField', () => {
  it('associates label with input', () => {
    render(<TextField label="Наименование" />)
    expect(screen.getByLabelText('Наименование')).toBeInstanceOf(HTMLInputElement)
  })

  it('shows error text and marks input invalid', () => {
    render(<TextField label="ИНН" error="Обязательное поле" />)
    const input = screen.getByLabelText('ИНН')
    expect(input).toHaveClass('is-error')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Обязательное поле')).toBeInTheDocument()
  })

  it('renders hint when no error', () => {
    render(<TextField label="Код" hint="До 9 символов" />)
    expect(screen.getByText('До 9 символов')).toBeInTheDocument()
  })
})
