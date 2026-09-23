/**
 * Лента разделов, МОНТИРУЕМАЯ В СТРАНИЦУ ЗАМЕРА живым React (DS-313).
 *
 * Собирается `bundleOf` из `measure-invariants.mjs` и доступна странице как
 * `WB`. Живой React, а не разметка: `is-scrollable`, `is-start` и `is-end`
 * ставит компонент по замеру и по `scroll`, а сдвиг к активному разделу — его
 * эффект. Строка разметки мерила бы ленту, которой у потребителя не бывает.
 * Разделы — из фикстуры: их подписи задают ширину, которой не хватает.
 */
import { useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import fixture from '../src/components/SectionPanel/SectionPanel.fixture.js'
import { SectionPanel } from '../src/components/SectionPanel/SectionPanel.js'

const roots = new Map<Element, Root>()

function Live({ selectedId }: { selectedId: string }) {
  const [sel, setSel] = useState(selectedId)
  return <SectionPanel orientation="horizontal" sections={fixture.props.sections} selectedId={sel} onSelect={setSel} />
}

export function mountSections(el: Element, selectedId: string): void {
  let root = roots.get(el)
  if (!root) { root = createRoot(el); roots.set(el, root) }
  flushSync(() => root!.render(<Live selectedId={selectedId} />))
}
