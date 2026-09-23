import { colId, colClass, colWidth, firstProjected, type Column } from '../../internal/columns.js'
import { Caret } from '../../internal/caret.js'
import './LedgerList.css'

/**
 * Колонка LedgerList: та же модель, что у `DataTable`, но **без `hideBelow`**.
 *
 * `hideBelow` у DataTable прячет колонку при тесноте через `@container`. У
 * LedgerList раскладка на CSS Grid + `subgrid`, и `display: none` на ячейке
 * оставляет трек дыркой (трек задан в `grid-template-columns` корня, и скрытие
 * ячейки его не убирает) — остальные ячейки строки сдвигаются, и это выглядит
 * как испорченные данные. Поэтому поля в типе нет намеренно: проп, который
 * задан и молча ничего не делает, — хуже ошибки типов (фиксировали замером в
 * браузере: на 700px заголовки накладывались, `scrollWidth == innerWidth`).
 * Узким местом управляют `width` (`minmax(0, 190px)` счёту, `minmax(0, 1fr)`
 * описанию). Число там тоже принимается и означает пиксели интерфейса — оно
 * едет по `--ds-ui-scale`, в отличие от голого rem; `minmax` и прочие функции
 * остаются строкой, потому что числом не выражаются.
 */
/**
 * Строка ЖУРНАЛА — ровно то, что `LedgerList` читает (DS-154).
 *
 * Не `DisplayRow` из `internal/rowModel.ts`, и это решение, а не экономия.
 * Общая модель несёт `depth` и `hasChildren`, то есть УЗЕЛ ДЕРЕВА, — а журнал
 * не дерево: он сгруппирован по дню, группировка у него своя (`groupByValue`),
 * и иерархия не нужна ни для чего, что он умеет. Пока тип был общим, дерево
 * компилировалось без единого возражения и МОЛЧА расплющивалось: замер на
 * дереве в два уровня давал строкам глубины 0 и 1 побайтово одинаковую
 * разметку, а `LedgerList.css` про глубину не знает ни одного правила.
 *
 * Что тип ловит и чего не ловит — названо честно, потому что разница видна не
 * сразу. ЛИТЕРАЛ с `depth`/`hasChildren` теперь ошибка компиляции: у объектных
 * литералов TypeScript проверяет лишние поля. РЕЗУЛЬТАТ `flattenTree`, поданный
 * переменной, структурно всё ещё подходит — лишние поля у не-литерала
 * разрешены, — и типом это не закрывается, пока `DisplayRow` объявлен один на
 * два компонента (менять его значило бы менять `DataTable`, а там иерархия
 * работает и чинена на DS-143). Поэтому у границы стоит ВТОРАЯ половина:
 * `LedgerList` бросает на строке, которая объявила себя узлом дерева, — см.
 * проверку в теле компонента. Тип и бросок закрывают РАЗНЫЕ пути, и ни один из
 * них не лишний.
 *
 * `groupByValue` ложится сюда без приведения: его группы и записи несут лишние
 * поля, но ни одного противоречащего.
 */
export type LedgerRow<T> =
  | {
      kind: 'data'
      id: string
      row: T
    }
  | {
      kind: 'group'
      id: string
      /** Заголовок группы. Число записей журнал не рисует — у него `aside` или ничего. */
      label: React.ReactNode
      /** Произвольный правый узел шапки группы. */
      aside?: React.ReactNode
    }

export type LedgerColumn<T> = Column<T> extends infer C
  ? C extends any ? Omit<C, 'hideBelow' | 'wrap'>
  : never
  : never

interface LedgerBase<T> {
  columns: LedgerColumn<T>[]
  /** Контент детали записи. Раскрытие — нативный `<details>`, без JS. */
  renderExpanded?: (row: T) => React.ReactNode
  /** Дешёвый гейт раскрываемости: не звать дорогой `renderExpanded` зря. */
  hasDetails?: (row: T) => boolean
  /** Состояние записи. `muted` — приглушённый ТЕКСТ, не фон (DS-137). */
  rowState?: (row: T) => { muted?: boolean } | undefined
  /** Строка-итог. Значения — ReactNode (мульти-валюта), не скаляр. */
  footer?: { label?: React.ReactNode; cells: Partial<Record<string, React.ReactNode>> }
  /** Плотная раскладка: высота сводок по `--ds-h-compact`. По умолчанию `--ds-h-default`. */
  dense?: boolean
  /** Какие записи открыты в статике (атрибут `open` на `<details>`). */
  defaultOpenIds?: string[]
  /** Уровень заголовка шапки группы (по умолчанию 3). */
  headingLevel?: 2 | 3 | 4
}
interface FlatLedger<T> extends LedgerBase<T> { rows: T[]; getRowId: (r: T) => string; displayRows?: never }
interface ModeledLedger<T> extends LedgerBase<T> { displayRows: LedgerRow<T>[]; rows?: never; getRowId?: never }
export type LedgerListProps<T> = FlatLedger<T> | ModeledLedger<T>

// Классы пишутся литералами (не `${BLOCK}__…`): гейт bem-modifiers видит
// модификатор в разметке только как строку, начинающуюся с `ds-`, и иначе слеп
// к нему (как у DataTable). colClass получает блок-префикс аргументом.
const BLOCK = 'ds-ledger'

/** Трек колонки: заданная ширина, иначе numeric → max-content, текст → тянущийся. */
function trackFor<T>(c: Column<T>): string {
  // Заданность, а не истинность: трек шириной 0 — законная колонка-нитка, и на
  // `if (c.width)` она молча уезжала бы в `minmax(0, 1fr)`, то есть в остаток.
  if (c.width !== undefined) return colWidth(c.width)
  // Словарь логический (DS-86): к концу строки, а не к правому краю.
  const atEnd = c.numeric || c.align === 'end'
  return atEnd ? 'max-content' : 'minmax(0, 1fr)'
}

export function LedgerList<T>(props: LedgerListProps<T>) {
  const {
    columns, renderExpanded, hasDetails, rowState, footer,
    dense = false, defaultOpenIds, headingLevel = 3,
  } = props

  const managed = props.displayRows != null
  const display: LedgerRow<T>[] = managed
    ? props.displayRows
    : props.rows.map((row) => ({ kind: 'data' as const, id: props.getRowId(row), row }))

  const openSet = new Set(defaultOpenIds ?? [])
  const gridTemplateColumns = columns.map(trackFor).join(' ')

  // Каретка — ПЕРВЫЙ РЕБЁНОК ведущей ячейки, а не отдельный грид-элемент:
  // иначе заняла бы трек и сдвинула колонки. Раньше её рисовал `::before` той
  // же ячейки — по той же причине, но текстом (DS-144).
  const cellsOf = (row: T, expandable: boolean) =>
    columns.map((c, i) => (
      <div key={colId(c)} className={colClass(BLOCK, c, i === 0 && 'ds-ledger__lead')}>
        {i === 0 && expandable && <Caret kind="branch" open="native" />}
        {c.id === undefined && !c.render ? String((row as Record<string, unknown>)[c.key]) : c.render?.(row)}
      </div>
    ))

  const renderRecord = (dr: Extract<LedgerRow<T>, { kind: 'data' }>) => {
    const rs = rowState?.(dr.row)
    const canExpand = hasDetails ? hasDetails(dr.row) : true
    const detail = canExpand ? renderExpanded?.(dr.row) : undefined
    const expandable = detail != null
    const cls = ['ds-ledger__rec', rs?.muted && 'ds-ledger__rec--muted', !expandable && 'ds-ledger__rec--plain']
      .filter(Boolean).join(' ')
    if (expandable) {
      return (
        <details key={dr.id} className={cls} open={openSet.has(dr.id) || undefined}>
          <summary className="ds-ledger__summary">{cellsOf(dr.row, true)}</summary>
          <div className="ds-ledger__detail">{detail}</div>
        </details>
      )
    }
    return (
      <div key={dr.id} className={cls}>
        <div className="ds-ledger__summary">{cellsOf(dr.row, false)}</div>
      </div>
    )
  }

  // Сегментация плоского display в группы: заголовок дня + его записи. Плоский
  // путь (без групп) — один безымянный сегмент.
  type DataRow = Extract<LedgerRow<T>, { kind: 'data' }>
  type GroupRow = Extract<LedgerRow<T>, { kind: 'group' }>
  const segments: { group: GroupRow | null; rows: DataRow[] }[] = []
  for (const dr of display) {
    // Бросок на УЗЛЕ ДЕРЕВА, а не на лишнем поле (DS-154). Читается
    // мимо типа намеренно: сюда приходит ровно то, что тип не отверг, —
    // результат `flattenTree`, поданный переменной. Условие называет дерево
    // двумя способами, потому что порознь каждый дырявый: `hasChildren` нет у
    // листьев, а `depth` 1 законно ставит `groupByValue` записям внутри
    // группы.
    const node = dr as { depth?: number; hasChildren?: boolean }
    if (node.hasChildren === true || (node.depth ?? 0) > 1) {
      throw new Error(
        `jig: LedgerList — строка «${dr.id}» пришла узлом дерева `
        + `(hasChildren=${String(node.hasChildren)}, depth=${String(node.depth)}). `
        + 'Журнал не дерево: глубину он не рисует ВООБЩЕ, и раньше молча '
        + 'расплющивал её — строка второго уровня давала ту же разметку, что '
        + 'первого. Иерархия строк живёт в `DataTable` (`flattenTree`), '
        + 'группировка по значению — здесь (`groupByValue`). DS-154.',
      )
    }
    if (dr.kind === 'group') segments.push({ group: dr, rows: [] })
    else {
      if (!segments.length) segments.push({ group: null, rows: [] })
      segments[segments.length - 1]!.rows.push(dr)
    }
  }

  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4'
  const from = footer ? firstProjected(columns, footer.cells) : 0

  return (
    <section className={[BLOCK, dense && `${BLOCK}--dense`].filter(Boolean).join(' ')} style={{ gridTemplateColumns }}>
      <div className="ds-ledger__head">
        {columns.map((c) => (
          <div key={colId(c)} className={colClass(BLOCK, c)}>{c.header}</div>
        ))}
      </div>
      {segments.map((seg) => {
        if (!seg.group) return seg.rows.map(renderRecord)
        const headId = `${seg.group.id}-head`
        return (
          <div key={seg.group.id} className="ds-ledger__group" role="group" aria-labelledby={headId}>
            <Heading id={headId} className="ds-ledger__grouphead">
              <span className="ds-ledger__grouplabel">{seg.group.label}</span>
              {seg.group.aside != null && <span className="ds-ledger__aside">{seg.group.aside}</span>}
            </Heading>
            {seg.rows.map(renderRecord)}
          </div>
        )
      })}
      {footer && (
        <div className="ds-ledger__foot">
          {from > 0 && (
            <div className="ds-ledger__lead" style={{ gridColumn: `1 / ${from + 1}` }}>{footer.label}</div>
          )}
          {columns.slice(from).map((c) => (
            <div key={colId(c)} className={colClass(BLOCK, c)}>{footer.cells[colId(c)] ?? null}</div>
          ))}
        </div>
      )}
    </section>
  )
}
