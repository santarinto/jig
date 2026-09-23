import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Stat } from './Stat.js'

describe('Stat', () => {
  it('renders label, value and hint', () => {
    render(<Stat label="Вес" value="71.2 кг" hint="за неделю" />)
    expect(screen.getByText('Вес')).toBeInTheDocument()
    expect(screen.getByText('71.2 кг')).toBeInTheDocument()
    expect(screen.getByText('за неделю')).toBeInTheDocument()
  })

  it('colours the delta positive for up and negative for down by default', () => {
    const { container, rerender } = render(<Stat label="A" value="1" delta={{ value: '5%', direction: 'up' }} />)
    expect(container.querySelector('.ds-stat__delta')).toHaveClass('ds-stat__delta--positive')
    rerender(<Stat label="A" value="1" delta={{ value: '5%', direction: 'down' }} />)
    expect(container.querySelector('.ds-stat__delta')).toHaveClass('ds-stat__delta--negative')
  })

  it('honours an explicit delta tone', () => {
    const { container } = render(<Stat label="Расходы" value="100" delta={{ value: '7%', direction: 'up', tone: 'negative' }} />)
    expect(container.querySelector('.ds-stat__delta')).toHaveClass('ds-stat__delta--negative')
  })

  it('omits the delta element when no delta is given', () => {
    const { container } = render(<Stat label="A" value="1" />)
    expect(container.querySelector('.ds-stat__delta')).toBeNull()
  })
})

describe('Stat: единица и адорнмент', () => {
  it('единица стоит отдельным узлом, а не внутри значения', () => {
    const { container } = render(<Stat label="Среднее время" value={347} unit="мс" />)
    expect(container.querySelector('.ds-stat__value')).toHaveTextContent('347')
    expect(container.querySelector('.ds-stat__value')).not.toHaveTextContent('мс')
    expect(container.querySelector('.ds-stat__unit')).toHaveTextContent('мс')
  })

  it('без единицы лишнего узла нет', () => {
    const { container } = render(<Stat label="Коммитов" value={12} />)
    expect(container.querySelector('.ds-stat__unit')).toBeNull()
  })

  it('адорнмент стоит в строке подписи, а не значения — иначе слипнется с delta', () => {
    const { container } = render(
      <Stat label="За последний час" value={12} adornment={<span>новый коммит</span>}
        delta={{ value: 3, direction: 'up' }} />,
    )
    expect(container.querySelector('.ds-stat__labelrow .ds-stat__adornment')).not.toBeNull()
    expect(container.querySelector('.ds-stat__row .ds-stat__adornment')).toBeNull()
  })

  it('адорнмент читается сразу за подписью — он статус плитки, а не отдельная вещь', () => {
    const { container } = render(
      <Stat label="За последний час" value={12} adornment={<span>новый коммит</span>} />,
    )
    expect(container.querySelector('.ds-stat__labelrow')).toHaveTextContent('За последний часновый коммит')
  })

  it('без адорнмента узла нет', () => {
    const { container } = render(<Stat label="Коммитов" value={12} />)
    expect(container.querySelector('.ds-stat__adornment')).toBeNull()
  })
})
