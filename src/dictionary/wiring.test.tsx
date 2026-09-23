import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { DsText } from './DsText.js'
import type { DsTextOverrides } from './text.js'
import { Modal } from '../components/Modal/Modal.js'
import { Drawer } from '../components/Drawer/Drawer.js'
import { Alert } from '../components/Alert/Alert.js'
import { Toast, NotificationCenter } from '../components/Notifications/Notifications.js'
import { SearchBar } from '../components/SearchBar/SearchBar.js'
import { DatePicker } from '../components/DatePicker/DatePicker.js'
import { NumberField } from '../components/NumberField/NumberField.js'
import { CodeInput } from '../components/CodeInput/CodeInput.js'
import { FileDrop } from '../components/FileDrop/FileDrop.js'
import { Tabs } from '../components/Tabs/Tabs.js'
import { Breadcrumbs } from '../components/Breadcrumbs/Breadcrumbs.js'
import { Pagination } from '../components/Pagination/Pagination.js'
import { FormTabs } from '../components/FormTabs/FormTabs.js'
import { FunctionPanel } from '../components/FunctionPanel/FunctionPanel.js'
import { RouteBar } from '../components/RouteBar/RouteBar.js'
import { DropdownMenu } from '../components/DropdownMenu/DropdownMenu.js'
import { Calendar } from '../components/Calendar/Calendar.js'
import { DataTable } from '../components/DataTable/DataTable.js'
import { PivotTable } from '../components/PivotTable/PivotTable.js'
import type { Column } from '../internal/columns.js'
import type { DisplayRow } from '../internal/rowModel.js'
import { MetricStrip } from '../components/MetricStrip/MetricStrip.js'
import { Skeleton } from '../components/Skeleton/Skeleton.js'
import { Avatar } from '../components/Avatar/Avatar.js'
import { AsOf } from '../components/AsOf/AsOf.js'
import { Heatmap } from '../components/Heatmap/Heatmap.js'
import { BarChart } from '../components/BarChart/BarChart.js'
import { LineChart } from '../components/LineChart/LineChart.js'
import { DonutChart } from '../components/DonutChart/DonutChart.js'
import { LogViewer } from '../components/LogViewer/LogViewer.js'
import { AgentTranscript } from '../components/AgentTranscript/AgentTranscript.js'
import { CodeBlock } from '../components/CodeBlock/CodeBlock.js'
import { Combobox } from '../components/Combobox/Combobox.js'
import { EstimateMark } from '../components/EstimateMark/EstimateMark.js'
import { GlobalSearch } from '../components/GlobalSearch/GlobalSearch.js'
import { Money } from '../components/Money/Money.js'
import { Split } from '../components/Split/Split.js'
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle.js'
import { EdgeBundling } from '../components/EdgeBundling/EdgeBundling.js'

/**
 * Что здесь проверяется и почему отдельным файлом.
 *
 * Существующие тесты компонентов зелены НЕЗАВИСИМО от того, доехал ли словарь:
 * умолчание русское, и «Закрыть» в разметке появится хоть из контекста, хоть из
 * забытого литерала. Гейт `no-hardcoded-ui-string` ловит литерал, но не ловит
 * приватную константу рядом с компонентом. Поймать «компонент читает СЛОВАРЬ»
 * может только переопределение, дошедшее до разметки.
 *
 * Поэтому файл растёт вместе с переводом: каждый подключённый компонент
 * добавляет сюда строчку, и без неё подключение не считается сделанным.
 */
function withText(value: DsTextOverrides, ui: ReactNode) {
  return render(<DsText value={value}>{ui}</DsText>)
}

describe('оверлеи читают словарь', () => {
  it('Modal', () => {
    withText({ 'modal.close': 'Close' }, <Modal open onClose={() => {}} title="T">x</Modal>)
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('Drawer', () => {
    withText({ 'drawer.close': 'Close' }, <Drawer open onClose={() => {}} title="T">x</Drawer>)
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('Alert', () => {
    withText({ 'alert.close': 'Close' }, <Alert onClose={() => {}}>x</Alert>)
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('Toast', () => {
    withText({ 'toast.close': 'Close' }, <Toast onClose={() => {}}>x</Toast>)
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('NotificationCenter: и область, и подстановка имени в «Скрыть …»', () => {
    withText(
      { 'notificationCenter.region': 'Alerts', 'notificationCenter.dismiss': (title) => `Dismiss ${title}` },
      <NotificationCenter items={[{ id: '1', title: 'Отчёт готов' }]} onDismiss={() => {}} />,
    )
    expect(screen.getByRole('log', { name: 'Alerts' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss Отчёт готов' })).toBeInTheDocument()
  })
})

describe('поля читают словарь', () => {
  it('SearchBar: обе кнопки и плейсхолдер', () => {
    withText(
      { 'searchBar.clear': 'Clear', 'searchBar.submit': 'Search', 'searchBar.placeholder': 'Find…' },
      <SearchBar value="x" onChange={() => {}} />,
    )
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Find…')).toBeInTheDocument()
  })

  it('SearchBar: проп сильнее словаря', () => {
    withText(
      { 'searchBar.placeholder': 'Find…' },
      <SearchBar value="" onChange={() => {}} placeholder="Своё" />,
    )
    expect(screen.getByPlaceholderText('Своё')).toBeInTheDocument()
  })

  it('DatePicker: очистка, кнопка календаря и плейсхолдер', () => {
    withText(
      { 'datePicker.clear': 'Clear', 'datePicker.open': 'Calendar', 'datePicker.placeholder': 'DD.MM.YYYY' },
      <DatePicker value="2026-03-15" onChange={() => {}} />,
    )
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Calendar' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('DD.MM.YYYY')).toBeInTheDocument()
  })

  it('NumberField: обе кнопки шага', () => {
    withText(
      { 'numberField.decrement': 'Less', 'numberField.increment': 'More' },
      <NumberField value={1} onChange={() => {}} />,
    )
    expect(screen.getByRole('button', { name: 'Less' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument()
  })

  it('CodeInput: номер ячейки подставляется', () => {
    withText(
      { 'codeInput.digit': (n) => `Digit ${n}` },
      <CodeInput length={3} value="" onChange={() => {}} />,
    )
    expect(screen.getByRole('textbox', { name: 'Digit 3' })).toBeInTheDocument()
  })

  it('FileDrop: имя файла подставляется', () => {
    withText(
      { 'fileDrop.remove': (name) => `Remove ${name}` },
      <FileDrop files={[new File(['x'], 'акт.pdf')]} onFiles={() => {}} />,
    )
    expect(screen.getByRole('button', { name: 'Remove акт.pdf' })).toBeInTheDocument()
  })
})

/**
 * Кнопки прокрутки и «Ещё вкладки» у `Tabs` живут за замером: `scrollWidth >
 * clientWidth`. В jsdom обе метрики — ноль, полоса никогда не считается
 * переполненной, и без подмены три ключа остались бы без проверки вовсе —
 * молча, потому что тест на них просто не нашёл бы кнопок.
 */
function stubOverflow(client: number, scroll: number, start: number) {
  const proto = window.HTMLElement.prototype
  const saved = ['clientWidth', 'scrollWidth', 'scrollLeft'].map(
    (k) => [k, Object.getOwnPropertyDescriptor(proto, k)] as const,
  )
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get: () => client })
  Object.defineProperty(proto, 'scrollWidth', { configurable: true, get: () => scroll })
  Object.defineProperty(proto, 'scrollLeft', { configurable: true, get: () => start, set: () => {} })
  return () => {
    for (const [k, d] of saved) {
      if (d) Object.defineProperty(proto, k, d)
      else delete (proto as unknown as Record<string, unknown>)[k]
    }
  }
}

describe('навигация читает словарь', () => {
  let restore: (() => void) | null = null
  afterEach(() => { restore?.(); restore = null })

  it('Tabs: обе кнопки прокрутки — только при переполненной полосе', () => {
    restore = stubOverflow(100, 500, 50)
    withText(
      { 'tabs.scrollStart': 'Scroll to start', 'tabs.scrollEnd': 'Scroll to end' },
      <Tabs tabs={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} selectedId="a" onSelect={() => {}} />,
    )
    expect(screen.getByRole('button', { name: 'Scroll to start' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scroll to end' })).toBeInTheDocument()
  })

  it('Tabs: кнопка «Ещё вкладки» при overflow="menu"', () => {
    restore = stubOverflow(100, 500, 0)
    withText(
      { 'tabs.more': 'More tabs' },
      <Tabs tabs={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} selectedId="a" onSelect={() => {}} overflow="menu" />,
    )
    expect(screen.getByRole('button', { name: 'More tabs' })).toBeInTheDocument()
  })

  it('Tabs: подстановка имени вкладки в «Закрыть вкладку …»', () => {
    withText(
      { 'tabs.closeTab': (label) => `Close ${label}` },
      <Tabs
        tabs={[{ id: 'a', label: 'Отчёт', closable: true }]}
        selectedId="a"
        onSelect={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Close Отчёт' })).toBeInTheDocument()
  })

  it('Breadcrumbs', () => {
    withText({ 'breadcrumbs.nav': 'Path' }, <Breadcrumbs items={[{ id: 'a', label: 'Парк' }]} />)
    expect(screen.getByRole('navigation', { name: 'Path' })).toBeInTheDocument()
  })

  it('Pagination: область, обе кнопки, подпись селектора и диапазон', () => {
    withText(
      {
        'pagination.nav': 'Pages',
        'pagination.prev': 'Prev',
        'pagination.next': 'Next',
        'pagination.pageSizeLabel': 'Per page',
        'pagination.range': (from, to, total) => `${from}–${to} of ${total}`,
      },
      <Pagination page={2} pageCount={5} total={50} pageSize={10} pageSizeOptions={[10, 20]} />,
    )
    expect(screen.getByRole('navigation', { name: 'Pages' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prev' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
    expect(screen.getByText('Per page')).toBeInTheDocument()
    expect(screen.getByText('11–20 of 50')).toBeInTheDocument()
  })

  it('Pagination: проп formatRange сильнее словаря', () => {
    withText(
      { 'pagination.range': () => 'из словаря' },
      <Pagination page={1} pageCount={2} total={20} pageSize={10} formatRange={() => 'из пропа'} />,
    )
    expect(screen.getByText('из пропа')).toBeInTheDocument()
  })

  it('FormTabs: домой и закрытие с именем формы', () => {
    withText(
      { 'formTabs.home': 'Home', 'formTabs.close': (label) => `Close ${label}` },
      <FormTabs
        tabs={[{ id: 'a', label: 'Накладная' }]}
        selectedId="a"
        onSelect={() => {}}
        onClose={() => {}}
        onHome={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument()
    // `formTabs.close` уехал из `aria-label` в `title` (DS-175): крестик
    // больше не кнопка, а `aria-hidden`-мишень для мыши, и `title` — то
    // единственное, что от ключа осталось видно. Ключ при этом ЖИВ и по-прежнему
    // берётся из словаря — что здесь и проверяется; закрытие с клавиатуры висит
    // на `Delete`, у него имени нет.
    expect(screen.queryByRole('button', { name: 'Close Накладная' })).toBeNull()
    expect(screen.getByTitle('Close Накладная')).toBeInTheDocument()
  })

  it('FunctionPanel', () => {
    withText(
      { 'functionPanel.nav': 'Section tools' },
      <FunctionPanel groups={[{ title: 'Отчёты', links: [{ id: 'a', label: 'Реестр' }] }]} />,
    )
    expect(screen.getByRole('navigation', { name: 'Section tools' })).toBeInTheDocument()
  })

  it('RouteBar: словарь даёт умолчание, проп его бьёт', () => {
    const routes = [{ id: 'a', label: 'Парк', href: '/park' }]
    const { unmount } = withText({ 'routeBar.nav': 'Sections' }, <RouteBar routes={routes} selectedId="a" />)
    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeInTheDocument()
    unmount()

    withText({ 'routeBar.nav': 'Sections' }, <RouteBar routes={routes} selectedId="a" ariaLabel="Своё" />)
    expect(screen.getByRole('navigation', { name: 'Своё' })).toBeInTheDocument()
  })

  it('DropdownMenu: словарь даёт умолчание кнопке «⋯»', () => {
    withText({ 'dropdownMenu.label': 'Actions' }, <DropdownMenu items={[{ id: 'del', label: 'Удалить' }]} />)
    expect(screen.getByRole('button', { name: 'Actions' })).toBeInTheDocument()
  })

  it('Calendar: год, месяц и обе стрелки', () => {
    withText(
      {
        'calendar.year': 'Year',
        'calendar.month': 'Month',
        'calendar.prevMonth': 'Previous month',
        'calendar.nextMonth': 'Next month',
      },
      <Calendar year={2026} month={2} onNavigate={() => {}} />,
    )
    expect(screen.getByRole('combobox', { name: 'Year' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Month' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument()
  })
})

type Goods = { id: string; name: string; sum: number }
const goods: Goods[] = [{ id: '1', name: 'Товар А', sum: 1200 }]
const goodsColumns: Column<Goods>[] = [
  { key: 'name', header: 'Номенклатура', rowHeader: true },
  { key: 'sum', header: 'Сумма', numeric: true },
]
const branch: DisplayRow<Goods>[] = [
  { kind: 'data', id: '1', row: goods[0]!, depth: 0, hasChildren: true, expanded: false },
]

describe('таблицы читают словарь', () => {
  it('DataTable: имена служебных колонок и подстановка id строки в флажок', () => {
    withText(
      {
        'dataTable.selectColumn': 'Selection',
        'dataTable.actionsColumn': 'Actions',
        'dataTable.selectRow': (id) => `Select row ${id}`,
      },
      <DataTable
        columns={[...goodsColumns, { id: 'act', header: 'Действия', headerHidden: true, actions: () => [] }]}
        rows={goods}
        getRowId={(r) => r.id}
        selectedIds={[]}
        onSelectionChange={() => {}}
      />,
    )
    expect(screen.getByText('Selection')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select row 1' })).toBeInTheDocument()
  })

  it('DataTable: свёрнутая и развёрнутая строка берут РАЗНЫЕ ключи', () => {
    const overrides = {
      'dataTable.expandRow': (id: string) => `Expand ${id}`,
      'dataTable.collapseRow': (id: string) => `Collapse ${id}`,
    }
    const { unmount } = withText(overrides,
      <DataTable columns={goodsColumns} displayRows={branch} onToggleExpand={() => {}} />)
    expect(screen.getByRole('button', { name: 'Expand 1' })).toBeInTheDocument()
    unmount()

    withText(overrides,
      <DataTable
        columns={goodsColumns}
        displayRows={[{ ...branch[0]!, expanded: true }]}
        onToggleExpand={() => {}}
      />)
    expect(screen.getByRole('button', { name: 'Collapse 1' })).toBeInTheDocument()
  })

  it('PivotTable: итог из словаря, проп сильнее', () => {
    const pivot = (extra?: { totalLabel?: string }) => (
      <PivotTable
        rows={goods}
        rowDimensions={[{ id: 'name', label: 'Номенклатура', value: (r: Goods) => r.name }]}
        measures={[{ id: 'sum', label: 'Сумма', agg: 'sum', value: (r: Goods) => r.sum }]}
        {...extra}
      />
    )
    const { unmount } = withText({ 'pivotTable.total': 'Total' }, pivot())
    expect(screen.getAllByText('Total').length).toBeGreaterThan(0)
    unmount()

    withText({ 'pivotTable.total': 'Total' }, pivot({ totalLabel: 'Своё' }))
    expect(screen.getAllByText('Своё').length).toBeGreaterThan(0)
  })

  it('PivotTable: пустая выборка объясняется словарём', () => {
    withText({ 'pivotTable.empty': 'Nothing to pivot' },
      <PivotTable
        rows={[] as Goods[]}
        rowDimensions={[{ id: 'name', label: 'Номенклатура', value: (r: Goods) => r.name }]}
        measures={[{ id: 'sum', label: 'Сумма', agg: 'sum', value: (r: Goods) => r.sum }]}
      />)
    expect(screen.getByText('Nothing to pivot')).toBeInTheDocument()
  })
})

describe('данные и графики читают словарь', () => {
  it('MetricStrip: «данных нет» — видимого знака мало, имя даётся текстом', () => {
    withText({ 'metricStrip.noData': 'no data' },
      <MetricStrip metrics={[{ id: 'a', label: 'Прогоны', value: null }]} />)
    expect(screen.getByText('no data')).toBeInTheDocument()
  })

  it('Skeleton: обе ветки — одна строка и несколько', () => {
    const { unmount } = withText({ 'skeleton.loading': 'Loading' }, <Skeleton />)
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    unmount()

    withText({ 'skeleton.loading': 'Loading' }, <Skeleton lines={3} />)
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
  })

  it('Avatar: присутствие берёт свой ключ, проп presenceLabel сильнее', () => {
    const { unmount } = withText({ 'avatar.busy': 'busy' }, <Avatar name="Иван Петров" presence="busy" />)
    expect(screen.getByLabelText('Иван Петров, busy')).toBeInTheDocument()
    unmount()

    withText({ 'avatar.busy': 'busy' }, <Avatar name="Иван Петров" presence="busy" presenceLabel="на встрече" />)
    expect(screen.getByLabelText('Иван Петров, на встрече')).toBeInTheDocument()
  })

  it('AsOf: предлог, пометка устаревания и счёт дней', () => {
    withText(
      { 'asOf.at': 'as of', 'asOf.stale': 'stale', 'asOf.days': (d) => `${d} d.` },
      <AsOf date="2026-08-01" stale={{ today: '2026-09-01', afterDays: 7 }} />,
    )
    expect(screen.getByText('as of', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('· stale, 31 d.')).toBeInTheDocument()
  })

  it('Heatmap: имя сетки с обеими датами и обе подписи легенды', () => {
    withText(
      { 'heatmap.grid': (from, to) => `Activity ${from} → ${to}`, 'heatmap.less': 'less', 'heatmap.more': 'more' },
      <Heatmap data={[]} from="2026-01-01" to="2026-01-31" />,
    )
    expect(screen.getByLabelText(/^Activity .+ → .+$/)).toBeInTheDocument()
    expect(screen.getByText('less')).toBeInTheDocument()
    expect(screen.getByText('more')).toBeInTheDocument()
  })

  /**
   * Имя ОБЛАСТИ — отдельный ключ, а не тот же `heatmap.grid` (DS-192).
   * Прокручиваемая область фокусируема, и на входе в неё звучит её имя;
   * повторить там датированную подпись картинки значило бы произнести одну
   * строку дважды подряд. Утверждение проверяет, что имена РАЗНЫЕ и оба из
   * словаря: один ключ на двоих читался бы как решение и был бы недосмотром.
   */
  it('Heatmap: имя прокручиваемой области — свой ключ, не подпись картинки', () => {
    const { container } = withText(
      { 'heatmap.grid': (from, to) => `Activity ${from} → ${to}`, 'heatmap.region': 'Activity grid' },
      <Heatmap data={[]} from="2026-01-01" to="2026-01-31" />,
    )
    expect(container.querySelector('.ds-heat__scroll')?.getAttribute('aria-label')).toBe('Activity grid')
    expect(container.querySelector('.ds-heat__grid')?.getAttribute('aria-label')).toMatch(/^Activity .+ → .+$/)
  })

  it('графики: вид диаграммы попадает в доступное имя', () => {
    const { unmount: u1 } = withText({ 'chart.bar': 'Bar chart' },
      <BarChart categories={['янв']} series={[{ id: 's', label: 'Выручка', values: [1] }]} />)
    expect(screen.getByLabelText(/^Bar chart:/)).toBeInTheDocument()
    u1()

    const { unmount: u2 } = withText({ 'chart.line': 'Line chart' },
      <LineChart series={[{ id: 's', label: 'Выручка', points: [{ x: 0, y: 1 }, { x: 1, y: 2 }] }]} />)
    expect(screen.getByLabelText(/^Line chart:/)).toBeInTheDocument()
    u2()

    withText({ 'chart.donut': 'Donut chart', 'donutChart.total': 'Total' },
      <DonutChart data={[{ id: 'a', label: 'Курьеры', value: 10 }]} />)
    expect(screen.getByLabelText(/^Donut chart:/)).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
  })

  it('графики: подпись «все ряды скрыты» из словаря у обоих графиков с легендой', async () => {
    const two = [{ id: 'a', label: 'A', values: [1] }, { id: 'b', label: 'B', values: [2] }]
    const { container: bar, unmount } = withText({ 'chart.allHidden': 'All series hidden' },
      <BarChart categories={['янв']} series={two} />)
    for (const chip of screen.getAllByRole('button')) await userEvent.click(chip)
    expect(bar.querySelector('.ds-bar__empty')?.textContent).toBe('All series hidden')
    unmount()

    const lines = two.map((s) => ({ id: s.id, label: s.label, points: [{ x: 0, y: 1 }, { x: 1, y: 2 }] }))
    const { container: line } = withText({ 'chart.allHidden': 'All series hidden' },
      <LineChart series={lines} />)
    for (const chip of screen.getAllByRole('button')) await userEvent.click(chip)
    expect(line.querySelector('.ds-chart__empty')?.textContent).toBe('All series hidden')
  })
})

describe('журналы читают словарь', () => {
  const lines = [
    { ts: '2026-09-01T10:00:00Z', kind: 'info', text: 'старт обработки' },
    { ts: '2026-09-01T10:00:01Z', kind: 'info', text: 'обработка завершена' },
  ]

  it('LogViewer: навигация по совпадениям целиком — область, обе стрелки и подсказка счётчика', () => {
    withText(
      {
        'logViewer.matchNav': 'Match navigation',
        'logViewer.prevMatch': 'Previous match',
        'logViewer.nextMatch': 'Next match',
        'logViewer.matchCountHint': 'Matches in the loaded log',
      },
      <LogViewer lines={lines} getLineId={(l) => l.ts} query="обработ" />,
    )
    expect(screen.getByRole('group', { name: 'Match navigation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous match' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next match' })).toBeInTheDocument()
    expect(screen.getByTitle('Matches in the loaded log')).toBeInTheDocument()
  })

  it('AgentTranscript: подпись размышлений и параметров инструмента', () => {
    withText(
      { 'agentTranscript.thinking': 'Thinking', 'agentTranscript.tool': 'Parameters' },
      <AgentTranscript
        getTurnId={(t) => t.id}
        turns={[
          { id: '1', kind: 'message', ts: '2026-09-01T10:00:00Z', role: 'assistant', text: 'готово', thinking: 'прикидываю' },
          {
            id: '2',
            kind: 'message',
            ts: '2026-09-01T10:00:01Z',
            role: 'assistant',
            text: '',
            toolCalls: [{ id: 'c1', name: 'grep', input: '-rn foo' }],
          },
        ]}
      />,
    )
    expect(screen.getByText('Thinking')).toBeInTheDocument()
    expect(screen.getByText('Parameters')).toBeInTheDocument()
  })

  it('AgentTranscript: «печатает» попадает в имя заголовка реплики', () => {
    withText(
      { 'agentTranscript.streaming': 'typing' },
      <AgentTranscript
        getTurnId={(t) => t.id}
        turns={[{ id: '1', kind: 'message', ts: '2026-09-01T10:00:00Z', role: 'assistant', text: 'по', streaming: true }]}
        onTurnClick={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /typing$/ })).toBeInTheDocument()
  })

  it('AgentTranscript: ожидание и результат инструмента', () => {
    const overrides = { 'agentTranscript.pending': 'waiting…', 'agentTranscript.result': 'Result' }
    const call = (result: { text: string; pending?: boolean }) => (
      <AgentTranscript
        getTurnId={(t) => t.id}
        turns={[{
          id: '1', kind: 'message', ts: '2026-09-01T10:00:00Z', role: 'assistant', text: '',
          toolCalls: [{ id: 'c1', name: 'grep', input: '-rn foo', result }],
        }]}
      />
    )
    const { unmount } = withText(overrides, call({ text: '', pending: true }))
    expect(screen.getByLabelText('waiting…')).toBeInTheDocument()
    unmount()

    // `CodeBlock` кладёт `label` в `aria-label` блока, а не в видимый текст.
    withText(overrides, call({ text: 'ok' }))
    expect(screen.getByRole('group', { name: 'Result' })).toBeInTheDocument()
  })
})

describe('остаток каталога читает словарь', () => {
  it('Calendar: «Сегодня»', () => {
    withText({ 'calendar.today': 'Today' }, <Calendar year={2026} month={2} onToday={() => {}} />)
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument()
  })

  it('CodeBlock: все три подписи копирования, включая невидимый распорщик', () => {
    withText(
      { 'codeBlock.copy': 'Copy', 'codeBlock.copied': 'Copied', 'codeBlock.copyFailed': 'Failed' },
      <CodeBlock code="ls -la" />,
    )
    // Распорщик держит все три сразу, поэтому каждой подписи по два вхождения.
    expect(screen.getAllByText('Copy')).toHaveLength(2)
    expect(screen.getByText('Copied')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('Combobox: плейсхолдер значения, а в раскрытом списке — поиск, пустота и предложение создать', async () => {
    const user = userEvent.setup()
    withText(
      {
        'combobox.placeholder': 'Choose…',
        'combobox.empty': 'Nothing found',
        'combobox.create': (q) => `Create "${q}"`,
        'combobox.searchPlaceholder': 'Search…',
      },
      <Combobox options={[{ value: 'a', label: 'Альфа' }]} value="" onChange={() => {}} onCreate={() => {}} />,
    )
    expect(screen.getByText('Choose…')).toBeInTheDocument()

    await user.click(screen.getByRole('button'))
    const search = screen.getByPlaceholderText('Search…')
    await user.type(search, 'Бета')
    expect(screen.getByText('Create "Бета"')).toBeInTheDocument()

    // «Ничего не найдено» показывается только когда создавать нечем: с
    // `onCreate` его место занимает предложение создать.
    expect(screen.queryByText('Nothing found')).not.toBeInTheDocument()
  })

  it('Combobox: без onCreate пустой список объясняется словарём', async () => {
    const user = userEvent.setup()
    withText({ 'combobox.empty': 'Nothing found', 'combobox.searchPlaceholder': 'Search…' },
      <Combobox options={[{ value: 'a', label: 'Альфа' }]} value="" onChange={() => {}} />)
    await user.click(screen.getByRole('button'))
    await user.type(screen.getByPlaceholderText('Search…'), 'Бета')
    expect(screen.getByText('Nothing found')).toBeInTheDocument()
  })

  it('EstimateMark: пояснение звёздочки, проп сильнее', () => {
    const { unmount } = withText({ 'estimateMark.hint': 'estimate' }, <EstimateMark />)
    expect(screen.getByText('estimate')).toBeInTheDocument()
    unmount()

    withText({ 'estimateMark.hint': 'estimate' }, <EstimateMark hint="приблизительно" />)
    expect(screen.getByText('приблизительно')).toBeInTheDocument()
  })

  it('GlobalSearch: плейсхолдер', () => {
    withText({ 'globalSearch.placeholder': 'Search everywhere' },
      <GlobalSearch value="" onChange={() => {}} />)
    expect(screen.getByPlaceholderText('Search everywhere')).toBeInTheDocument()
  })

  it('FileDrop: приглашение зоны и формат размера файла', () => {
    withText(
      { 'fileDrop.dropHint': 'Drop files here or', 'fileDrop.browse': 'browse', 'fileDrop.size': (b) => `${b} bytes` },
      <FileDrop files={[new File(['xx'], 'акт.pdf')]} onFiles={() => {}} />,
    )
    expect(screen.getByText('Drop files here or', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('browse')).toBeInTheDocument()
    expect(screen.getByText('2 bytes')).toBeInTheDocument()
  })

  it('Money: подпись даты курса', () => {
    withText({ 'money.rateAt': 'rate of' },
      <Money value="1000" currency="USD" secondary={{ value: '90000', currency: 'RUB', rateDate: '2026-08-01' }} />)
    expect(screen.getByText('rate of', { exact: false })).toBeInTheDocument()
  })

  it('Split: имя ручки, проп сильнее', () => {
    const { unmount } = withText({ 'split.resize': 'Resize' }, <Split><div>a</div><div>b</div></Split>)
    expect(screen.getByRole('separator', { name: 'Resize' })).toBeInTheDocument()
    unmount()

    withText({ 'split.resize': 'Resize' }, <Split aria-label="Своё"><div>a</div><div>b</div></Split>)
    expect(screen.getByRole('separator', { name: 'Своё' })).toBeInTheDocument()
  })

  it('ThemeToggle: обе стороны переключателя берут РАЗНЫЕ ключи', () => {
    withText({ 'themeToggle.toLight': 'Light theme', 'themeToggle.toDark': 'Dark theme' }, <ThemeToggle />)
    expect(screen.getByRole('button', { name: /theme$/i })).toBeInTheDocument()
  })

  it('EdgeBundling: сводка со склонением по числу приходит из словаря', () => {
    withText(
      { 'edgeBundling.summary': (nodes, edges) => `Bundling: ${nodes} nodes, ${edges} edges` },
      <EdgeBundling items={[{ id: 'a.b', links: ['a.c'] }, { id: 'a.c', links: [] }]} />,
    )
    expect(screen.getByLabelText('Bundling: 2 nodes, 1 edges')).toBeInTheDocument()
  })
})
