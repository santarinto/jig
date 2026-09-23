import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Select } from './Select.js'

const opts = [
  { value: 'rub', label: 'Рубль' },
  { value: 'usd', label: 'Доллар США' },
]

describe('Select', () => {
  it('renders labeled select with options', () => {
    render(<Select label="Валюта" options={opts} defaultValue="usd" />)
    const el = screen.getByLabelText('Валюта') as HTMLSelectElement
    expect(el).toHaveClass('ds-select')
    expect(el.value).toBe('usd')
    expect(screen.getByRole('option', { name: 'Рубль' })).toBeInTheDocument()
  })

  // DS-24: метка сверху ломала выравнивание в тулбаре.
  it('labelPosition="hidden" убирает видимую метку, имя уходит в aria-label', () => {
    const { container } = render(<Select label="Валюта" labelPosition="hidden" options={opts} />)
    expect(container.querySelector('.ds-field__label')).toBeNull()
    // Доступное имя сохранено: getByLabelText находит select по aria-label.
    expect(screen.getByLabelText('Валюта')).toHaveClass('ds-select')
  })

  it('labelPosition="inline" ставит метку в строку (модификатор), метка видима', () => {
    const { container } = render(<Select label="Валюта" labelPosition="inline" options={opts} />)
    expect(container.querySelector('.ds-field--inline')).not.toBeNull()
    expect(container.querySelector('.ds-field__label')).not.toBeNull()
  })

  // DS-56: ошибку было нечем выразить, и форма со смешанными полями
  // уходила в общий Alert над формой — связь «ошибка ↔ поле» терялась.
  it('error помечает список невалидным и связывает текст с контролом', () => {
    render(<Select label="Валюта" options={opts} error="Валюта не выбрана" />)
    const el = screen.getByLabelText('Валюта')
    expect(el).toHaveClass('is-error')
    expect(el).toHaveAttribute('aria-invalid', 'true')
    // Не просто «текст где-то на экране»: он должен быть ТЕМ, на что указывает
    // контрол, иначе скринридер его не прочитает вместе с полем.
    const errId = el.getAttribute('aria-describedby')
    expect(errId).toBeTruthy()
    expect(document.getElementById(errId!)).toHaveTextContent('Валюта не выбрана')
  })

  it('hint показывается, пока нет ошибки, и тоже связан с контролом', () => {
    render(<Select label="Валюта" options={opts} hint="Валюта договора" />)
    const el = screen.getByLabelText('Валюта')
    expect(el).not.toHaveClass('is-error')
    expect(el).not.toHaveAttribute('aria-invalid')
    const hintId = el.getAttribute('aria-describedby')
    expect(document.getElementById(hintId!)).toHaveTextContent('Валюта договора')
  })

  // Контракт тот же, что у TextField: describedby указывает на одно, и это
  // ошибка. Подсказка при этом уходит с экрана целиком — состояния различимы.
  it('ошибка вытесняет подсказку, а не соседствует с ней', () => {
    render(<Select label="Валюта" options={opts} hint="Валюта договора" error="Валюта не выбрана" />)
    const el = screen.getByLabelText('Валюта')
    expect(screen.queryByText('Валюта договора')).toBeNull()
    expect(document.getElementById(el.getAttribute('aria-describedby')!))
      .toHaveTextContent('Валюта не выбрана')
  })
})
