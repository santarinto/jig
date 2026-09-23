/**
 * Графики, МОНТИРУЕМЫЕ В СТРАНИЦУ ЗАМЕРА живым React (DS-185).
 *
 * Собирается `bundleOf` из `measure-invariants.mjs` и доступен странице как
 * `WB`. Статическая разметка (`ssrMarkup`) здесь не годится по предмету: поле
 * подписей категорий считается ПОСЛЕ монтирования — шрифт снимается
 * `getComputedStyle` с узла оси, ширина холста приходит из `ResizeObserver`.
 * SSR дал бы откат-оценку на холсте 520 px, то есть замер мерил бы вчерашнюю
 * ширину по угаданному шрифту, а не то, что увидит потребитель.
 */
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { BarChart, type BarChartProps } from '../src/components/BarChart/BarChart.js'
import barFixture from '../src/components/BarChart/BarChart.fixture.js'
import { LineChart, type LineChartProps } from '../src/components/LineChart/LineChart.js'
import lineFixture from '../src/components/LineChart/LineChart.fixture.js'

const roots = new Map<Element, Root>()

export function mountBar(el: Element, props: BarChartProps): void {
  let root = roots.get(el)
  if (!root) { root = createRoot(el); roots.set(el, root) }
  flushSync(() => root!.render(createElement(BarChart, props)))
}

export function mountLine(el: Element, props: LineChartProps): void {
  let root = roots.get(el)
  if (!root) { root = createRoot(el); roots.set(el, root) }
  flushSync(() => root!.render(createElement(LineChart, props)))
}

/**
 * Подписи случая `long` — ИЗ ФИКСТУРЫ, а не переписанные в замер: длинные имена
 * там подобраны под предмет, и копия разошлась бы с ними молча.
 */
export const BAR_LONG_CATEGORIES: string[] = barFixture.data!.long!.categories!
/** Имена с длинным общим началом — жёлоб растёт ради различающего символа (DS-295). */
export const BAR_TWIN_CATEGORIES: string[] = barFixture.data!.twins!.categories!
export const BAR_SERIES = barFixture.props.series

/** Семизначные наборы `big` — тоже из фикстур (DS-275). */
export const LINE_BIG_SERIES = lineFixture.data!.big!.series!
export const BAR_BIG_SERIES = barFixture.data!.big!.series!
/** Обычные наборы — пол поля: трёхзначная шкала обязана остаться на прежней константе. */
export const LINE_SHORT_SERIES = lineFixture.props.series
export const BAR_CATEGORIES = barFixture.props.categories
/** Двенадцать недель диапазонами дат — подписи оси X, которым тесно подряд (DS-274). */
export const LINE_WEEKS_SERIES = lineFixture.data!.weeks!.series!
/** Восемь рядов — самая ВЫСОКАЯ плашка подсказки системы (DS-286). */
export const LINE_EIGHT_SERIES = lineFixture.data!.eight!.series!
