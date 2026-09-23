import { useState } from 'react'
import { LineChart, type ChartSeries } from '../../src/components/LineChart/index.js'
import { BarChart } from '../../src/components/BarChart/index.js'
import { DonutChart } from '../../src/components/DonutChart/index.js'
import { EdgeBundling } from '../../src/components/EdgeBundling/index.js'
import { Heatmap } from '../../src/components/Heatmap/index.js'
import { FLARE_SAMPLE } from '../data/flare-sample.js'
import { DemoBlock } from '../demo-spec.js'

const LINE: ChartSeries[] = [
  {
    id: 'sales',
    label: 'Продажи',
    points: [
      { x: 'Пн', y: 12 }, { x: 'Вт', y: 18 }, { x: 'Ср', y: 15 },
      { x: 'Чт', y: 22 }, { x: 'Пт', y: 19 }, { x: 'Сб', y: 8 },
    ],
  },
]

const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май']
const BARS = [
  { id: 'in', label: 'Приход', values: [820, 940, 760, 1120, 1040] },
  { id: 'out', label: 'Расход', values: [610, 700, 690, 780, 720] },
]

/** Серии с закреплёнными слотами: поднабор ниже рисуется теми же цветами. */
const BARS_PINNED = [
  { id: 'in', label: 'Приход', values: [820, 940, 760, 1120, 1040], paletteSlot: 1 as const },
  { id: 'out', label: 'Расход', values: [610, 700, 690, 780, 720], paletteSlot: 2 as const },
  { id: 'refund', label: 'Возвраты', values: [40, 65, 30, 90, 55], paletteSlot: 3 as const },
]

const PIE = [
  { id: 'goods', label: 'Товары', value: 1240 },
  { id: 'services', label: 'Услуги', value: 860 },
  { id: 'rent', label: 'Аренда', value: 420 },
]

function heatDays() {
  const out = []
  for (let d = 1; d <= 28; d++) {
    const date = `2026-01-${String(d).padStart(2, '0')}`
    out.push({ date, value: (d * 7 + (d % 5) * 3) % 15 })
  }
  return out
}

export function ChartsSection() {
  const [tension, setTension] = useState(0.85)

  return (
    <section className="demo-section" id="charts">
      <h2 className="demo-section__title">Charts</h2>
      <div className="demo-grid demo-grid--1">
        <p style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-muted)', margin: '0 0 8px' }}>
          EdgeBundling — hierarchical edge bundling (D3). Наведите на подпись — подсветятся связи.
        </p>
        <div className="demo-row" style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 'var(--ds-fs-sm)' }}>
            tension {tension.toFixed(2)}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={tension}
              onChange={(e) => setTension(Number(e.target.value))}
              style={{ marginLeft: 8, verticalAlign: 'middle' }}
            />
          </label>
        </div>
        <DemoBlock
          name="EdgeBundling"
          code={'<EdgeBundling items={items} size={560} tension={0.85} ariaLabel="…" />'}
        >
          <EdgeBundling
            items={FLARE_SAMPLE}
            size={560}
            tension={tension}
            ariaLabel="Зависимости классов flare"
          />
        </DemoBlock>
        <DemoBlock
          name="LineChart"
          block
          code={'<LineChart series={series} ariaLabel="Продажи по дням" />'}
        >
          <LineChart series={LINE} ariaLabel="Продажи по дням" />
        </DemoBlock>
        <DemoBlock
          name="BarChart"
          block
          code={'<BarChart categories={months} series={series} ariaLabel="Движение средств" />'}
        >
          <BarChart categories={MONTHS} series={BARS} ariaLabel="Движение средств" />
        </DemoBlock>
        <DemoBlock
          name="BarChart: закреплённые слоты палитры"
          block
          code={'<BarChart categories={months} series={[\n  { id: \'out\', label: \'Расход\', values: expenses, paletteSlot: 2 },\n  { id: \'refund\', label: \'Возвраты\', values: refunds, paletteSlot: 3 },\n]} ariaLabel="Расход и возвраты" />'}
        >
          <BarChart categories={MONTHS} series={BARS_PINNED} ariaLabel="Приход, расход и возвраты" />
          <BarChart
            categories={MONTHS}
            series={BARS_PINNED.filter((s) => s.id !== 'in')}
            ariaLabel="Расход и возвраты"
          />
        </DemoBlock>
        <DemoBlock
          name="DonutChart"
          code={'<DonutChart data={data} center="sumLabel" />'}
        >
          <DonutChart data={PIE} center="sumLabel" />
        </DemoBlock>
        <DemoBlock
          name="Heatmap"
          block
          code={'<Heatmap data={days} from="2026-01-01" to="2026-01-28" legend />'}
        >
          <Heatmap data={heatDays()} from="2026-01-01" to="2026-01-28" legend />
        </DemoBlock>
      </div>
    </section>
  )
}
