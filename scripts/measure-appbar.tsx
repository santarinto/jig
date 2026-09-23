/**
 * Шапка, МОНТИРУЕМАЯ В СТРАНИЦУ ЗАМЕРА живым React (DS-309).
 *
 * Собирается `bundleOf` из `measure-invariants.mjs` и доступна странице как
 * `WB`. Живой React, а не статическая разметка, по той же причине, что у
 * `measure-tabs.tsx`: свёртку, второй ряд и перенос бренда компонент решает
 * ПОСЛЕ монтирования — замером в `useLayoutEffect` и по `ResizeObserver`.
 * Пересказ разметки строкой мерил бы шапку, которой у потребителя не бывает.
 *
 * Случаи — ИЗ ФИКСТУРЫ, её же `render`: подписи действий, бренд и начинка
 * центра задают меряемые ширины, и копия разошлась бы с верстаком молча.
 */
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import fixture from '../src/components/AppBar/AppBar.fixture.js'

const roots = new Map<Element, Root>()

export function mountAppBar(el: Element, caseId: string): void {
  const c = fixture.cases.find((x) => x.id === caseId)
  if (!c) throw new Error(`AppBar: случая ${caseId} в фикстуре нет`)
  const props = { ...fixture.props, ...(c.props ?? {}) }
  const render = c.render ?? fixture.render
  if (!render) throw new Error(`AppBar/${caseId}: рисовать нечем`)
  let root = roots.get(el)
  if (!root) { root = createRoot(el); roots.set(el, root) }
  flushSync(() => root!.render(render(props as never, {})))
}
