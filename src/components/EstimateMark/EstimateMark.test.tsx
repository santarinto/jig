import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { EstimateMark } from './EstimateMark.js'

describe('EstimateMark', () => {
  /**
   * Главное утверждение — про РАЗНЫЕ СТОРОНЫ, а не про каждый узел по
   * отдельности: звёздочка вне дерева доступности, пояснение внутри него. Порознь
   * обе проверки зелены и у компонента, который прячет оба узла (тогда
   * скринридер молчит вовсе), и у того, который не прячет ни одного (тогда
   * скринридер читает «звёздочка оценочная величина»).
   *
   * Чинится здесь ровно то, что нашёл потребитель: прежняя форма объявляла
   * звёздочку и молчала о смысле, потому что смысл лежал в `title`.
   *
   * Мутация: сними `aria-hidden` со звёздочки — падает; повесь его на пояснение
   * — падает.
   */
  it('звёздочка декоративна, а смысл несёт текст', () => {
    const { container } = render(<EstimateMark />)
    const star = container.querySelector('.ds-estmark__star')!
    const hint = screen.getByText('оценочная величина')

    expect(star).toHaveTextContent('*')
    expect(star).toHaveAttribute('aria-hidden', 'true')
    expect(hint).not.toHaveAttribute('aria-hidden')
  })

  /**
   * Пояснение скрыто КЛАССОМ из общего листа, а не `display:none` и не `title`.
   * `display:none` убрал бы текст и из дерева доступности — то есть выглядел бы
   * как решение и был бы прежней бедой под другим именем. Что класс действительно
   * убирает текст с экрана (jsdom раскладки не знает) — держит measure-инвариант
   * «EstimateMark: пояснение звучит, но не видно».
   */
  it('пояснение скрыто общим классом, а не спрятано в title', () => {
    const { container } = render(<EstimateMark />)
    expect(screen.getByText('оценочная величина')).toHaveClass('ds-visually-hidden')
    expect(container.querySelector('[title]')).toBeNull()
  })

  it('hint уточняет, чем помечена величина', () => {
    render(<EstimateMark hint="ставка оценочная" />)
    expect(screen.getByText('ставка оценочная')).toBeInTheDocument()
    expect(screen.queryByText('оценочная величина')).toBeNull()
  })

  /**
   * Тот самый случай потребителя, ради которого знак вынут из `Money`: звёздочка
   * на процентной ставке. Утверждается, что знак у ставки и знак у суммы — ОДИН
   * И ТОТ ЖЕ узел, иначе в одной таблице встанут две разные звёздочки.
   */
  it('годится не только для денег — ставка помечается тем же знаком', () => {
    const { container } = render(<span>43% <EstimateMark hint="ставка оценочная" /></span>)
    expect(container.querySelector('.ds-estmark__star')).toHaveTextContent('*')
  })
})
