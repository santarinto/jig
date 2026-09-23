import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/styles.css'
import '../fonts/inter.css'
import './sidenav-lab.css'
import './card-lab.css'

import { Slider } from '../src/components/Slider/index.js'
import { Select } from '../src/components/Select/index.js'
import { Switch } from '../src/components/Toggle/index.js'
import { Calendar } from '../src/components/Calendar/index.js'
import { Card } from '../src/components/Form/index.js'

/* Calendar (C3) on the real component — the 42-cell grid plus the 4×4 marks is
   the densest thing in the system, so it is where a scale of 1.3 shows first. */

const MARKED = [
  '2026-07-01', '2026-07-03', '2026-07-08', '2026-07-15', '2026-07-22', '2026-07-24',
  '2026-06-03', '2026-06-10', '2026-06-17', '2026-06-24',
  '2026-08-05', '2026-08-12', '2026-08-19',
]
const TONED: Record<string, 'accent' | 'success' | 'warning' | 'error'> = {
  '2026-07-03': 'success',
  '2026-07-08': 'success',
  '2026-07-15': 'warning',
  '2026-07-22': 'error',
  '2026-07-24': 'accent',
}

function Stage({ theme, months, readOnly, toned, inCard, embedded, selected, onSelect }: {
  theme: 'light' | 'dark'; months: 1 | 2 | 3; readOnly: boolean; toned: boolean
  inCard: boolean; embedded: boolean; selected: string; onSelect: (d: string) => void
}) {
  const cal = (
    <Calendar
      year={2026}
      month={6}
      selectedId={selected}
      onSelect={onSelect}
      months={months}
      readOnly={readOnly}
      embedded={embedded}
      markedDates={toned ? undefined : MARKED}
      marks={toned ? TONED : undefined}
    />
  )
  return (
    <div className="pane" data-theme={theme}>
      <div className="pane__label">{theme}</div>
      <div className="cardp__stage">
        {inCard
          ? <Card title="Тренировки" subtitle="июль 2026" headerAction={<span style={{ color: 'var(--ds-text-muted)' }}>⋯</span>}>{cal}</Card>
          : cal}
      </div>
    </div>
  )
}

function Lab() {
  const [months, setMonths] = useState<1 | 2 | 3>(3)
  const [readOnly, setReadOnly] = useState(false)
  const [toned, setToned] = useState(false)
  const [inCard, setInCard] = useState(true)
  const [embedded, setEmbedded] = useState(false)
  const [uiScale, setUiScale] = useState(1)
  const [selected, setSelected] = useState('2026-07-24')

  // Только с корня — см. AGENTS.md.
  useEffect(() => {
    document.documentElement.style.setProperty('--ds-ui-scale', String(uiScale))
  }, [uiScale])

  return (
    <div className="lab">
      <aside className="lab__panel">
        <h1 className="lab__title">Calendar — лаборатория</h1>
        <p className="lab__hint">
          Настоящий компонент. Сетка из 42 ячеек и точки 4×4 — самое плотное место
          системы, тут масштаб виден раньше всего. Кликай по дням: выбор живой,
          пока не включён режим просмотра.
        </p>

        <div className="lab__group">
          <div className="lab__group-title">Календарь</div>
          <div className="lab__row">
            <Select label="Месяцев" value={String(months)}
              onChange={(e) => setMonths(Number(e.target.value) as 1 | 2 | 3)}
              options={[
                { value: '1', label: '1 — обычный выбор даты' },
                { value: '2', label: '2 месяца' },
                { value: '3', label: '3 — обзор для главной' },
              ]} />
          </div>
          <div className="lab__toggles">
            <Switch label="Отметки с тонами (иначе все акцентные)" checked={toned} onChange={(e) => setToned(e.target.checked)} />
            <Switch label="readOnly — только смотреть" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />
            <Switch label="Внутри Card" checked={inCard} onChange={(e) => setInCard(e.target.checked)} />
            <Switch label="embedded — без своей рамки и тени" checked={embedded} onChange={(e) => setEmbedded(e.target.checked)} />
          </div>
        </div>

        <div className="lab__group">
          <div className="lab__group-title">Проверка масштаба</div>
          <div className="lab__row">
            <Slider label="--ds-ui-scale" suffix="×" min={1} max={1.4} step={0.05}
              value={uiScale} onChange={setUiScale} />
          </div>
          <p className="lab__hint" style={{ margin: '8px 0 0' }}>
            Смотри на точки-отметки и на выходные: если что-то поедет, то здесь.
          </p>
        </div>

        <div className="lab__readout">{[
          '// Calendar',
          `месяцев:   ${months}`,
          `тона:      ${toned}`,
          `readOnly:  ${readOnly}`,
          `в Card:    ${inCard}`,
          `выбрано:   ${selected}`,
          `ui-scale:  ${uiScale}`,
        ].join('\n')}</div>
      </aside>

      <main className="lab__stage">
        <div className="lab__stage-head"><strong>Обе темы сразу</strong></div>
        <div className="lab__panes lab__panes--split">
          <Stage theme="light" months={months} readOnly={readOnly} toned={toned} inCard={inCard} embedded={embedded} selected={selected} onSelect={setSelected} />
          <Stage theme="dark" months={months} readOnly={readOnly} toned={toned} inCard={inCard} embedded={embedded} selected={selected} onSelect={setSelected} />
        </div>
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><Lab /></StrictMode>)
