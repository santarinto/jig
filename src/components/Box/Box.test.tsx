import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Fit, Center } from './Box.js'

describe('Fit / Center', () => {
  it('Fit рендерит ребёнка в контейнере .ds-fit', () => {
    const { container } = render(<Fit><span>внутри</span></Fit>)
    expect(container.querySelector('.ds-fit')).toBeInTheDocument()
    expect(screen.getByText('внутри')).toBeInTheDocument()
  })
  it('Center рендерит ребёнка в контейнере .ds-center', () => {
    const { container } = render(<Center><span>по центру</span></Center>)
    expect(container.querySelector('.ds-center')).toBeInTheDocument()
    expect(screen.getByText('по центру')).toBeInTheDocument()
  })
  it('пробрасывают rest и мёржат className', () => {
    render(<Fit aria-label="область" className="my">x</Fit>)
    const el = screen.getByLabelText('область')
    expect(el).toHaveClass('ds-fit', 'my')
  })
})
