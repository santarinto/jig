/**
 * «Цвет, каким его видно» — общий снимок для всех случаев про контраст
 * (DS-209).
 *
 * Каждый случай `measure-invariants.mjs` считал контраст по НОМИНАЛЬНОМУ
 * `getComputedStyle(el).color` против `backgroundColor`. `opacity` предка для
 * этой пары не существует: она не входит ни в одно computed-значение, она
 * применяется при отрисовке — группа рисуется целиком и накладывается на то,
 * что позади. `.ds-cal__day--out` (`color: var(--ds-text-muted); opacity: .65`
 * на КНОПКЕ) давал номинальные 5.33 в свете и 5.38 в темноте, а на экране —
 * 2.64 и 3.10. Оба числа правдоподобны, ни одно не падало, и разошлись они не
 * на округлении, а вдвое: гейт утверждал про цвет, которого на экране нет.
 *
 * Альфа самого цвета (`color: rgba(…, .6)`) и альфа фона обрабатываются ТЕМ ЖЕ
 * механизмом: при отрисовке между «цвет полупрозрачен» и «предок приглушён»
 * разницы нет, это два слоя прозрачности, и они перемножаются.
 *
 * Разделение труда — то же, что и во всём файле случаев: браузер СНИМАЕТ,
 * node СЧИТАЕТ.
 * - `SEEN_INSTALL` заводит в странице `window.__seen(el, colour?)`. Он только
 *   ходит по предкам и складывает `{backgroundColor, opacity}` — арифметики в
 *   нём нет вовсе, потому что арифметику в браузере нечем проверить: она
 *   уехала бы в `page.evaluate`, где её не видит ни один гейт.
 * - `seenPair`/`seenOn` считают в node над снятыми строками и проверяются
 *   гейтом `src/__guards__/colour-parse.test.ts` на синтетических цепочках,
 *   без браузера вообще.
 *
 * Модель наложения — стандартная, группами: у элемента `n` с `opacity: o` СВОЙ
 * фон лежит ВНУТРИ его группы, поэтому `o` действует и на фон, и на текст.
 * Идём снаружи внутрь, копим `A` (произведение `opacity`) и непрозрачную
 * подложку `C`; на каждом шаге `C = blend(фон, C, α_фона · A)`. Видимый текст —
 * `blend(color, C, α_color · A)`, видимая подложка рядом с ним — то же `C`.
 * Первый непрозрачный фон снизу сам «съедает» всё, что было под ним, — искать
 * его отдельно не нужно, он получается из той же формулы.
 */

import { blend } from './colour.mjs'

/**
 * Снимок в браузере: цвет плюс цепочка слоёв ОТ КОРНЯ К ЭЛЕМЕНТУ.
 * `colour` — необязательная подмена цвета: обвод фокуса или линия рамки тоже
 * гаснут под `opacity` предка, а лежат не в `color`.
 */
function seenSnapshot(el, colour) {
  const layers = []
  for (let n = el; n; n = n.parentElement) {
    const cs = getComputedStyle(n)
    const o = parseFloat(cs.opacity)
    layers.unshift({ bg: cs.backgroundColor, opacity: Number.isFinite(o) ? o : 1 })
  }
  return { color: colour ?? getComputedStyle(el).color, layers }
}

/**
 * Готовое выражение для `page.evaluate`. `void (…)` обязателен: без него
 * playwright попытается сериализовать возвращённую функцию и упадёт.
 */
export const SEEN_INSTALL = `void (window.__seen = ${seenSnapshot.toString()})`

/**
 * Холст страницы. Chromium рисует его белым, если ни `html`, ни `body` не
 * закрасили себя; наш лист закрашивает `body` (`--ds-bg-app`), и этот фон
 * приходит в снимке слоем, то есть до умолчания дело обычно не доходит.
 */
const CANVAS = 'rgb(255, 255, 255)'

/** Накопленная прозрачность и непрозрачная подложка под текстом. */
function composite(snap, base) {
  let alpha = 1
  let background = base
  for (const l of snap.layers) {
    alpha *= l.opacity
    background = blend(l.bg, background, alpha)
  }
  return { alpha, background }
}

/**
 * Пара «текст и его подложка», обе `rgb(...)` — ровно то, что ест `contrastOf`.
 * Подложку берёт СО СТРАНИЦЫ: это ответ на вопрос «что видно», и литерал в
 * случае был бы уже другим вопросом.
 */
export function seenPair(snap, base = CANVAS) {
  const { alpha, background } = composite(snap, base)
  return { color: blend(snap.color, background, alpha), background, alpha }
}

/**
 * Тот же видимый цвет, но на НАЗВАННОЙ подложке — для случаев, где подложка
 * гипотетическая (пробник токена: «а как это будет на зебре, на наведении, на
 * выборе»). Накопленная прозрачность берётся из снимка, подложка — из вопроса.
 */
export function seenOn(snap, onto, base = CANVAS) {
  return blend(snap.color, onto, composite(snap, base).alpha)
}
