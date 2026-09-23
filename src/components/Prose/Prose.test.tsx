import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Prose } from './Prose.js'

describe('Prose', () => {
  it('рендерит серверный html через dangerouslySetInnerHTML', () => {
    const { container } = render(<Prose html="<h2>Заголовок</h2><p>абзац</p>" />)
    expect(container.querySelector('.ds-prose h2')?.textContent).toBe('Заголовок')
    expect(container.querySelector('.ds-prose p')?.textContent).toBe('абзац')
  })

  it('рендерит children, если html не задан', () => {
    render(<Prose><p>дочерний</p></Prose>)
    expect(screen.getByText('дочерний')).toBeInTheDocument()
  })

  it('несёт класс ds-prose и мёржит className', () => {
    const { container } = render(<Prose html="<p>x</p>" className="my" />)
    expect(container.querySelector('.ds-prose')).toHaveClass('my')
  })

  it('пробрасывает rest на контейнер', () => {
    render(<Prose html="<p>тело</p>" aria-label="статья" />)
    expect(screen.getByLabelText('статья')).toHaveClass('ds-prose')
  })
})

/**
 * DS-147. Проверяется ТОЖДЕСТВОМ УЗЛА, а не текстом: текст совпадает и у
 * пересозданного поддерева, поэтому санитар на `textContent` зеленел бы ровно
 * на том дефекте, ради которого написан.
 */
describe('Prose — поддерево переживает перерисовку', () => {
  it('тот же html не пересоздаёт узлы', () => {
    const { container, rerender } = render(<Prose html="<h2>Заголовок</h2><p>абзац</p>" />)
    const h2 = container.querySelector('.ds-prose h2')
    expect(h2).not.toBeNull()

    rerender(<Prose html="<h2>Заголовок</h2><p>абзац</p>" />)

    expect(container.querySelector('.ds-prose h2')).toBe(h2)
    expect(h2?.isConnected).toBe(true)
  })

  it('перерисовка от соседнего пропа тоже не пересоздаёт узлы', () => {
    // Именно так это и случается у потребителя: html не трогали, перерисовку
    // вызвало что-то рядом.
    const { container, rerender } = render(<Prose html="<p>тело</p>" aria-label="а" />)
    const p = container.querySelector('.ds-prose p')

    rerender(<Prose html="<p>тело</p>" aria-label="б" />)

    expect(container.querySelector('.ds-prose p')).toBe(p)
  })

  it('изменившийся html поддерево ПЕРЕСОЗДАЁТ — иначе это была бы заморозка', () => {
    const { container, rerender } = render(<Prose html="<p>было</p>" />)
    const p = container.querySelector('.ds-prose p')

    rerender(<Prose html="<p>стало</p>" />)

    expect(container.querySelector('.ds-prose p')).not.toBe(p)
    expect(container.querySelector('.ds-prose p')?.textContent).toBe('стало')
  })
})
