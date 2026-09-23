import { StrictMode, useEffect, useState, type CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/styles.css'
// Без этого демо рисуется системным фолбэком, а не Inter.
import '../fonts/inter.css'
import './sidenav-lab.css'

import { Slider } from '../src/components/Slider/index.js'
import { Select } from '../src/components/Select/index.js'
import { Switch } from '../src/components/Toggle/index.js'
import { Badge } from '../src/components/Badge/index.js'
import { FormTabs } from '../src/components/FormTabs/index.js'
import { Tabs } from '../src/components/Tabs/index.js'
import { SideNav, type SideNavGroup } from '../src/components/SideNav/index.js'

// Tabler is the chosen set (wider accounting-domain coverage). Dev-only here —
// the DS itself keeps taking icons as props and depends on no set.
import {
  IconHome, IconFileText, IconList, IconChartBar, IconSettings,
} from '@tabler/icons-react'

/* ------------------------------------------------------------------ *
 * SideNav LAB — a playground for task C1, not a DS component.
 * Turn the knobs until it matches the accounting-system reference you are looking at,
 * then send me the readout block at the bottom of the panel.
 * ------------------------------------------------------------------ */

type ActiveStyle = 'fill' | 'tint' | 'bar' | 'text'
type TopTabs = 'form' | 'content' | 'none'
type IconSet = 'tabler' | 'placeholder'

interface Cfg {
  iconSet: IconSet
  real: boolean
  topTabs: TopTabs
  tabsHome: boolean
  tabsClose: boolean
  width: number
  itemH: number
  gap: number
  padOut: number
  padIn: number
  radius: 'none' | 'sm' | 'md'
  fontSize: 'sm' | 'base'
  active: ActiveStyle
  icons: boolean
  counts: boolean
  sections: boolean
  separators: boolean
  nested: boolean
  collapsed: boolean
  navBg: 'surface' | 'bg-app' | 'section-bar'
}

// Settled against a real accounting-system screen (2026-07-26).
const DEFAULTS: Cfg = {
  width: 212, itemH: 30, gap: 1, padOut: 5, padIn: 10,
  radius: 'md', fontSize: 'base', active: 'tint',
  icons: true, counts: true, sections: true, separators: true,
  nested: true, collapsed: false, navBg: 'surface',
  topTabs: 'form', tabsHome: true, tabsClose: true, real: true, iconSet: 'tabler',
}

const RADIUS: Record<Cfg['radius'], string> = {
  none: '0', sm: 'var(--ds-radius-sm)', md: 'var(--ds-radius-md)',
}
const FS: Record<Cfg['fontSize'], string> = {
  sm: 'var(--ds-fs-sm)', base: 'var(--ds-fs-base)',
}

/* Plain 16px glyphs — placeholders for whatever icon set the portal uses. */
const I = {
  home: 'M3 9.5 12 3l9 6.5V21H3z',
  doc: 'M6 2h8l4 4v16H6zM14 2v4h4',
  list: 'M4 6h16M4 12h16M4 18h16',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  gear: 'M12 8a4 4 0 100 8 4 4 0 000-8zM2 12h2m16 0h2M12 2v2m0 16v2',
}
function Icon({ d }: { d: string }) {
  return (
    <span className="nav__icon" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </span>
  )
}

/* Same five glyphs from each set, all at 16px — the size they actually ship at. */
const SETS: Record<IconSet, Record<string, React.ReactNode>> = {
  tabler: {
    main: <IconHome size={16} stroke={1.6} />,
    docs: <IconFileText size={16} stroke={1.6} />,
    refs: <IconList size={16} stroke={1.6} />,
    reports: <IconChartBar size={16} stroke={1.6} />,
    settings: <IconSettings size={16} stroke={1.6} />,
  },
  placeholder: {},
}

function iconFor(cfg: Cfg, it: Item): React.ReactNode {
  if (cfg.iconSet === 'placeholder') return <Icon d={it.icon} />
  return <span className="nav__icon" aria-hidden="true">{SETS[cfg.iconSet][it.id]}</span>
}

type Item = { id: string; label: string; icon: string; count?: number; children?: string[] }
const ITEMS: Item[] = [
  { id: 'main', label: 'Главная', icon: I.home },
  { id: 'docs', label: 'Документы', icon: I.doc, count: 12, children: ['Реализация', 'Поступление'] },
  { id: 'refs', label: 'Справочники', icon: I.list },
  { id: 'reports', label: 'Отчёты', icon: I.chart, count: 3 },
  { id: 'settings', label: 'Настройки', icon: I.gear },
]

function Nav({ cfg, active, onPick }: { cfg: Cfg; active: string; onPick: (id: string) => void }) {
  const style = {
    '--nav-w': cfg.collapsed ? `${cfg.itemH + cfg.padOut * 2}px` : `${cfg.width}px`,
    '--nav-item-h': `${cfg.itemH}px`,
    '--nav-gap': `${cfg.gap}px`,
    '--nav-pad-out': `${cfg.padOut}px`,
    '--nav-pad-in': `${cfg.padIn}px`,
    '--nav-radius': RADIUS[cfg.radius],
    '--nav-fs': FS[cfg.fontSize],
    '--nav-bg': `var(--ds-${cfg.navBg})`,
  } as CSSProperties

  const item = (it: Item) => (
    <div key={it.id}>
      <button
        type="button"
        className={[
          'nav__item',
          it.id === active && `nav__item--active is-${cfg.active}`,
        ].filter(Boolean).join(' ')}
        onClick={() => onPick(it.id)}
        title={cfg.collapsed ? it.label : undefined}
      >
        {cfg.icons && iconFor(cfg, it)}
        <span className="nav__label">{it.label}</span>
        {cfg.counts && it.count != null && <span className="nav__count">{it.count}</span>}
      </button>
      {cfg.nested && !cfg.collapsed && it.children?.map((c) => (
        <button key={c} type="button" className="nav__item nav__item--child" onClick={() => onPick(it.id)}>
          <span className="nav__label">{c}</span>
        </button>
      ))}
    </div>
  )

  return (
    <nav className={['nav', cfg.collapsed && 'nav--collapsed'].filter(Boolean).join(' ')} style={style}>
      <div className="nav__brand">
        <span className="nav__brand-mark">◆</span>
        <span>Управление</span>
      </div>
      {cfg.sections && !cfg.collapsed && <div className="nav__section">Учёт</div>}
      {ITEMS.slice(0, 3).map(item)}
      {cfg.separators && <div className="nav__sep" />}
      {cfg.sections && !cfg.collapsed && <div className="nav__section">Анализ</div>}
      {ITEMS.slice(3).map(item)}
    </nav>
  )
}

/* Open-form tabs, the accounting-system strip that sits above the content area. Both DS
   candidates are shown so they can be compared against the real app. */
const OPEN_TABS = [
  { id: 'start', label: 'Начальная страница' },
  { id: 'sale', label: 'Реализация №РТ-0001' },
  { id: 'client', label: 'ООО «Ромашка»' },
]

function TopTabs({ cfg }: { cfg: Cfg }) {
  const [tab, setTab] = useState('sale')
  const [tabs, setTabs] = useState(OPEN_TABS)
  if (cfg.topTabs === 'none') return null
  if (cfg.topTabs === 'content') {
    return (
      <div className="app__tabs">
        <Tabs tabs={tabs} selectedId={tab} onSelect={setTab} />
      </div>
    )
  }
  return (
    <div className="app__tabs">
      <FormTabs
        tabs={tabs}
        selectedId={tab}
        onSelect={setTab}
        onHome={cfg.tabsHome ? () => setTab('start') : undefined}
        onClose={cfg.tabsClose ? (id) => setTabs((t) => t.filter((x) => x.id !== id)) : undefined}
      />
    </div>
  )
}

/* The shipped component, fed from the same toggles as the prototype so the two
   can be compared like for like. Its metrics live in SideNav.css now — the
   metric sliders above only move the prototype. */
function realGroups(cfg: Cfg): SideNavGroup[] {
  const map = (it: Item) => ({
    id: it.id,
    label: it.label,
    icon: cfg.icons ? iconFor(cfg, it) : undefined,
    count: cfg.counts ? it.count : undefined,
    children: cfg.nested && it.children
      ? it.children.map((c) => ({ id: `${it.id}-${c}`, label: c }))
      : undefined,
  })
  return [
    { id: 'g1', title: cfg.sections ? 'Учёт' : undefined, items: ITEMS.slice(0, 3).map(map) },
    {
      id: 'g2', title: cfg.sections ? 'Анализ' : undefined,
      separator: cfg.separators, items: ITEMS.slice(3).map(map),
    },
  ]
}

function Stage({ theme, cfg, active, onPick }: {
  theme: 'light' | 'dark'; cfg: Cfg; active: string; onPick: (id: string) => void
}) {
  const current = ITEMS.find((i) => i.id === active)
  return (
    <div className="pane" data-theme={theme}>
      <div className="pane__label">{theme} — {cfg.real ? 'настоящий SideNav' : 'прототип'}</div>
      <div className="app">
        {cfg.real ? (
          <SideNav
            groups={realGroups(cfg)}
            selectedId={active}
            onSelect={onPick}
            collapsed={cfg.collapsed}
            width={cfg.width}
            title="Управление"
            mark="◆"
          />
        ) : (
          <Nav cfg={cfg} active={active} onPick={onPick} />
        )}
        <div className="app__right">
        <TopTabs cfg={cfg} />
        <div className="app__main">
          <div className="app__crumb">Главное / {current?.label}</div>
          <h1 className="app__h1">{current?.label}</h1>
          <div style={{ display: 'flex', gap: 'var(--ds-space-3)', alignItems: 'center' }}>
            <Badge tone="accent">раздел</Badge>
            <Badge tone="warning">черновик</Badge>
            <span style={{ color: 'var(--ds-text-muted)', fontSize: 'var(--ds-fs-sm)' }}>
              Контент экрана — тут только фон, чтобы видеть контраст навигации.
            </span>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}

function Lab() {
  const [cfg, setCfg] = useState<Cfg>(DEFAULTS)
  const [active, setActive] = useState('docs')
  const [uiScale, setUiScale] = useState(1)
  // --ds-ui-scale only works from the root: the metric tokens live in :root, and
  // the var() inside their calc() resolves there. Setting it on a wrapper scales
  // the component-level calc()s but leaves every token at 1 — stretched rows with
  // unchanged text, which is worse than not scaling at all.
  useEffect(() => {
    document.documentElement.style.setProperty('--ds-ui-scale', String(uiScale))
  }, [uiScale])
  const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg((c) => ({ ...c, [k]: v }))

  const readout = [
    '// SideNav — параметры из лаборатории',
    `ширина:            ${cfg.width}px`,
    `высота пункта:     ${cfg.itemH}px`,
    `зазор:             ${cfg.gap}px`,
    `padding снаружи:   ${cfg.padOut}px`,
    `padding в пункте:  ${cfg.padIn}px`,
    `радиус:            ${cfg.radius}`,
    `размер шрифта:     ${cfg.fontSize}`,
    `активный пункт:    ${cfg.active}`,
    `фон панели:        --ds-${cfg.navBg}`,
    `иконки:            ${cfg.icons}`,
    `счётчики:          ${cfg.counts}`,
    `заголовки групп:   ${cfg.sections}`,
    `разделители:       ${cfg.separators}`,
    `вложенность:       ${cfg.nested}`,
    `свёрнутый режим:   ${cfg.collapsed}`,
    '',
    `набор иконок:      ${cfg.iconSet}`,
    `верхние вкладки:   ${cfg.topTabs}`,
    `кнопка «домой»:    ${cfg.tabsHome}`,
    `крестик закрытия:  ${cfg.tabsClose}`,
  ].join('\n')

  return (
    <div className="lab">
      <aside className="lab__panel">
        <h1 className="lab__title">SideNav — лаборатория</h1>
        <p className="lab__hint">
          Прототип на реальных токенах jig. Крути параметры под свой референс учётной системы,
          потом пришли мне блок внизу — по нему соберу настоящий компонент.
        </p>

        <div className="lab__group">
          <div className="lab__group-title">Масштаб интерфейса</div>
          <div className="lab__row">
            <Slider label="--ds-ui-scale" suffix="×" min={1} max={1.4} step={0.05}
              value={uiScale} onChange={setUiScale} />
          </div>
          <p className="lab__hint" style={{ margin: '8px 0 0' }}>
            Множитель на контейнере панели. При 1.0 — как сейчас; 1.15 / 1.3 — типичные шаги учётной системы.
          </p>
        </div>

        <div className="lab__group">
          <div className="lab__group-title">Метрика</div>
          <div className="lab__row">
            <Slider label="Ширина панели" suffix="px" min={160} max={280} step={4}
              value={cfg.width} onChange={(v) => set('width', v)} />
            <Slider label="Высота пункта" suffix="px" min={22} max={40} step={1}
              value={cfg.itemH} onChange={(v) => set('itemH', v)} />
            <Slider label="Зазор между пунктами" suffix="px" min={0} max={8} step={1}
              value={cfg.gap} onChange={(v) => set('gap', v)} />
            <Slider label="Отступ панели по бокам" suffix="px" min={0} max={20} step={1}
              value={cfg.padOut} onChange={(v) => set('padOut', v)} />
            <Slider label="Отступ внутри пункта" suffix="px" min={4} max={24} step={1}
              value={cfg.padIn} onChange={(v) => set('padIn', v)} />
          </div>
        </div>

        <div className="lab__group">
          <div className="lab__group-title">Вид</div>
          <div className="lab__row">
            <Select label="Активный пункт" value={cfg.active}
              onChange={(e) => set('active', e.target.value as ActiveStyle)}
              options={[
                { value: 'fill', label: 'Заливка акцентом' },
                { value: 'tint', label: 'Бирюзовая подложка' },
                { value: 'bar', label: 'Полоса слева' },
                { value: 'text', label: 'Только цвет текста' },
              ]} />
            <Select label="Фон панели" value={cfg.navBg}
              onChange={(e) => set('navBg', e.target.value as Cfg['navBg'])}
              options={[
                { value: 'surface', label: 'surface (белый)' },
                { value: 'bg-app', label: 'bg-app (серый)' },
                { value: 'section-bar', label: 'section-bar' },
              ]} />
            <Select label="Радиус пункта" value={cfg.radius}
              onChange={(e) => set('radius', e.target.value as Cfg['radius'])}
              options={[
                { value: 'none', label: 'Без скругления' },
                { value: 'sm', label: 'sm (2px)' },
                { value: 'md', label: 'md (4px)' },
              ]} />
            <Select label="Размер текста" value={cfg.fontSize}
              onChange={(e) => set('fontSize', e.target.value as Cfg['fontSize'])}
              options={[
                { value: 'sm', label: 'sm (12px)' },
                { value: 'base', label: 'base (14px)' },
              ]} />
          </div>
        </div>

        <div className="lab__group">
          <div className="lab__group-title">Иконки</div>
          <div className="lab__row">
            <Select label="Набор" value={cfg.iconSet}
              onChange={(e) => set('iconSet', e.target.value as IconSet)}
              options={[
                { value: 'tabler', label: 'Tabler' },
                { value: 'placeholder', label: 'Мои заглушки' },
              ]} />
          </div>
        </div>

        <div className="lab__group">
          <div className="lab__group-title">Что показывать</div>
          <div className="lab__toggles">
            <Switch label="Настоящий SideNav (иначе прототип)" checked={cfg.real}
              onChange={(e) => set('real', e.target.checked)} />
          </div>
          <p className="lab__hint" style={{ margin: '8px 0 0' }}>
            У настоящего компонента метрика зашита в CSS — ползунки метрики двигают только прототип.
          </p>
        </div>

        <div className="lab__group">
          <div className="lab__group-title">Верхние вкладки</div>
          <div className="lab__row">
            <Select label="Вариант" value={cfg.topTabs}
              onChange={(e) => set('topTabs', e.target.value as TopTabs)}
              options={[
                { value: 'form', label: 'FormTabs — вкладки форм учётной системы' },
                { value: 'content', label: 'Tabs — контентные вкладки' },
                { value: 'none', label: 'Без вкладок' },
              ]} />
          </div>
          <div className="lab__toggles">
            <Switch label="Кнопка «домой»" checked={cfg.tabsHome} disabled={cfg.topTabs !== 'form'}
              onChange={(e) => set('tabsHome', e.target.checked)} />
            <Switch label="Крестик закрытия" checked={cfg.tabsClose} disabled={cfg.topTabs !== 'form'}
              onChange={(e) => set('tabsClose', e.target.checked)} />
          </div>
        </div>

        <div className="lab__group">
          <div className="lab__group-title">Состав</div>
          <div className="lab__toggles">
            <Switch label="Иконки" checked={cfg.icons} onChange={(e) => set('icons', e.target.checked)} />
            <Switch label="Счётчики" checked={cfg.counts} onChange={(e) => set('counts', e.target.checked)} />
            <Switch label="Заголовки групп" checked={cfg.sections} onChange={(e) => set('sections', e.target.checked)} />
            <Switch label="Разделители" checked={cfg.separators} onChange={(e) => set('separators', e.target.checked)} />
            <Switch label="Вложенные пункты" checked={cfg.nested} onChange={(e) => set('nested', e.target.checked)} />
            <Switch label="Свёрнутый режим" checked={cfg.collapsed} onChange={(e) => set('collapsed', e.target.checked)} />
          </div>
        </div>

        <div className="lab__group-title">Пришли мне это</div>
        <div className="lab__readout">{readout}</div>
      </aside>

      <main className="lab__stage">
        <div className="lab__stage-head">
          <strong>Обе темы сразу</strong>
          <span style={{ color: 'var(--ds-text-muted)', fontSize: 'var(--ds-fs-sm)' }}>
            кликай по пунктам — активное состояние живое
          </span>
        </div>
        <div className="lab__panes lab__panes--split">
          <Stage theme="light" cfg={cfg} active={active} onPick={setActive} />
          <Stage theme="dark" cfg={cfg} active={active} onPick={setActive} />
        </div>
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><Lab /></StrictMode>,
)
