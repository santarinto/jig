import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LedgerList } from './LedgerList.js'
import { groupByValue, flattenTree, type RowTreeNode } from '../../internal/rowModel.js'
import type { Column } from '../../internal/columns.js'

interface Op { id: string; title: string; sum: string }
const columns: Column<Op>[] = [
  { id: 'title', header: 'Операция', render: (o) => o.title },
  { id: 'sum', header: 'Сумма', numeric: true, render: (o) => o.sum },
]
const rows: Op[] = [
  { id: '1', title: 'Пятёрочка', sum: '−1 240 ₽' },
  { id: '2', title: 'Зарплата', sum: '+120 000 ₽' },
]

/**
 * Найдено ревью DS-86 мутацией: `c.align === 'end'` в `trackFor` можно
 * было снять, и все 15 случаев оставались зелёными. Не мёртвый код — колонка,
 * прижатая к концу строки, обязана получать трек по содержимому (`max-content`),
 * иначе она растянется на остаток и «прижатость» станет невидимой: текст
 * стоит у конца трека, а трек занимает пол-таблицы.
 *
 * Пара, а не два случая порознь: утверждается различимость треков. Схлопни обе
 * ветки в одну — каждое утверждение по отдельности всё ещё проходит.
 */
describe('LedgerList: трек колонки по выравниванию', () => {
  it('align=end даёт трек по содержимому, отсутствие align — тянущийся', () => {
    const { container } = render(
      <LedgerList rows={rows} getRowId={(o) => o.id} columns={[
        { id: 'title', header: 'Операция', render: (o) => o.title },
        { id: 'sum', header: 'Сумма', align: 'end', render: (o) => o.sum },
      ]} />,
    )
    const grid = container.querySelector('.ds-ledger') as HTMLElement
    expect(grid.style.gridTemplateColumns).toBe('minmax(0, 1fr) max-content')
  })
})

describe('LedgerList: базовый рендер', () => {
  it('рисует строки из плоского пути и колонки-заголовки', () => {
    const { container } = render(<LedgerList columns={columns} rows={rows} getRowId={(o) => o.id} />)
    expect(container.querySelector('.ds-ledger')).not.toBeNull()
    expect(screen.getByText('Операция')).toBeInTheDocument()
    expect(screen.getByText('Пятёрочка')).toBeInTheDocument()
    expect(screen.getByText('Зарплата')).toBeInTheDocument()
  })

  it('без renderExpanded все записи простые — нет <details>', () => {
    const { container } = render(<LedgerList columns={columns} rows={rows} getRowId={(o) => o.id} />)
    expect(container.querySelectorAll('details')).toHaveLength(0)
    expect(container.querySelectorAll('.ds-ledger__rec--plain')).toHaveLength(2)
  })

  it('раскрываемая запись — <details> со <summary>, простая — нет', () => {
    const { container } = render(
      <LedgerList columns={columns} rows={rows} getRowId={(o) => o.id}
        hasDetails={(o) => o.id === '1'} renderExpanded={() => <div>детали</div>} />)
    const dets = container.querySelectorAll('details')
    expect(dets).toHaveLength(1)
    expect(within(dets[0] as HTMLElement).getByText('детали')).toBeInTheDocument()
    expect(screen.getByText('Зарплата').closest('.ds-ledger__rec')).toHaveClass('ds-ledger__rec--plain')
  })

  it('модельный путь (displayRows) рисует те же строки', () => {
    // Строка журнала — `kind`, `id`, `row`, и всё. Ни `depth`, ни
    // `hasChildren` (DS-154).
    const displayRows = [
      { kind: 'data' as const, id: '1', row: rows[0]! },
      { kind: 'data' as const, id: '2', row: rows[1]! },
    ]
    render(<LedgerList columns={columns} displayRows={displayRows} />)
    expect(screen.getByText('Пятёрочка')).toBeInTheDocument()
    expect(screen.getByText('Зарплата')).toBeInTheDocument()
  })
})

/**
 * ЖУРНАЛ НЕ ДЕРЕВО, И ОТКАЗЫВАЕТ ОН ГРОМКО (DS-154).
 *
 * До этой задачи `LedgerList` принимал `displayRows={flattenTree(...)}` без
 * единого возражения и расплющивал дерево МОЛЧА: замер на двух уровнях давал
 * строкам глубины 0 и 1 побайтово одинаковую разметку, а в `LedgerList.css`
 * правил про глубину нет вовсе. Компонент при этом сам же реэкспортировал
 * `flattenTree` — то есть выдавал потребителю сборщик деревьев для компонента,
 * который деревья не рисует.
 *
 * Проверяется РАЗЛИЧЕНИЕМ, тремя входами: дерево — бросок, группировка —
 * молчание и разметка, плоский `flattenTree` без единого родителя — тоже
 * молчание. Один вход ничего бы не доказал: «бросает» верно и у компонента,
 * который бросает всегда, а «рисует» — у того, который не проверяет ничего.
 */
describe('LedgerList: дерево — отказ, а не тихое расплющивание', () => {
  const TREE: RowTreeNode<Op>[] = [
    { row: { id: 'p', title: 'Парк', sum: '0 ₽' }, children: [{ row: rows[0]! }] },
  ]

  it('flattenTree с узлом-родителем — бросок, называющий строку', () => {
    const displayRows = flattenTree(TREE, (r) => r.id, ['p'])
    // Санитар: модель обязана отдать именно УЗЕЛ, иначе бросать не на чем и
    // случай проверяет пустоту.
    expect(displayRows[0]).toMatchObject({ id: 'p', depth: 0, hasChildren: true })
    expect(() => render(<LedgerList columns={columns} displayRows={displayRows} />))
      .toThrow(/строка «p» пришла узлом дерева/)
  })

  it('глубина сверх первой — бросок, даже когда родителя в выдаче нет', () => {
    // Лист третьего уровня несёт `hasChildren: false`: одного признака мало,
    // и потому условие броска названо двумя.
    const deep = [{ kind: 'data' as const, id: 'x', row: rows[0]!, depth: 2 }]
    expect(() => render(<LedgerList columns={columns} displayRows={deep} />))
      .toThrow(/пришла узлом дерева/)
  })

  it('строка с глубиной, написанная ЛИТЕРАЛОМ, не компилируется', () => {
    // Вторая половина запрета, и она про ГРАНИЦУ КОМПИЛЯЦИИ. Работает только
    // на литерале В МЕСТЕ ВЫЗОВА: лишние поля TypeScript проверяет у литералов,
    // а у переменной (случай выше) — нет, и закрыть эту дыру типом нельзя, пока
    // `DisplayRow` объявлен один на два компонента. Отсюда и бросок рядом:
    // половины закрывают РАЗНЫЕ пути, а не дублируют друг друга.
    expect(() => render(
      <LedgerList
        columns={columns}
        // @ts-expect-error — `depth` у строки журнала: лишнее поле в литерале
        displayRows={[{ kind: 'data', id: 'x', row: rows[0]!, depth: 2 }]}
      />,
    )).toThrow(/пришла узлом дерева/)
  })

  it('группировка по значению проходит: depth 1 у записи в группе законен', () => {
    const grouped = groupByValue(rows, (r) => r.id, 'title', ['group:Пятёрочка'])
    expect(() => render(<LedgerList columns={columns} displayRows={grouped} />)).not.toThrow()
  })

  it('плоская выдача flattenTree проходит: это список, а не дерево', () => {
    const flat = flattenTree([{ row: rows[0]! }, { row: rows[1]! }], (r) => r.id, [])
    expect(() => render(<LedgerList columns={columns} displayRows={flat} />)).not.toThrow()
  })
})

describe('LedgerList: контракт раскрываемости', () => {
  it('renderExpanded вернул null → запись простая, без пустого <details>', () => {
    const { container } = render(
      <LedgerList columns={columns} rows={rows} getRowId={(o) => o.id}
        renderExpanded={(o) => (o.id === '1' ? <div>детали</div> : null)} />)
    expect(container.querySelectorAll('details')).toHaveLength(1)
    expect(screen.getByText('Зарплата').closest('.ds-ledger__rec')).toHaveClass('ds-ledger__rec--plain')
  })

  it('hasDetails=false не зовёт renderExpanded (дешёвый гейт)', () => {
    let called = 0
    render(<LedgerList columns={columns} rows={[rows[0]!]} getRowId={(o) => o.id}
      hasDetails={() => false} renderExpanded={() => { called++; return <div>x</div> }} />)
    expect(called).toBe(0)
  })

  it('defaultOpenIds раскрывает запись в статике (<details open>)', () => {
    const { container } = render(
      <LedgerList columns={columns} rows={rows} getRowId={(o) => o.id}
        renderExpanded={() => <div>детали</div>} defaultOpenIds={['1']} />)
    const dets = [...container.querySelectorAll('details')] as HTMLDetailsElement[]
    const first = dets.find((d) => d.querySelector('.ds-ledger__lead')?.textContent === 'Пятёрочка')!
    expect(first.open).toBe(true)
    const second = dets.find((d) => d.querySelector('.ds-ledger__lead')?.textContent === 'Зарплата')!
    expect(second.open).toBe(false)
  })
})

describe('LedgerList: группы и footer', () => {
  interface DayOp { id: string; title: string; sum: string; day: string }
  const dayRows: DayOp[] = [
    { id: '1', title: 'Пятёрочка', sum: '−1 240 ₽', day: 'пт' },
    { id: '2', title: 'Зарплата', sum: '+120 000 ₽', day: 'пт' },
  ]
  const grouped = groupByValue(
    dayRows, (o) => o.id, 'day', ['group:пт'], (v) => `День ${String(v)}`,
    { aside: () => 'потрачено 1 240 ₽' },
  )
  const cols3: Column<DayOp>[] = [
    { id: 'title', header: 'Операция', render: (o) => o.title },
    { id: 'sum', header: 'Сумма', numeric: true, render: (o) => o.sum },
  ]

  it('заголовок группы — heading нужного уровня с меткой и aside', () => {
    render(<LedgerList columns={cols3} displayRows={grouped} headingLevel={3} />)
    expect(screen.getByRole('heading', { level: 3, name: /День пт/ })).toBeInTheDocument()
    expect(screen.getByText('потрачено 1 240 ₽')).toBeInTheDocument()
  })

  it('группа обёрнута в role=group, связана с заголовком через aria-labelledby', () => {
    render(<LedgerList columns={cols3} displayRows={grouped} />)
    const group = screen.getByRole('group')
    const labelledby = group.getAttribute('aria-labelledby')
    expect(labelledby).toBeTruthy()
    expect(document.getElementById(labelledby!)).toHaveTextContent('День пт')
  })

  it('footer проецирует значение под свою колонку', () => {
    const { container } = render(
      <LedgerList columns={cols3} displayRows={grouped}
        footer={{ label: 'Итого', cells: { sum: '+118 760 ₽' } }} />)
    const foot = container.querySelector('.ds-ledger__foot')!
    expect(foot).toHaveTextContent('Итого')
    expect(foot).toHaveTextContent('+118 760 ₽')
    expect(within(foot as HTMLElement).getByText('+118 760 ₽').closest('.ds-ledger__num')).not.toBeNull()
  })
})

describe('LedgerList: состояния и каретка', () => {
  it('rowState вешает класс muted на запись', () => {
    render(<LedgerList columns={columns} rows={rows} getRowId={(o) => o.id}
      rowState={(o) => ({ muted: o.id === '1' })} />)
    expect(screen.getByText('Пятёрочка').closest('.ds-ledger__rec')).toHaveClass('ds-ledger__rec--muted')
    expect(screen.getByText('Зарплата').closest('.ds-ledger__rec')).not.toHaveClass('ds-ledger__rec--muted')
  })
})

/**
 * Ширина здесь становится грид-треком, а не шириной `<col>`, но остаётся тем же
 * размером интерфейса: под `.ds-scale` высоты сводок едут по `--ds-h-compact`,
 * и трек обязан ехать вместе с ними (DS-82).
 */
describe('LedgerList: ширина колонки и масштаб', () => {
  const wide = (w: number | string): Column<Op>[] => [
    { id: 'title', header: 'Операция', render: (o: Op) => o.title, width: w },
    { id: 'sum', header: 'Сумма', numeric: true, render: (o: Op) => o.sum },
  ]

  const trackOf = (container: HTMLElement) =>
    (container.querySelector('.ds-ledger') as HTMLElement).style.gridTemplateColumns

  it('числовая ширина едет по --ds-ui-scale', () => {
    const { container } = render(<LedgerList rows={rows} getRowId={(r) => r.id} columns={wide(190)} />)
    expect(trackOf(container)).toContain('calc(190px * var(--ds-ui-scale, 1))')
  })

  it('строка форвардится дословно — minmax остаётся выразимым', () => {
    const { container } = render(
      <LedgerList rows={rows} getRowId={(r) => r.id} columns={wide('minmax(0, 190px)')} />,
    )
    expect(trackOf(container)).toContain('minmax(0, 190px)')
    // Соседний трек с известным ответом: колонка без width осталась на своём
    // умолчании, то есть тронута ровно одна.
    expect(trackOf(container)).toContain('max-content')
  })
})

// DS-51: hideBelow у колонок LedgerList — проп без поведения. Раскладка
// на CSS Grid/subgrid, `display:none` на ячейке оставляет трек дыркой (остальные
// ячейки сдвигаются). Поля в типе нет намеренно: заданный и молча игнорируемый
// проп — хуже ошибки типов. Узким местом управляют `width` (`minmax`).
describe('LedgerList: тип колонок', () => {
  it('hideBelow нет в типе колонки — задание падает по типам', () => {
    type C = Parameters<typeof LedgerList>[0]['columns'][number]
    // @ts-expect-error — LedgerColumn не имеет hideBelow (раскладка не прячет)
    const col: C = { id: 'x', header: 'X', render: () => null, hideBelow: 'sm' }
    expect(col).toBeDefined()
  })

  // `wrap` — оговорка к однострочному умолчанию `table-layout: fixed`. Здесь
  // раскладка гридовая: перенос есть всегда и отключить его нечем, так что
  // `wrap: true` был бы истинным по умолчанию, а `wrap: false` — неисполнимым.
  // Проп, который задан и молча ничего не делает, — ровно тот случай, ради
  // которого `hideBelow` уже вычеркнут строкой выше.
  it('wrap нет в типе колонки — переносы тут не выключаются', () => {
    type C = Parameters<typeof LedgerList>[0]['columns'][number]
    // @ts-expect-error — LedgerColumn не имеет wrap (грид переносит всегда)
    const col: C = { id: 'x', header: 'X', render: () => null, wrap: true }
    expect(col).toBeDefined()
  })
})
