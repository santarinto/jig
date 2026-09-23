import { StrictMode, useEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/styles.css'
// Без этого демо рисуется системным фолбэком, а не Inter.
import '../fonts/inter.css'
import './sidenav-lab.css'
import './card-lab.css'

import { Slider } from '../src/components/Slider/index.js'
import { Select } from '../src/components/Select/index.js'
import { Switch } from '../src/components/Toggle/index.js'
import { Badge } from '../src/components/Badge/index.js'
import { Button } from '../src/components/Button/index.js'
import { KeyValueList } from '../src/components/KeyValueList/index.js'
import { MetricStrip } from '../src/components/MetricStrip/index.js'
import { LineChart } from '../src/components/LineChart/index.js'
import { Card } from '../src/components/Form/index.js'
import { IconChevronRight, IconArrowRight, IconDots } from '@tabler/icons-react'

/* ------------------------------------------------------------------ *
 * Card LAB — task C2. The card below is a PROTOTYPE built from --ds-*
 * tokens; the shipped Card only has title/footer today. Pick the header
 * action, the density and the padding, then send me the readout.
 * ------------------------------------------------------------------ */

type ActionKind = 'link' | 'linkArrow' | 'ghost' | 'icon' | 'kebab' | 'none'
type HeadBg = 'section-bar' | 'surface' | 'surface-subtle'

interface Cfg {
  action: ActionKind
  subtitle: boolean
  headBg: HeadBg
  headBorder: boolean
  dense: boolean
  noPadding: boolean
  headH: number
  uiScale: number
}

const DEFAULTS: Cfg = {
  action: 'linkArrow', subtitle: true, headBg: 'section-bar', headBorder: true,
  dense: false, noPadding: false, headH: 32, uiScale: 1,
}

function Action({ kind }: { kind: ActionKind }) {
  if (kind === 'none') return null
  if (kind === 'link') return <a className="cardp__link" href="#">Все заметки</a>
  if (kind === 'linkArrow') return (
    <a className="cardp__link" href="#">Все заметки <IconArrowRight size={14} stroke={1.6} /></a>
  )
  if (kind === 'ghost') return <Button variant="ghost" size="sm">Все заметки</Button>
  if (kind === 'icon') return (
    <button type="button" className="cardp__icon" aria-label="Все заметки"><IconChevronRight size={16} stroke={1.6} /></button>
  )
  return <button type="button" className="cardp__icon" aria-label="Меню"><IconDots size={16} stroke={1.6} /></button>
}

/* Настоящий Card из системы. Метрика шапки (32px, --ds-section-bar, линия)
   теперь зашита в Form.css — ползунков под неё больше нет, они своё отработали. */
function CardProto({ cfg, title, subtitle, children }: {
  cfg: Cfg; title: string; subtitle?: string; children: ReactNode
}) {
  return (
    <Card
      title={title}
      subtitle={cfg.subtitle ? subtitle : undefined}
      headerAction={<Action kind={cfg.action} />}
      dense={cfg.dense}
      noPadding={cfg.noPadding}
    >{children}</Card>
  )
}

const kv = [
  { id: 'org', label: 'Организация', value: 'ООО «Ромашка»' },
  { id: 'sum', label: 'Сумма', value: '1 240 500,00 ₽' },
  { id: 'status', label: 'Статус', value: <Badge tone="warning">Не проведён</Badge> },
]
const metrics = [
  { id: 'a', label: 'Выручка', value: '1 240 500 ₽' },
  { id: 'b', label: 'Долг', value: '86 300 ₽', tone: 'warning' as const },
  { id: 'c', label: 'Оплачено', value: '94 %', tone: 'success' as const },
]
const trend = {
  id: 't', label: 'Остаток',
  points: [12, 15, 13, 18, 17, 21, 24, 22, 27].map((y, i) => ({ x: `Н${i + 1}`, y })),
}

function Stage({ theme, cfg }: { theme: 'light' | 'dark'; cfg: Cfg }) {
  return (
    <div className="pane" data-theme={theme}>
      <div className="pane__label">{theme}</div>
      <div className="cardp__stage">
        <CardProto cfg={cfg} title="Последние заметки" subtitle="за июль 2026">
          <KeyValueList items={kv} dividers />
        </CardProto>

        <CardProto cfg={cfg} title="Показатели" subtitle="обновлено 5 минут назад">
          <MetricStrip metrics={metrics} dense={cfg.dense} />
        </CardProto>

        <CardProto cfg={cfg} title="Остаток на счетах" subtitle="1 240 500 ₽">
          <LineChart series={[trend]} variant="spark" lastPoint />
        </CardProto>
      </div>
    </div>
  )
}

function Lab() {
  const [cfg, setCfg] = useState<Cfg>(DEFAULTS)
  const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg((c) => ({ ...c, [k]: v }))
  // Только с корня: метрические токены объявлены в :root, и var(--ds-ui-scale)
  // внутри их calc() вычисляется там же. На обёртке подрастут лишь покомпонентные
  // calc(), а шрифт останется прежним.
  useEffect(() => {
    document.documentElement.style.setProperty('--ds-ui-scale', String(cfg.uiScale))
  }, [cfg.uiScale])

  const readout = [
    '// Card — параметры из лаборатории',
    `действие в шапке:  ${cfg.action}`,
    `подзаголовок:      ${cfg.subtitle}`,
    `dense:             ${cfg.dense}`,
    `noPadding:         ${cfg.noPadding}`,
  ].join('\n')

  return (
    <div className="lab">
      <aside className="lab__panel">
        <h1 className="lab__title">Card — лаборатория</h1>
        <p className="lab__hint">
          Настоящий <code>Card</code> из системы, три штуки с разным содержимым.
          Метрика шапки уже зашита по итогам прошлого прогона; здесь остались
          пропы, которые задаёт потребитель.
        </p>

        <div className="lab__group">
          <div className="lab__group-title">Шапка</div>
          <div className="lab__row">
            <Select label="Действие справа" value={cfg.action}
              onChange={(e) => set('action', e.target.value as ActionKind)}
              options={[
                { value: 'linkArrow', label: 'Ссылка со стрелкой →' },
                { value: 'link', label: 'Простая ссылка' },
                { value: 'ghost', label: 'Кнопка-призрак' },
                { value: 'icon', label: 'Иконка-шеврон' },
                { value: 'kebab', label: 'Меню «⋯»' },
                { value: 'none', label: 'Без действия' },
              ]} />

          </div>
          <div className="lab__toggles">
            <Switch label="Подзаголовок" checked={cfg.subtitle} onChange={(e) => set('subtitle', e.target.checked)} />
          </div>
        </div>

        <div className="lab__group">
          <div className="lab__group-title">Тело</div>
          <div className="lab__toggles">
            <Switch label="dense — уплотнённые отступы" checked={cfg.dense} onChange={(e) => set('dense', e.target.checked)} />
            <Switch label="noPadding — контент впритык" checked={cfg.noPadding} onChange={(e) => set('noPadding', e.target.checked)} />
          </div>
        </div>

        <div className="lab__group">
          <div className="lab__group-title">Проверка масштаба</div>
          <div className="lab__row">
            <Slider label="--ds-ui-scale" suffix="×" min={1} max={1.4} step={0.05}
              value={cfg.uiScale} onChange={(v) => set('uiScale', v)} />
          </div>
        </div>

        <div className="lab__group-title">Пришли мне это</div>
        <div className="lab__readout">{readout}</div>
      </aside>

      <main className="lab__stage">
        <div className="lab__stage-head"><strong>Обе темы сразу</strong></div>
        <div className="lab__panes lab__panes--split">
          <Stage theme="light" cfg={cfg} />
          <Stage theme="dark" cfg={cfg} />
        </div>
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><Lab /></StrictMode>)
