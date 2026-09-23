/**
 * Бар вкладок, МОНТИРУЕМЫЙ В СТРАНИЦУ ЗАМЕРА живым React (DS-236).
 *
 * Собирается `bundleOf` из `measure-invariants.mjs` и доступен странице как
 * `WB`. Приём и причина те же, что у `measure-charts.tsx`, но предмет другой:
 * стрелки прокрутки и класс `is-scrollable` компонент ставит ПОСЛЕ
 * монтирования — `updateOverflow` сравнивает `scrollWidth` с `clientWidth` в
 * `useLayoutEffect` и потом по `ResizeObserver`. Статическая разметка (`ssrMarkup`,
 * которой снят случай DS-205) отдаёт бар БЕЗ единого контрола
 * переполнения, а контролы — `flex: 0 0 auto` соседи ленты, то есть ровно те,
 * кто отнимает у неё ширину. Замер по SSR мерил бы остаток, которого у
 * потребителя не бывает: там лента делит бар с тремя соседями, а не с одним.
 *
 * `is-scrollable` здесь тоже НЕ дописывается строкой: его ставит сам компонент,
 * и случай проверяет в том числе то, что он его ставит.
 */
import { createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { Tabs } from '../src/components/Tabs/Tabs.js'
import { TabPanel } from '../src/components/Tabs/TabPanel.js'
import { Button } from '../src/components/Button/Button.js'
import tabsFixture from '../src/components/Tabs/Tabs.fixture.js'

const roots = new Map<Element, Root>()

/** Набор вкладок — ИЗ ФИКСТУРЫ, а не переписанный сюда: подписи и счётчики
 *  задают ширину первой вкладки, то есть саму меряемую величину, и копия
 *  разошлась бы с верстаком молча. */
const TABS = tabsFixture.props.tabs

/**
 * Начинка слота — та же по смыслу, что у случая `?c=Tabs&case=trailing` в
 * верстаке: квадратная кнопка со значком плюс обычная рядом. Через фикстуру
 * её не снять (слот разрешает верстак, а не `render-preview`), поэтому здесь
 * стоят НАСТОЯЩИЕ кнопки системы — как в случае DS-205, и по той же
 * причине: пересказ разметки проверял бы сам себя.
 *
 * Значок свой, а не из системы: ширину `iconOnly`-кнопки задаёт её высота, и
 * от содержимого значка она не зависит вовсе.
 */
const TRAILING = h(
  'span',
  { style: { display: 'flex', gap: '0.5rem', alignItems: 'center' } },
  h(
    Button,
    { key: 'icon', iconOnly: true, 'aria-label': 'Добавить' },
    h(
      'svg',
      { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true },
      h('path', { d: 'M8 3v10M3 8h10', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' }),
    ),
  ),
  h(Button, { key: 'label' }, 'Добавить'),
)

export function mountTabs(el: Element, opts: { trailing: boolean }): void {
  let root = roots.get(el)
  if (!root) { root = createRoot(el); roots.set(el, root) }
  flushSync(() => root!.render(h(Tabs, {
    tabs: TABS,
    selectedId: TABS[0]!.id,
    trailing: opts.trailing ? TRAILING : null,
  })))
}

/**
 * Раскладка «бар сбоку» ЦЕЛИКОМ: обёртка, бар и тело (DS-285).
 *
 * Предмет случая — дележ ширины между лентой и панелью, а панель в `Tabs` не
 * входит: её кладёт рядом потребитель, и направление даёт CSS-обёртка
 * `.ds-tabs-layout--left`. Мерить один бар значило бы мерить половину вопроса —
 * «лента забрала 194.7» само по себе не дефект, дефектом оно становится вместе
 * с тем, что осталось телу.
 *
 * Обёртка здесь написана строкой намеренно, и это не пересказ компонента:
 * `.ds-tabs-layout` — РАЗМЕТКА ПОТРЕБИТЕЛЯ (`Tabs.tsx` про неё только
 * рассказывает в доке), то есть ровно тот код, который в этом случае и
 * проверяется. Бар и тело — настоящие `Tabs` и `TabPanel`.
 *
 * Текст тела — тот же, что в фикстуре (`Tabs.fixture.tsx`, `Live`): именно на
 * слове «Содержимое» видно, что панели не хватило ширины.
 */
export function mountTabsLayout(el: Element, opts: { position: 'left' | 'right' }): void {
  let root = roots.get(el)
  if (!root) { root = createRoot(el); roots.set(el, root) }
  const first = TABS[0]!
  flushSync(() => root!.render(h(
    'div',
    { className: `ds-tabs-layout ds-tabs-layout--${opts.position}` },
    h(Tabs, { key: 'bar', id: 'wb-tabs', tabs: TABS, selectedId: first.id, position: opts.position }),
    h(
      TabPanel,
      { key: 'panel', tabsId: 'wb-tabs', selectedId: first.id },
      `Содержимое вкладки «${first.label}».`,
    ),
  )))
}
