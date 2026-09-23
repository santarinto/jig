import { useMemo, useState } from 'react'
import { useDsLocale } from '../../dictionary/index.js'
import { CommandBar, type CommandAction } from '../../components/CommandBar/index.js'
import { Card, FormRow } from '../../components/Form/index.js'
import { TextField } from '../../components/TextField/index.js'
import { Combobox } from '../../components/Combobox/index.js'
import { DataTable, type Column } from '../../components/DataTable/index.js'
import { Badge } from '../../components/Badge/index.js'
import './DocumentFormExample.css'

interface Line { id: string; name: string; qty: number; price: number; sum: number }

/**
 * Колонки строятся ОТ ЛОКАЛИ, а не лежат модульной константой (DS-184).
 *
 * Так это и делает потребитель: локаль он берёт у системы тем же `useDsLocale`,
 * которым её берут наши компоненты, — иначе его собственная колонка «Сумма» и
 * наш заголовок месяца разъедутся по разделителю разрядов на одном экране.
 * Прибитый в этом файле `'ru-RU'` был ровно такой второй источник.
 */
function makeColumns(locale: string): Column<Line>[] {
  const money = new Intl.NumberFormat(locale, { minimumFractionDigits: 2 })
  return [
    { key: 'name', header: 'Номенклатура' },
    { key: 'qty', header: 'Кол-во', numeric: true },
    { key: 'price', header: 'Цена', numeric: true, render: (r) => money.format(r.price) },
    { key: 'sum', header: 'Сумма', numeric: true, render: (r) => money.format(r.sum) },
  ]
}
const rows: Line[] = [
  { id: '1', name: 'Ноутбук ASUS', qty: 2, price: 54900, sum: 109800 },
  { id: '2', name: 'Мышь Logitech', qty: 5, price: 1290, sum: 6450 },
]
/**
 * Действия — ДАННЫМИ (DS-239). Группа не рисует разделитель сама: его
 * ставит панель там, где имя группы сменилось, и при свёртке хвоста в «Ещё»
 * он уходит вместе со своей группой, а не остаётся сиротой у правого края.
 *
 * `Badge` «Не проведён» — не действие, а состояние документа, и живёт он в
 * `trailing`: в меню состояние не прячут, его читают.
 */
const ACTIONS: CommandAction[] = [
  { id: 'post-close', label: 'Провести и закрыть', variant: 'primary', group: 'write' },
  { id: 'save', label: 'Записать', variant: 'secondary', group: 'write' },
  { id: 'print', label: 'Печать', group: 'print' },
]

const orgs = [
  { value: 'romashka', label: 'ООО «Ромашка»' },
  { value: 'ip', label: 'ИП Иванов И.И.' },
]

export function DocumentFormExample() {
  const [org, setOrg] = useState('romashka')
  const locale = useDsLocale()
  const columns = useMemo(() => makeColumns(locale), [locale])
  return (
    <div className="ds-example-doc">
      <CommandBar
        aria-label="Команды документа"
        actions={ACTIONS}
        trailing={<Badge tone="warning">Не проведён</Badge>}
      />
      <Card title="Реализация товаров №РТ-0001 от 24.07.2026">
        <FormRow label="Организация"><Combobox options={orgs} value={org} onChange={setOrg} /></FormRow>
        <FormRow label="Контрагент" htmlFor="doc-kontr"><TextField id="doc-kontr" defaultValue="ООО «Покупатель»" /></FormRow>
        <FormRow label="Договор" htmlFor="doc-dogovor"><TextField id="doc-dogovor" defaultValue="Основной договор" /></FormRow>
        <div className="ds-example-doc__table">
          <DataTable columns={columns} rows={rows} getRowId={(r) => r.id} />
        </div>
      </Card>
    </div>
  )
}
