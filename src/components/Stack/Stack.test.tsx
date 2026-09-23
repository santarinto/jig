import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Stack } from './Stack.js'

describe('Stack', () => {
  it('по умолчанию column, проставляет data-атрибуты по пропсам', () => {
    const { container } = render(<Stack align="center" justify="between" wrap>x</Stack>)
    const el = container.querySelector('.ds-stack')!
    expect(el).toHaveAttribute('data-direction', 'column')
    expect(el).toHaveAttribute('data-align', 'center')
    expect(el).toHaveAttribute('data-justify', 'between')
    expect(el).toHaveAttribute('data-wrap', 'true')
  })
  it('gap уходит inline-переменной токена', () => {
    const { container } = render(<Stack gap={4}>x</Stack>)
    expect((container.querySelector('.ds-stack') as HTMLElement).style.gap).toBe('var(--ds-space-4)')
  })

  /**
   * УМОЛЧАНИЕ ЗАЗОРА ЖИВЁТ В ЛИСТЕ, А НЕ В РАЗМЕТКЕ (DS-179).
   *
   * Здесь проверяется ровно это разделение: без пропа инлайнового `gap` нет
   * ВООБЩЕ — значит правит лист (`.ds-stack { gap: var(--ds-space-3) }`), и
   * потребитель может перебить умолчание своим классом. Появись число в
   * `style`, оно перебивало бы и его правило тоже.
   *
   * Сколько это в пикселях и что зазор действительно есть — вопрос браузера, и
   * на него отвечает случай `Stack/Grid: без gap дети стоят на базовом шаге, а
   * gap={0} — вплотную` в `make measure`. jsdom листов не считает, и «default
   * работает» здесь было бы утверждением ни о чём.
   */
  it('без пропа инлайнового gap НЕТ — умолчание правит лист', () => {
    const { container } = render(<Stack>x</Stack>)
    expect((container.querySelector('.ds-stack') as HTMLElement).style.gap).toBe('')
  })

  it('gap={0} — это ЯВНОЕ «вплотную», и оно доезжает до разметки', () => {
    // Нулевая ступень объявлена в шкале (`--ds-space-0: 0`) именно ради этого:
    // без неё подстановка давала бы невалидное объявление, которое браузер
    // отбрасывает, — а отброшенное объявление теперь означало бы «умолчание из
    // листа», то есть `gap={0}` перестал бы работать МОЛЧА.
    const { container } = render(<Stack gap={0}>x</Stack>)
    expect((container.querySelector('.ds-stack') as HTMLElement).style.gap).toBe('var(--ds-space-0)')
  })
  it('direction row отражается в data-direction', () => {
    const { container } = render(<Stack direction="row">x</Stack>)
    expect(container.querySelector('.ds-stack')).toHaveAttribute('data-direction', 'row')
  })
  it('inline даёт data-inline', () => {
    const { container } = render(<Stack inline>x</Stack>)
    expect(container.querySelector('.ds-stack')).toHaveAttribute('data-inline', 'true')
  })
  it('пробрасывает rest на div', () => {
    render(<Stack aria-label="панель">x</Stack>)
    expect(screen.getByLabelText('панель')).toHaveClass('ds-stack')
  })
})
