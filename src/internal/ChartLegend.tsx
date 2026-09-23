import { useState } from 'react'
import '../styles/chart-legend.css'

/**
 * Легенда графика: ряд чипов-переключателей, по одному на серию.
 *
 * До 1.42.0 её разметка стояла двумя копиями — в `LineChart` и `BarChart`, — и
 * копии совпадали вплоть до `aria-pressed` и порядка классов. Расходились они
 * только префиксом блока, поэтому он и стал пропом: имена `ds-chart__*` и
 * `ds-bar__*` потребитель уже видит у себя, и сводить их к третьему имени
 * значило бы менять чужой контракт ради нашей внутренней чистоты.
 *
 * Состояние живёт в графике, а не здесь: скрытые серии нужны и раскладке —
 * `visible` считается до всякой легенды. Поэтому хук отдельно от разметки.
 */
export interface LegendSeries { id: string; label: string }

export function useSeriesToggle() {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  return { hidden, toggle }
}

export interface ChartLegendProps {
  /** Префикс блока: чей это график. `ds-eventcal` — легенда календарей. */
  block: 'ds-chart' | 'ds-bar' | 'ds-eventcal'
  series: LegendSeries[]
  /**
   * Цвет точки по `id` — ТОТ ЖЕ расчёт, которым график красит отметки
   * (`assignPaletteSlots`, DS-185). Своего индекса у легенды больше нет:
   * с закреплённым слотом индекс чипа и цвет ряда расходятся, и легенда
   * называла бы ряд чужим цветом.
   */
  colors: ReadonlyMap<string, string>
  hidden: Set<string>
  onToggle: (id: string) => void
}

export function ChartLegend({ block, series, colors, hidden, onToggle }: ChartLegendProps) {
  return (
    <div className={`${block}__legend`}>
      {series.map((s) => {
        const off = hidden.has(s.id)
        return (
          <button
            key={s.id}
            type="button"
            className={[`${block}__chip`, off && 'is-off'].filter(Boolean).join(' ')}
            aria-pressed={!off}
            onClick={() => onToggle(s.id)}
          >
            <span className={`${block}__chip-dot`} style={{ background: colors.get(s.id) }} />
            {s.label}
          </button>
        )
      })}
    </div>
  )
}
