import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { Combobox } from '../components/Combobox/index.js'
import { GlobalSearch } from '../components/GlobalSearch/index.js'

/**
 * Общий ГЕЙТ вместо общего хука (DS-110).
 *
 * Совпадающего кода у `Combobox` и `GlobalSearch` — две строки клампа стрелок.
 * Всё остальное расходится по существу: у `Combobox` потолок индекса учитывает
 * виртуальную строку «создать», `Enter` выбирает опцию ИЛИ создаёт, `Escape`
 * уходит в `useDismiss` с возвратом фокуса на триггер; у `GlobalSearch` выдача
 * приходит пропом снаружи и триггера нет вовсе. Абстракция, у которой
 * параметров больше, чем сэкономленных строк, — не переиспользование, а лишний
 * слой.
 *
 * Второе основание важнее арифметики. В проекте ДВА несовместимых
 * клавиатурных паттерна:
 *   • roving tabindex — фокус реально ездит по элементам: `DropdownMenu`,
 *     `Tabs`, `Tree`, `SideNav`, `Accordion`, `Calendar`;
 *   • `aria-activedescendant` — фокус остаётся на поле, активность виртуальна:
 *     `Combobox`, `GlobalSearch`.
 * Хук с именем вроде «клавиатура списка» однажды применят ПОПЕРЁК этой
 * границы, и получится фокус, уехавший с поля, при живом
 * `aria-activedescendant`. Тот же класс ошибок, что запрещает гейт
 * `no-nested-interactive`.
 *
 * Поэтому расхождение стерегут утверждения, а не разделяемая функция: один и
 * тот же список гоняется по обоим виджетам.
 *
 * `SearchBar` в этот список не входит намеренно: у него нет ни списка, ни
 * активного индекса — с этими двумя он пересекается визуально и по имени, не
 * по контракту.
 */

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'

const OPTIONS = [
  { value: 'rub', label: 'Рубль' },
  { value: 'usd', label: 'Доллар США' },
  { value: 'eur', label: 'Евро' },
]
const RESULTS = [
  { id: 'a', label: 'Рубль' },
  { id: 'b', label: 'Доллар США' },
  { id: 'c', label: 'Евро' },
]

interface Opened {
  /** Поле, на котором живёт активность. */
  input: HTMLInputElement
  /** Сменить данные под открытым списком: у одного проп, у другого ввод. */
  changeData: () => Promise<void>
}

const WIDGETS: Array<{ name: string; open: () => Promise<Opened> }> = [
  {
    name: 'Combobox',
    open: async () => {
      render(<Combobox options={OPTIONS} value="rub" onChange={vi.fn()} />)
      await userEvent.click(screen.getByRole('button'))
      const input = screen.getByRole('combobox') as HTMLInputElement
      // Данные вычисляются ВНУТРИ из строки поиска — меняются вводом.
      return { input, changeData: async () => { await userEvent.type(input, 'ол') } }
    },
  },
  {
    name: 'GlobalSearch',
    open: async () => {
      const { rerender } = render(
        <GlobalSearch value="ва" onChange={vi.fn()} results={RESULTS} onSelect={vi.fn()} />,
      )
      const input = screen.getByRole('combobox') as HTMLInputElement
      // Выдача приходит пропом снаружи — меняется перерисовкой.
      return {
        input,
        changeData: async () => {
          rerender(<GlobalSearch value="вал" onChange={vi.fn()} onSelect={vi.fn()} results={[
            { id: 'x', label: 'Другое' }, { id: 'y', label: 'Ещё' },
          ]} />)
        },
      }
    },
  },
]

describe('контракт aria-activedescendant', () => {
  it('список виджетов не усох', () => {
    expect(WIDGETS.length, 'виджетов в каталоге меньше двух').toBe(2)
  })

  for (const w of WIDGETS) {
    describe(w.name, () => {
      it('aria-activedescendant указывает на существующий id открытого списка', async () => {
        const { input } = await w.open()
        const id = input.getAttribute('aria-activedescendant')
        expect(id, 'активный потомок не назван').toBeTruthy()
        const target = document.getElementById(id!)
        expect(target, `id "${id}" не существует в документе`).not.toBeNull()
        expect(target!.getAttribute('role'), 'активный потомок — не option').toBe('option')
      })

      it('после ArrowDown фокус ОСТАЁТСЯ на поле — граница с roving tabindex', async () => {
        // Та самая граница, ради которой не заведён общий хук: уехавший фокус
        // при живом aria-activedescendant — это две модели навигации разом.
        const { input } = await w.open()
        input.focus()
        await userEvent.keyboard('{ArrowDown}')
        expect(document.activeElement, 'фокус уехал с поля').toBe(input)
        const id = input.getAttribute('aria-activedescendant')
        expect(document.getElementById(id!), 'активный потомок пропал').not.toBeNull()
      })

      it('строка списка не фокусируема — ни сама, ни изнутри', async () => {
        // Проверяется И САМ узел, а не только его потомки. Мутация
        // `tabIndex={0}` на `role="option"` пережила первую редакцию кейса
        // (`querySelectorAll` смотрит только вниз) и гейт `no-nested-interactive`
        // тоже — там предмет вложенность, а фокусируемая строка сама по себе
        // никуда не вложена. Между тем это ровно слом модели: фокус получает
        // право уехать с поля, при живом `aria-activedescendant`.
        await w.open()
        const opts = screen.getAllByRole('option')
        expect(opts.length, 'список пуст — проверять нечего').toBeGreaterThan(0)
        for (const o of opts) {
          expect(o.matches(FOCUSABLE), `${w.name}: сама строка списка фокусируема`).toBe(false)
          expect(within(o).queryAllByRole('button'), `${w.name}: кнопка внутри option`).toHaveLength(0)
          expect(o.querySelectorAll(FOCUSABLE), `${w.name}: фокусируемый потомок в option`).toHaveLength(0)
        }
      })

      it('смена данных под открытым списком возвращает активность на первую строку', async () => {
        // Индекс, переживший данные, указывает уже не туда: Enter выбрал бы не
        // то, что подсвечено.
        const { input, changeData } = await w.open()
        input.focus()
        await userEvent.keyboard('{ArrowDown}{ArrowDown}')
        const moved = input.getAttribute('aria-activedescendant')
        const firstBefore = screen.getAllByRole('option')[0]!.id
        expect(moved, 'стрелка не сдвинула активность — кейс проверяет не то').not.toBe(firstBefore)

        await changeData()
        const first = screen.getAllByRole('option')[0]!
        expect(input.getAttribute('aria-activedescendant'), 'активность пережила данные').toBe(first.id)
      })

      it('Home и End не перехвачены: каретка принадлежит полю', async () => {
        // Оба виджета — текстовый ввод с живым запросом. Перехват означал бы,
        // что нельзя дописать слово в начало строки (DS-110).
        const { input } = await w.open()
        input.focus()
        await userEvent.keyboard('дол')
        expect(input.value.length, 'в поле не оказалось текста — каретке негде ездить').toBeGreaterThan(0)
        const before = input.getAttribute('aria-activedescendant')

        await userEvent.keyboard('{Home}')
        expect(input.selectionStart, 'Home не увёл каретку в начало').toBe(0)
        await userEvent.keyboard('{End}')
        expect(input.selectionStart, 'End не увёл каретку в конец').toBe(input.value.length)
        expect(input.getAttribute('aria-activedescendant'), 'Home/End сдвинули активную строку')
          .toBe(before)
      })
    })
  }

  it('общего хука клавиатуры списка в исходниках нет', () => {
    // Решение в том, что хука НЕТ, и случайно появившийся противоречил бы
    // записанному в AGENTS.md. Проверка на ИМЯ, потому что опасно именно общее
    // имя: под ним приём применят через границу двух моделей навигации.
    // Имена собираются из кусков — литерал уронил бы гейт о него самого.
    const NAMES = ['use' + 'ListboxKeyboard', 'use' + 'ActiveDescendant', 'use' + 'ListKeyboard']
    const SRC = resolve(__dirname, '..')
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [])
    const files = walk(SRC)
    expect(files.length, 'обход не нашёл исходников').toBeGreaterThan(100)

    const offenders = files.filter((f) => {
      const src = readFileSync(f, 'utf8')
      return NAMES.some((n) => src.includes(n))
    })
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([])

    // И проверка умеет находить нарушение: тот же предикат на подложенном тексте.
    expect(NAMES.some((n) => `export function ${NAMES[0]}() {}`.includes(n))).toBe(true)
  })
})
