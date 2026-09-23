/**
 * Границы оси, раздвинутые до читаемого шага, чтобы тики вставали на круглые
 * числа.
 *
 * Жил в `BarChart`. Общим стал на DS-275: у `LineChart` шаг был
 * `(max − min) / 4` от данных с запасом 8 %, и ось печатала 19.8 / 45.9 / 72 /
 * 98.1 — числа, по которым глаз не отсчитывает, а читатель ищет смысл, которого
 * в них нет. Два графика на одном дашборде обязаны размечать ось одинаково.
 *
 * Считаются оба конца, а не только верх: шкала от нуля давала отрицательному
 * значению столбец отрицательной длины, уходящий за холст, а ряду целиком ниже
 * нуля — верх 1. При `lo = 0` для неотрицательных данных результат прежний.
 */
export function niceScale(lo: number, hi: number, ticks = 4) {
  if (!(hi - lo > 0)) return { lo: 0, hi: 1, step: 1 / ticks }
  const raw = (hi - lo) / ticks
  const mag = 10 ** Math.floor(Math.log10(raw))
  const n = raw / mag
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag
  return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step }
}

/**
 * Значения тиков от `lo` до `hi` с шагом `step`. Через индекс, а не накоплением,
 * и с отрезанием хвоста двоичной дроби: `0.1 × 3` иначе печатается как
 * `0.30000000000000004`.
 */
export function scaleTicks({ lo, hi, step }: { lo: number; hi: number; step: number }): number[] {
  return Array.from(
    { length: Math.round((hi - lo) / step) + 1 },
    (_, i) => +(lo + step * i).toPrecision(12),
  )
}
