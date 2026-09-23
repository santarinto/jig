import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'

/**
 * Шрифт подписи оси, снятый С НАСТОЯЩЕГО УЗЛА после монтирования, и эпоха
 * загрузки веб-шрифтов — для `textWidth`.
 *
 * Вынесен из `BarChart` на DS-275, когда поле по содержимому понадобилось
 * второму графику. Размер подписи едет по `--ds-ui-scale`, семейство задаёт
 * тема, и угаданная константа разошлась бы с нарисованным. До замера (SSR,
 * jsdom) шрифта нет, и `textWidth` работает оценкой.
 *
 * Эффект без зависимостей, но состояние меняется только при другой строке —
 * лишнего прохода нет. Эпоха растёт, когда догружается веб-шрифт: замер
 * запасным семейством дал бы поле не той ширины, и оно осталось бы таким до
 * ресайза. Эпоха кладётся в зависимости раскладки и телом не читается.
 */
export function useAxisFont(
  svgRef: RefObject<SVGSVGElement | null>, selector: string, enabled: boolean,
): { font: string | null; epoch: number } {
  const [font, setFont] = useState<string | null>(null)
  useLayoutEffect(() => {
    if (!enabled) return
    const el = svgRef.current?.querySelector(selector)
    if (!el || typeof getComputedStyle === 'undefined') return
    const cs = getComputedStyle(el)
    if (!cs.fontSize || !cs.fontFamily) return
    const next = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    setFont((prev) => (prev === next ? prev : next))
  })
  const [epoch, setEpoch] = useState(0)
  useEffect(() => {
    if (!enabled || typeof document === 'undefined' || !document.fonts) return
    let live = true
    const bump = () => { if (live) setEpoch((e) => e + 1) }
    document.fonts.ready.then(bump)
    document.fonts.addEventListener?.('loadingdone', bump)
    return () => { live = false; document.fonts.removeEventListener?.('loadingdone', bump) }
  }, [enabled])
  return { font, epoch }
}
