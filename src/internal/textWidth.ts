/**
 * Ширина строки в пикселях, снятая тем же шрифтом, каким её нарисует SVG.
 *
 * Нужна там, где раскладка обязана знать длину подписи ДО отрисовки: поле
 * категорий горизонтального `BarChart` (DS-185). `getBBox()` уже
 * нарисованного `<text>` дал бы то же число, но только после кадра, и поле
 * тогда прыгало бы на втором проходе на каждое изменение данных.
 *
 * Шрифт передаётся строкой `font` (стиль, вес, размер, семейство), снятой
 * `getComputedStyle` с настоящего узла оси — не угаданной константой: размер
 * подписи едет по `--ds-ui-scale`, семейство задаёт тема.
 *
 * ОТКАТ — ОЦЕНКА, А НЕ ЗАМЕР. Без канвы (SSR, jsdom) ширина считается как
 * `символы × 0.6 × размер`: средняя ширина глифа кириллицы и латиницы в
 * гротеске около 0.55–0.6 em, то есть откат скорее переоценивает и даёт полю
 * запас. Браузер после монтирования пересчитает настоящей мерой.
 */
let ctx: CanvasRenderingContext2D | null | undefined

function context(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx
  // jsdom объявляет `getContext`, но не реализует его и пишет об этом в
  // консоль на каждый вызов; раскладки у него нет, так что оценка честнее.
  if (typeof document === 'undefined'
    || (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent))) {
    ctx = null
    return ctx
  }
  try {
    ctx = document.createElement('canvas').getContext('2d')
  } catch {
    ctx = null
  }
  return ctx
}

/** Оценочная ширина глифа в долях размера шрифта — см. шапку. */
export const FALLBACK_GLYPH_EM = 0.6

/**
 * @param font    CSS-шорткат `font`, снятый с узла; `null` — узла ещё нет.
 * @param sizePx  размер шрифта для оценки, когда мерить нечем.
 */
export function textWidth(text: string, font: string | null, sizePx: number): number {
  const c = font ? context() : null
  if (!c) return Array.from(text).length * FALLBACK_GLYPH_EM * sizePx
  c.font = font!
  return c.measureText(text).width
}

/**
 * Строка, обрезанная С КОНЦА многоточием так, чтобы влезть в `max`.
 *
 * С конца, а не с начала: у подписей категорий различающая часть бывает и в
 * хвосте («Автопарк-Юг» / «Автопарк-Север»), но начало — это то, с чего
 * читают, и обрезка спереди оставляет обрывок без опоры. Полное имя
 * возвращается потребителю отдельно (`<title>`), так что хвост не теряется.
 *
 * Бинарный поиск по числу символов: ширина монотонна по длине префикса.
 */
export function truncateEnd(text: string, max: number, measure: (s: string) => number): string {
  if (measure(text) <= max) return text
  const chars = Array.from(text)
  let lo = 0, hi = chars.length - 1
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (measure(chars.slice(0, mid).join('').trimEnd() + '…') <= max) lo = mid
    else hi = mid - 1
  }
  return chars.slice(0, lo).join('').trimEnd() + '…'
}
