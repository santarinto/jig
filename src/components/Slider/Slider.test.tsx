import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Slider } from './Slider.js'

describe('Slider', () => {
  it('renders label and the current value with suffix', () => {
    render(<Slider label="Громкость" value={65} onChange={() => {}} suffix="%" />)
    expect(screen.getByText('Громкость')).toBeInTheDocument()
    expect(screen.getByText('65 %')).toBeInTheDocument()
    expect(screen.getByRole('slider')).toHaveValue('65')
  })

  it('calls onChange with a numeric value', () => {
    const onChange = vi.fn()
    render(<Slider label="Громкость" value={65} onChange={onChange} min={0} max={100} />)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '80' } })
    expect(onChange).toHaveBeenCalledWith(80)
  })

  it('can be disabled', () => {
    render(<Slider label="Выкл" value={40} onChange={() => {}} disabled />)
    expect(screen.getByRole('slider')).toBeDisabled()
  })

  // Заливка трека — единственное, что показывает долю значения глазом, и её не
  // читал ни один assert (DS-12, Slider.tsx:24-26).
  it('заливка трека отражает долю значения', () => {
    render(<Slider label="Заполнение" value={30} min={0} max={100} onChange={() => {}} />)
    const style = screen.getByRole('slider').getAttribute('style') ?? ''
    expect(style).toContain('30%')
    expect(style).toContain('--ds-accent')
  })

  it('гард max === min: доля 0, а не деление на ноль', () => {
    render(<Slider label="Плоский" value={5} min={5} max={5} onChange={() => {}} />)
    const style = screen.getByRole('slider').getAttribute('style') ?? ''
    expect(style).toContain('0%')
    expect(style).not.toContain('NaN')
  })
})
