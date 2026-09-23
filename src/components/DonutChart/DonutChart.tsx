import type { ChartPaletteSlot } from '../../../tokens/chartPalette.js'
import { assignPaletteSlots } from '../../internal/paletteSlots.js'
import { chartLabel } from '../../internal/chartLabel.js'
import { useDsText, useDsLocale } from '../../dictionary/DsText.js'
import { numberFormat } from '../../internal/intl.js'
import './DonutChart.css'

export interface DonutSlice {
  id: string
  label: string
  value: number
  /**
   * Закреплённый слот палитры `--ds-chart-1..8` (DS-185) — как у рядов
   * `LineChart` и `BarChart`: доля «Аренда» остаётся своим цветом и на
   * кольце, где «Прочее» отфильтровано. Один слот у двух долей — исключение.
   */
  paletteSlot?: ChartPaletteSlot
}

export interface DonutChartProps {
  data: DonutSlice[]
  /** Ring diameter in px before `--ds-ui-scale`. */
  size?: number
  /** Ring width as a share of the radius: 0.4 leaves a hole of 60 %. */
  thickness?: number
  /** What sits in the hole: nothing, the total, or the total under a caption. */
  center?: 'none' | 'sum' | 'sumLabel'
  centerLabel?: string
  legend?: 'right' | 'bottom' | 'none'
  /** Second column of the legend. */
  legendValue?: 'none' | 'value' | 'percent'
  /** Gap between slices, in degrees. */
  sliceGap?: number
  format?: (value: number) => string
  ariaLabel?: string
  className?: string
}

// Локаль числа — из `DsText` (DS-184), а не прибита к `ru-RU`: подпись
// оси и подпись значения на одном экране обязаны разделять один разделитель
// разрядов.
const defaultFormat = (locale: string) => (n: number) => numberFormat(locale).format(n)

export function DonutChart({
  data, size = 180, thickness = 0.4,
  center = 'sumLabel', centerLabel,
  legend = 'right', legendValue = 'value', sliceGap = 1.5,
  format, ariaLabel, className,
}: DonutChartProps) {
  const t = useDsText()
  const locale = useDsLocale()
  // Умолчание перенесено из деструктуризации в тело: оно зависит от локали, а
  // значение по умолчанию в сигнатуре вычисляется вне компонента и хука не видит.
  const fmt = format ?? defaultFormat(locale)
  const c = size / 2
  const R = c - 4
  // Кольцо остаётся кольцом при любом вводе: за единицей внутренний радиус
  // уходит в минус, а на нуле дырка съедает всё кольцо целиком.
  const r = R * (1 - Math.min(0.95, Math.max(0.05, thickness)))
  // Доля целого не бывает отрицательной. Обрезать надо и доли, и сумму разом:
  // доли от обрезанных значений при сумме от сырых дают 175 % на [70, −30],
  // и кольцо проворачивается больше оборота, ложась само на себя.
  const values = data.map((d) => Math.max(0, d.value))
  const total = values.reduce((s, v) => s + v, 0)

  const point = (rad: number, turns: number): [number, number] => {
    const a = turns * 2 * Math.PI - Math.PI / 2
    return [c + rad * Math.cos(a), c + rad * Math.sin(a)]
  }
  const arc = (from: number, to: number) => {
    const large = to - from > 0.5 ? 1 : 0
    const [x0, y0] = point(R, from), [x1, y1] = point(R, to)
    const [x2, y2] = point(r, to), [x3, y3] = point(r, from)
    return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${r} ${r} 0 ${large} 0 ${x3} ${y3} Z`
  }

  const colors = assignPaletteSlots(data, 'DonutChart')
  let acc = 0
  const slices = data.map((d, i) => {
    const value = values[i]!
    const frac = total > 0 ? value / total : 0
    // Половина зазора снимается с каждого края доли, но не больше половины
    // самой доли — иначе узкая доля вывернулась бы и легла дугой назад.
    const half = Math.min(sliceGap / 720, frac / 2)
    const from = acc + half
    // Math.max, а не просто разность: при равенстве краёв она даёт «минус ноль»
    // размером в один ulp, и дуга уходит назад на неразличимый, но обратный ход.
    const path = arc(from, Math.max(from, acc + frac - half))
    acc += frac
    return { ...d, value, frac, path, color: colors.get(d.id) }
  })

  return (
    <div className={['ds-donut', `ds-donut--${legend}`, className].filter(Boolean).join(' ')}>
      <div
        className="ds-donut__ring"
        style={{ width: `calc(${size}px * var(--ds-ui-scale, 1))` }}
      >
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="ds-donut__svg"
          role="img"
          aria-label={chartLabel(ariaLabel, t['chart.donut'], data.map((d) => d.label))}
        >
          {slices.map((s) => (
            <path key={s.id} className="ds-donut__slice" d={s.path} style={{ fill: s.color }}>
              <title>{`${s.label}: ${fmt(s.value)}`}</title>
            </path>
          ))}
        </svg>
        {center !== 'none' && (
          <div className="ds-donut__center">
            {center === 'sumLabel' && <div className="ds-donut__center-label">{centerLabel ?? t['donutChart.total']}</div>}
            <div className="ds-donut__center-value">{fmt(total)}</div>
          </div>
        )}
      </div>

      {legend !== 'none' && (
        <ul className="ds-donut__legend">
          {slices.map((s) => (
            <li key={s.id} className="ds-donut__row">
              <span className="ds-donut__dot" style={{ background: s.color }} />
              <span className="ds-donut__label">{s.label}</span>
              {legendValue === 'value' && <span className="ds-donut__value">{fmt(s.value)}</span>}
              {legendValue === 'percent' && <span className="ds-donut__value">{Math.round(s.frac * 100)} %</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
