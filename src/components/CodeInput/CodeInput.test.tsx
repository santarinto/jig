import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { CodeInput } from './CodeInput.js'

describe('CodeInput', () => {
  it('renders `length` cells prefilled from value', () => {
    render(<CodeInput length={6} value="4128" onChange={() => {}} label="Код" />)
    const cells = screen.getAllByRole('textbox')
    expect(cells).toHaveLength(6)
    expect(cells[0]).toHaveValue('4')
    expect(cells[3]).toHaveValue('8')
    expect(cells[4]).toHaveValue('')
  })

  it('fills a cell and reports the new value', async () => {
    const onChange = vi.fn()
    render(<CodeInput length={6} value="41" onChange={onChange} label="Код" />)
    await userEvent.type(screen.getAllByRole('textbox')[2], '2')
    expect(onChange).toHaveBeenCalledWith('412')
  })

  it('fires onComplete when the last cell is filled', async () => {
    const onComplete = vi.fn()
    render(<CodeInput length={4} value="128" onChange={() => {}} onComplete={onComplete} label="Код" />)
    await userEvent.type(screen.getAllByRole('textbox')[3], '5')
    expect(onComplete).toHaveBeenCalledWith('1285')
  })

  it('backspace on an empty cell clears the previous digit', async () => {
    const onChange = vi.fn()
    render(<CodeInput length={6} value="4128" onChange={onChange} label="Код" />)
    const cells = screen.getAllByRole('textbox')
    cells[4].focus()
    await userEvent.keyboard('{Backspace}')
    expect(onChange).toHaveBeenCalledWith('412')
  })

  it('pastes digits across the cells', async () => {
    const onChange = vi.fn()
    render(<CodeInput length={6} value="" onChange={onChange} label="Код" />)
    const cells = screen.getAllByRole('textbox')
    cells[0].focus()
    await userEvent.paste('123456')
    expect(onChange).toHaveBeenCalledWith('123456')
  })

  it('shows an error and marks cells invalid', () => {
    render(<CodeInput length={4} value="9310" onChange={() => {}} error="Неверно" />)
    expect(screen.getByText('Неверно')).toBeInTheDocument()
    expect(screen.getAllByRole('textbox')[0]).toHaveClass('is-error')
  })
})
