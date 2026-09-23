import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Grid } from './Grid.js'

const tpl = (el: Element) => (el as HTMLElement).style.gridTemplateColumns

describe('Grid', () => {
  it('число колонок → repeat(n, minmax(0,1fr))', () => {
    const { container } = render(<Grid columns={3}>x</Grid>)
    expect(tpl(container.querySelector('.ds-grid')!)).toBe('repeat(3, minmax(0, 1fr))')
  })
  it('строковый columns уходит как есть', () => {
    const { container } = render(<Grid columns="200px 1fr">x</Grid>)
    expect(tpl(container.querySelector('.ds-grid')!)).toBe('200px 1fr')
  })
  it('minColumnWidth даёт auto-fit и перекрывает columns', () => {
    const { container } = render(<Grid columns={4} minColumnWidth="240px">x</Grid>)
    expect(tpl(container.querySelector('.ds-grid')!)).toBe('repeat(auto-fit, minmax(240px, 1fr))')
  })
  // Оба режима в одном случае, а не по отдельности: проверка «умолчание —
  // auto-fit» проходит и тогда, когда `keepEmptyTracks` не читается вовсе и оба
  // вызова дают auto-fit. Различимость и есть утверждение (writing-checks, п.6).
  it('keepEmptyTracks переключает на auto-fill, и режимы различимы', () => {
    const { container: fit } = render(<Grid minColumnWidth="240px">x</Grid>)
    const { container: fill } = render(<Grid minColumnWidth="240px" keepEmptyTracks>x</Grid>)
    const a = tpl(fit.querySelector('.ds-grid')!)
    const b = tpl(fill.querySelector('.ds-grid')!)
    expect(a).toBe('repeat(auto-fit, minmax(240px, 1fr))')
    expect(b).toBe('repeat(auto-fill, minmax(240px, 1fr))')
    expect(a).not.toBe(b)
  })
  it('gap уходит токеном', () => {
    const { container } = render(<Grid gap={5}>x</Grid>)
    expect((container.querySelector('.ds-grid') as HTMLElement).style.gap).toBe('var(--ds-space-5)')
  })

  // Та же пара, что у `Stack`, и по той же причине: умолчание в листе, ноль —
  // словом (DS-179). Пиксели меряет `make measure`.
  it('без пропа инлайнового gap НЕТ — умолчание правит лист', () => {
    const { container } = render(<Grid columns={2}>x</Grid>)
    expect((container.querySelector('.ds-grid') as HTMLElement).style.gap).toBe('')
  })

  it('gap={0} доезжает до разметки нулевой ступенью', () => {
    const { container } = render(<Grid columns={2} gap={0}>x</Grid>)
    expect((container.querySelector('.ds-grid') as HTMLElement).style.gap).toBe('var(--ds-space-0)')
  })
  it('пробрасывает rest на div', () => {
    render(<Grid aria-label="сетка">x</Grid>)
    expect(screen.getByLabelText('сетка')).toHaveClass('ds-grid')
  })
})
