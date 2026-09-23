import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { TextField } from '../components/TextField/index.js'
import { Textarea } from '../components/Textarea/index.js'
import { Select } from '../components/Select/index.js'
import { NumberField } from '../components/NumberField/index.js'
import { DatePicker } from '../components/DatePicker/index.js'
import { Slider } from '../components/Slider/index.js'
import { Combobox } from '../components/Combobox/index.js'
import { CodeInput } from '../components/CodeInput/index.js'
import { SearchBar } from '../components/SearchBar/index.js'
import { GlobalSearch } from '../components/GlobalSearch/index.js'
import { FileDrop } from '../components/FileDrop/index.js'

/**
 * Одна модель обёртки поля на все поля (DS-109).
 *
 * Было четыре семантики под одним внешним видом: корневой `<label class="ds-field">`
 * у `TextField`/`Textarea`/`Select`; `div` плюс отдельная подпись у
 * `NumberField`/`DatePicker`; свой класс подписи у `Slider`; вовсе не `<label>`
 * у `Combobox`, `CodeInput`, `SearchBar`, `GlobalSearch`, `FileDrop`.
 *
 * Победила вторая. Корневая метка ловит клик по подсказке, по тексту ошибки и
 * по счётчику символов, а её accessible name склеивается из всего содержимого —
 * «Сумма Не более 12 знаков Обязательное поле». Лечился этот склеенный name
 * пропом `aria-label` на контроле, и цена костыля в том, что имя перестаёт быть
 * разметкой: звёздочка обязательности, единица измерения и `<abbr>` в имя уже
 * не попадают. Плюс модель не расширяется: степпер `NumberField` и кнопки
 * `DatePicker` — вторые интерактивные точки, и корневая метка ловила бы их
 * клики.
 */

const noop = () => {}
const OPTIONS = [{ value: 'a', label: 'А' }]
const LABEL = 'Сумма к оплате'
const ERROR = 'Обязательное поле'

interface FieldCase {
  name: string
  /** Как подпись связана с контролом: фокусом или действием. */
  labelDoes: 'focus' | 'click'
  /** Есть ли у поля проп `error`. */
  hasError: boolean
  render: (props: { label: string; error?: string }) => React.ReactElement
  /** Контрол, который подпись обязана назвать и сфокусировать. */
  control: (c: HTMLElement) => HTMLElement
}

const q = (c: HTMLElement, sel: string) => c.querySelector(sel) as HTMLElement

const FIELDS: FieldCase[] = [
  {
    name: 'TextField', labelDoes: 'focus', hasError: true,
    render: (p) => <TextField {...p} />, control: (c) => q(c, 'input'),
  },
  {
    name: 'Textarea', labelDoes: 'focus', hasError: true,
    render: (p) => <Textarea {...p} />, control: (c) => q(c, 'textarea'),
  },
  {
    name: 'Select', labelDoes: 'focus', hasError: true,
    render: (p) => <Select {...p} options={OPTIONS} />, control: (c) => q(c, 'select'),
  },
  {
    name: 'NumberField', labelDoes: 'focus', hasError: true,
    render: (p) => <NumberField {...p} value={1} onChange={noop} />,
    control: (c) => q(c, 'input[role="spinbutton"]'),
  },
  {
    name: 'DatePicker', labelDoes: 'focus', hasError: true,
    render: (p) => <DatePicker {...p} value="" onChange={noop} />,
    control: (c) => q(c, 'input.ds-datepicker__input'),
  },
  {
    name: 'Slider', labelDoes: 'focus', hasError: false,
    render: (p) => <Slider {...p} value={5} onChange={noop} />,
    control: (c) => q(c, 'input[type="range"]'),
  },
  {
    // `<label for>` на `<button>` легален — кнопка labelable. В браузере клик
    // по подписи нажимает триггер и фокус едет за настоящим кликом; jsdom
    // клик пробрасывает, а фокус нет, поэтому предмет здесь — что клик ДОЕХАЛ.
    // Наблюдаемое следствие сильнее фокуса: открывается список.
    name: 'Combobox', labelDoes: 'click', hasError: true,
    render: (p) => <Combobox {...p} options={OPTIONS} value="a" onChange={noop} />,
    control: (c) => q(c, 'button.ds-combobox__trigger'),
  },
  {
    name: 'CodeInput', labelDoes: 'focus', hasError: true,
    render: (p) => <CodeInput {...p} value="" onChange={noop} />,
    control: (c) => q(c, 'input.ds-code__cell'),
  },
  {
    name: 'SearchBar', labelDoes: 'focus', hasError: false,
    render: (p) => <SearchBar {...p} value="" onChange={noop} />,
    control: (c) => q(c, 'input.ds-searchbar__input'),
  },
  {
    name: 'GlobalSearch', labelDoes: 'focus', hasError: false,
    render: (p) => <GlobalSearch {...p} value="" onChange={noop} />,
    control: (c) => q(c, 'input.ds-gsearch__input'),
  },
  {
    // Подпись уводит на СКРЫТЫЙ файловый ввод: сфокусировать его нельзя, зато
    // клик по подписи открывает диалог выбора — нативное поведение метки, и
    // здесь оно ровно то, что нужно. Имя при этом нужно ЗОНЕ, она и работает.
    name: 'FileDrop', labelDoes: 'click', hasError: false,
    render: (p) => <FileDrop label={p.label} files={[]} onFiles={noop} />,
    control: (c) => q(c, 'input[type="file"]'),
  },
]

describe('обёртка поля', () => {
  it('каталог полей не пуст и не усох', () => {
    expect(FIELDS.length, 'каталог полей усох').toBeGreaterThanOrEqual(11)
  })

  for (const f of FIELDS) {
    describe(f.name, () => {
      it('корень с классом ds-field — не label', () => {
        // Корневая метка ловит клик по всему, что внутри, включая подсказку,
        // текст ошибки и счётчик символов.
        const { container } = render(f.render({ label: LABEL }))
        const root = container.querySelector('.ds-field')
        // Не у всех полей корень несёт `.ds-field` (у `Slider` и `FileDrop`
        // обёртка своя, с собственной раскладкой); проверяем там, где несёт.
        if (root) expect(root.tagName, 'корень поля — <label>').not.toBe('LABEL')
      })

      it('подпись — label с htmlFor, и она называет контрол', () => {
        const { container } = render(f.render({ label: LABEL }))
        const label = container.querySelector('label[for]')
        expect(label, 'подписи-метки с htmlFor нет').not.toBeNull()
        expect(label!.textContent).toBe(LABEL)
        // Единственная гарантия, что имя не потерялось по дороге. `getAll`, а
        // не `get`: у составных полей подпись законно называет ДВА узла —
        // группу через `aria-labelledby` и главный ввод через `htmlFor`
        // (`CodeInput`, `FileDrop`). Требовать ровно одного значило бы
        // запретить именовать группу.
        expect(screen.getAllByLabelText(LABEL).length).toBeGreaterThan(0)
      })

      it(f.labelDoes === 'focus' ? 'клик по подписи фокусирует контрол' : 'клик по подписи доезжает до контрола', async () => {
        const { container } = render(f.render({ label: LABEL }))
        const label = q(container, 'label[for]')
        const control = f.control(container)
        if (f.labelDoes === 'focus') {
          await userEvent.click(label)
          expect(control).toHaveFocus()
        } else {
          // Скрытый ввод фокус не примет; предмет — что клик до него доехал.
          let clicked = false
          control.addEventListener('click', () => { clicked = true })
          await userEvent.click(label)
          expect(clicked, 'клик по подписи не дошёл до контрола').toBe(true)
        }
      })

      it('aria-label не дублирует видимую подпись', () => {
        // Тот самый костыль, которым лечился склеенный accessible name корневой
        // метки. Снят — значит подпись снова разметка, и в неё можно положить
        // звёздочку обязательности или единицу измерения.
        const { container } = render(f.render({ label: LABEL }))
        const dup = container.querySelector(`[aria-label="${LABEL}"]`)
        expect(dup, 'aria-label повторяет видимую подпись').toBeNull()
      })

      if (f.hasError) {
        it('клик по тексту ошибки не фокусирует контрол', async () => {
          // Ровно то, что чинится сменой корня. Проверка на клик по подписи
          // одна такого регресса не поймает: у корневой метки работает и она.
          //
          // Клик — `userEvent`, а не `element.click()`: активацию метки по
          // клику в ПОТОМКА jsdom делает на полной последовательности событий,
          // а на одиночном `click()` — нет. С `click()` кейс проходил бы и на
          // корневой метке, то есть был бы утверждением, которое не может
          // сработать никогда.
          const { container } = render(f.render({ label: LABEL, error: ERROR }))
          const err = container.querySelector('.ds-field__error, .ds-code__error')
          expect(err, 'текст ошибки не найден').not.toBeNull()
          const control = f.control(container)
          await userEvent.click(err as HTMLElement)
          expect(control, 'клик по тексту ошибки увёл фокус в контрол').not.toHaveFocus()
        })
      }
    })
  }

  it('и проверка умеет находить нарушение', () => {
    // Утверждения выше верны и для проверки, которая ничего не проверяет:
    // на корневой метке они обязаны сработать.
    const Old = () => (
      <label className="ds-field" htmlFor="x">
        <span className="ds-field__label">{LABEL}</span>
        <input id="x" aria-label={LABEL} />
        <span className="ds-field__error">{ERROR}</span>
      </label>
    )
    const { container } = render(<Old />)
    expect(container.querySelector('.ds-field')!.tagName).toBe('LABEL')
    expect(container.querySelector(`[aria-label="${LABEL}"]`)).not.toBeNull()
  })
})
