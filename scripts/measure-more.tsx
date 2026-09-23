/**
 * Кнопка «Ещё» и её меню, МОНТИРУЕМЫЕ В СТРАНИЦУ ЗАМЕРА живым React
 * (DS-359), плюс выключенный инструмент шапки карточки (DS-358).
 *
 * Собирается `bundleOf` из `measure-invariants.mjs` и доступна странице как
 * `WB`. Живой React, а не разметка строкой, — по той же причине, что у
 * `measure-appbar.tsx`, и здесь причина даже жёстче: предмет замера — то, что
 * компонент делает ПОСЛЕ монтирования. Свёртку в «Ещё» решает
 * `useActionOverflow` замером, координаты меню считает `useAnchoredPosition`
 * из вьюпорта, а триггер — чужой узел, клонированный `cloneElement`. Разметка,
 * вписанная в кейс строкой, не несёт ни одного из трёх: у неё «Ещё» —
 * статический `<button>`, а меню — фолбэк `position: absolute` из листа, то
 * есть ровно то, чего у потребителя не бывает.
 *
 * Случаи — ИЗ ФИКСТУР, их же `render`: набор действий, подписи и триггер
 * задают меряемые ширины, и копия разошлась бы с верстаком молча.
 */
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import appBar from '../src/components/AppBar/AppBar.fixture.js'
import commandBar from '../src/components/CommandBar/CommandBar.fixture.js'
import dropdownMenu from '../src/components/DropdownMenu/DropdownMenu.fixture.js'
import form from '../src/components/Form/Form.fixture.js'

/**
 * Фикстура, какой её видит монтировщик: список случаев и чем рисовать. Типы
 * пропсов у четырёх фикстур разные, и сводить их к общему здесь нечем — но
 * СТРУКТУРА у них одна, и именно её монтировщик и читает.
 */
interface MountableCase {
  id: string
  props?: Record<string, unknown>
  render?: (props: never, ctx: Record<string, never>) => React.ReactNode
}
interface Mountable {
  cases: MountableCase[]
  props: Record<string, unknown>
  render?: (props: never, ctx: Record<string, never>) => React.ReactNode
}

const FIXTURES: Record<string, Mountable> = {
  AppBar: appBar as unknown as Mountable,
  CommandBar: commandBar as unknown as Mountable,
  DropdownMenu: dropdownMenu as unknown as Mountable,
  Form: form as unknown as Mountable,
}

const roots = new Map<Element, Root>()

/**
 * Смонтировать случай `caseId` фикстуры `name` в узел `el`.
 *
 * Имя фикстуры приходит СТРОКОЙ и проверяется здесь же: опечатка обязана
 * упасть с именем, а не смонтировать пустоту — пустой хост дал бы замеру
 * «элемента нет», то есть жалобу не про тот предмет.
 */
export function mountCase(el: Element, name: string, caseId: string): void {
  const fixture = FIXTURES[name]
  if (!fixture) throw new Error(`measure-more: фикстуры ${name} нет`)
  const c = fixture.cases.find((x) => x.id === caseId)
  if (!c) throw new Error(`${name}: случая ${caseId} в фикстуре нет`)
  const props = { ...fixture.props, ...(c.props ?? {}) }
  const render = c.render ?? fixture.render
  if (!render) throw new Error(`${name}/${caseId}: рисовать нечем`)
  let root = roots.get(el)
  if (!root) { root = createRoot(el); roots.set(el, root) }
  flushSync(() => root!.render(render(props as never, {})))
}
