/**
 * Categorical series palette for charts (LineChart, and later Bar/Donut).
 * Values live as `--ds-chart-1` … `--ds-chart-8` in tokens.css (both themes).
 * Not semantic status colors — series index ≠ “error/success”.
 */
export const CHART_SERIES_COUNT = 8 as const

/**
 * Слот палитры, закрепляемый за рядом (`paletteSlot`, DS-185): номер
 * токена `--ds-chart-N`, с единицы — как в имени токена, а не как индекс.
 * Литеральный союз, а не `number`: 9 и 0 — ошибка компиляции, а не заворот.
 */
export type ChartPaletteSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

/** CSS custom-property refs, index 0 → `--ds-chart-1`. */
export const chartSeriesVars: readonly string[] = Array.from(
  { length: CHART_SERIES_COUNT },
  (_, i) => `var(--ds-chart-${i + 1})`,
)

/** `chartSeriesVar(0)` → `var(--ds-chart-1)` */
export function chartSeriesVar(index: number): string {
  const i = ((index % CHART_SERIES_COUNT) + CHART_SERIES_COUNT) % CHART_SERIES_COUNT
  return chartSeriesVars[i]
}
