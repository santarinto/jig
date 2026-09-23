import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Skeleton } from './Skeleton.js'

describe('Skeleton', () => {
  it('renders a busy status region with the default sweep animation', () => {
    render(<Skeleton variant="rect" width={120} height={40} />)
    const el = screen.getByRole('status')
    expect(el).toHaveAttribute('aria-busy', 'true')
    expect(el).toHaveClass('ds-skel', 'ds-skel--sweep', 'ds-skel--rect')
    expect(el).toHaveStyle({
      width: 'calc(120px * var(--ds-ui-scale, 1))',
      height: 'calc(40px * var(--ds-ui-scale, 1))',
    })
  })

  it('applies the chosen animation variant', () => {
    render(<Skeleton variant="rect" anim="retro" />)
    expect(screen.getByRole('status')).toHaveClass('ds-skel--retro')
  })

  it('renders N text lines with the last one shorter', () => {
    const { container } = render(<Skeleton variant="text" lines={3} />)
    const lines = container.querySelectorAll('.ds-skel--text')
    expect(lines).toHaveLength(3)
    expect(lines[2]).toHaveStyle({ width: '60%' })
  })

  it('renders a circle with equal dimensions', () => {
    render(<Skeleton variant="circle" width={40} height={40} />)
    const el = screen.getByRole('status')
    expect(el).toHaveClass('ds-skel--circle')
    expect(el).toHaveStyle({
      width: 'calc(40px * var(--ds-ui-scale, 1))',
      height: 'calc(40px * var(--ds-ui-scale, 1))',
    })
  })
})

/* Числовой размер — это размер интерфейса, и он обязан жить по --ds-ui-scale,
   как height у BarChart, size у DonutChart и width у SideNav. Иначе заглушка
   перестаёт совпадать с содержимым, которое она изображает. Строка остаётся
   дословной — это и есть выход для тех, кому нужен фиксированный размер. */
describe('Skeleton and the UI scale', () => {
  it('scales a numeric size with the rest of the interface', () => {
    const { container } = render(<Skeleton variant="rect" width={200} height={40} />)
    const el = container.querySelector('.ds-skel') as HTMLElement
    expect(el.style.width).toBe('calc(200px * var(--ds-ui-scale, 1))')
    expect(el.style.height).toBe('calc(40px * var(--ds-ui-scale, 1))')
  })

  it('passes a string size through verbatim', () => {
    const { container } = render(<Skeleton variant="rect" width="60%" height="2rem" />)
    const el = container.querySelector('.ds-skel') as HTMLElement
    expect(el.style.width).toBe('60%')
    expect(el.style.height).toBe('2rem')
  })
})
