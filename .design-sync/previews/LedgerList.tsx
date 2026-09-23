import { LedgerList, groupByValue } from '@santarinto/jig'
import type { LedgerColumn } from '@santarinto/jig'

// Композиция снята с витрины репозитория (demo/sections/data.tsx): та же лента
// операций, что и у DataTable, но раскрытие записи — нативный <details>, без JS
// и без состояния потребителя.
interface Op {
  id: string
  day: string
  title: string
  amount: number
  cur: string
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

// Итог считается из данных, а не вписан числом: иначе разойдётся с фикстурой
// при первой же правке. Отклонённые исключены — денег не двигали.
const netByCur = (rows: Op[]) => {
  const m = new Map<string, number>()
  for (const o of rows) if (!o.declined) m.set(o.cur, (m.get(o.cur) ?? 0) + o.amount)
  return [...m].map(([cur, n]) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${rub(Math.abs(n))} ${cur}`).join(' · ')
}

const byCur = (rows: Op[], pick: (o: Op) => boolean) => {
  const m = new Map<string, number>()
  for (const o of rows) if (pick(o)) m.set(o.cur, (m.get(o.cur) ?? 0) + Math.abs(o.amount))
  return [...m].map(([cur, n]) => `${rub(n)} ${cur}`).join(' · ')
}

// Шапка группы несёт aside — итоги дня рядом с заголовком.
const dayAside = (_day: unknown, rows: Op[]) => {
  const spent = byCur(rows, (o) => o.amount < 0 && !o.ownTransfer && !o.declined)
  const received = byCur(rows, (o) => o.amount > 0 && !o.declined)
  return (
    <span style={{ display: 'inline-flex', gap: 'var(--ds-space-4)', alignItems: 'baseline' }}>
      {spent && <span>потрачено {spent}</span>}
      {received && <span>поступило {received}</span>}
    </span>
  )
}

// У LedgerColumn нет hideBelow: раскладка на subgrid, и display:none оставил бы
// трек дыркой. Узким управляет width.
const COLS: LedgerColumn<Op>[] = [
  {
    id: 'title',
    header: 'Операция',
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

const DAYS = [...new Set(FEED.map((o) => `group:${o.day}`))]
const rows = () => groupByValue(FEED, (o) => o.id, 'day', DAYS, undefined, { aside: dayAside })

const details = (o: Op) => (
  <div style={{ display: 'flex', gap: 'var(--ds-space-5)', flexWrap: 'wrap' }}>
    <span>Категория: {o.amount > 0 ? 'поступления' : 'покупки'}</span>
    <span>Валюта операции: {o.cur}</span>
    <span>Комиссия: 0 {o.cur}</span>
  </div>
)

/**
 * Лента записей с группами и раскрытием. Группы всегда развёрнуты — сворачивается
 * запись, а не группа. Раскрываемость требует **двух** условий: `hasDetails`
 * пропускает запись и `renderExpanded` вернул не-null.
 */
export const Default = () => (
  <div style={{ width: 640 }}>
    <LedgerList
      columns={COLS}
      displayRows={rows()}
      rowState={(o: Op) => ({ muted: !!o.ownTransfer || !!o.declined })}
      hasDetails={(o: Op) => !o.ownTransfer && !o.declined}
      renderExpanded={details}
      footer={{ label: 'Итого за период', cells: { sum: netByCur(FEED) } }}
    />
  </div>
)

/**
 * Раскрытая запись в статике: `defaultOpenIds` кладёт атрибут `open` на
 * `<details>`. Управляемого режима нет намеренно — переключает браузер, и
 * страница работает без гидрации.
 */
export const Expanded = () => (
  <div style={{ width: 640 }}>
    <LedgerList
      columns={COLS}
      displayRows={rows()}
      rowState={(o: Op) => ({ muted: !!o.ownTransfer || !!o.declined })}
      hasDetails={(o: Op) => !o.ownTransfer && !o.declined}
      renderExpanded={details}
      defaultOpenIds={['f1', 'f5']}
      footer={{ label: 'Итого за период', cells: { sum: netByCur(FEED) } }}
    />
  </div>
)

/**
 * Плотная раскладка: высота сводок уходит на `--ds-h-compact`. Тот же проп
 * `dense`, что у Card, DataTable и Timeline — с 2.3.0 плотность во всей системе
 * называется одинаково.
 */
export const Dense = () => (
  <div style={{ width: 640 }}>
    <LedgerList
      columns={COLS}
      displayRows={rows()}
      dense
      rowState={(o: Op) => ({ muted: !!o.ownTransfer || !!o.declined })}
      hasDetails={(o: Op) => !o.ownTransfer && !o.declined}
      renderExpanded={details}
      footer={{ label: 'Итого за период', cells: { sum: netByCur(FEED) } }}
    />
  </div>
)

/**
 * Плоский список без групп: `rows` + `getRowId` вместо `displayRows`.
 */
export const Flat = () => (
  <div style={{ width: 640 }}>
    <LedgerList
      columns={COLS}
      rows={FEED}
      getRowId={(o: Op) => o.id}
      hasDetails={(o: Op) => !o.ownTransfer && !o.declined}
      renderExpanded={details}
    />
  </div>
)
