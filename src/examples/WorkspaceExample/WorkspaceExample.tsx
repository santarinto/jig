import { useState } from 'react'
import { AppBar } from '../../components/AppBar/index.js'
import { SectionPanel } from '../../components/SectionPanel/index.js'
import { FormTabs } from '../../components/FormTabs/index.js'
import { Dashboard, Tile } from '../../components/Dashboard/index.js'
import { Badge } from '../../components/Badge/index.js'
import './WorkspaceExample.css'

const sections = [
  { id: 'sales', label: 'Продажи' },
  { id: 'buy', label: 'Закупки' },
  { id: 'stock', label: 'Склад' },
  { id: 'bank', label: 'Банк и касса' },
  { id: 'reports', label: 'Отчёты' },
]

export function WorkspaceExample() {
  const [section, setSection] = useState('sales')
  const [tab, setTab] = useState('t1')
  const [tabs, setTabs] = useState([
    { id: 't1', label: 'Начальная страница' },
    { id: 't2', label: 'Реализация №РТ-0001' },
  ])

  return (
    <div className="ds-example-ws">
      <AppBar brand="Курьер 7" trailing={<Badge tone="accent">ИП</Badge>}>
        <input className="ds-input ds-input--sm" placeholder="Поиск везде (Ctrl+Shift+F)" style={{ width: 320 }} />
      </AppBar>
      <div className="ds-example-ws__body">
        <SectionPanel sections={sections} selectedId={section} onSelect={setSection} />
        <div className="ds-example-ws__main">
          <FormTabs
            tabs={tabs}
            selectedId={tab}
            onSelect={setTab}
            onClose={(id) => setTabs((t) => t.filter((x) => x.id !== id))}
            onHome={() => setTab(tabs[0]?.id ?? '')}
          />
          <Dashboard>
            <Tile title="Продажи за день" value="128 400" tone="accent" />
            <Tile title="Заказов в работе" value="17" />
            <Tile title="Позиций на складе" value="2 431" />
            <Tile title="Контрагентов" value="356" />
          </Dashboard>
        </div>
      </div>
    </div>
  )
}
