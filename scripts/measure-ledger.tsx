/**
 * Лента журнала, МОНТИРУЕМАЯ В СТРАНИЦУ ЗАМЕРА живым React (DS-312).
 *
 * Собирается `bundleOf` из `measure-invariants.mjs` и доступна странице как
 * `WB`. Раскладку LedgerList решает CSS (`@container`), а не JS, так что живой
 * React здесь не ради замера после монтирования, как у AppBar, а ради ДАННЫХ:
 * записи, колонки и деталь берутся из фикстуры её же `render`, и копия разметки
 * строкой разошлась бы с верстаком молча — ширина текста и есть предмет порога.
 */
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import fixture from '../src/components/LedgerList/LedgerList.fixture.js'

const roots = new Map<Element, Root>()

export function mountLedger(el: Element, opts: { dense: boolean }): void {
  const props = { ...fixture.props, dense: opts.dense }
  const render = fixture.render
  if (!render) throw new Error('LedgerList: рисовать нечем')
  let root = roots.get(el)
  if (!root) { root = createRoot(el); roots.set(el, root) }
  flushSync(() => root!.render(render(props as never, {})))
}
