import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createRef } from 'react'
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
 * Поле формы обязано принимать `ref` и нативные атрибуты.
 *
 * До DS-108 `ref` не был объявлен в пропсах НИ У ОДНОГО компонента.
 * `React.InputHTMLAttributes` его не содержит — содержит
 * `ComponentPropsWithRef`, — поэтому `<TextField ref={r} />` был ошибкой
 * компиляции даже там, где `...rest` донёс бы ref до элемента на рантайме.
 * Ровно эта форма и опасна: «работает, но по типам нельзя» не находится ни
 * тестом, ни глазами.
 *
 * Гейт двойной, и это не перестраховка. РАНТАЙМ-проверка зелена и там, где тип
 * запрещает передать `ref`: в тесте `ref` пишется без ошибки, потому что
 * `tsc` по тестам не гоняется отдельно от сборки. Поэтому ниже есть ещё и
 * ТИПОВОЙ блок `TypeProbe` — он ничего не проверяет на рантайме, он обязан
 * КОМПИЛИРОВАТЬСЯ, и падает он в `npm run typecheck`, первым.
 *
 * `forwardRef` в проекте нет и не будет: React 19, `ref` — обычный проп.
 * Проверяется отдельным утверждением.
 */

const noop = () => {}
const OPTIONS = [{ value: 'a', label: 'А' }]

/**
 * Куда смотрит `ref` у каждого поля — записано здесь и в `AGENTS.md`, потому
 * что из типа это не видно. Правило одно: на ГЛАВНЫЙ ФОКУСИРУЕМЫЙ элемент, тот
 * же, на который уводит `<label htmlFor>`.
 */
const FIELDS: Array<{
  name: string
  /** Что должно оказаться в `ref.current`. */
  tag: string
  render: (ref: React.Ref<never>) => React.ReactElement
}> = [
  { name: 'TextField', tag: 'INPUT', render: (r) => <TextField ref={r} name="probe" data-testid="probe" /> },
  { name: 'Textarea', tag: 'TEXTAREA', render: (r) => <Textarea ref={r} name="probe" data-testid="probe" /> },
  { name: 'Select', tag: 'SELECT', render: (r) => <Select ref={r} options={OPTIONS} name="probe" data-testid="probe" /> },
  { name: 'NumberField', tag: 'INPUT', render: (r) => <NumberField ref={r} value={1} onChange={noop} name="probe" data-testid="probe" /> },
  { name: 'DatePicker', tag: 'INPUT', render: (r) => <DatePicker ref={r} value="" onChange={noop} name="probe" data-testid="probe" /> },
  { name: 'Slider', tag: 'INPUT', render: (r) => <Slider ref={r} value={5} onChange={noop} name="probe" data-testid="probe" /> },
  { name: 'Combobox', tag: 'BUTTON', render: (r) => <Combobox ref={r} options={OPTIONS} value="a" onChange={noop} name="probe" data-testid="probe" /> },
  { name: 'CodeInput', tag: 'INPUT', render: (r) => <CodeInput ref={r} value="" onChange={noop} name="probe" data-testid="probe" /> },
  { name: 'SearchBar', tag: 'INPUT', render: (r) => <SearchBar ref={r} value="" onChange={noop} name="probe" data-testid="probe" /> },
  { name: 'GlobalSearch', tag: 'INPUT', render: (r) => <GlobalSearch ref={r} value="" onChange={noop} name="probe" data-testid="probe" /> },
  { name: 'FileDrop', tag: 'INPUT', render: (r) => <FileDrop ref={r} files={[]} onFiles={noop} name="probe" data-testid="probe" /> },
  { name: 'Checkbox', tag: 'INPUT', render: (r) => <Checkbox ref={r} name="probe" data-testid="probe" /> },
  { name: 'Radio', tag: 'INPUT', render: (r) => <Radio ref={r} name="probe" data-testid="probe" /> },
  { name: 'Switch', tag: 'INPUT', render: (r) => <Switch ref={r} name="probe" data-testid="probe" /> },
]

describe('политика ref и нативных атрибутов у полей', () => {
  it('каталог полей не пуст и не усох', () => {
    // Без этого «все поля прошли» осталось бы зелёным на пустом списке.
    expect(FIELDS.length, 'каталог полей усох').toBeGreaterThanOrEqual(14)
  })

  for (const f of FIELDS) {
    it(`${f.name}: ref доезжает до ${f.tag}`, () => {
      const ref = createRef<never>()
      render(f.render(ref))
      const node = ref.current as unknown as HTMLElement | null
      expect(node, `${f.name}: ref остался пустым`).not.toBeNull()
      expect(node!.tagName, `${f.name}: ref смотрит не на тот элемент`).toBe(f.tag)
    })

    it(`${f.name}: name и data-* доезжают до DOM`, () => {
      // `name` — то, чем поле называет себя форме и `react-hook-form`;
      // `data-testid` — то, чем его находит тест потребителя. У половины полей
      // передать их было нечем: закрытый набор пропов (DS-108).
      const ref = createRef<never>()
      const { container } = render(f.render(ref))
      expect(container.querySelector('[name="probe"]'), `${f.name}: name не доехал`).not.toBeNull()
      expect(container.querySelector('[data-testid="probe"]'), `${f.name}: data-testid не доехал`).not.toBeNull()
    })
  }

  it('forwardRef в исходниках нет — React 19, ref обычный проп', () => {
    // Кто напишет `forwardRef`, вернёт лишнюю обёртку и потеряет то, ради чего
    // 19-я версия его и отменила. Пусто здесь — это решение, а не совпадение.
    //
    // Ищется ВЫЗОВ, а не слово: слово стоит в объяснениях — здесь и в
    // `TextField.tsx`, — и запрет на упоминание запретил бы объяснять решение.
    const SRC = resolve(__dirname, '..')
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name))
        : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [])
    const files = walk(SRC)
    expect(files.length, 'обход не нашёл исходников').toBeGreaterThan(100)
    const offenders = files.filter((f) => readFileSync(f, 'utf8').includes('forward' + 'Ref' + '('))
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([])
  })

  it('и проверка умеет находить нарушение', () => {
    // Утверждения выше верны и для проверки, которая ничего не проверяет:
    // компонент без проброса обязан оставить ref пустым.
    const Deaf = (_: { ref?: React.Ref<HTMLInputElement> }) => <input />
    const ref = createRef<HTMLInputElement>()
    render(<Deaf ref={ref} />)
    expect(ref.current).toBeNull()
  })
})

/**
 * ТИПОВОЙ блок. Не рендерится и ничего не утверждает на рантайме — он обязан
 * компилироваться, и это проверяет `npm run typecheck`. Уберут `ref` из пропсов
 * любого поля — красным станет он, а не кейс выше.
 *
 * Отмечен `void`, а не рендером: `noUnusedLocals` иначе уронит сборку на
 * неиспользованной функции, и гейт превратится в тест «файл компилируется».
 */
function TypeProbe() {
  const input = createRef<HTMLInputElement>()
  const area = createRef<HTMLTextAreaElement>()
  const select = createRef<HTMLSelectElement>()
  const button = createRef<HTMLButtonElement>()
  return (
    <>
      <TextField ref={input} name="a" autoComplete="off" data-testid="t" aria-describedby="x" />
      <Textarea ref={area} name="a" data-testid="t" />
      <Select ref={select} options={OPTIONS} name="a" data-testid="t" />
      <NumberField ref={input} value={1} onChange={noop} name="a" disabled data-testid="t" />
      <DatePicker ref={input} value="" onChange={noop} name="a" data-testid="t" />
      <Slider ref={input} value={1} onChange={noop} name="a" data-testid="t" />
      <Combobox ref={button} options={OPTIONS} value="a" onChange={noop} name="a" data-testid="t" />
      <CodeInput ref={input} value="" onChange={noop} name="a" data-testid="t" />
      <SearchBar ref={input} value="" onChange={noop} name="a" data-testid="t" />
      <GlobalSearch ref={input} value="" onChange={noop} name="a" data-testid="t" />
      <FileDrop ref={input} files={[]} onFiles={noop} name="a" data-testid="t" />
      <Checkbox ref={input} name="a" data-testid="t" />
      <Radio ref={input} name="a" data-testid="t" />
      <Switch ref={input} name="a" data-testid="t" />
    </>
  )
}
void TypeProbe
