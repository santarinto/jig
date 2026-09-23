import { describe, it, expect } from 'vitest'
import { metaOf } from './fixture-meta.js'
import type { AnyFixture, Control, Slot } from '../src/internal/fixture.js'
import type { ControlMeta, SlotMeta } from './protocol.js'

const fx: AnyFixture = {
  name: 'X',
  group: 'Группа',
  props: { a: 1 },
  controls: { a: { kind: 'number', min: 0, max: 9, prop: true } },
  cases: [
    { id: 'base', title: 'База', note: 'что утверждает' },
    { id: 'alt', title: 'Другой', render: () => null },
  ],
  render: () => null,
}

describe('metaOf', () => {
  it('переносит имя, группу и состав случаев', () => {
    const meta = metaOf(fx)
    expect(meta).toEqual({
      name: 'X',
      group: 'Группа',
      cases: [
        // `ignoresProps` у ОБОИХ, и у `base` он приехал от `fx.render` — тот
        // объявлен без параметров, значит крутилки мертвы и без своей
        // разметки ([3] ручного QA). `ownRender` при этом только у `alt`:
        // поля отвечают на разные вопросы и совпадать не обязаны.
        {
          id: 'base',
          title: 'База',
          note: 'что утверждает',
          values: { a: '1' },
          ignoresProps: true,
          overrides: ['a'],
          slots: {},
        },
        {
          id: 'alt',
          title: 'Другой',
          values: { a: '1' },
          ownRender: true,
          ignoresProps: true,
          overrides: ['a'],
          slots: {},
        },
      ],
      controls: { a: { kind: 'number', min: 0, max: 9, prop: true } },
      unexpressed: [],
      data: [],
      slots: {},
    })
    // `toEqual` не отличает отсутствующий ключ от ключа со значением
    // `undefined` — регрессию вида `note: c.note` (без условия) он бы не
    // поймал. Ключ проверяем явно и отдельно.
    expect(Object.keys(meta.cases[1]!)).not.toContain('note')
    // `alt` объявлен со своим render (см. fx выше) — ownRender у него, а не
    // у 'base'.
    expect(Object.keys(meta.cases[0]!)).not.toContain('ownRender')
  })

  // Это и есть причина, по которой модуль существует: postMessage клонирует
  // структурно, а `render` — функция. Послать фикстуру как есть нельзя, и
  // выясняется это не типом, а DOMException в рантайме.
  /**
   * ПЕРЕКРЫТЫЕ КРУТИЛКИ (DS-164) — ответ зонда `case-overrides.ts`,
   * доставленный панели. Пустой список в сообщение НЕ кладётся: «зонд не
   * ответил» (`null`) и «ничего не перекрыто» панель читает одинаково —
   * крутилки живые, — и лишний ключ на каждом случае ничего бы не сказал.
   */
  it('перекрытые случаем крутилки названы в overrides, пропущенные насквозь — нет', () => {
    const m = metaOf({
      name: 'X', group: 'G',
      props: { a: 1, b: 'x' },
      controls: { a: { kind: 'number', min: 0, max: 9, prop: true }, b: { kind: 'text', prop: true } },
      cases: [
        { id: 'pass', title: 'P' },
        { id: 'own', title: 'O', render: (p: { a: number; b: string }) => ({ a: p.a, b: 'своё' }) as never },
      ],
      render: (p: { a: number; b: string }) => ({ a: p.a, b: p.b }) as never,
    })
    expect(Object.keys(m.cases[0]!)).not.toContain('overrides')
    expect(m.cases[1]!.overrides).toEqual(['b'])
  })

  it('переживает структурное клонирование, а сама фикстура — нет', () => {
    expect(() => structuredClone(metaOf(fx))).not.toThrow()
    expect(() => structuredClone(fx)).toThrow()
  })

  it('несёт виды крутилок и имена наборов данных', () => {
    const m = metaOf({
      ...fx,
      controls: { dense: { kind: 'bool', prop: true }, tone: { kind: 'enum', values: ['a', 'b'], prop: true } },
      data: { empty: { a: 1 }, 'rows-500': { a: 2 } },
    })
    expect(m.controls).toEqual({ dense: { kind: 'bool', prop: true }, tone: { kind: 'enum', values: ['a', 'b'], prop: true } })
    expect(m.data).toEqual(['empty', 'rows-500'])
  })

  it('наборы данных едут ИМЕНАМИ, а не содержимым', () => {
    const heavy = metaOf({ ...fx, data: { big: { rows: Array.from({ length: 500 }, (_, i) => ({ i })) } } })
    expect(JSON.stringify(heavy).length).toBeLessThan(400)
  })

  it('в значениях случая — только управляемые пропы, строками', () => {
    const m = metaOf({
      name: 'X', group: 'G',
      props: { dense: false, rows: [1, 2, 3], emptyText: 'нет' },
      controls: { dense: { kind: 'bool', prop: true }, emptyText: { kind: 'text', prop: true } },
      cases: [{ id: 'a', title: 'A', props: { dense: true } }],
    })
    expect(m.cases[0]!.values).toEqual({ dense: 'true', emptyText: 'нет' })
  })

  it('значение без крутилки названо в unexpressed — иначе сниппет потеряет его молча', () => {
    // `rows` задан фикстурой и крутилкой не выражается. До DS-128 про
    // него не знал никто: в `controls` его нет, в `values` его нет, и сниппет
    // печатал `<DataTable />` так, будто таблица пустая по замыслу.
    const m = metaOf({
      name: 'X', group: 'G',
      props: { dense: false, rows: [1, 2, 3], emptyText: 'нет' },
      controls: { dense: { kind: 'bool', prop: true }, emptyText: { kind: 'text', prop: true } },
      cases: [{ id: 'a', title: 'A' }],
    })
    expect(m.unexpressed).toEqual(['rows'])
  })

  it('всё покручено — список пуст, а не отсутствует', () => {
    // Пустой массив и отсутствие поля читаются сниппетом одинаково, но врозь
    // ломаются: `undefined.length` уронил бы оболочку, у которой нет границы
    // ошибок (та же причина, что у фильтрации controls выше).
    expect(metaOf(fx).unexpressed).toEqual([])
  })

  it('пустые значения крутилок ({ dense: undefined }) отфильтрованы — оболочка не падает на control.kind', () => {
    const m = metaOf({
      ...fx,
      controls: { a: { kind: 'number', min: 0, max: 9, prop: true }, dense: undefined },
    })
    expect(m.controls).toEqual({ a: { kind: 'number', min: 0, max: 9, prop: true } })
    expect(Object.keys(m.controls)).not.toContain('dense')
  })

  it('форма ControlMeta совпадает с Control из фикстуры', () => {
    const control: Control = { kind: 'number', min: 0, max: 10, step: 1, prop: true }
    const asMeta: ControlMeta = control
    expect(asMeta).toEqual(control)

    // ЛИТЕРАЛОМ, А НЕ ПЕРЕМЕННОЙ, И ЭТО НЕ СТИЛЬ. Присваивание ПЕРЕМЕННОЙ не
    // проверяет лишние поля, поэтому строка выше проходит и тогда, когда у
    // `ControlMeta` поля просто НЕТ: она ловит расхождение в одну сторону
    // (`Control` шире), а обещает обе. Проверено мутацией на DS-128:
    // сняли `prop` с `ControlMeta` — тест остался зелёным, покраснели чужие
    // файлы. Свежий литерал включает проверку лишних полей, и сторона
    // «протокол забыл поле» наконец падает здесь, а не где-то через два модуля.
    const fresh: ControlMeta = { kind: 'number', min: 0, max: 10, step: 1, prop: true }
    expect(fresh.prop).toBe(true)
  })

  it('несёт объявленные позиции с их подписями', () => {
    const m = metaOf({
      ...fx,
      slots: {
        cell: { title: 'Свободная ячейка', accepts: 'inline', prop: 'columns[3].render', note: 'опасно' },
      },
    })
    expect(m.slots).toEqual({
      cell: { title: 'Свободная ячейка', accepts: 'inline', prop: 'columns[3].render', note: 'опасно' },
    })
  })

  it('у фикстуры без позиций — пустой объект, а не отсутствие поля', () => {
    expect(metaOf(fx).slots).toEqual({})
  })

  // По образцу теста про пустые значения крутилок: `Record<string, Slot>` в
  // `fx.slots` формально не допускает `undefined`-значений, но фильтрация
  // controls защищается от той же дыры на неточном рантайм-типе (`AnyFixture`
  // = `Fixture<any>`), и slots — по той же причине и тем же кодом.
  it('пустые значения позиций отфильтрованы — оболочка не падает на slot.accepts', () => {
    const m = metaOf({
      ...fx,
      slots: { cell: { title: 'Я', accepts: 'inline' }, ghost: undefined as unknown as Slot },
    })
    expect(m.slots).toEqual({ cell: { title: 'Я', accepts: 'inline' } })
    expect(Object.keys(m.slots)).not.toContain('ghost')
  })

  it('начинка кейса приезжает строкой того же вида, что в адресе', () => {
    const m = metaOf({
      ...fx,
      slots: { cell: { title: 'Я', accepts: 'inline' } },
      cases: [{ id: 'a', title: 'А', slots: { cell: { c: 'Badge', case: 'dot' } } }],
    })
    expect(m.cases[0]!.slots).toEqual({ cell: 'Badge:dot' })
  })

  it('начинка без кейса — имя без двоеточия', () => {
    const m = metaOf({
      ...fx,
      slots: { cell: { title: 'Я', accepts: 'inline' } },
      cases: [{ id: 'a', title: 'А', slots: { cell: { c: 'Badge' } } }],
    })
    expect(m.cases[0]!.slots).toEqual({ cell: 'Badge' })
  })

  it('у кейса без начинок — пустой объект', () => {
    expect(metaOf(fx).cases[0]!.slots).toEqual({})
  })

  it('форма SlotMeta совпадает со Slot из фикстуры', () => {
    const slot: Slot = { title: 'Т', accepts: 'inline', prop: 'p', note: 'n' }
    const asMeta: SlotMeta = slot
    expect(asMeta).toEqual(slot)
  })
})

/**
 * КУДА НЕ ДОЕЗЖАЮТ КРУТИЛКИ ([3] ручного QA, DS-128).
 *
 * Отчёт увидел крутилки, которые ничего не меняют, и назвал причиной
 * `ownRender`. По коду это НЕВЕРНО и опровергается первой же фикстурой: у
 * `Badge` случай «Все тона» объявлен как `render: (p) => … dot={p.dot}` — своя
 * разметка есть, а крутилка `dot` работает. Погасив её «по `ownRender`», мы
 * отняли бы живой контрол и соврали про него.
 *
 * Провести границу можно и не гадая: `render.length` — это число объявленных
 * параметров, и НОЛЬ означает, что пропы прочитать нечем. Тогда мертвы ВСЕ
 * крутилки разом, и сказать это можно без догадок. Единица не означает
 * обратного («какие-то читает»), поэтому про такой случай не говорится ничего:
 * ложное утверждение хуже молчания.
 *
 * СЧИТАЕТСЯ ДЕЙСТВУЮЩИЙ render, а не `c.render`: кадр рисует
 * `kase.render ?? fx.render`, и фикстура с безпараметровым общим render
 * оставляет крутилки такими же мёртвыми — про `ownRender` там речи нет вовсе.
 */
describe('случай, до которого не доезжают пропы', () => {
  const make = (cases: AnyFixture['cases'], render: AnyFixture['render']): AnyFixture => ({
    name: 'X',
    group: 'Г',
    props: { a: 1 },
    controls: { a: { kind: 'number', min: 0, max: 9, prop: true } },
    cases,
    render,
  })

  it('свой render без параметров — помечен', () => {
    const m = metaOf(make([{ id: 'k', title: 'К', render: () => null }], (_p) => null))
    expect(m.cases[0]!.ignoresProps).toBe(true)
  })

  // Имя с подчёркиванием — чтобы `noUnusedParameters` не потребовал убрать
  // параметр: убрать его здесь значит уничтожить сам предмет проверки, у
  // безымянной стрелки `length` уже ноль.
  it('свой render с параметром пометки НЕ получает — читать пропы ему есть чем', () => {
    const m = metaOf(make([{ id: 'k', title: 'К', render: (_p) => null }], () => null))
    expect(Object.keys(m.cases[0]!)).not.toContain('ignoresProps')
  })

  it('без своего render считается render фикстуры', () => {
    const m = metaOf(make([{ id: 'k', title: 'К' }], () => null))
    expect(m.cases[0]!.ignoresProps).toBe(true)
    const live = metaOf(make([{ id: 'k', title: 'К' }], (_p) => null))
    expect(Object.keys(live.cases[0]!)).not.toContain('ignoresProps')
  })
})
