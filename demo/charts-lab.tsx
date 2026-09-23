import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/styles.css'
import '../fonts/inter.css'
import './sidenav-lab.css'
import './card-lab.css'
import './charts-lab.css'

import { Slider } from '../src/components/Slider/index.js'
import { Select } from '../src/components/Select/index.js'
import { Switch } from '../src/components/Toggle/index.js'
import { Card } from '../src/components/Form/index.js'
import { BarChart } from '../src/components/BarChart/index.js'
import { DonutChart } from '../src/components/DonutChart/index.js'

/* ------------------------------------------------------------------ *
 * Charts LAB — C7 BarChart и C8 DonutChart, уже настоящие компоненты.
 * Ползунки дёргают их публичные пропсы, так что всё увиденное здесь
 * воспроизводится в портале одной строкой JSX.
 * ------------------------------------------------------------------ */

const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн']
const BARS = [
  { id: 'in', label: 'Поступления', values: [820, 940, 760, 1120, 1040, 1240] },
  { id: 'out', label: 'Списания', values: [610, 700, 690, 780, 720, 860] },
  { id: 'tax', label: 'Налоги', values: [180, 210, 190, 240, 230, 270] },
]
// Отклонение от плана — данные со знаком, ради которых у шкалы две границы.
const SIGNED = [
  { id: 'plan', label: 'Отклонение от плана', values: [120, -80, 45, -160, 70, -30] },
  { id: 'fact', label: 'Корректировки', values: [-40, 60, -25, 90, -55, 35] },
]
const PIE = [
  { id: 'goods', label: 'Товары', value: 1240 },
  { id: 'services', label: 'Услуги', value: 860 },
  { id: 'rent', label: 'Аренда', value: 420 },
  { id: 'salary', label: 'Зарплата', value: 980 },
  { id: 'other', label: 'Прочее', value: 260 },
]

interface BarCfg {
  horizontal: boolean; stacked: boolean; values: boolean
  grid: boolean; axis: boolean; radius: number; gap: number; series: 1 | 2 | 3
  signed: boolean
}
interface DonutCfg {
  thickness: number; center: 'none' | 'sum' | 'sumLabel'
  legend: 'right' | 'bottom' | 'none'; legendValue: 'none' | 'value' | 'percent'; segGap: number
}

function Stage({ theme, bar, donut }: { theme: 'light' | 'dark'; bar: BarCfg; donut: DonutCfg }) {
  return (
    <div className="pane" data-theme={theme}>
      <div className="pane__label">{theme}</div>
      <div className="cardp__stage cp__stack">
        <Card title="Движение средств" subtitle="6 месяцев" headerAction={<span style={{ color: 'var(--ds-text-muted)' }}>⋯</span>}>
          <BarChart
            categories={MONTHS}
            series={(bar.signed ? SIGNED : BARS).slice(0, bar.series)}
            orientation={bar.horizontal ? 'horizontal' : 'vertical'}
            mode={bar.stacked ? 'stacked' : 'grouped'}
            valueLabels={bar.values}
            grid={bar.grid}
            axis={bar.axis}
            radius={bar.radius}
            groupGap={bar.gap}
            ariaLabel="Движение средств по месяцам"
          />
        </Card>
        <Card title="Структура расходов" subtitle="июль 2026" headerAction={<span style={{ color: 'var(--ds-text-muted)' }}>⋯</span>}>
          <DonutChart
            data={PIE}
            thickness={donut.thickness}
            center={donut.center}
            legend={donut.legend}
            legendValue={donut.legendValue}
            sliceGap={donut.segGap}
            ariaLabel="Структура расходов"
          />
        </Card>
      </div>
    </div>
  )
}

function Lab() {
  // Значения по умолчанию — те, что ты утвердил по итогам прототипов.
  const [bar, setBar] = useState<BarCfg>({
    horizontal: false, stacked: false, values: true, grid: true,
    axis: true, radius: 5, gap: 10, series: 2, signed: false,
  })
  const [donut, setDonut] = useState<DonutCfg>({
    thickness: 0.4, center: 'sumLabel', legend: 'right', legendValue: 'value', segGap: 1.5,
  })
  const [uiScale, setUiScale] = useState(1)
  const sb = <K extends keyof BarCfg>(k: K, v: BarCfg[K]) => setBar((c) => ({ ...c, [k]: v }))
  const sd = <K extends keyof DonutCfg>(k: K, v: DonutCfg[K]) => setDonut((c) => ({ ...c, [k]: v }))

  useEffect(() => {
    document.documentElement.style.setProperty('--ds-ui-scale', String(uiScale))
  }, [uiScale])

  return (
    <div className="lab">
      <aside className="lab__panel">
        <h1 className="lab__title">Графики — лаборатория</h1>
        <p className="lab__hint">
          Настоящие <code>BarChart</code> и <code>DonutChart</code>. Ползунки — это их
          пропсы; клик по фишке легенды убирает серию из масштаба, наведение на
          столбец показывает подпись.
        </p>

        <div className="lab__group">
          <div className="lab__group-title">BarChart</div>
          <div className="lab__row">
            <Select label="Серий" value={String(bar.series)}
              onChange={(e) => sb('series', Number(e.target.value) as 1 | 2 | 3)}
              options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }]} />
            <Slider label="Зазор между группами" suffix="px" min={4} max={28} step={2}
              value={bar.gap} onChange={(v) => sb('gap', v)} />
            <Slider label="Скругление столбцов" suffix="px" min={0} max={10} step={1}
              value={bar.radius} onChange={(v) => sb('radius', v)} />
          </div>
          <div className="lab__toggles">
            <Switch label="Данные со знаком (есть отрицательные)" checked={bar.signed} onChange={(e) => sb('signed', e.target.checked)} />
            <Switch label="Горизонтальные" checked={bar.horizontal} onChange={(e) => sb('horizontal', e.target.checked)} />
            <Switch label="Стековый режим" checked={bar.stacked} onChange={(e) => sb('stacked', e.target.checked)} />
            <Switch label="Подписи значений" checked={bar.values} onChange={(e) => sb('values', e.target.checked)} />
            <Switch label="Сетка" checked={bar.grid} onChange={(e) => sb('grid', e.target.checked)} />
            <Switch label="Оси и подписи" checked={bar.axis} onChange={(e) => sb('axis', e.target.checked)} />
          </div>
        </div>

        <div className="lab__group">
          <div className="lab__group-title">DonutChart</div>
          <div className="lab__row">
            <Slider label="Толщина кольца" min={0.15} max={0.7} step={0.01}
              value={donut.thickness} onChange={(v) => sd('thickness', v)} />
            <Slider label="Зазор между долями" suffix="°" min={0} max={6} step={0.5}
              value={donut.segGap} onChange={(v) => sd('segGap', v)} />
            <Select label="В центре" value={donut.center}
              onChange={(e) => sd('center', e.target.value as DonutCfg['center'])}
              options={[
                { value: 'sumLabel', label: '«Всего» + сумма' },
                { value: 'sum', label: 'Только сумма' },
                { value: 'none', label: 'Пусто' },
              ]} />
            <Select label="Легенда" value={donut.legend}
              onChange={(e) => sd('legend', e.target.value as DonutCfg['legend'])}
              options={[
                { value: 'right', label: 'Справа' },
                { value: 'bottom', label: 'Снизу' },
                { value: 'none', label: 'Без легенды' },
              ]} />
            <Select label="В легенде" value={donut.legendValue}
              onChange={(e) => sd('legendValue', e.target.value as DonutCfg['legendValue'])}
              options={[
                { value: 'value', label: 'Суммы' },
                { value: 'percent', label: 'Проценты' },
                { value: 'none', label: 'Только названия' },
              ]} />
          </div>
        </div>

        <div className="lab__group">
          <div className="lab__group-title">Проверка масштаба</div>
          <div className="lab__row">
            <Slider label="--ds-ui-scale" suffix="×" min={1} max={1.4} step={0.05}
              value={uiScale} onChange={setUiScale} />
          </div>
          <p className="lab__hint" style={{ margin: '8px 0 0' }}>
            Столбчатый график считает координаты от фактической ширины, поэтому
            подписи здесь растут вместе с рамкой, а не быстрее неё.
          </p>
        </div>
      </aside>

      <main className="lab__stage">
        <div className="lab__stage-head"><strong>Обе темы сразу</strong></div>
        <div className="lab__panes lab__panes--split">
          <Stage theme="light" bar={bar} donut={donut} />
          <Stage theme="dark" bar={bar} donut={donut} />
        </div>
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><Lab /></StrictMode>)
