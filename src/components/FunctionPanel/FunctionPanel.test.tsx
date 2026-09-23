import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { FunctionPanel } from './FunctionPanel.js'

const groups = [
  { title: 'Документы', links: [{ id: 'inv', label: 'Реализация' }, { id: 'ord', label: 'Заказ' }] },
  { title: 'Отчёты', links: [{ id: 'rep', label: 'Продажи' }] },
]
const LINKS = groups.flatMap((g) => g.links).length

/**
 * Разметка без шва, снятая с HEAD ДО DS-273 (d7498f0). Сравнивается
 * строка целиком, а не «кнопок столько-то»: шов не должен сдвинуть у прежних
 * потребителей ни атрибута, ни порядка, ни обёртки.
 */
const BEFORE = '<nav class="ds-fnpanel" aria-label="Функции раздела"><div class="ds-fnpanel__group"><div class="ds-fnpanel__title">Документы</div><ul class="ds-fnpanel__list"><li><button type="button" class="ds-fnpanel__link">Реализация</button></li><li><button type="button" class="ds-fnpanel__link">Заказ</button></li></ul></div><div class="ds-fnpanel__group"><div class="ds-fnpanel__title">Отчёты</div><ul class="ds-fnpanel__list"><li><button type="button" class="ds-fnpanel__link">Продажи</button></li></ul></div></nav>'

describe('FunctionPanel', () => {
  it('renders group titles and links, fires onOpen', async () => {
    const onOpen = vi.fn()
    render(<FunctionPanel groups={groups} onOpen={onOpen} />)
    expect(screen.getByText('Документы')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Реализация' }))
    expect(onOpen).toHaveBeenCalledWith('inv')
  })

  it('без renderItem разметка байт в байт прежняя — и с onOpen, и без', () => {
    expect(render(<FunctionPanel groups={groups} />).container.innerHTML).toBe(BEFORE)
    expect(render(<FunctionPanel groups={groups} onOpen={() => {}} />).container.innerHTML).toBe(BEFORE)
  })

  it('renderItem подменяет элемент: ссылок столько же, сколько пунктов, кнопок ноль', () => {
    const { container } = render(
      <FunctionPanel groups={groups} renderItem={(l, p) => <a href={'#' + l.id} {...p} />} />,
    )
    expect(container.querySelectorAll('nav a[href]')).toHaveLength(LINKS)
    expect(container.querySelectorAll('nav button')).toHaveLength(0)
    expect(container.querySelector('a[href="#ord"]')?.className).toBe('ds-fnpanel__link')
    expect(container.querySelector('a[href="#ord"]')?.textContent).toBe('Заказ')
  })

  it('onOpen и renderItem вместе — ошибка типов', () => {
    // @ts-expect-error — источник перехода один
    const _el = <FunctionPanel groups={groups} onOpen={() => {}} renderItem={(l, p) => <a href={l.id} {...p} />} />
    expect(_el).toBeDefined()
  })

  it('onOpen и renderItem вместе через any — бросок, называющий оба', () => {
    const loose = { groups, onOpen: () => {}, renderItem: () => null } as any
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => render(<FunctionPanel {...loose} />)).toThrow(/`onOpen`.*`renderItem`/)
    } finally { quiet.mockRestore() }
  })
})
