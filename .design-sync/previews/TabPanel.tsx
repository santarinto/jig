import { Tabs, TabPanel, DataTable } from '@santarinto/jig'
import type { Column } from '@santarinto/jig'

/**
 * `TabPanel` рисуется только вместе с `Tabs` — в одиночку это прямоугольник без
 * смысла. Связь собирается из двух совпадающих значений: `tabsId` равен `id`
 * соседних вкладок, `selectedId` — их активной вкладке. Панели не нужно знать,
 * какая вкладка активна, чтобы нарисовать стык: его рисуют сами вкладки.
 */

const tabs = [
  { id: 'lines', label: 'Строки', count: 3 },
  { id: 'props', label: 'Реквизиты' },
]

export const Default = () => (
  <div style={{ width: 520 }}>
    <Tabs id="doc" selectedId="props" onSelect={() => {}} tabs={tabs} />
    <TabPanel tabsId="doc" selectedId="props">
      Паддинг по умолчанию — под текст, показатели и графики: содержимое не
      должно упираться в рамку виджета.
    </TabPanel>
  </div>
)

interface Line { id: string; name: string; qty: number; sum: string }

const columns: Column<Line>[] = [
  { key: 'name', header: 'Номенклатура' },
  { key: 'qty', header: 'Кол-во', numeric: true },
  { key: 'sum', header: 'Сумма', numeric: true },
]

const rows: Line[] = [
  { id: '1', name: 'Ноутбук ASUS Vivobook', qty: 2, sum: '109 800,00' },
  { id: '2', name: 'Мышь Logitech MX', qty: 5, sum: '6 450,00' },
  { id: '3', name: 'Монитор LG 27"', qty: 3, sum: '55 200,00' },
]

/**
 * `noPadding` — под содержимое со своими краями. `DataTable` рисует строки от
 * границы до границы; внутренний отступ панели оставил бы поля, из-за которых
 * таблица перестала бы читаться как часть виджета.
 */
export const NoPadding = () => (
  <div style={{ width: 520 }}>
    <Tabs id="doc-lines" selectedId="lines" onSelect={() => {}} tabs={tabs} />
    <TabPanel tabsId="doc-lines" selectedId="lines" noPadding>
      <DataTable columns={columns} rows={rows} getRowId={(r) => r.id} />
    </TabPanel>
  </div>
)
