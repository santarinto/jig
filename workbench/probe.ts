/**
 * Определения живого документа, общие для развёртки (sweep.ts) и `window.jig`
 * (JIG-40). До этой задачи `normColour` и `pick` жили приватно в `sweep.ts`;
 * теперь одно определение на обоих потребителей — разошедшаяся копия отвечала
 * бы браузерному агенту не то же самое, что развёртке владельца.
 */

let ctx: CanvasRenderingContext2D | null = null

/**
 * Цвет к `'rgba(r, g, b, a)'` через canvas; альфа округлена до сотых.
 * Контекст ЛЕНИВЫЙ: создаётся при первом вызове, а не при импорте модуля —
 * `sweep.ts` держал его на уровне модуля, и это создавало canvas ради одного
 * `getContext`, даже когда вызывающему цвет не нужен вовсе.
 *
 * НЕ-ЦВЕТ — БРОСОК, А НЕ МОЛЧАЛИВЫЙ ЧЁРНЫЙ. Невалидное присвоение
 * `ctx.fillStyle = css` canvas игнорирует и оставляет прежнее значение — до
 * этой задачи `fillStyle = '#000'` стояло перед присвоением, и `redd` тихо
 * давал чёрный. ДВОЙНАЯ ПРОБА (от `#000` и от `#fff`) отличает понятый цвет от
 * непонятого: сдвинулась хотя бы одна проба — цвет понят, обе остались на
 * месте — бросок. Чёрный сам по себе не путается с отказом: у него
 * `a === '#000000'`, но проба от белого (`b`) при чёрном цвете меняется на
 * `'#000000'`, а не остаётся `'#ffffff'`, — условие требует ОБЕИХ проб сразу.
 */
export function normColour(css: string): string {
  if (!ctx) {
    ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('canvas недоступен')
  }
  ctx.fillStyle = '#000'
  ctx.fillStyle = css
  const fromBlack = ctx.fillStyle
  ctx.fillStyle = '#fff'
  ctx.fillStyle = css
  const fromWhite = ctx.fillStyle
  if (fromBlack === '#000000' && fromWhite === '#ffffff') {
    throw new Error(`не цвет CSS: «${css}»`)
  }
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = '#000'
  ctx.fillStyle = css
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return `rgba(${r}, ${g}, ${b}, ${Math.round((a! / 255) * 100) / 100})`
}

/** Первый узел селектора с ненулевой коробкой: скрытые копии не меряются. */
export function pick(doc: Document, selector: string): HTMLElement | null {
  for (const el of doc.querySelectorAll<HTMLElement>(selector)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}
