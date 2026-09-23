/**
 * Split, МОНТИРУЕМЫЙ В СТРАНИЦУ ЗАМЕРА живым React (DS-343).
 *
 * Собирается `bundleOf` из `measure-invariants.mjs` и доступен странице как
 * `WB`. Соседние случаи про Split мерят статичную разметку — им хватает листа.
 * Этому не хватает: предмет — арифметика обработчика перетаскивания, то есть
 * JS, а единицы, в которых он ошибался, сводит вместе только настоящий каскад
 * (`calc(<n>px * var(--ds-ui-scale))`). jsdom `calc` не вычисляет вовсе, и тест
 * там утверждал бы про число в состоянии, а не про то, где встал разделитель.
 */
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { Split } from '../src/components/Split/Split.js'

const roots = new Map<Element, Root>()

export function mountSplit(el: Element, opts: { direction: 'row' | 'column'; size: number }): void {
  let root = roots.get(el)
  if (!root) { root = createRoot(el); roots.set(el, root) }
  flushSync(() => root!.render(
    // `min={0}` и без `max`: клэмп не должен участвовать — он остановил бы
    // разделитель сам и скрыл бы лишний ход.
    <Split direction={opts.direction} defaultSize={opts.size} min={0} style={{ width: '100%', height: '100%' }}>
      {[<div key="a">первая</div>, <div key="b">вторая</div>]}
    </Split>,
  ))
}
