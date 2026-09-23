import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { escapeRe, highlight } from './highlight.js'

describe('highlight', () => {
  const mount = (node: React.ReactNode) => {
    const { container } = render(<div>{node}</div>)
    return container.firstElementChild as HTMLElement
  }

  it('пустой запрос отдаёт текст ОДНИМ куском, а не набором узлов', () => {
    // Разбиение «на всякий случай» плодило бы узлы на каждой строке лога без
    // единой подсветки. Предмет — что вернулась сама строка, а не массив.
    expect(highlight('запуск воркера', undefined, 'x')).toBe('запуск воркера')
    expect(highlight('запуск воркера', '', 'x')).toBe('запуск воркера')
  })

  it('класс метки — параметр, а не константа', () => {
    // Единственное, чем различались две копии. Один класс на оба означал бы,
    // что подсветка одного из компонентов вышла из-под собственного CSS.
    expect(mount(highlight('ошибка', 'шиб', 'ds-log__hit'))
      .querySelector('mark')).toHaveClass('ds-log__hit')
    expect(mount(highlight('ошибка', 'шиб', 'ds-transcript__hit'))
      .querySelector('mark')).toHaveClass('ds-transcript__hit')
  })

  it('находит все вхождения и не теряет текст между ними', () => {
    const el = mount(highlight('ток и ток и ток', 'ток', 'h'))
    expect(el.querySelectorAll('mark')).toHaveLength(3)
    expect(el.textContent).toBe('ток и ток и ток')
  })

  it('регистр не важен, а разметка совпадения сохраняет исходный регистр', () => {
    const el = mount(highlight('Ошибка соединения', 'ОШИБКА', 'h'))
    expect(el.querySelector('mark')!.textContent).toBe('Ошибка')
  })

  it('запрос ищется буквально: точки и скобки не работают как регэксп', () => {
    // Ради этого и есть escapeRe. Без него `a.c` подсветило бы `abc`.
    const el = mount(highlight('abc и a.c', 'a.c', 'h'))
    expect(el.querySelectorAll('mark')).toHaveLength(1)
    expect(el.querySelector('mark')!.textContent).toBe('a.c')
    expect(escapeRe('a.c')).toBe('a\\.c')
    // Строка, которая без экранирования уронила бы `new RegExp` целиком.
    expect(() => mount(highlight('скобка ( тут', '(', 'h'))).not.toThrow()
  })

  it('текст без совпадений возвращается одним куском', () => {
    expect(highlight('запуск', 'ззз', 'h')).toBe('запуск')
  })
})
