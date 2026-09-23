/**
 * Лента записей. `kind: 'block'`.
 *
 * Она не таблица и не ARIA-таблица: раскрытие сделано нативным `<details>`
 * (страница статическая, гидрации нет), а `<details>` внутри `<table>`
 * невалиден. Отсюда раскладка на CSS Grid + `subgrid` — и отсюда же все
 * состояния, которые видно только рядом.
 *
 * Главный случай — треки колонок. Колонка, прижатая к концу строки, обязана
 * получать трек `max-content`; на `minmax(0, 1fr)` она растянется на остаток, и
 * прижатость станет НЕВИДИМОЙ: текст стоит у конца трека, а трек занимает пол
 * ленты. Ревью DS-86 нашло, что ветка `c.align === 'end'` в `trackFor` не
 * была проверена вовсе — снималась без единого красного теста.
 *
 * Второй такой случай — итог. Правые края ячеек данных и строки-итога сходятся
 * по `subgrid`, и утверждать это можно только парой: одна строка итога сама по
 * себе выглядит выровненной всегда.
 */
import { defineFixture } from '../../internal/fixture.js'
import { LedgerList, type LedgerColumn } from './LedgerList.js'
import { Money } from '../Money/Money.js'

interface Rec {
  id: string
  date: string
  counterparty: string
  purpose: string
  sum: string
  state: 'ok' | 'draft'
}

const COLUMNS: LedgerColumn<Rec>[] = [
  { key: 'date', header: 'Дата', width: 96 },
  // Доли, а не `minmax(0, 190px)` (DS-307): трек с потолком в px забирал
  // место раньше `fr`, и в узкой ленте сумма без `align` (нижняя лента случая
  // `tracks`) получала остаток в несколько пикселей.
  { key: 'counterparty', header: 'Контрагент', width: 'minmax(0, 1fr)' },
  // `minmax(0, 1fr)`, а не `minmax(18ch, 1fr)` (DS-307): пол 18ch распирал
  // ленту в узкой колонке — на 300 px при шкале 1 это 96 + 137 + 104 больше
  // ширины. На широком кадре 1fr и так шире 18ch, и вид не меняется.
  { key: 'purpose', header: 'Назначение', width: 'minmax(0, 1fr)' },
  {
    id: 'sum',
    header: 'Сумма',
    align: 'end',
    numeric: true,
    render: (r: Rec) => <Money value={r.sum} currency="RUB" />,
  },
]

/** Те же колонки, но у суммы снят `align` — предмет случая про треки. */
const COLUMNS_LOOSE: LedgerColumn<Rec>[] = COLUMNS.map((c) =>
  'id' in c && c.id === 'sum' ? { ...c, align: undefined, numeric: false } : c,
) as LedgerColumn<Rec>[]

const ROWS: Rec[] = [
  { id: '1', date: '01.08.2026', counterparty: 'ООО «Ромашка»', purpose: 'Аренда автомобиля за июль', sum: '12400.00', state: 'ok' },
  { id: '2', date: '03.08.2026', counterparty: 'ИП Кузнецов', purpose: 'Мойка и химчистка салона', sum: '3150.50', state: 'ok' },
  { id: '3', date: '07.08.2026', counterparty: 'АО «Топливная компания „Северная“»', purpose: 'Топливная карта, пополнение', sum: '21990.00', state: 'draft' },
  { id: '4', date: '12.08.2026', counterparty: 'ООО «Ромашка»', purpose: 'Штраф ГИБДД, возмещение', sum: '-5000.00', state: 'ok' },
]

const FOOTER = {
  label: 'Итого за август',
  cells: { sum: <Money value="32540.50" currency="RUB" /> },
}

interface Props {
  rows: Rec[]
  dense: boolean
  withFooter: boolean
  withDetails: boolean
  muteDrafts: boolean
}

/** Деталь записи. Дорогая по смыслу — потому и есть дешёвый гейт `hasDetails`. */
const details = (r: Rec) => (
  <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '0.25rem 1rem', margin: 0 }}>
    <dt>Документ</dt>
    <dd style={{ margin: 0 }}>№ {r.id} от {r.date}</dd>
    <dt>Состояние</dt>
    <dd style={{ margin: 0 }}>{r.state === 'draft' ? 'Черновик, не проведён' : 'Проведён'}</dd>
  </dl>
)

export default defineFixture<Props>({
  name: 'LedgerList',
  group: 'Данные',
  kind: 'block',

  props: { rows: ROWS, dense: false, withFooter: true, withDetails: true, muteDrafts: true },

  controls: {
    dense: { kind: 'bool', prop: true },
    withFooter: { kind: 'bool', prop: false },
    withDetails: { kind: 'bool', prop: false },
    muteDrafts: { kind: 'bool', prop: false },
  },

  data: {
    empty: { rows: [] },
    one: { rows: ROWS.slice(0, 1) },
    // Длинное назначение и длинный контрагент разом: колонка описания тянется
    // (minmax(0, 1fr)), и колонка контрагента тоже тянется долей.
    long: {
      rows: [
        {
          id: 'L',
          date: '01.08.2026',
          counterparty: 'Акционерное общество «Российский Сельскохозяйственный банк»',
          purpose: 'Возмещение расходов по договору транспортной экспедиции за период с 01.07 по 31.07',
          sum: '1234567.89',
          state: 'ok',
        },
      ],
    },
  },

  cases: [
    {
      id: 'base',
      title: 'Лента',
      note: 'Записи с раскрытием: щёлкните строку — деталь открывается без JS, это <details>.',
    },
    {
      id: 'tracks',
      title: 'Прижатая колонка и её трек',
      note:
        'Сверху сумма объявлена align: "end" — трек считается max-content, и ' +
        'колонка сидит у конца строки. Снизу ТЕ ЖЕ данные без align: трек ' +
        'становится minmax(0, 1fr), колонка растягивается на остаток, и текст ' +
        'внутри неё оказывается у левого края широкого трека. Порознь обе ленты ' +
        'выглядят нормальными — вторая просто «пошире». Ревью DS-86 ' +
        'обнаружило, что эта ветка не была проверена вовсе: снималась без ' +
        'единого красного теста.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <LedgerList<Rec> columns={COLUMNS} rows={p.rows} getRowId={(r) => r.id} />
          <LedgerList<Rec> columns={COLUMNS_LOOSE} rows={p.rows} getRowId={(r) => r.id} />
        </div>
      ),
    },
    {
      id: 'footer',
      title: 'Итог по subgrid',
      note:
        'Строка итога и ячейки данных сходятся правыми краями, потому что ' +
        'раскладка общая (subgrid), а не потому, что итогу задали такой же ' +
        'отступ. Утверждение парное: одна строка итога выглядит выровненной ' +
        'всегда — проверять надо совпадение краёв, а не вид итога.',
      props: { withFooter: true },
    },
    {
      id: 'muted',
      title: 'Приглушённая запись',
      note:
        'Черновик приглушён ФОНОМ, а не текстом: приглушённый текст читался бы ' +
        'как «менее важно», тогда как речь о состоянии записи. Рядом стоят ' +
        'проведённые — без них приглушение неотличимо от общего фона ленты.',
      props: { muteDrafts: true },
    },
    {
      id: 'no-details',
      title: 'Нераскрываемые записи',
      note:
        'Раскрываемость — двойной контракт: hasDetails говорит «стоит звать», а ' +
        'renderExpanded обязан вернуть не null. Здесь деталей нет вовсе: каретки ' +
        'не должно быть ни у одной записи. Каретка без содержимого — обещание, ' +
        'которое не выполняется по щелчку, и это хуже её отсутствия.',
      props: { withDetails: false },
    },
    {
      id: 'empty',
      title: 'Пусто',
      props: { rows: [], withFooter: false },
      note: 'Ни записей, ни итога: итог по пустому множеству — это ноль, которого никто не считал.',
    },
  ],

  render: (p) => (
    <LedgerList<Rec>
      columns={COLUMNS}
      rows={p.rows}
      getRowId={(r) => r.id}
      dense={p.dense}
      footer={p.withFooter ? FOOTER : undefined}
      hasDetails={p.withDetails ? () => true : () => false}
      renderExpanded={p.withDetails ? details : undefined}
      rowState={p.muteDrafts ? (r) => (r.state === 'draft' ? { muted: true } : undefined) : undefined}
      defaultOpenIds={['1']}
    />
  ),
})
