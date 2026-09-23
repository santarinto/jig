import { StrictMode, useState, type CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/styles.css'
import '../fonts/inter.css'
// Раскладка лаборатории (.lab, .lab__panel, .pane) живёт в этих двух — так же,
// как её берёт charts-lab. Собственный файл добавляет только своё.
import './sidenav-lab.css'
import './card-lab.css'
import './charts-lab.css'
import './palette-lab.css'

import { Select } from '../src/components/Select/index.js'
import { Switch } from '../src/components/Toggle/index.js'
import { Card } from '../src/components/Form/index.js'
import { LineChart } from '../src/components/LineChart/index.js'
import { BarChart } from '../src/components/BarChart/index.js'
import { DonutChart } from '../src/components/DonutChart/index.js'
import {
  PALETTES, SIM, METRICS, BENCHMARKS, CVD_MATRICES,
  type PalKey, type Vision, type Theme,
} from './palette-data.js'

/* ------------------------------------------------------------------ *
 * Palette LAB — DS-122.
 *
 * Отвечает на ОДИН вопрос, которого нет в числах: числа сняты с больших
 * однородных полей, а серия на графике бывает линией в 2px. При малых
 * угловых размерах падает чувствительность S-конуса, то есть порог
 * различения на тонкой линии ВЫШЕ, чем на плашке при том же ΔE. Насколько —
 * не считается, смотрится.
 *
 * Поэтому здесь настоящие компоненты и настоящие размеры: LineChart рисует
 * stroke-width 2 (spark 1.5), DonutChart разделяет доли обводкой 0.5,
 * BarChart заливает. Стенд ничего из этого не задаёт сам — он только
 * подменяет --ds-chart-1..8 и накладывает симуляцию зрения.
 * ------------------------------------------------------------------ */

const PAL_LABEL: Record<PalKey, string> = {
  tokens: 'как есть — из tokens.css',
  previous: 'прежняя, до DS-122',
}
const VISION_LABEL: Record<Vision, string> = {
  normal: 'норма',
  protan: 'протанопия (нет L-конуса, ~1% мужчин)',
  deutan: 'дейтеранопия (нет M-конуса, ~1%; аномалия ~6%)',
  tritan: 'тританопия (нет S-конуса, редко)',
}

const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг']
const SERIES_NAMES = ['Курьеры', 'Доставка', 'Аренда', 'Логистика', 'Сервис', 'Страховка', 'Топливо', 'Прочее']

/** Восемь серий: их и надо различить. Числа ровные — вопрос про цвет, не про данные. */
const LINES = SERIES_NAMES.map((label, i) => ({
  id: `s${i}`,
  label,
  points: MONTHS.map((m, x) => ({
    x: m,
    y: 400 + i * 90 + Math.round(70 * Math.sin((x + i * 1.7) * 0.9)),
  })),
}))
const BARS = SERIES_NAMES.map((label, i) => ({
  id: `s${i}`,
  label,
  values: MONTHS.map((_, x) => 120 + ((i * 37 + x * 23) % 90)),
}))
const PIE = SERIES_NAMES.map((label, i) => ({ id: `s${i}`, label, value: 300 - i * 28 }))

/**
 * Матрицы Machado 2009 действуют в ЛИНЕЙНОМ RGB — поэтому
 * color-interpolation-filters задан ЯВНО. По спеке linearRGB и есть значение
 * по умолчанию, но полагаться на это нельзя: браузер, ставший считать в sRGB,
 * дал бы правдоподобно выглядящую и НЕВЕРНУЮ симуляцию, а вся задача про то,
 * что правдоподобная картинка проходит любую проверку на глаз.
 */
function Filters() {
  return (
    <svg className="pl__defs" aria-hidden="true">
      <defs>
        {(['protan', 'deutan', 'tritan'] as const).map((v) => {
          const k = CVD_MATRICES[v]
          const values = [
            k[0], k[1], k[2], 0, 0,
            k[3], k[4], k[5], 0, 0,
            k[6], k[7], k[8], 0, 0,
            0, 0, 0, 1, 0,
          ].join(' ')
          return (
            <filter id={`cvd-${v}`} key={v} colorInterpolationFilters="linearRGB">
              <feColorMatrix type="matrix" values={values} />
            </filter>
          )
        })}
      </defs>
    </svg>
  )
}

/**
 * Вариант «как есть» НЕ подставляет ничего: цвета берутся из tokens.css сами.
 * Иначе стенд держал бы вторую копию принятой палитры и разошёлся бы с
 * токенами молча — тот самый отказ, ради которого вся задача и затевалась.
 */
const paletteVars = (key: PalKey, theme: Theme): Record<string, string> =>
  key === 'tokens'
    ? {}
    : Object.fromEntries(PALETTES[key][theme].map((hex, i) => [`--ds-chart-${i + 1}`, hex]))

/**
 * Самопроверка фильтра. Слева плашка под фильтром браузера, справа — тот же
 * цвет, ПОСЧИТАННЫЙ заранее тем же кодом, что дал все числа задачи, и залитый
 * без фильтра. Совпали — браузер считает то же самое. Разошлись — стенд врёт,
 * и верить ему нельзя ни в чём остальном.
 */
function FilterSelftest({ pal, theme, vision }: { pal: PalKey; theme: Theme; vision: Vision }) {
  const src = PALETTES[pal][theme]
  const expect = SIM[pal][theme][vision]
  return (
    <div className="pl__selftest">
      <div className="pl__selftest-title">
        Самопроверка фильтра — верхний ряд под фильтром браузера, нижний посчитан заранее.
        {vision === 'normal' ? ' При норме ряды тождественны по построению.' : ' Ряды обязаны совпасть.'}
      </div>
      <div className="pl__swatches" style={vision === 'normal' ? undefined : { filter: `url(#cvd-${vision})` }}>
        {src.map((c) => <i key={c} style={{ background: c }} />)}
      </div>
      <div className="pl__swatches">
        {expect.map((c, i) => <i key={i} style={{ background: c }} />)}
      </div>
    </div>
  )
}

function Stage({ pal, theme, vision, spark }: { pal: PalKey; theme: Theme; vision: Vision; spark: boolean }) {
  const worst = METRICS[pal][theme].worst
  return (
    <div className="pane pl__pane" data-theme={theme} style={paletteVars(pal, theme)}>
      <div className="pane__label">
        {theme} · худшая пара {worst.toFixed(2)}
        <span className={worst >= BENCHMARKS['Tol bright'] ? 'pl__ok' : 'pl__bad'}>
          {worst >= BENCHMARKS['Okabe-Ito'] ? ' выше Okabe-Ito' : worst >= BENCHMARKS['Tol bright'] ? ' выше Tol bright' : ' ниже всех эталонов'}
        </span>
      </div>

      <div className="pl__stage" style={vision === 'normal' ? undefined : { filter: `url(#cvd-${vision})` }}>
        <Card title="Линии — stroke-width 2" subtitle="восемь серий на одной оси">
          <LineChart series={LINES} height={190} curve="straight" ariaLabel="Восемь серий" />
        </Card>

        {spark && (
          <Card title="Спарклайны — stroke-width 1.5" subtitle="худший случай: тонко и без легенды">
            {/* Каждому спарклайну — СВОЙ цвет серии, локальной подменой chart-1.
                Без этого все восемь выходят бирюзовыми: LineChart раскрашивает
                по индексу ВНУТРИ своего набора, а набор здесь из одной серии.
                Карточка тогда показывала бы один цвет, называясь «самое тонкое,
                что рисует система», — то есть выглядела бы работающей. */}
            <div className="pl__sparks">
              {LINES.map((s, i) => (
                <div
                  className="pl__spark"
                  key={s.id}
                  style={{ '--ds-chart-1': PALETTES[pal][theme][i] } as CSSProperties}
                >
                  <LineChart series={[s]} variant="spark" height={34} fill="line" lastPoint ariaLabel={s.label} />
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card title="Столбцы — заливка" subtitle="стек: позиция разводит серии вторым каналом">
          <BarChart categories={MONTHS} series={BARS} mode="stacked" grid axis ariaLabel="Стек восьми серий" />
        </Card>

        <Card title="Доли и легенда" subtitle="срезы соседствуют по построению; точка легенды мелкая">
          <DonutChart data={PIE} thickness={0.4} center="sumLabel" legend="right" legendValue="percent" sliceGap={1.5} ariaLabel="Восемь долей" />
        </Card>

        <Card title="Одно и то же, разным размером" subtitle="сверху плашка, снизу полоса в 2px — числа сняты с верхнего">
          <div className="pl__sizes">
            <div className="pl__swatches pl__swatches--big">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <i key={i} style={{ background: `var(--ds-chart-${i})` }} />)}
            </div>
            <div className="pl__rules">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <i key={i} style={{ background: `var(--ds-chart-${i})` }} />)}
            </div>
          </div>
        </Card>
      </div>

      <FilterSelftest pal={pal} theme={theme} vision={vision} />
    </div>
  )
}

function Lab() {
  const [pal, setPal] = useState<PalKey>('tokens')
  const [vision, setVision] = useState<Vision>('deutan')
  const [spark, setSpark] = useState(true)
  const mL = METRICS[pal].light
  const mD = METRICS[pal].dark

  return (
    <div className="lab">
      <Filters />
      <aside className="lab__panel">
        <h1 className="lab__title">Палитра серий — DS-122</h1>
        <p className="lab__hint">
          Настоящие <code>LineChart</code>, <code>BarChart</code>, <code>DonutChart</code> на настоящих
          токенах. Стенд подменяет только <code>--ds-chart-1..8</code> и накладывает симуляцию зрения.
        </p>

        <div className="lab__group">
          <div className="lab__group-title">Палитра</div>
          <Select label="Набор" value={pal} onChange={(e) => setPal(e.target.value as PalKey)}
            options={(Object.keys(PAL_LABEL) as PalKey[]).map((k) => ({ value: k, label: PAL_LABEL[k] }))} />
          <div className="pl__nums">
            <div>худшая пара из 28, по всем четырём зрениям:</div>
            <div><b>светлая {mL.worst.toFixed(2)}</b> · <b>тёмная {mD.worst.toFixed(2)}</b></div>
            <div className="pl__bench">
              планка работающих палитр: Tol bright {BENCHMARKS['Tol bright'].toFixed(2)} ·
              Okabe-Ito {BENCHMARKS['Okabe-Ito'].toFixed(2)} · Tol muted {BENCHMARKS['Tol muted'].toFixed(2)}
            </div>
          </div>
        </div>

        <div className="lab__group">
          <div className="lab__group-title">Зрение</div>
          <Select label="Симуляция" value={vision} onChange={(e) => setVision(e.target.value as Vision)}
            options={(Object.keys(VISION_LABEL) as Vision[]).map((k) => ({ value: k, label: VISION_LABEL[k] }))} />
          <p className="lab__hint" style={{ margin: '8px 0 0' }}>
            Machado 2009, severity 1.0, в линейном RGB. Дейтеранопия — та, на которой
            нынешняя палитра проваливается сильнее всего.
          </p>
        </div>

        <div className="lab__group">
          <div className="lab__group-title">Формы</div>
          <Switch label="Спарклайны (1.5px — самое тонкое, что рисует система)"
            checked={spark} onChange={(e) => setSpark(e.target.checked)} />
        </div>

        <div className="lab__group">
          <div className="lab__group-title">Что тут смотреть</div>
          <p className="lab__hint">
            Числа сняты с больших полей. Вопрос, которого в них нет: на какой ТОЛЩИНЕ
            пара, проходящая по числам, перестаёт различаться. Ставь дейтеранопию и
            сравнивай верхнюю карточку (2px) с нижней плашкой в последней — один и тот
            же цвет, разный размер. Переключение на «прежнюю» показывает, зачем это
            менялось: при дейтеранопии её восемь серий читались как три.
          </p>
        </div>
      </aside>

      <main className="lab__stage">
        <div className="lab__stage-head">
          <strong>{PAL_LABEL[pal]}</strong> · {VISION_LABEL[vision]}
        </div>
        <div className="lab__panes lab__panes--split">
          <Stage pal={pal} theme="light" vision={vision} spark={spark} />
          <Stage pal={pal} theme="dark" vision={vision} spark={spark} />
        </div>
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><Lab /></StrictMode>)
