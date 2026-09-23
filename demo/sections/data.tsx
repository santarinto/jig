import { useState } from 'react'
import { DataTable, flattenTree, groupByValue, type Column, type RowTreeNode } from '../../src/components/DataTable/index.js'
import { LedgerList } from '../../src/components/LedgerList/index.js'
import { Pagination } from '../../src/components/Pagination/index.js'
import { MetricStrip } from '../../src/components/MetricStrip/index.js'
import { KeyValueList } from '../../src/components/KeyValueList/index.js'
import { Timeline } from '../../src/components/Timeline/index.js'
import { LogViewer } from '../../src/components/LogViewer/index.js'
import { Badge } from '../../src/components/Badge/index.js'
import { DemoBlock } from '../demo-spec.js'

interface Row { id: string; name: string; sum: number; status: string }

const ROWS: Row[] = [
  { id: '1', name: 'Реализация №142', sum: 128400, status: 'posted' },
  { id: '2', name: 'Счёт №89', sum: 45200, status: 'draft' },
  { id: '3', name: 'Возврат №12', sum: -8400, status: 'posted' },
]

const COLS: Column<Row>[] = [
  { key: 'name', header: 'Документ' },
  { key: 'sum', header: 'Сумма', align: 'end' },
  {
    id: 'status',
    header: 'Статус',
    render: (r) => (
      <Badge tone={r.status === 'posted' ? 'success' : 'neutral'}>
        {r.status === 'posted' ? 'Проведён' : 'Черновик'}
      </Badge>
    ),
  },
]

const LOG = [
  { ts: '2026-07-31T08:00:01Z', kind: 'info', text: 'Worker started', stream: 'stdout' },
  { ts: '2026-07-31T08:00:02Z', kind: 'warn', text: 'Retry connection…', stream: 'stderr' },
  { ts: '2026-07-31T08:00:05Z', kind: 'info', text: 'Task completed OK', stream: 'stdout' },
]

const TREE: RowTreeNode<Row>[] = [
  { row: { id: 'grp', name: 'Услуги', sum: 173600, status: 'posted' }, children: [
    { row: { id: '1', name: 'Реализация №142', sum: 128400, status: 'posted' } },
    { row: { id: '2', name: 'Счёт №89', sum: 45200, status: 'draft' } },
  ] },
]

// Лента операций (кейс fin-ilya): группировка по дню с итогом в шапке (aside),
// строка-итог в tfoot (footer) и приглушённый фон служебных строк (rowState).
interface Op {
  id: string
  day: string
  title: string
  amount: number // <0 — расход, >0 — приход
  cur: '₽' | '₸'
  ownTransfer?: boolean
  declined?: boolean
}
const FEED: Op[] = [
  { id: 'f1', day: 'Пятница, 8 августа', title: 'Пятёрочка', amount: -1240, cur: '₽' },
  { id: 'f2', day: 'Пятница, 8 августа', title: 'Перевод на свой счёт', amount: -15000, cur: '₽', ownTransfer: true },
  { id: 'f3', day: 'Пятница, 8 августа', title: 'Возврат Wildberries', amount: 2300, cur: '₽' },
  { id: 'f4', day: 'Четверг, 7 августа', title: 'Kaspi платёж', amount: -8000, cur: '₸', declined: true },
  { id: 'f5', day: 'Четверг, 7 августа', title: 'Зарплата', amount: 120000, cur: '₽' },
]

const rub = (n: number) => n.toLocaleString('ru-RU')
const signed = (o: Op) => `${o.amount > 0 ? '+' : o.amount < 0 ? '−' : ''}${rub(Math.abs(o.amount))} ${o.cur}`

// Сумма по валютам: разных валют в дне может быть несколько (₽ и ₸), общего курса нет.
const byCur = (rows: Op[], pick: (o: Op) => boolean) => {
  const m = new Map<string, number>()
  for (const o of rows) if (pick(o)) m.set(o.cur, (m.get(o.cur) ?? 0) + Math.abs(o.amount))
  return [...m].map(([cur, n]) => `${rub(n)} ${cur}`).join(' · ')
}

// Итог за период — знаковая сумма по валютам, отклонённые исключены (денег не
// двигали). Считается из FEED, а не вписан числом: иначе разойдётся с данными
// при первой же правке фикстуры.
const netByCur = (rows: Op[]) => {
  const m = new Map<string, number>()
  for (const o of rows) if (!o.declined) m.set(o.cur, (m.get(o.cur) ?? 0) + o.amount)
  return [...m].map(([cur, n]) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${rub(Math.abs(n))} ${cur}`).join(' · ')
}
const FEED_TOTAL = netByCur(FEED)

const dayAside = (_day: unknown, rows: Op[]) => {
  const spent = byCur(rows, (o) => o.amount < 0 && !o.ownTransfer && !o.declined)
  const received = byCur(rows, (o) => o.amount > 0 && !o.declined)
  const excluded = rows.filter((o) => o.ownTransfer).length
  const declined = rows.filter((o) => o.declined).length
  const note = [
    excluded && `${excluded} между своими не в счёт`,
    declined && `${declined} отклонено`,
  ].filter(Boolean).join(' · ')
  return (
    <span style={{ display: 'inline-flex', gap: 'var(--ds-space-4)', alignItems: 'baseline' }}>
      {spent && <span>потрачено {spent}</span>}
      {received && <span>поступило {received}</span>}
      {note && <span style={{ color: 'var(--ds-text-muted)' }}>{note}</span>}
    </span>
  )
}

const FEED_COLS: Column<Op>[] = [
  {
    id: 'title',
    header: 'Операция',
    // Вычёркивание отклонённой — контент потребителя, а не флаг компонента.
    // Приписка «· отклонена» выходит из-под черты через display: inline-block.
    render: (o) => (
      <span style={{ textDecoration: o.declined ? 'line-through' : undefined }}>
        {o.title}
        {o.declined && (
          <span style={{ display: 'inline-block', textDecoration: 'none', color: 'var(--ds-text-muted)' }}>
            {' · отклонена'}
          </span>
        )}
      </span>
    ),
  },
  { id: 'sum', header: 'Сумма', align: 'end', render: (o) => signed(o) },
]

const FEED_CODE = [
  "const displayRows = groupByValue(FEED, (o) => o.id, 'day', expanded, undefined, {",
  '  // Узел справа в шапке дня: два итога по валютам + приписка-исключение',
  '  aside: (_day, rows) => <DayTotals rows={rows} />,',
  '})',
  '',
  '<DataTable',
  '  columns={FEED_COLS}',
  '  displayRows={displayRows}',
  '  onToggleExpand={toggle}',
  '  // Приглушённый ФОН служебных строк (перевод между своими, отклонённая)',
  '  rowState={(o) => ({ muted: o.ownTransfer || o.declined })}',
  '  // Строка-итог под колонкой суммы (считается из FEED, отклонённые вне счёта)',
  "  footer={{ label: 'Итого за период', cells: { sum: netByCur(FEED) } }}",
  '/>',
].join('\n')

const GROUP_CODE = [
  '// ROWS и COLS — фикстуры из блока DataTable выше',
  "const [expanded, setExpanded] = useState(['group:posted'])",
  '',
  '<DataTable',
  '  columns={COLS}',
  "  displayRows={groupByValue(ROWS, (r) => r.id, 'status', expanded,",
  "    (value, rows) => `${value === 'posted' ? 'Проведённые' : 'Черновики'} (${rows.length})`)}",
  '  onToggleExpand={(id) => setExpanded(',
  '    expanded.includes(id) ? expanded.filter((x) => x !== id) : [...expanded, id],',
  '  )}',
  '/>',
].join('\n')

const TREETABLE_CODE = [
  "// RowTreeNode — узел МОДЕЛИ СТРОК, из '@santarinto/jig'. Не путать с TreeNode:",
  '// то узел компонента Tree, и это другая вещь',
  'const TREE: RowTreeNode<Row>[] = [',
  "  { row: { id: 'grp', name: 'Услуги', sum: 173600, status: 'posted' }, children: [",
  "    { row: { id: '1', name: 'Реализация №142', sum: 128400, status: 'posted' } },",
  "    { row: { id: '2', name: 'Счёт №89', sum: 45200, status: 'draft' } },",
  '  ] },',
  ']',
  "const [expanded, setExpanded] = useState(['grp'])",
  '',
  '<DataTable',
  '  columns={COLS}',
  '  displayRows={flattenTree(TREE, (r) => r.id, expanded)}',
  '  onToggleExpand={(id) => setExpanded(',
  '    expanded.includes(id) ? expanded.filter((x) => x !== id) : [...expanded, id],',
  '  )}',
  '/>',
].join('\n')

// LedgerList: те же операции, но раскрытие детали без JS (<details>). Группы
// всегда развёрнуты (LedgerList не сворачивает группы — раскрываются записи).
const LEDGER_DAYS = [...new Set(FEED.map((o) => `group:${o.day}`))]
const ledgerHasDetails = (o: Op) => !o.ownTransfer && !o.declined
const LEDGER_CODE = [
  '// Раскрытие строки — нативный <details>, без JS и без вашего состояния',
  "const displayRows = groupByValue(FEED, (o) => o.id, 'day', LEDGER_DAYS, undefined, {",
  '  aside: (_day, rows) => <DayTotals rows={rows} />,',
  '})',
  '',
  '<LedgerList',
  '  columns={FEED_COLS}',
  '  displayRows={displayRows}',
  '  rowState={(o) => ({ muted: o.ownTransfer || o.declined })}',
  '  hasDetails={(o) => !o.ownTransfer && !o.declined}',
  '  renderExpanded={(o) => <OpDetails op={o} />}',
  "  footer={{ label: 'Итого за период', cells: { sum: FEED_TOTAL } }}",
  '/>',
].join('\n')

export function DataSection() {
  const [page, setPage] = useState(1)
  const [grouped, setGrouped] = useState(['group:posted'])
  const [treeExpanded, setTreeExpanded] = useState(['grp'])
  const [feedExpanded, setFeedExpanded] = useState(['group:Пятница, 8 августа'])

  return (
    <section className="demo-section" id="data">
      <h2 className="demo-section__title">Data</h2>
      <div className="demo-grid demo-grid--1">
        <DemoBlock
          name="DataTable"
          block
          code={'<DataTable rows={rows} columns={columns} getRowId={(r) => r.id} />'}
        >
          <div className="demo-wide">
            <DataTable rows={ROWS} columns={COLS} getRowId={(r) => r.id} />
          </div>
        </DemoBlock>
        <DemoBlock name="DataTable · groupByValue" block code={GROUP_CODE}>
          <div className="demo-wide">
            <DataTable
              columns={COLS}
              displayRows={groupByValue(ROWS, (r) => r.id, 'status', grouped,
                (value, rows) => `${value === 'posted' ? 'Проведённые' : 'Черновики'} (${rows.length})`)}
              onToggleExpand={(id) => setGrouped(
                grouped.includes(id) ? grouped.filter((x) => x !== id) : [...grouped, id],
              )}
            />
          </div>
        </DemoBlock>
        <DemoBlock name="DataTable · flattenTree" block code={TREETABLE_CODE}>
          <div className="demo-wide">
            <DataTable
              columns={COLS}
              displayRows={flattenTree(TREE, (r) => r.id, treeExpanded)}
              onToggleExpand={(id) => setTreeExpanded(
                treeExpanded.includes(id) ? treeExpanded.filter((x) => x !== id) : [...treeExpanded, id],
              )}
            />
          </div>
        </DemoBlock>
        <DemoBlock name="DataTable · лента операций (aside · footer · rowState)" block code={FEED_CODE}>
          <div className="demo-wide">
            <DataTable
              columns={FEED_COLS}
              displayRows={groupByValue(FEED, (o) => o.id, 'day', feedExpanded, undefined, { aside: dayAside })}
              onToggleExpand={(id) => setFeedExpanded(
                feedExpanded.includes(id) ? feedExpanded.filter((x) => x !== id) : [...feedExpanded, id],
              )}
              rowState={(o) => ({ muted: !!o.ownTransfer || !!o.declined })}
              footer={{ label: 'Итого за период', cells: { sum: FEED_TOTAL } }}
            />
          </div>
        </DemoBlock>
        <DemoBlock name="LedgerList · лента с раскрытием (details, no-JS)" block code={LEDGER_CODE}>
          <div className="demo-wide">
            <LedgerList
              columns={FEED_COLS}
              displayRows={groupByValue(FEED, (o) => o.id, 'day', LEDGER_DAYS, undefined, { aside: dayAside })}
              rowState={(o) => ({ muted: !!o.ownTransfer || !!o.declined })}
              hasDetails={ledgerHasDetails}
              renderExpanded={(o) => (
                <div style={{ display: 'flex', gap: 'var(--ds-space-5)', flexWrap: 'wrap' }}>
                  <span>Категория: {o.amount > 0 ? 'поступления' : 'покупки'}</span>
                  <span>Валюта операции: {o.cur}</span>
                  <span>Комиссия: 0 {o.cur}</span>
                </div>
              )}
              footer={{ label: 'Итого за период', cells: { sum: FEED_TOTAL } }}
            />
          </div>
        </DemoBlock>
        <DemoBlock
          name="Pagination"
          block
          code={'<Pagination page={page} pageCount={12} onChange={setPage} total={234} pageSize={20} />'}
        >
          <Pagination page={page} pageCount={12} onChange={setPage} total={234} pageSize={20} />
        </DemoBlock>
        <DemoBlock
          name="MetricStrip"
          block
          code={'<MetricStrip metrics={[{ id, label, value, tone? }, …]} />'}
        >
          <MetricStrip
            metrics={[
              { id: 'a', label: 'Дебет', value: '9427,50' },
              { id: 'b', label: 'Кредит', value: '9427,50' },
              { id: 'c', label: 'Сальдо', value: '0,00', tone: 'success' },
            ]}
          />
        </DemoBlock>
        <DemoBlock
          name="KeyValueList"
          block
          code={'<KeyValueList items={items} columns={2} dividers />'}
        >
          <KeyValueList
            items={[
              { id: 'org', label: 'Организация', value: 'ООО «Ромашка»' },
              { id: 'inn', label: 'ИНН', value: '7701234567' },
              { id: 'date', label: 'Дата', value: '31.07.2026' },
            ]}
            columns={2}
            dividers
          />
        </DemoBlock>
        <DemoBlock
          name="Timeline"
          block
          code={'<Timeline events={events} labels={labels} groupByDay={false} />'}
        >
          <Timeline
            events={[
              { id: '1', ts: '2026-07-31T10:00:00Z', kind: 'status', body: 'Статус изменён на «В работе»' },
              { id: '2', ts: '2026-07-31T11:30:00Z', kind: 'note', body: 'Добавлена заметка' },
            ]}
            labels={{ status: 'Статус', note: 'Заметка' }}
            groupByDay={false}
          />
        </DemoBlock>
        <DemoBlock
          name="LogViewer"
          block
          code={'<LogViewer lines={lines} getLineId={…} labels={labels} height={160} />'}
        >
          <LogViewer
            lines={LOG}
            getLineId={(l) => l.ts}
            labels={{ info: 'INFO', warn: 'WARN' }}
            height={160}
          />
        </DemoBlock>
      </div>
    </section>
  )
}
