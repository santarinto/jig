import { useState } from 'react'
import { Breadcrumbs } from '../../src/components/Breadcrumbs/index.js'
import { RouteBar } from '../../src/components/RouteBar/index.js'
import { SideNav, type SideNavGroup } from '../../src/components/SideNav/index.js'
import { Accordion } from '../../src/components/Accordion/index.js'
import { Button } from '../../src/components/Button/index.js'
import { SearchBar } from '../../src/components/SearchBar/index.js'
import { Calendar } from '../../src/components/Calendar/index.js'
import { DatePicker } from '../../src/components/DatePicker/index.js'
import { DemoBlock } from '../demo-spec.js'

const NAV: SideNavGroup[] = [
  {
    id: 'main',
    items: [
      { id: 'home', label: 'Главная' },
      { id: 'docs', label: 'Документы', count: 12 },
      { id: 'reports', label: 'Отчёты' },
    ],
  },
]

const ACC_ITEMS = [
  { id: '1', title: 'Реквизиты', content: 'ИНН, КПП, адрес…' },
  { id: '2', title: 'Банковские счета', content: 'Р/с, БИК…' },
]

const ACCORDION_CODE = [
  '// неконтролируемый режим — <Accordion items={[{ id, title, content }, …]} />',
  '// контролируемый нужен, когда состав раскрытых задаёт не сам аккордеон:',
  'const [open, setOpen] = useState<string[]>([])',
  '',
  '<Button onClick={() => setOpen([])}>Свернуть всё</Button>',
  '<Accordion multiple items={items} openIds={open} onOpenChange={setOpen} />',
].join('\n')

export function NavLayoutSection() {
  const [nav, setNav] = useState('home')
  const [date, setDate] = useState('2026-07-15')
  const [search, setSearch] = useState('')
  const [openSections, setOpenSections] = useState<string[]>(['1'])

  return (
    <>
      <section className="demo-section" id="navigation">
        <h2 className="demo-section__title">Navigation</h2>
        <div className="demo-grid demo-grid--1">
          <DemoBlock
            name="Breadcrumbs"
            code={'<Breadcrumbs items={items} onNavigate={…} />'}
          >
            <Breadcrumbs
              items={[
                { id: 'home', label: 'Главная' },
                { id: 'settings', label: 'Настройки' },
                { id: 'users', label: 'Пользователи' },
              ]}
              onNavigate={() => {}}
            />
          </DemoBlock>
          <DemoBlock
            name="RouteBar"
            block
            code={'<RouteBar routes={routes} selectedId="accounts" />'}
          >
            <RouteBar
              routes={[
                { id: 'home', label: 'Сводка', href: '#home' },
                { id: 'accounts', label: 'Счета', href: '#accounts' },
                { id: 'debts', label: 'Долги', href: '#debts', count: 2 },
                { id: 'strategy', label: 'Стратегия', href: '#strategy' },
              ]}
              selectedId="accounts"
            />
          </DemoBlock>
          <DemoBlock
            name="SideNav"
            code={'<SideNav groups={groups} selectedId={nav} onSelect={setNav} width={200} />'}
          >
            <SideNav groups={NAV} selectedId={nav} onSelect={setNav} width={200} />
          </DemoBlock>
          <DemoBlock
            name="SearchBar"
            block
            code={'<SearchBar value={search} onChange={setSearch} placeholder="Поиск документов…" />'}
          >
            <div className="demo-field-width">
              <SearchBar value={search} onChange={setSearch} placeholder="Поиск документов…" />
            </div>
          </DemoBlock>
        </div>
      </section>

      <section className="demo-section" id="layout">
        <h2 className="demo-section__title">Layout</h2>
        <div className="demo-grid demo-grid--1">
          <DemoBlock name="Accordion" block code={ACCORDION_CODE}>
            <div className="demo-stack">
              <div className="demo-row">
                <Button variant="secondary" size="sm" onClick={() => setOpenSections(ACC_ITEMS.map((i) => i.id))}>
                  Развернуть всё
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setOpenSections([])}>
                  Свернуть всё
                </Button>
              </div>
              <Accordion multiple items={ACC_ITEMS} openIds={openSections} onOpenChange={setOpenSections} />
            </div>
          </DemoBlock>
          <DemoBlock
            name="Calendar"
            code={'<Calendar year={2026} month={6} selectedId={date} onSelect={setDate} />'}
          >
            <Calendar year={2026} month={6} selectedId={date} onSelect={setDate} />
          </DemoBlock>
          <DemoBlock
            name="DatePicker"
            block
            code={'<DatePicker label="Дата документа" value={date} onChange={setDate} />'}
          >
            <div className="demo-field-width">
              <DatePicker label="Дата документа" value={date} onChange={setDate} />
            </div>
          </DemoBlock>
        </div>
      </section>
    </>
  )
}
