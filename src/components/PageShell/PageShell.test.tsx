import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PageShell } from './PageShell.js'

describe('PageShell', () => {
  it('рендерит заголовок в шапке и контент в теле', () => {
    const { container } = render(<PageShell title="Заметки">тело</PageShell>)
    expect(container.querySelector('.ds-page__title')?.textContent).toBe('Заметки')
    expect(container.querySelector('.ds-page__body')?.textContent).toBe('тело')
  })

  it('рендерит действия в шапке', () => {
    render(<PageShell title="T" actions={<button type="button">Создать</button>}>x</PageShell>)
    expect(screen.getByRole('button', { name: 'Создать' })).toBeInTheDocument()
  })

  it('без title/actions/header шапки нет', () => {
    const { container } = render(<PageShell>только тело</PageShell>)
    expect(container.querySelector('.ds-page__header')).toBeNull()
    expect(container.querySelector('.ds-page__body')?.textContent).toBe('только тело')
  })

  it('кастомный header перекрывает title/actions', () => {
    const { container } = render(
      <PageShell title="не показывать" header={<div>своя шапка</div>}>x</PageShell>,
    )
    expect(container.querySelector('.ds-page__title')).toBeNull()
    expect(screen.getByText('своя шапка')).toBeInTheDocument()
  })

  it('maxWidth ограничивает и центрирует тело', () => {
    const { container } = render(<PageShell maxWidth={960}>x</PageShell>)
    const body = container.querySelector('.ds-page__body') as HTMLElement
    expect(body.style.maxWidth).toBe('960px')
    expect(body.style.marginInline).toBe('auto')
  })

  it('пробрасывает rest и мёржит className', () => {
    render(<PageShell className="my" aria-label="страница">x</PageShell>)
    expect(screen.getByLabelText('страница')).toHaveClass('ds-page', 'my')
  })
})
