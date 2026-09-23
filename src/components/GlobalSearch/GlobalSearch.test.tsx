import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { GlobalSearch } from './GlobalSearch.js'

const results = [
  { id: 'r1', label: 'Реализация №1', group: 'Данные' },
  { id: 'r2', label: 'Реализация товаров', group: 'Меню' },
]

describe('GlobalSearch', () => {
  it('fires onChange while typing', async () => {
    const onChange = vi.fn()
    render(<GlobalSearch value="" onChange={onChange} />)
    await userEvent.type(screen.getByRole('combobox'), 'р')
    expect(onChange).toHaveBeenCalled()
  })

  it('renders results and fires onSelect on click', async () => {
    const onSelect = vi.fn()
    render(<GlobalSearch value="реал" onChange={() => {}} results={results} onSelect={onSelect} />)
    expect(screen.getAllByRole('option')).toHaveLength(2)
    await userEvent.click(screen.getByRole('option', { name: /Реализация товаров/ }))
    expect(onSelect).toHaveBeenCalledWith('r2')
  })
})

/**
 * `role="listbox"` без единого клавиатурного обработчика — обещание, которого
 * никто не выполнял: скринридер объявлял список, а стрелки по нему не ходили.
 * Выбрать результат можно было только мышью.
 *
 * И роль поля была не та: `searchbox` описывает одинокое поле ввода, а на
 * экране поле, управляющее всплывающим списком. `aria-expanded`,
 * `aria-controls` и `aria-activedescendant` осмысленны только при `combobox`.
 */
describe('GlobalSearch · клавиатура и модель навигации', () => {
  const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'

  it('поле — combobox, и оно объявляет открытый список', () => {
    const { rerender } = render(<GlobalSearch value="" onChange={() => {}} />)
    const input = screen.getByRole('combobox')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).not.toHaveAttribute('aria-controls')

    rerender(<GlobalSearch value="реал" onChange={() => {}} results={results} />)
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-controls')
  })

  it('aria-activedescendant указывает на активную строку и едет со стрелкой', async () => {
    render(<GlobalSearch value="реал" onChange={() => {}} results={results} />)
    const input = screen.getByRole('combobox')
    const [first, second] = screen.getAllByRole('option')
    expect(input).toHaveAttribute('aria-activedescendant', first!.id)
    await userEvent.type(input, '{ArrowDown}')
    expect(input).toHaveAttribute('aria-activedescendant', second!.id)
    await userEvent.type(input, '{ArrowUp}')
    expect(input).toHaveAttribute('aria-activedescendant', first!.id)
  })

  it('Enter выбирает активную строку — без мыши', async () => {
    const onSelect = vi.fn()
    render(<GlobalSearch value="реал" onChange={() => {}} results={results} onSelect={onSelect} />)
    await userEvent.type(screen.getByRole('combobox'), '{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith('r2')
  })

  it('Home и End принадлежат каретке, а не списку', async () => {
    // Обратное было дефектом: `preventDefault` на Home/End в поле с живым
    // текстом означал, что пользователь не может перевести каретку в начало
    // своего запроса, чтобы дописать слово спереди (DS-110).
    const onSelect = vi.fn()
    render(<GlobalSearch value="реал" onChange={() => {}} results={results} onSelect={onSelect} />)
    const input = screen.getByRole('combobox') as HTMLInputElement
    input.focus()
    input.setSelectionRange(4, 4)

    await userEvent.keyboard('{Home}')
    expect(input.selectionStart, 'Home не увёл каретку в начало').toBe(0)
    await userEvent.keyboard('{Enter}')
    // Активная строка от Home не сдвинулась: она осталась первой, как была.
    expect(onSelect).toHaveBeenCalledWith('r1')

    onSelect.mockClear()
    await userEvent.keyboard('{End}{Enter}')
    expect(input.selectionStart, 'End не увёл каретку в конец').toBe(4)
    expect(onSelect, 'End сдвинул активную строку').toHaveBeenCalledWith('r1')
  })

  it('новая выдача сбрасывает активную строку на первую', async () => {
    const onSelect = vi.fn()
    const { rerender } = render(
      <GlobalSearch value="реал" onChange={() => {}} results={results} onSelect={onSelect} />,
    )
    await userEvent.type(screen.getByRole('combobox'), '{ArrowDown}')
    // Индекс 1 указывал на «Реализация товаров»; под новой выдачей он указывал
    // бы на другую запись — Enter выбрал бы не то, что подсвечено.
    rerender(
      <GlobalSearch value="реал т" onChange={() => {}}
        results={[{ id: 'x1', label: 'Другое' }, { id: 'x2', label: 'Ещё' }]} onSelect={onSelect} />,
    )
    await userEvent.type(screen.getByRole('combobox'), '{Enter}')
    expect(onSelect).toHaveBeenCalledWith('x1')
  })

  it('стрелка не уходит за края списка', async () => {
    const onSelect = vi.fn()
    render(<GlobalSearch value="реал" onChange={() => {}} results={results} onSelect={onSelect} />)
    await userEvent.type(screen.getByRole('combobox'), '{ArrowUp}{ArrowUp}{Enter}')
    expect(onSelect).toHaveBeenCalledWith('r1')
    await userEvent.type(screen.getByRole('combobox'), '{ArrowDown}{ArrowDown}{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith('r2')
  })

  it('внутри строки результата нет фокусируемых элементов', () => {
    render(<GlobalSearch value="реал" onChange={() => {}} results={results} />)
    const opts = screen.getAllByRole('option')
    expect(opts).toHaveLength(results.length)
    for (const o of opts) expect(o.querySelectorAll(FOCUSABLE)).toHaveLength(0)
  })
})
