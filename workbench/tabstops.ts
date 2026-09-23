/**
 * Слой таб-стопов (Задача 33): куда доходит клавиатура и в каком порядке.
 *
 * ЗАЧЕМ ОТДЕЛЬНО ОТ ФОРСА. Форс-`:focus-visible` показывает, как фокус
 * ВЫГЛЯДИТ; доходит ли он туда вообще и сколько раз — вопрос другой, и
 * подменять один другим нельзя. Живой дефект, ради которого слой заведён,
 * записан в CLAUDE.md: портальная разметка `<a><button>` давала ДВА таб-стопа
 * на один пункт списка — глазами не видно ничего, клавиатурой список вдвое
 * длиннее.
 *
 * ЧЕГО ЭТОТ РАСЧЁТ НЕ ЗНАЕТ, и это записано, чтобы не выдавать за большее:
 *  - `inert` у предка и `display: none` в ЛИСТЕ (а не в атрибуте) браузер
 *    учитывает, а этот обход — нет: он смотрит разметку, а не раскладку.
 *    Скрытая стилями кнопка попадёт в список лишним номером;
 *  - shadow DOM не обходится (в системе его нет);
 *  - `dialog`/`popover` меняют область обхода целиком — в системе их нет.
 * Каждый из трёх пунктов даёт ЛИШНИЙ стоп, а не пропущенный, — и это
 * сознательный перекос: лишний номер на экране видно и можно объяснить,
 * пропущенный молчит.
 *
 * ОТКРЫТЫЙ ОВЕРЛЕЙ обходится правильно и без специальной ветки, но держится
 * это НЕ САМО СОБОЙ, а двумя вещами разом (DS-163). Первая: корней
 * несколько, и оверлей приезжает своим (`preview-roots.ts`) — иначе стопов
 * было бы ноль, потому что за пределы хоста слой не смотрел вовсе. Вторая:
 * `useOverlayIsolation` вешает `inert` на всех детей `body`, кроме узлов
 * оверлеев, а `inert` предка этот обход уже читает — поэтому фон из списка
 * выпадает сам, и номера идут по одной ловушке фокуса, а не по двум областям
 * подряд. Сломается любая из двух — список станет врать в разные стороны:
 * без первой в ноль, без второй в сумму.
 */

import { accessibleName } from './accname.js'

/** Что вообще бывает фокусируемым. `a` без `href` сюда не попадает намеренно. */
const CANDIDATES = [
  'a[href]',
  'area[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  'audio[controls]',
  'video[controls]',
  '[tabindex]',
  '[contenteditable]:not([contenteditable="false"])',
].join(',')

function tabIndexOf(el: Element): number {
  const raw = el.getAttribute('tabindex')
  if (raw === null) return 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

function isReachable(el: Element): boolean {
  if (el.hasAttribute('disabled')) return false
  if (el.getAttribute('aria-disabled') === 'true') return false
  if (el.hasAttribute('hidden')) return false
  if (el.closest('[inert]')) return false
  if (el instanceof HTMLInputElement && el.type === 'hidden') return false
  return tabIndexOf(el) >= 0
}

/**
 * Таб-стопы в ПОРЯДКЕ ОБХОДА, а не в порядке разметки.
 *
 * Положительный `tabindex` идёт первым и по возрастанию — так устроен
 * браузер, и слой, показывающий порядок разметки, врал бы ровно там, где
 * порядок и есть предмет вопроса. Внутри одного значения порядок разметки
 * сохраняется (сортировка стабильная).
 *
 * КОРНЕЙ НЕСКОЛЬКО, и порядок их — порядок обхода: положительный `tabindex`
 * поднимается НАД ВСЕМИ корнями разом, как и в браузере, где он глобален по
 * документу, а не по поддереву.
 */
export function tabStops(roots: readonly Element[]): Element[] {
  const found = roots
    .flatMap((root) => Array.from(root.querySelectorAll(CANDIDATES)))
    .filter(isReachable)
  const positive = found.filter((el) => tabIndexOf(el) > 0)
  const natural = found.filter((el) => tabIndexOf(el) === 0)
  positive.sort((a, b) => tabIndexOf(a) - tabIndexOf(b))
  return [...positive, ...natural]
}

/**
 * Короткая подпись стопа для списка в панели — ДОСТУПНОЕ ИМЯ, а не текст
 * разметки (DS-211).
 *
 * Раньше здесь было `aria-label || textContent`, и это отвечало на другой
 * вопрос. `aria-label` действительно сильнее текста, но остальное имя ловилось
 * мимо: узел с `aria-hidden`-потомком подписывался ВМЕСТЕ с потомком. На
 * `FormTabs/many` док печатал «Реализация ТК-00417×» при доступном имени
 * «Реализация ТК-00417» — то есть слой показывал ровно то, что мы намеренно
 * убрали из имени. Прибор, скрывающий свой успех, завтра скроет провал.
 *
 * Расчёт имени и его цена — `accname.ts`; там же сказано, чего он не знает.
 */
export function stopLabel(el: Element): string {
  const text = accessibleName(el)
  return text.length > 32 ? `${text.slice(0, 31)}…` : text
}
