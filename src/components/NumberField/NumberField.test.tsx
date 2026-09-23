import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, it, expect } from 'vitest'
import { NumberField } from './NumberField.js'

function Harness({ initial = 10, ...rest }: { initial?: number } & Partial<React.ComponentProps<typeof NumberField>>) {
  const [v, setV] = useState(initial)
  return (
    <>
      <NumberField label="Число" value={v} onChange={setV} {...rest} />
      <output data-testid="v">{v}</output>
    </>
  )
}

describe('NumberField', () => {
  it('renders the value and suffix', () => {
    render(<NumberField label="Вес" value={72.5} onChange={() => {}} suffix="кг" />)
    expect(screen.getByLabelText('Вес')).toHaveValue('72.5')
    expect(screen.getByText('кг')).toBeInTheDocument()
  })

  it('increments and decrements by step', async () => {
    render(<Harness initial={72.5} step={0.5} />)
    await userEvent.click(screen.getByLabelText('Увеличить'))
    expect(screen.getByTestId('v')).toHaveTextContent('73')
    await userEvent.click(screen.getByLabelText('Уменьшить'))
    await userEvent.click(screen.getByLabelText('Уменьшить'))
    expect(screen.getByTestId('v')).toHaveTextContent('72')
  })

  it('clamps at min/max and disables the corresponding button', () => {
    const { rerender } = render(<NumberField label="Число" value={10} onChange={() => {}} min={0} max={10} />)
    expect(screen.getByLabelText('Увеличить')).toBeDisabled()
    expect(screen.getByLabelText('Уменьшить')).not.toBeDisabled()
    rerender(<NumberField label="Число" value={0} onChange={() => {}} min={0} max={10} />)
    expect(screen.getByLabelText('Уменьшить')).toBeDisabled()
  })

  it('commits a typed number', async () => {
    render(<Harness initial={10} />)
    const input = screen.getByLabelText('Число')
    await userEvent.clear(input)
    await userEvent.type(input, '15')
    expect(screen.getByTestId('v')).toHaveTextContent('15')
  })

  it('ArrowUp / ArrowDown step the value', async () => {
    render(<Harness initial={10} step={1} />)
    const input = screen.getByLabelText('Число')
    input.focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByTestId('v')).toHaveTextContent('11')
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByTestId('v')).toHaveTextContent('10')
  })

  it('reverts an invalid typed value on blur', async () => {
    render(<NumberField label="Число" value={10} onChange={() => {}} />)
    const input = screen.getByLabelText('Число')
    await userEvent.clear(input)
    await userEvent.type(input, 'abc')
    await userEvent.tab()
    expect(input).toHaveValue('10')
  })

  it('exposes spinbutton semantics and error state', () => {
    render(<NumberField label="Число" value={5} onChange={() => {}} min={0} max={10} error="Слишком мало" />)
    const input = screen.getByLabelText('Число')
    expect(input).toHaveAttribute('role', 'spinbutton')
    expect(input).toHaveAttribute('aria-valuenow', '5')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Слишком мало')).toBeInTheDocument()
  })
})
