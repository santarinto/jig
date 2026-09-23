/**
 * Выжимка из фикстуры для отправки наверх.
 *
 * Живёт отдельно от protocol.ts намеренно: протокол не должен ничего знать про
 * формат фикстуры (его импортируют обе половины верстака), а этот модуль —
 * знать про постмессадж. Общее у них — только тип FixtureMeta.
 */
import type { AnyFixture, SlotFill } from '../src/internal/fixture.js'
import type { CaseMeta, ControlMeta, FixtureMeta, SlotMeta } from './protocol.js'
import { overriddenControls } from './case-overrides.js'

/**
 * Приводит начинку позиции к той же строковой форме, что и адрес кадра
 * (`s.<id>=Component:case`) — единственное место, где живёт это приведение.
 * `slot-fill.ts` кадра (Задача 3) зовёт ровно эту функцию: продублируй её —
 * и чип панели, и рисунок в кадре разойдутся при первой же правке формата
 * `SlotFill`, каждый раз молча.
 *
 * `{ text: '…' }` в этой фазе не поддержан: строкой того же вида не
 * выражается, возвращаем `null` — вызывающий обязан начинку пропустить
 * (см. `metaOf` ниже и валидатор Task 8, который эту форму запретит писать).
 */
export function fillToString(fill: SlotFill): string | null {
  if (!('c' in fill)) return null
  return fill.case ? `${fill.c}:${fill.case}` : fill.c
}

/**
 * Значения случая — только по ключам `controls` и только строками.
 *
 * Пропсы целиком сюда класть нельзя: у `DataTable` в шапке лежит `rows`, а в
 * наборе `rows-500` — пятьсот объектов. Структурное клонирование такого груза
 * на каждый `ready` стоит мегабайта, а панели нужны ровно те значения, которые
 * она умеет показывать.
 */
const valuesOf = (fx: AnyFixture, c: AnyFixture['cases'][number]): Record<string, string> => {
  const merged = { ...fx.props, ...c.props } as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const key of Object.keys(fx.controls)) out[key] = String(merged[key] ?? '')
  return out
}

/**
 * Начинки случая — строками того же вида, что адрес кадра (см. `fillToString`).
 * Позиция без начинки (или с начинкой вида `{ text: … }`, которую `fillToString`
 * отвергает) в объект не попадает — не подставлена пустой строкой: пустая
 * строка панель нарисовала бы как «сброшенную» позицию, хотя начинка есть,
 * просто в форме, которую эта фаза ещё не понимает.
 */
const slotsOf = (c: AnyFixture['cases'][number]): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [key, fill] of Object.entries(c.slots ?? {}) as [string, SlotFill][]) {
    const s = fillToString(fill)
    if (s !== null) out[key] = s
  }
  return out
}

export function metaOf(fx: AnyFixture): FixtureMeta {
  return {
    name: fx.name,
    group: fx.group,
    cases: fx.cases.map((c): CaseMeta => {
      const m: CaseMeta = { id: c.id, title: c.title, values: valuesOf(fx, c), slots: slotsOf(c) }
      if (c.note) m.note = c.note
      // `c.render` в руках — только здесь фикстура ещё жива (кадр её загрузил
      // и вызывает metaOf). Панели она недоступна и импортировать нельзя.
      if (c.render) m.ownRender = true
      // ДЕЙСТВУЮЩИЙ render, а не `c.render`: кадр рисует `kase.render ??
      // fx.render`, и фикстура с безпараметровым общим render оставляет
      // крутилки такими же мёртвыми — `ownRender` там нет вовсе.
      //
      // `length` — число ОБЪЯВЛЕННЫХ параметров. Ноль доказывает, что пропы
      // прочитать нечем; единица ничего не доказывает в обратную сторону, и
      // потому про такой случай не говорится ничего (см. `ignoresProps`).
      //
      // `render` в типе фикстуры НЕОБЯЗАТЕЛЕН, и его отсутствие — не то же
      // самое, что ноль параметров: рисовать в этом случае нечем вовсе, и
      // разговор о крутилках уже не про них. Молчим — панель скажет своё про
      // не загрузившуюся фикстуру.
      const draw = c.render ?? fx.render
      if (draw !== undefined && draw.length === 0) m.ignoresProps = true
      // ПЕРЕКРЫТЫЕ КРУТИЛКИ (DS-164) — зондом по действующему render,
      // здесь же и по той же причине, что `ownRender`: фикстура жива только в
      // кадре. Пустой ответ и отказ зонда (`null`) не кладутся — панель читает
      // оба как «крутилки живые».
      const overrides = overriddenControls(fx, c)
      if (overrides && overrides.length > 0) m.overrides = overrides
      return m
    }),
    // `Controls<P>` держит значения как `Control | undefined` ради удобства
    // определения фикстуры (частичный объект). Пустые значения ({ dense:
    // undefined }) отфильтрованы, а не просто приведены типом: `postMessage`
    // такой ключ пронёс бы как есть, `ControlRow` в дальнейшем прочитал бы
    // `control.kind` у `undefined` — и упала бы ОБОЛОЧКА, а не кадр, у неё
    // нет границы ошибок на этот случай.
    controls: Object.fromEntries(
      Object.entries(fx.controls).filter(([, v]) => v !== undefined),
    ) as Record<string, ControlMeta>,
    // Значения фикстуры, у которых нет крутилки. Выводится ВЫЧИТАНИЕМ, а не
    // объявляется рукой: `Controls<P>` ключами лежит в `keyof P`, поэтому
    // разность «ключи props минус ключи controls» — это ровно то, что у
    // фикстуры задано и покрутить нельзя (`rows` у DataTable, `tabs` у Tabs,
    // `nodes` у Tree). Объявленный руками список разошёлся бы с props на
    // первой же правке фикстуры и врал бы молча — а он существует ровно затем,
    // чтобы сниппет не молчал.
    unexpressed: Object.keys(fx.props).filter((k) => (fx.controls as Record<string, unknown>)[k] === undefined),
    // Имена наборов, не содержимое — см. комментарий у FixtureMeta.data.
    data: Object.keys(fx.data ?? {}),
    // Та же фильтрация пустых значений и по той же причине, что у controls
    // выше: у оболочки нет границы ошибок, и `undefined` в позиции уронил бы
    // её, а не кадр.
    slots: Object.fromEntries(
      Object.entries(fx.slots ?? {}).filter(([, v]) => v !== undefined),
    ) as Record<string, SlotMeta>,
  }
}
