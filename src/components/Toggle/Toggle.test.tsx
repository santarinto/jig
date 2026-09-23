import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Checkbox, Radio, Switch } from './index.js'

describe('Toggles', () => {
  it('checkbox reflects indeterminate on the input element', () => {
    render(<Checkbox label="Все" indeterminate />)
    const input = screen.getByLabelText('Все') as HTMLInputElement
    expect(input.indeterminate).toBe(true)
  })
  it('radio is a radio input with label', () => {
    render(<Radio name="g" label="Наличные" />)
    expect(screen.getByLabelText('Наличные')).toHaveAttribute('type', 'radio')
  })
  it('switch is a checkbox input with switch role styling', () => {
    render(<Switch label="Активна" defaultChecked />)
    const input = screen.getByLabelText('Активна') as HTMLInputElement
    expect(input.checked).toBe(true)
    expect(input.closest('.ds-switch')).not.toBeNull()
    // role="switch" обязателен: без него скринридер объявит обычный чекбокс, а
    // не переключатель. Прежний тест потерю роли не замечал (DS-12).
    expect(input).toHaveAttribute('role', 'switch')
  })
})
