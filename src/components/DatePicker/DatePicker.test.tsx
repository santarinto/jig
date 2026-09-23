import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { DatePicker } from './DatePicker.js'

function Harness() {
  const [v, setV] = useState('')
  return (
    <>
      <DatePicker label="Дата" value={v} onChange={setV} />
      <output data-testid="v">{v}</output>
    </>
  )
}

describe('DatePicker', () => {
  it('renders the ISO value formatted as DD.MM.YYYY', () => {
    render(<DatePicker label="Дата" value="2026-07-24" onChange={() => {}} />)
    expect(screen.getByLabelText('Дата')).toHaveValue('24.07.2026')
  })

  it('typing a valid date commits ISO to onChange', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByLabelText('Дата'), '25.07.2026')
    expect(screen.getByLabelText('Дата')).toHaveValue('25.07.2026')
    expect(screen.getByTestId('v')).toHaveTextContent('2026-07-25')
  })

  it('opens the calendar and picks a day', async () => {
    const onChange = vi.fn()
    render(<DatePicker label="Дата" value="2026-07-24" onChange={onChange} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(screen.getByLabelText('Открыть календарь'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // Имя ячейки — полная дата с 1.35.0, а не число: искать день по числу
    // как по имени было ровно тем, что чинилось (три пятнадцатых в months={3}
    // на слух неразличимы).
    await userEvent.click(screen.getByRole('button', { name: /15 июля 2026/ }))
    expect(onChange).toHaveBeenCalledWith('2026-07-15')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('clears the value via the clear button', async () => {
    const onChange = vi.fn()
    render(<DatePicker label="Дата" value="2026-07-24" onChange={onChange} />)
    await userEvent.click(screen.getByLabelText('Очистить'))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('reverts an invalid typed value on blur', async () => {
    render(<DatePicker label="Дата" value="2026-07-24" onChange={() => {}} />)
    const input = screen.getByLabelText('Дата')
    await userEvent.clear(input)
    await userEvent.type(input, '99.99.9999')
    await userEvent.tab()
    expect(input).toHaveValue('24.07.2026')
  })

  it('shows an error and marks the input invalid', () => {
    render(<DatePicker label="Дата" value="2026-07-24" onChange={() => {}} error="Дата в будущем" />)
    expect(screen.getByLabelText('Дата')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Дата в будущем')).toBeInTheDocument()
  })

  it('документный Esc закрывает календарь и возвращает фокус в инпут', async () => {
    render(<DatePicker label="Дата" value="2026-07-24" onChange={() => {}} />)
    await userEvent.click(screen.getByLabelText('Открыть календарь'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    ;(document.activeElement as HTMLElement | null)?.blur() // фокус ушёл из компонента
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByLabelText('Дата')).toHaveFocus()
  })

  // Гейт min/max (DatePicker.tsx:63-77) не тестировался — дата вне диапазона
  // могла уйти в форму. В диапазоне коммитится, вне — на blur откат к value.
  it('дата в диапазоне коммитится, вне диапазона — откат на blur (min/max)', () => {
    const onChange = vi.fn()
    render(<DatePicker label="Срок" value="2026-08-10" min="2026-08-01" max="2026-08-31" onChange={onChange} />)
    const input = screen.getByLabelText('Срок')
    fireEvent.change(input, { target: { value: '20.08.2026' } })
    expect(onChange).toHaveBeenCalledWith('2026-08-20')
    onChange.mockClear()
    fireEvent.change(input, { target: { value: '15.09.2026' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.blur(input)
    expect(input).toHaveValue('10.08.2026')
  })
})
