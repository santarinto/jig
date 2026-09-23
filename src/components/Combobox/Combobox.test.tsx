import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Combobox } from './Combobox.js'

const options = [
  { value: 'rub', label: 'Рубль', icon: <span>₽</span> },
  { value: 'usd', label: 'Доллар США', icon: <span>$</span> },
  { value: 'eur', label: 'Евро', icon: <span>€</span> },
]

describe('Combobox', () => {
  it('opens, filters by query, and selects an option', async () => {
    const onChange = vi.fn()
    render(<Combobox options={options} label="Валюта" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /Выберите/ }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(3)
    await userEvent.type(screen.getByRole('combobox'), 'долл')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await userEvent.click(screen.getByRole('option', { name: /Доллар США/ }))
    expect(onChange).toHaveBeenCalledWith('usd')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('shows the selected option label and icon on the trigger', () => {
    render(<Combobox options={options} value="rub" />)
    const trigger = screen.getByRole('button')
    expect(trigger).toHaveTextContent('Рубль')
    expect(trigger).toHaveTextContent('₽')
  })

  it('keyboard: ArrowDown then Enter selects the active option', async () => {
    const onChange = vi.fn()
    render(<Combobox options={options} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button'))
    await userEvent.type(screen.getByRole('combobox'), '{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('usd')
  })

  it('associates the field label with the trigger', () => {
    render(<Combobox options={options} label="Валюта" />)
    expect(screen.getByLabelText('Валюта')).toBe(screen.getByRole('button'))
  })

  it('points aria-activedescendant at the keyboard-active option', async () => {
    render(<Combobox options={options} />)
    await userEvent.click(screen.getByRole('button'))
    const input = screen.getByRole('combobox')
    const [first, second] = screen.getAllByRole('option')
    expect(first.id).toBeTruthy()
    expect(input).toHaveAttribute('aria-activedescendant', first.id)
    await userEvent.type(input, '{ArrowDown}')
    expect(input).toHaveAttribute('aria-activedescendant', second.id)
  })

  it('points aria-activedescendant at the create row when it is active', async () => {
    render(<Combobox options={options} onCreate={() => {}} />)
    await userEvent.click(screen.getByRole('button'))
    const input = screen.getByRole('combobox')
    await userEvent.type(input, 'Тенге')
    const createRow = screen.getByRole('option')
    expect(createRow.id).toBeTruthy()
    expect(input).toHaveAttribute('aria-activedescendant', createRow.id)
  })

  it('offers a create row for an unmatched query and fires onCreate on click', async () => {
    const onCreate = vi.fn()
    render(<Combobox options={options} onCreate={onCreate} />)
    await userEvent.click(screen.getByRole('button'))
    await userEvent.type(screen.getByRole('combobox'), 'Тенге')
    expect(screen.queryByText('Ничего не найдено')).toBeNull()
    await userEvent.click(screen.getByRole('option', { name: /Создать «Тенге»/ }))
    expect(onCreate).toHaveBeenCalledWith('Тенге')
  })

  it('creates via Enter when nothing matches', async () => {
    const onCreate = vi.fn()
    render(<Combobox options={options} onCreate={onCreate} />)
    await userEvent.click(screen.getByRole('button'))
    await userEvent.type(screen.getByRole('combobox'), 'Тенге{Enter}')
    expect(onCreate).toHaveBeenCalledWith('Тенге')
  })

  it('does not offer a create row when the query matches an existing option', async () => {
    const onCreate = vi.fn()
    render(<Combobox options={options} onCreate={onCreate} />)
    await userEvent.click(screen.getByRole('button'))
    await userEvent.type(screen.getByRole('combobox'), 'Евро')
    expect(screen.queryByText(/Создать/)).toBeNull()
  })

  it('closes on Escape', async () => {
    render(<Combobox options={options} />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})

/**
 * Куда уходит фокус, когда список закрылся.
 *
 * Поповер размонтируется вместе с фокусированным инпутом поиска, и без явного
 * возврата фокус достаётся `<body>` — клавиатурный пользователь после каждого
 * выбора значения оказывается в начале страницы. На форме из пяти полей это
 * пять прыжков в начало; мышью не видно ничего.
 *
 * Возврат — не всегда: `useDismiss` отдаёт причину именно поэтому. Esc и выбор
 * — жесты «я закончил здесь», фокусу место на триггере. Клик мимо — жест «я уже
 * в другом месте», и вернуть фокус на триггер значило бы отобрать его у того,
 * куда пользователь только что ткнул.
 */
describe('Combobox · возврат фокуса', () => {
  it('Esc возвращает фокус на триггер', async () => {
    render(<Combobox options={options} />)
    const trigger = screen.getByRole('button')
    await userEvent.click(trigger)
    expect(screen.getByRole('combobox')).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
  })

  it('выбор опции с клавиатуры возвращает фокус на триггер', async () => {
    render(<Combobox options={options} onChange={() => {}} />)
    const trigger = screen.getByRole('button')
    await userEvent.click(trigger)
    await userEvent.type(screen.getByRole('combobox'), '{ArrowDown}{Enter}')
    expect(trigger).toHaveFocus()
  })

  it('выбор опции мышью возвращает фокус на триггер', async () => {
    render(<Combobox options={options} onChange={() => {}} />)
    const trigger = screen.getByRole('button')
    await userEvent.click(trigger)
    await userEvent.click(screen.getByRole('option', { name: /Евро/ }))
    expect(trigger).toHaveFocus()
  })

  it('создание возвращает фокус на триггер', async () => {
    render(<Combobox options={options} onCreate={() => {}} />)
    const trigger = screen.getByRole('button')
    await userEvent.click(trigger)
    await userEvent.type(screen.getByRole('combobox'), 'Тенге{Enter}')
    expect(trigger).toHaveFocus()
  })

  it('клик мимо фокус на триггер НЕ возвращает — он ушёл туда, куда ткнули', async () => {
    render(<Combobox options={options} />)
    const trigger = screen.getByRole('button')
    await userEvent.click(trigger)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(trigger).not.toHaveFocus()
  })
})

/**
 * Одна модель навигации, а не две.
 *
 * `aria-activedescendant` на инпуте говорит скринридеру: фокус остаётся в поле
 * поиска, «активная» строка объявляется по id. Фокусируемая `<button>` внутри
 * `<li role="option">` утверждает обратное — что по списку ходят табом. Обе
 * модели разом не работают ни для кого: клавиатурный пользователь получает
 * таб-стоп на каждую опцию, которого стрелки не двигают, а скринридер слышит
 * «кнопка» внутри «элемент списка».
 */
describe('Combobox · одна модель навигации', () => {
  const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'

  it('внутри опции нет фокусируемых элементов', async () => {
    render(<Combobox options={options} onCreate={() => {}} />)
    await userEvent.click(screen.getByRole('button'))
    for (const opt of screen.getAllByRole('option')) {
      expect(opt.querySelectorAll(FOCUSABLE)).toHaveLength(0)
    }
  })

  it('строка создания — тоже опция без своей кнопки', async () => {
    render(<Combobox options={options} onCreate={() => {}} />)
    await userEvent.click(screen.getByRole('button'))
    await userEvent.type(screen.getByRole('combobox'), 'Тенге')
    const createRow = screen.getByRole('option', { name: /Создать «Тенге»/ })
    expect(createRow.querySelectorAll(FOCUSABLE)).toHaveLength(0)
  })

  it('таб-стоп в открытом списке ровно один — инпут поиска', async () => {
    render(<Combobox options={options} />)
    const trigger = screen.getByRole('button')
    await userEvent.click(trigger)
    const popover = trigger.parentElement!.querySelector('.ds-combobox__popover')!
    expect(popover.querySelectorAll(FOCUSABLE)).toHaveLength(1)
    expect(popover.querySelector(FOCUSABLE)).toBe(screen.getByRole('combobox'))
  })
})

describe('Combobox: disabled и error (DS-36)', () => {
  it('disabled — триггер выключен', () => {
    render(<Combobox options={options} label="Валюта" disabled />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  /**
   * Не только атрибут: с уже открытым списком выключение обязано его закрыть.
   * Держится тем, что поповер рисуется по `isOpen = open && !disabled`, а не по
   * `open`. Мутация: рисовать поповер по `open` — после выключения список
   * останется, и проверка покраснеет.
   */
  it('disabled закрывает уже открытый список', async () => {
    const { rerender } = render(<Combobox options={options} label="Валюта" />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    rerender(<Combobox options={options} label="Валюта" disabled />)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('error — is-error на поверхности, сообщение и aria-invalid', () => {
    render(<Combobox options={options} label="Валюта" error="Выберите валюту" />)
    const trigger = screen.getByRole('button')
    expect(trigger).toHaveClass('is-error')
    expect(trigger).toHaveAttribute('aria-invalid', 'true')
    expect(trigger.getAttribute('aria-describedby')).toContain('error')
    expect(screen.getByText('Выберите валюту')).toBeInTheDocument()
  })

  it('className пробрасывается на корень combobox', () => {
    const { container } = render(<Combobox options={options} className="my-cb" />)
    expect(container.querySelector('.ds-combobox.my-cb')).not.toBeNull()
  })
})
