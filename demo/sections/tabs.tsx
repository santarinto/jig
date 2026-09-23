import { useState } from 'react'
import {
  IconHome, IconFileText, IconChartBar, IconSettings, IconInbox, IconPlus, IconCircleCheck,
} from '@tabler/icons-react'
import { Tabs, TabPanel, type Tab, type TabPosition } from '../../src/components/Tabs/index.js'
import { Card } from '../../src/components/Form/index.js'
import { DemoBlock } from '../demo-spec.js'

const BASE: Tab[] = [
  { id: 'all', label: 'Все', count: 42 },
  { id: 'todo', label: 'К работе', count: 7 },
  { id: 'done', label: 'Готово', count: 0 },
]

const ICONS: Tab[] = [
  { id: 'home', label: 'Главная', icon: <IconHome size={16} stroke={1.75} /> },
  { id: 'docs', label: 'Документы', icon: <IconFileText size={16} stroke={1.75} />, count: 12 },
  { id: 'stats', label: 'Отчёты', icon: <IconChartBar size={16} stroke={1.75} /> },
]

const ICON_ONLY: Tab[] = [
  { id: 'inbox', label: 'Входящие', icon: <IconInbox size={16} stroke={1.75} /> },
  { id: 'home', label: 'Главная', icon: <IconHome size={16} stroke={1.75} /> },
  { id: 'cfg', label: 'Настройки', icon: <IconSettings size={16} stroke={1.75} /> },
]

// Визуально скрыто, но доступно скринридеру — для варианта «только иконка».
const HIDDEN: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
}

const DISABLED: Tab[] = [
  { id: 'a', label: 'Обзор' },
  { id: 'b', label: 'Доступ', disabled: true },
  { id: 'c', label: 'История' },
]

function BasicDemo() {
  const [tab, setTab] = useState('all')
  return (
    <div className="ds-tabs-layout ds-tabs-layout--top">
      <Tabs tabs={BASE} selectedId={tab} onSelect={setTab} id="demo-basic" />
      <TabPanel tabsId="demo-basic" selectedId={tab}>
        {tab === 'all' ? 'Список всех задач' : tab === 'todo' ? 'Задачи к работе' : 'Завершённые задачи'}
      </TabPanel>
    </div>
  )
}

function IconsDemo() {
  const [tab, setTab] = useState('home')
  return (
    <div className="ds-tabs-layout ds-tabs-layout--top">
      <Tabs tabs={ICONS} selectedId={tab} onSelect={setTab} id="demo-icons" />
      <TabPanel tabsId="demo-icons" selectedId={tab}>Иконка + подпись; подпись несёт смысл, значок декоративен.</TabPanel>
    </div>
  )
}

function IconOnlyDemo() {
  // «Только иконка» — подпись остаётся в доступном имени (label), визуально скрыта
  // через renderItem: значок виден, текст читает скринридер.
  const [tab, setTab] = useState('inbox')
  return (
    <div className="ds-tabs-layout ds-tabs-layout--top">
      <Tabs
        tabs={ICON_ONLY} selectedId={tab} onSelect={setTab} id="demo-icononly"
        renderItem={(t, props) => (
          <button {...props} title={t.label}>
            <span className="ds-tabs__icon" aria-hidden="true">{t.icon}</span>
            <span style={HIDDEN}>{t.label}</span>
          </button>
        )}
      />
      <TabPanel tabsId="demo-icononly" selectedId={tab}>Раздел «{ICON_ONLY.find((t) => t.id === tab)?.label}».</TabPanel>
    </div>
  )
}

function DisabledDemo() {
  const [tab, setTab] = useState('a')
  return (
    <div className="ds-tabs-layout ds-tabs-layout--top">
      <Tabs tabs={DISABLED} selectedId={tab} onSelect={setTab} id="demo-disabled" />
      <TabPanel tabsId="demo-disabled" selectedId={tab}>Вкладка «Доступ» недоступна — стрелки её пропускают.</TabPanel>
    </div>
  )
}

function PlainDemo() {
  const [tab, setTab] = useState('all')
  return (
    <div className="ds-tabs-layout ds-tabs-layout--top">
      <Tabs tabs={BASE} selectedId={tab} onSelect={setTab} id="demo-plain" variant="plain" />
      <TabPanel tabsId="demo-plain" selectedId={tab}>Вариант plain — без «папок», активная помечена подчёркиванием.</TabPanel>
    </div>
  )
}

function PositionsDemo() {
  const [pos, setPos] = useState<TabPosition>('top')
  const [tab, setTab] = useState('all')
  const positions: TabPosition[] = ['top', 'bottom', 'left', 'right']
  return (
    <div>
      <div className="demo-row" style={{ marginBottom: 12 }}>
        {positions.map((p) => (
          <label key={p} style={{ fontSize: 'var(--ds-fs-sm)', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            <input type="radio" name="tab-pos" checked={pos === p} onChange={() => setPos(p)} />
            {p}
          </label>
        ))}
      </div>
      <div
        className={`ds-tabs-layout ds-tabs-layout--${pos}`}
        style={{ minHeight: 160, ...(pos === 'left' || pos === 'right' ? { height: 180 } : {}) }}
      >
        <Tabs tabs={BASE} selectedId={tab} onSelect={setTab} position={pos} id="demo-pos" />
        <TabPanel tabsId="demo-pos" selectedId={tab}>Бар стоит {pos}. Раскладку даёт обёртка .ds-tabs-layout--{pos}.</TabPanel>
      </div>
    </div>
  )
}

const MANY: Tab[] = Array.from({ length: 14 }, (_, i) => ({ id: `s${i}`, label: `Раздел ${i + 1}` }))

function OverflowScrollDemo() {
  const [tab, setTab] = useState('s0')
  return (
    <div className="ds-tabs-layout ds-tabs-layout--top" style={{ maxWidth: 420 }}>
      <Tabs tabs={MANY} selectedId={tab} onSelect={setTab} overflow="scroll" id="demo-ovf-scroll" />
      <TabPanel tabsId="demo-ovf-scroll" selectedId={tab}>Вкладок больше, чем влезает: стрелки по краям прокручивают ленту.</TabPanel>
    </div>
  )
}

function OverflowMenuDemo() {
  const [tab, setTab] = useState('s0')
  return (
    <div className="ds-tabs-layout ds-tabs-layout--top" style={{ maxWidth: 420 }}>
      <Tabs tabs={MANY} selectedId={tab} onSelect={setTab} overflow="menu" id="demo-ovf-menu" />
      <TabPanel tabsId="demo-ovf-menu" selectedId={tab}>Кнопка «⋯» открывает список всех вкладок и переходит к выбранной.</TabPanel>
    </div>
  )
}

function ReorderDemo() {
  const [items, setItems] = useState<Tab[]>([
    { id: 'a', label: 'Первый' },
    { id: 'b', label: 'Второй' },
    { id: 'c', label: 'Третий' },
    { id: 'd', label: 'Четвёртый' },
  ])
  const [tab, setTab] = useState('a')
  return (
    <div className="ds-tabs-layout ds-tabs-layout--top">
      <Tabs
        tabs={items} selectedId={tab} onSelect={setTab} id="demo-reorder"
        onReorder={(order) => setItems(order.map((id) => items.find((t) => t.id === id)!))}
      />
      <TabPanel tabsId="demo-reorder" selectedId={tab}>
        Тяните вкладки мышью или переносите активную через <kbd>Ctrl</kbd>+<kbd>←</kbd>/<kbd>→</kbd>.
      </TabPanel>
    </div>
  )
}

let dynSeq = 0
function DynamicDemo() {
  const [items, setItems] = useState<Tab[]>([
    { id: 'd0', label: 'Вкладка 1', closable: true },
    { id: 'd1', label: 'Вкладка 2', closable: true },
  ])
  const [tab, setTab] = useState('d0')

  function addTab() {
    dynSeq += 1
    const id = `dyn${dynSeq}`
    setItems((prev) => [...prev, { id, label: `Новая ${dynSeq}`, closable: true }])
    setTab(id)
  }

  function closeTab(id: string) {
    setItems((prev) => {
      const idx = prev.findIndex((t) => t.id === id)
      const next = prev.filter((t) => t.id !== id)
      // Закрыли активную — активной становится соседняя (правая, иначе левая).
      if (id === tab && next.length) {
        setTab((next[idx] ?? next[idx - 1] ?? next[0]!).id)
      }
      return next
    })
  }

  return (
    <div className="ds-tabs-layout ds-tabs-layout--top">
      <Tabs
        tabs={items} selectedId={tab} onSelect={setTab} id="demo-dynamic"
        onClose={closeTab}
        trailing={
          <button type="button" className="ds-btn ds-btn--ghost ds-btn--sm" aria-label="Добавить вкладку" onClick={addTab}>
            <IconPlus size={16} stroke={2} aria-hidden />
          </button>
        }
      />
      <TabPanel tabsId="demo-dynamic" selectedId={tab}>
        {items.length
          ? <>Содержимое: «{items.find((t) => t.id === tab)?.label}». «+» добавляет, крестик закрывает.</>
          : <span style={{ color: 'var(--ds-text-muted)' }}><IconCircleCheck size={16} style={{ verticalAlign: 'middle' }} /> Все вкладки закрыты — нажмите «+».</span>}
      </TabPanel>
    </div>
  )
}

const NEST_LABELS = ['Товары', 'Услуги']

/** Один вложенный уровень (basic/framed). Рендерит вкладки на текущем уровне и
    рекурсивно — следующий, пока не дойдёт до maxLevel; глубже — лист. `id` не
    зависит от активной вкладки (стабильная связь с TabPanel). */
function NestLevel({ level, maxLevel, idBase }: { level: number; maxLevel: number; idBase: string }) {
  const [active, setActive] = useState('a')
  if (level > maxLevel) {
    return (
      <div style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-secondary)' }}>
        Лист на глубине {maxLevel}.
      </div>
    )
  }
  const tabs: Tab[] = [
    { id: 'a', label: `${NEST_LABELS[0]} · ур.${level}` },
    { id: 'b', label: `${NEST_LABELS[1]} · ур.${level}` },
  ]
  const id = `${idBase}-l${level}`
  return (
    <div className="ds-tabs-layout ds-tabs-layout--top">
      <Tabs tabs={tabs} selectedId={active} onSelect={setActive} id={id} />
      <TabPanel tabsId={id} selectedId={active}>
        <NestLevel level={level + 1} maxLevel={maxLevel} idBase={`${id}-${active}`} />
      </TabPanel>
    </div>
  )
}

/** Вложенные вкладки в basic-стиле (framed на всех уровнях): 4 родительских
    таба, глубина вложенности 2 / 3 / 4 / 2. */
function NestedTabs() {
  const [p, setP] = useState('p0')
  const parents = [
    { id: 'p0', label: 'Документы', depth: 2 },
    { id: 'p1', label: 'Реестры', depth: 3 },
    { id: 'p2', label: 'Отчёты', depth: 4 },
    { id: 'p3', label: 'Настройки', depth: 2 },
  ]
  const cur = parents.find((x) => x.id === p)!
  return (
    <div className="ds-tabs-layout ds-tabs-layout--top">
      <Tabs tabs={parents.map(({ id, label }) => ({ id, label }))} selectedId={p} onSelect={setP} id="nest-root" />
      <TabPanel tabsId="nest-root" selectedId={p}>
        <div style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-muted)', marginBottom: 8 }}>
          «{cur.label}» — вложенность {cur.depth} уровня
        </div>
        <NestLevel level={2} maxLevel={cur.depth} idBase={`nest-${p}`} />
      </TabPanel>
    </div>
  )
}

// Вкладки первым ребёнком карточки без отступов — раскладка «список слева,
// открытые записи справа». Ровно тот случай, ради которого у полосы есть зазор
// перед первой вкладкой: иначе «папка» садится в угол рамки.
function InCardDemo() {
  const [tab, setTab] = useState('all')
  return (
    <Card title="Список" variant="framed" noPadding>
      <Tabs
        id="demo-incard"
        tabs={[{ id: 'all', label: 'Все' }, { id: 'history', label: 'История' }]}
        selectedId={tab}
        onSelect={setTab}
      />
      <TabPanel tabsId="demo-incard" selectedId={tab} noPadding>
        <div style={{ padding: 'var(--ds-space-5)' }}>
          {tab === 'all' ? 'Содержимое списка' : 'История открытых записей'}
        </div>
      </TabPanel>
    </Card>
  )
}

export function TabsSection() {
  return (
    <section className="demo-section" id="tabs">
      <h2 className="demo-section__title">Tabs</h2>
      <div className="demo-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <DemoBlock name="Tabs · Basic" block code={'<Tabs variant="framed"          // дефолт: «папки» с рамками; отдельного variant=\'basic\' нет\n  tabs={tabs} selectedId={id} onSelect={setId} id="t" />\n<TabPanel tabsId="t" selectedId={id}>…</TabPanel>'}>
          <BasicDemo />
        </DemoBlock>
        <DemoBlock name="Tabs · Icons" block code={`<Tabs
  tabs={[
    { id: 'home', label: 'Главная', icon: <IconHome /> },
    { id: 'docs', label: 'Документы', icon: <IconFileText />, count: 12 },
    { id: 'stats', label: 'Отчёты', icon: <IconChartBar /> },
  ]}
  selectedId={tab} onSelect={setTab}
/>`}>
          <IconsDemo />
        </DemoBlock>
        <DemoBlock name="Tabs · Icon only" block code={`// Подпись остаётся в доступном имени: визуально скрыта, но читается SR.
<Tabs
  tabs={tabs} selectedId={tab} onSelect={setTab}
  renderItem={(t, props) => (
    <button {...props} title={t.label}>
      <span className="ds-tabs__icon" aria-hidden="true">{t.icon}</span>
      <span style={visuallyHidden}>{t.label}</span>
    </button>
  )}
/>`}>
          <IconOnlyDemo />
        </DemoBlock>
        <DemoBlock name="Tabs · Disabled" block code={`<Tabs
  tabs={[
    { id: 'a', label: 'Обзор' },
    { id: 'b', label: 'Доступ', disabled: true },
    { id: 'c', label: 'История' },
  ]}
  selectedId={tab} onSelect={setTab}
/>`}>
          <DisabledDemo />
        </DemoBlock>
        <DemoBlock name="Tabs · в карточке" block code={`// Полоса вкладок первым ребёнком карточки без отступов.
// Зазор перед первой вкладкой даёт сама полоса — руками ничего не задаём.
<Card title="Список" variant="framed" noPadding>
  <Tabs id="left" tabs={tabs} selectedId={tab} onSelect={setTab} />
  <TabPanel tabsId="left" selectedId={tab} noPadding>…</TabPanel>
</Card>`}>
          <InCardDemo />
        </DemoBlock>
        <DemoBlock name="Tabs · Plain" block code={'<Tabs variant="plain" tabs={tabs} selectedId={id} onSelect={setId} />'}>
          <PlainDemo />
        </DemoBlock>
        <DemoBlock name="Tabs · Positions" block code={`// Значения position: top | bottom | left | right.
// Раскладку даёт обязательная обёртка .ds-tabs-layout--{pos}.
<div className="ds-tabs-layout ds-tabs-layout--left">
  <Tabs tabs={tabs} selectedId={id} onSelect={setId} position="left" id="t" />
  <TabPanel tabsId="t" selectedId={id}>…</TabPanel>
</div>`}>
          <PositionsDemo />
        </DemoBlock>
        <DemoBlock name="Tabs · Overflow scroll" block code={'<Tabs overflow="scroll" tabs={tabs} selectedId={id} onSelect={setId} />'}>
          <OverflowScrollDemo />
        </DemoBlock>
        <DemoBlock name="Tabs · Overflow menu" block code={'<Tabs overflow="menu" tabs={tabs} selectedId={id} onSelect={setId} />'}>
          <OverflowMenuDemo />
        </DemoBlock>
        <DemoBlock name="Tabs · Reorder" block code={'<Tabs onReorder={(order) => setItems(order)} tabs={tabs} selectedId={id} onSelect={setId} />'}>
          <ReorderDemo />
        </DemoBlock>
        <DemoBlock name="Tabs · вложенные (2–4 уровня)" block code={`<div className="ds-tabs-layout ds-tabs-layout--top">
  <Tabs tabs={parents} selectedId={p} onSelect={setP} id="root" />
  <TabPanel tabsId="root" selectedId={p}>
    {/* внутри — снова Tabs + TabPanel, рекурсивно на нужную глубину */}
    <Tabs tabs={children} selectedId={c} onSelect={setC} id="root-l2" />
    <TabPanel tabsId="root-l2" selectedId={c}>…</TabPanel>
  </TabPanel>
</div>`}>
          <NestedTabs />
        </DemoBlock>
        <DemoBlock name="Tabs · Dynamic (+/×)" block code={'<Tabs onClose={close} trailing={<button>+</button>} tabs={tabs} selectedId={id} onSelect={setId} />'}>
          <DynamicDemo />
        </DemoBlock>
      </div>
    </section>
  )
}
