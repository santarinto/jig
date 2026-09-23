import { useState } from 'react'
import { AppBar } from '../../src/components/AppBar/index.js'
import { Button } from '../../src/components/Button/index.js'
import { CommandBar, type CommandAction } from '../../src/components/CommandBar/index.js'
import { GlobalSearch, type SearchResult } from '../../src/components/GlobalSearch/index.js'
import { FunctionPanel, type FunctionGroup } from '../../src/components/FunctionPanel/index.js'
import { ThemeToggle } from '../../src/components/ThemeToggle/index.js'
import { DemoBlock } from '../demo-spec.js'

const RESULTS: SearchResult[] = [
  { id: 'doc-142', label: 'Реализация №142', group: 'Документы' },
  { id: 'doc-89', label: 'Счёт №89', group: 'Документы' },
  { id: 'ref-units', label: 'Единицы измерения', group: 'Справочники' },
]

const GROUPS: FunctionGroup[] = [
  { title: 'Документы', links: [{ id: 'sales', label: 'Реализации' }, { id: 'bills', label: 'Счета' }] },
  { title: 'Справочники', links: [{ id: 'goods', label: 'Номенклатура' }, { id: 'units', label: 'Единицы измерения' }] },
]

const APPBAR_CODE = [
  '<AppBar',
  '  brand="Курьер 7"',
  "  actions={[{ id: 'shift', label: 'Смена' }, { id: 'reports', label: 'Отчёты' }]}",
  '  trailing={<Button variant="ghost">Выйти</Button>}',
  '>',
  '  <span>Тестовая база</span>',
  '</AppBar>',
].join('\n')

const DOC_ACTIONS: CommandAction[] = [
  { id: 'post', label: 'Провести', group: 'write' },
  { id: 'save', label: 'Записать', group: 'write' },
  { id: 'delete', label: 'Удалить', tone: 'error', group: 'delete' },
]

const COMMANDBAR_CODE = [
  'const actions: CommandAction[] = [',
  "  { id: 'post', label: 'Провести', group: 'write' },",
  "  { id: 'save', label: 'Записать', group: 'write' },",
  "  { id: 'delete', label: 'Удалить', tone: 'error', group: 'delete' },",
  ']',
  '',
  '<CommandBar aria-label="Действия документа" actions={actions} />',
].join('\n')

const GLOBALSEARCH_CODE = [
  "const RESULTS: SearchResult[] = [",
  "  { id: 'doc-142', label: 'Реализация №142', group: 'Документы' },",
  "  { id: 'doc-89', label: 'Счёт №89', group: 'Документы' },",
  "  { id: 'ref-units', label: 'Единицы измерения', group: 'Справочники' },",
  "]",
  "const [query, setQuery] = useState('')",
  '',
  '<GlobalSearch',
  '  value={query}',
  '  onChange={setQuery}',
  '  results={query ? RESULTS : []}',
  '  onSelect={(id) => setQuery(id)}',
  '  placeholder="Поиск везде"',
  '/>',
].join('\n')

const FUNCTIONPANEL_CODE = [
  "const GROUPS: FunctionGroup[] = [",
  "  { title: 'Документы', links: [{ id: 'sales', label: 'Реализации' }, { id: 'bills', label: 'Счета' }] },",
  "  { title: 'Справочники', links: [{ id: 'goods', label: 'Номенклатура' }, { id: 'units', label: 'Единицы измерения' }] },",
  "]",
  '',
  '<FunctionPanel groups={GROUPS} />',
].join('\n')

const FUNCTIONPANEL_LINKS_CODE = [
  '// Шов ПОДМЕНЯЕТ элемент: пропсы раскладываются на ссылку роутера, кнопки нет.',
  '// onOpen рядом с renderItem — ошибка типов: источник перехода один.',
  '<FunctionPanel',
  '  groups={GROUPS}',
  '  renderItem={(link, props) => <Link to={`/${link.id}`} {...props} />}',
  '/>',
].join('\n')

export function ShellSection() {
  const [query, setQuery] = useState('')

  return (
    <section className="demo-section" id="shell">
      <h2 className="demo-section__title">Shell</h2>
      <div className="demo-grid demo-grid--1">
        <DemoBlock name="AppBar" block code={APPBAR_CODE}>
          <AppBar
            brand="Курьер 7"
            actions={[{ id: 'shift', label: 'Смена' }, { id: 'reports', label: 'Отчёты' }]}
            trailing={<Button variant="ghost">Выйти</Button>}
          >
            <span>Тестовая база</span>
          </AppBar>
        </DemoBlock>
        <DemoBlock name="CommandBar" code={COMMANDBAR_CODE}>
          <CommandBar aria-label="Действия документа" actions={DOC_ACTIONS} />
        </DemoBlock>
        <DemoBlock name="GlobalSearch" block code={GLOBALSEARCH_CODE}>
          <div className="demo-field-width">
            <GlobalSearch
              value={query}
              onChange={setQuery}
              results={query ? RESULTS : []}
              onSelect={(id) => setQuery(id)}
              placeholder="Поиск везде"
            />
          </div>
        </DemoBlock>
        <DemoBlock name="FunctionPanel" code={FUNCTIONPANEL_CODE}>
          <FunctionPanel groups={GROUPS} />
        </DemoBlock>
        <DemoBlock name="FunctionPanel · renderItem" code={FUNCTIONPANEL_LINKS_CODE}>
          <FunctionPanel groups={GROUPS} renderItem={(link, props) => <a href={`#${link.id}`} {...props} />} />
        </DemoBlock>
        <DemoBlock name="ThemeToggle" code={'<ThemeToggle />'}>
          <ThemeToggle />
        </DemoBlock>
      </div>
    </section>
  )
}
