import { useEffect, useRef, useState } from 'react'

/**
 * Rendered size of the plot box, in CSS pixels.
 *
 * Charts here draw 1:1 instead of stretching a fixed viewBox: a viewBox scales
 * its text along with the geometry, so the same chart on a wide dashboard card
 * came out with axis labels several times too large.
 *
 * The box height is set in CSS as `height * var(--ds-ui-scale)`, so the measured
 * height divided by the requested one *is* the UI scale — which is how the
 * caller gets the factor for paddings without reading custom properties back.
 *
 * Falls back to the requested height (and a sane width) where ResizeObserver is
 * unavailable: SSR and jsdom, where nothing has a layout anyway.
 */
export function useChartBox(height: number, fallbackWidth = 520) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: fallbackWidth, height })

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height: h } = entry!.contentRect
      if (width > 0 && h > 0) setBox({ width: Math.round(width), height: Math.round(h) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return [ref, box.width, box.height, box.height / height] as const
}
