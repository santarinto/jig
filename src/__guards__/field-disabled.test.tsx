import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
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
import { Checkbox, Radio, Switch } from '../components/Toggle/index.js'

/**
 * У выключенного поля выключены ВСЕ его кнопки (DS-133).
 *
 * Дефект, из-за которого гейт написан, был один и тот же в трёх компонентах
 * сразу: `disabled` не объявлялся собственным пропом и приезжал через
 * `...rest`, то есть садился только на `<input>`. Кнопки внутри той же рамки —
 * «Очистить» у `SearchBar` и `DatePicker`, «Открыть календарь», «Удалить» у
 * `FileDrop` — рисовались без него и РАБОТАЛИ: клик по крестику звал
 * `onChange('')` у поля, которое менять запрещено. Запрет не действовал.
 *
 * Поэтому предмет здесь не «поле выглядит выключенным», а два наблюдаемых
 * следствия: внутри нет ни одной точки, где остановится таб, и ни одна кнопка
 * не зовёт обработчик по клику. Вид не проверяется вовсе — он и был исправным,
 * ровно этим дефект и держался незамеченным.
 *
 * Обход по каталогу, как в `field-wrapper` и `field-ref-policy`, и по той же
 * причине: три компонента промолчали одинаково, значит четвёртый промолчит
 * так же. Покомпонентная проверка ловит один случай, каталог — вид.
 */

const OPTIONS = [{ value: 'a', label: 'А' }]
const FILE = new File(['x'], 'акт.pdf', { type: 'application/pdf' })

interface DisabledCase {
  name: string
  /**
   * Поле в состоянии, где нарисованы ВСЕ его кнопки. У `SearchBar` и
   * `DatePicker` крестик есть только при непустом значении, у `FileDrop`
   * «Удалить» — только при непустом списке: пустое поле прошло бы гейт, не
   * показав ни одной кнопки.
   */
  render: (onChange: (...args: unknown[]) => void) => React.ReactElement
}

const FIELDS: DisabledCase[] = [
  { name: 'TextField', render: (f) => <TextField disabled onChange={f} /> },
  { name: 'Textarea', render: (f) => <Textarea disabled onChange={f} /> },
  { name: 'Select', render: (f) => <Select disabled options={OPTIONS} onChange={f} /> },
  { name: 'NumberField', render: (f) => <NumberField disabled value={5} onChange={f} /> },
  { name: 'DatePicker', render: (f) => <DatePicker disabled value="2026-08-30" onChange={f} /> },
  { name: 'Slider', render: (f) => <Slider disabled value={5} onChange={f} /> },
  { name: 'Combobox', render: (f) => <Combobox disabled options={OPTIONS} value="a" onChange={f} /> },
  { name: 'CodeInput', render: (f) => <CodeInput disabled value="12" onChange={f} /> },
  { name: 'SearchBar', render: (f) => <SearchBar disabled value="акт" onChange={f} /> },
  { name: 'GlobalSearch', render: (f) => <GlobalSearch disabled value="акт" onChange={f} /> },
  { name: 'FileDrop', render: (f) => <FileDrop disabled files={[FILE]} onFiles={f} /> },
  { name: 'Checkbox', render: () => <Checkbox disabled label="Согласен" /> },
  { name: 'Radio', render: () => <Radio disabled label="Наличные" /> },
  { name: 'Switch', render: () => <Switch disabled label="Ночной тариф" /> },
]

/**
 * Всё, на чём останавливается таб. `[tabindex]` — не только про `-1`: зона
 * `FileDrop` держит фокус собственным `tabIndex`, а не тем, что она `<div>`.
 */
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]'

const stops = (el: Element) => {
  const ti = el.getAttribute('tabindex')
  if (ti !== null && Number(ti) < 0) return false
  return !(el as HTMLButtonElement).disabled
}

describe('выключенное поле выключено целиком', () => {
  it('каталог полей не пуст и не усох', () => {
    // Без этого «все поля прошли» осталось бы зелёным на пустом списке.
    expect(FIELDS.length, 'каталог полей усох').toBeGreaterThanOrEqual(14)
  })

  for (const f of FIELDS) {
    describe(f.name, () => {
      it('ни одна кнопка внутри не осталась включённой', () => {
        const { container } = render(f.render(() => {}))
        const live = [...container.querySelectorAll('button')].filter((b) => !b.disabled)
        expect(
          live.map((b) => b.getAttribute('aria-label') ?? b.textContent),
          `${f.name}: кнопки внутри выключенного поля остались включёнными`,
        ).toEqual([])
      })

      it('таб не останавливается внутри', () => {
        // Второе следствие того же дефекта и первое, что замечает клавиатурный
        // пользователь: выключенное поле, на котором таб всё равно тормозит.
        const { container } = render(f.render(() => {}))
        const live = [...container.querySelectorAll(FOCUSABLE)].filter(stops)
        expect(
          live.map((el) => `${el.tagName.toLowerCase()}.${el.className || '—'}`),
          `${f.name}: внутри выключенного поля остались таб-стопы`,
        ).toEqual([])
      })

      it('клик по каждой кнопке не меняет значение', () => {
        // Главное утверждение: не «кнопка выглядит серой», а «запрет
        // действует». Клик — `element.click()`, а не `userEvent`: последний
        // на выключенной кнопке молчит по своим правилам, то есть был бы
        // утверждением о `userEvent`, а не о компоненте. Нативный `click()`
        // событие доставляет всегда, и молчание обработчика — заслуга
        // атрибута, а не библиотеки.
        const spy = vi.fn()
        const { container } = render(f.render(spy))
        for (const b of container.querySelectorAll('button')) (b as HTMLButtonElement).click()
        expect(spy, `${f.name}: кнопка выключенного поля позвала обработчик`).not.toHaveBeenCalled()
      })
    })
  }

  it('и проверка умеет находить нарушение', async () => {
    // Утверждения выше верны и для проверки, которая ничего не проверяет:
    // ровно тот дефект, ради которого гейт написан, обязан их уронить.
    const spy = vi.fn()
    const Leaky = ({ disabled, ...rest }: { disabled?: boolean }) => (
      <div>
        <input disabled={disabled} {...rest} />
        <button type="button" aria-label="Очистить" onClick={() => spy()}>×</button>
      </div>
    )
    const { container } = render(<Leaky disabled />)
    const live = [...container.querySelectorAll('button')].filter((b) => !b.disabled)
    expect(live).toHaveLength(1)
    expect([...container.querySelectorAll(FOCUSABLE)].filter(stops)).toHaveLength(1)
    await userEvent.click(live[0])
    expect(spy).toHaveBeenCalled()
  })
})
