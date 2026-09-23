import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Caret } from '../../internal/caret.js'
import {
  buildAxis, aggregate, intersectSorted, visibleRows, visibleLeaves, headerCells, pivotId,
  type PivotAgg, type PivotDimension, type PivotMeasure, type PivotCountMeasure,
  type PivotValueMeasure, type PivotNode, type PivotRow, type PivotHeaderCell,
} from './model.js'
import { useDsText } from '../../dictionary/DsText.js'
import './PivotTable.css'

export { pivotId }
export type {
  PivotAgg, PivotDimension, PivotMeasure, PivotCountMeasure, PivotValueMeasure,
  PivotNode, PivotRow, PivotHeaderCell,
}

export interface PivotTableProps<T> {
  /** Исходные строки — самая мелкая крупа. Компонент сводит их сам. */
  rows: T[]
  /** Измерения строк, сверху вниз. Пустой список — бросок: сводить не по чему. */
  rowDimensions: PivotDimension<T>[]
  /** Измерения колонок. Без них таблица вырождается в группировку с итогами. */
  columnDimensions?: PivotDimension<T>[]
  measures: PivotMeasure<T>[]
  /**
   * Свёрнутые узлы, а не раскрытые, — и это про умолчание, а не про вкус.
   * Сводная со всем свёрнутым показывает один итог и ничего не объясняет, то
   * есть по умолчанию она РАСКРЫТА. Проп, называющий раскрытые, при таком
   * умолчании обязан был бы перечислить все узлы разом и пересчитываться при
   * каждой смене данных; проп, называющий свёрнутые, при тех же данных пуст.
   *
   * Управляемая пара — как у `Tree`: задан `collapsedRows` — состояние снаружи,
   * не задан — своё.
   */
  collapsedRows?: string[]
  defaultCollapsedRows?: string[]
  onCollapsedRowsChange?: (ids: string[]) => void
  collapsedColumns?: string[]
  defaultCollapsedColumns?: string[]
  onCollapsedColumnsChange?: (ids: string[]) => void
  /** Строка общего итога снизу. По умолчанию есть. */
  grandTotalRow?: boolean
  /**
   * Колонка общего итога справа. По умолчанию есть — но только когда есть
   * измерения колонок: без них колонка итога повторила бы единственную колонку
   * значений слово в слово.
   */
  grandTotalColumn?: boolean
  /** Подпись итоговой строки и итоговой колонки. */
  totalLabel?: ReactNode
  /** Плотная раскладка: высота строк по `--ds-h-compact`. */
  dense?: boolean
  /**
   * Предел высоты обёртки. Число — пиксели, строка — любая длина CSS
   * (`'60vh'`, `'calc(100vh - 12rem)'`).
   *
   * УМОЛЧАНИЯ НЕТ И НЕ БУДЕТ — довод в `PivotTable.css` и он не изменился:
   * любое прибитое число отбирает у страницы вертикальный ритм и врёт в
   * невысокой карточке. Проп нужен не вместо той возможности задать высоту
   * листом, а ПОТОМУ ЧТО ПРО НЕЁ НЕ УЗНАЮТ: лечение жило в комментарии к CSS,
   * а отказ молчалив.
   *
   * ЧТО ИМЕННО ЧИНИТ (DS-266). Без предела высоты обёртка равна
   * содержимому и по вертикали не листается, значит `position: sticky` шапке
   * не к чему прилипать — едет ДОКУМЕНТ, и шапка уезжает вместе с ним. Взять
   * и то и другое нельзя: `overflow-x: auto` нужен, чтобы примерзала колонка
   * имени, а он по спецификации превращает `overflow-y: visible` в `auto`, —
   * то есть «липкая шапка к странице» и «примёрзшая колонка внутри» взаимно
   * исключены, и выбор между ними делает высота.
   *
   * Замерено на случае `wide` при `deep`: 18 строк, 642px. На окне 1440×600
   * шапка уходит целиком, а на экране остаются ВСЕ 18 строк — то есть строки
   * кончаются гораздо позже шапки, и таблица без единого заголовка колонки
   * перестаёт читаться вовсе. Порог по высоте окна около 607px; на 360×640
   * наступает впритык.
   */
  maxHeight?: number | string
  /** Что показать вместо тела, когда сводить нечего. */
  emptyContent?: ReactNode
  /** Видимая подпись таблицы (`<caption>`). Одна из двух форм имени. */
  caption?: ReactNode
  /** Имя таблицы, когда видимой подписи нет. */
  'aria-label'?: string
}


/**
 * Сводная таблица: агрегаты на пересечении измерений строк и колонок.
 *
 * ЧЕМ ОТЛИЧАЕТСЯ ОТ `DataTable`. Тот принимает готовую модель строк
 * (`displayRows`, собранные потребителем через `flattenTree`/`groupByValue`) —
 * и это правильно: иерархия данных есть решение потребителя. Здесь наоборот:
 * `{ rowDimensions, columnDimensions, measures }` И ЕСТЬ модель, между
 * конфигом и матрицей выбирать нечего. Заставить потребителя посчитать матрицу
 * и вернуть её значило бы отдать ему второй тип, который надо где-то держать и
 * который протухает молча — стоит данным смениться без пересчёта.
 *
 * ЧЕГО ЗДЕСЬ НЕТ И НЕ ПЛАНИРУЕТСЯ БЕЗ ЗАПРОСА: сортировки строк по значению
 * колонки (это отдельное решение о том, что считать «значением» строки при
 * нескольких мерах) и перетаскивания измерений между осями. Первое — работа,
 * второе — целый конструктор отчёта, а не компонент таблицы.
 *
 * ЦВЕТА ПО ВЕЛИЧИНЕ ЗДЕСЬ НЕТ намеренно (системный закон): величина живёт в
 * числе и в выключке вправо. `--ds-heat-*` — единственное место для цвета как
 * величины, и сводная в него не входит.
 */
export function PivotTable<T>({
  rows, rowDimensions, columnDimensions = [], measures,
  collapsedRows, defaultCollapsedRows = [], onCollapsedRowsChange,
  collapsedColumns, defaultCollapsedColumns = [], onCollapsedColumnsChange,
  grandTotalRow = true, grandTotalColumn = true,
  totalLabel, dense = false, emptyContent, maxHeight,
  caption, 'aria-label': ariaLabel,
}: PivotTableProps<T>) {
  const t = useDsText()
  // Не `empty`: ниже так зовётся ПУСТОТА выборки (`body.length === 0`).
  const totalText = totalLabel ?? t['pivotTable.total']
  const emptyText = emptyContent ?? t['pivotTable.empty']
  // Тип это выразил бы непустым кортежем, и это была бы ошибка: измерения
  // сводной выбирают РУКАМИ, в интерфейсе отчёта, — то есть массив приезжает из
  // `filter`, и кортеж научил бы потребителя писать `as`. Бросок громкий и на
  // первом же рендере.
  if (rowDimensions.length === 0) {
    throw new Error(
      'jig: PivotTable — пустой rowDimensions. Сводить не по чему: '
      + 'без измерения строк остался бы один общий итог, и это не таблица.',
    )
  }
  if (measures.length === 0) {
    throw new Error(
      'jig: PivotTable — пустой measures. Пересечения измерений есть, '
      + 'а показывать в них нечего.',
    )
  }

  const [ownRows, setOwnRows] = useState<string[]>(defaultCollapsedRows)
  const [ownCols, setOwnCols] = useState<string[]>(defaultCollapsedColumns)
  const foldedRows = collapsedRows ?? ownRows
  const foldedCols = collapsedColumns ?? ownCols
  const foldedRowSet = useMemo(() => new Set(foldedRows), [foldedRows])
  const foldedColSet = useMemo(() => new Set(foldedCols), [foldedCols])

  const toggle = (
    id: string, folded: string[], set: (next: string[]) => void, notify?: (ids: string[]) => void,
  ) => {
    const next = folded.includes(id) ? folded.filter((x) => x !== id) : [...folded, id]
    set(next)
    notify?.(next)
  }
  const toggleRow = (id: string) => {
    toggle(id, foldedRows, (next) => { if (collapsedRows == null) setOwnRows(next) }, onCollapsedRowsChange)
  }
  const toggleCol = (id: string) => {
    toggle(id, foldedCols, (next) => { if (collapsedColumns == null) setOwnCols(next) }, onCollapsedColumnsChange)
  }

  // Оси считаются от ДАННЫХ и не зависят от свёртки — иначе каждый клик по
  // каретке пересобирал бы всю арифметику.
  const rowAxis = useMemo(() => buildAxis(rows, rowDimensions), [rows, rowDimensions])
  const colAxis = useMemo(() => buildAxis(rows, columnDimensions), [rows, columnDimensions])

  const colLevels = columnDimensions.length
  const leaves = colLevels > 0 ? visibleLeaves(colAxis, foldedColSet) : []
  const header = colLevels > 0 ? headerCells(colAxis, foldedColSet, colLevels) : []
  const body = visibleRows(rowAxis, foldedRowSet)

  // Колонка итога справа осмысленна только при измерениях колонок: без них
  // единственная колонка значений И ЕСТЬ итог, и вторая повторила бы её.
  const totalColumn = colLevels > 0 && grandTotalColumn
  const multiMeasure = measures.length > 1
  // Высота шапки: строка на измерение плюс строка имён мер, если их несколько.
  const headerHeight = Math.max(1, colLevels + (multiMeasure ? 1 : 0))

  const dimLabels = rowDimensions.map((d) => d.label)
  const cornerLabel = dimLabels.map((label, i) => (
    <span key={i}>{i > 0 ? ' / ' : null}{label}</span>
  ))

  /** Ячейка значения. `null` — пересечение без строк, и это не ноль. */
  const valueCell = (indices: number[], measure: PivotMeasure<T>, key: string, total: boolean) => {
    const value = aggregate(rows, indices, measure)
    return (
      <td key={key} className={total ? 'ds-pivot__cell ds-pivot__cell--total' : 'ds-pivot__cell'}>
        {value === null
          // Прочерк — знак для глаза; диктору ячейка обязана остаться пустой,
          // иначе «тире» прозвучит как значение.
          ? <span className="ds-pivot__blank" aria-hidden="true">—</span>
          : measure.format?.(value) ?? value}
      </td>
    )
  }

  /** Значения одной строки: по видимым листьям колонок, затем итог строки. */
  const valueCells = (nodeRows: number[], prefix: string) => {
    const cells: ReactNode[] = []
    if (colLevels > 0) {
      for (const leaf of leaves) {
        const indices = intersectSorted(nodeRows, leaf.rows)
        for (const m of measures) cells.push(valueCell(indices, m, `${prefix}|${leaf.id}|${m.id}`, false))
      }
    }
    // Итог строки считается по СВОИМ строкам, а не сложением показанных ячеек:
    // для `avg`, `min` и `max` это разные числа, и складывание дало бы
    // правдоподобную неправду. Та же причина — у общего итога ниже.
    if (totalColumn || colLevels === 0) {
      for (const m of measures) cells.push(valueCell(nodeRows, m, `${prefix}|total|${m.id}`, colLevels > 0))
    }
    return cells
  }

  const allIndices = rows.map((_, i) => i)
  const empty = body.length === 0
  const colCount = 1 + (colLevels > 0 ? leaves.length : 0) * measures.length
    + (totalColumn || colLevels === 0 ? measures.length : 0)

  return (
    <div
      className={dense ? 'ds-pivot ds-pivot--dense' : 'ds-pivot'}
      style={maxHeight == null ? undefined : { maxHeight }}
    >
      <table className="ds-pivot__table" aria-label={caption ? undefined : ariaLabel}>
        {caption ? <caption className="ds-pivot__caption">{caption}</caption> : null}
        <thead>
          {header.map((cells, level) => (
            // Уровень строки шапки — шов наружу, в CSS: каждая строка липнет на
            // своей высоте. Без него ВСЕ строки шапки липли к нулю и при
            // прокрутке вниз ложились одна на другую — замерено в chromium на
            // случае `wide`: строка «Эконом» стояла в тех же координатах, что
            // «пн». При одном измерении колонок дефекта не видно вовсе, потому
            // что накладываться не на что.
            <tr key={`h${level}`} style={{ '--ds-pivot-level': level } as React.CSSProperties}>
              {level === 0 ? (
                <th className="ds-pivot__corner" rowSpan={headerHeight} scope="col">{cornerLabel}</th>
              ) : null}
              {cells.map((cell) => {
                const dim = columnDimensions[cell.node.depth]!
                const label = dim.formatValue?.(cell.node.key) ?? cell.node.key
                const foldable = cell.node.children.length > 0
                return (
                  <th
                    key={cell.node.id}
                    className={cell.leaf ? 'ds-pivot__colhead ds-pivot__colhead--leaf' : 'ds-pivot__colhead'}
                    scope={cell.leaf ? 'col' : 'colgroup'}
                    colSpan={cell.colSpan * measures.length}
                    rowSpan={cell.rowSpan}
                  >
                    {foldable ? (
                      <button
                        type="button"
                        className="ds-pivot__fold"
                        aria-expanded={!foldedColSet.has(cell.node.id)}
                        onClick={() => toggleCol(cell.node.id)}
                      >
                        <Caret kind="branch" open={!foldedColSet.has(cell.node.id)} />
                        {label}
                      </button>
                    ) : label}
                  </th>
                )
              })}
              {level === 0 && totalColumn ? (
                <th
                  className="ds-pivot__colhead ds-pivot__colhead--leaf ds-pivot__colhead--total"
                  scope="col"
                  rowSpan={colLevels}
                  colSpan={measures.length}
                >
                  {totalText}
                </th>
              ) : null}
            </tr>
          ))}
          {/* Имена мер — отдельной строкой, и только когда мер несколько: при
              одной мере её имя стоит в углу, а лишняя строка шапки съедала бы
              высоту, ничего не называя. */}
          {multiMeasure || colLevels === 0 ? (
            <tr style={{ '--ds-pivot-level': colLevels } as React.CSSProperties}>
              {colLevels === 0 ? (
                <th className="ds-pivot__corner" scope="col">{cornerLabel}</th>
              ) : null}
              {leaves.flatMap((leaf) => measures.map((m) => (
                <th key={`${leaf.id}|${m.id}`} className="ds-pivot__meashead" scope="col">{m.label}</th>
              )))}
              {totalColumn || colLevels === 0
                ? measures.map((m) => (
                  <th
                    key={`total|${m.id}`}
                    className={colLevels > 0
                      ? 'ds-pivot__meashead ds-pivot__meashead--total'
                      : 'ds-pivot__meashead'}
                    scope="col"
                  >
                    {m.label}
                  </th>
                ))
                : null}
            </tr>
          ) : null}
        </thead>
        {empty ? (
          <tbody>
            <tr>
              <td className="ds-pivot__empty" colSpan={colCount}>{emptyText}</td>
            </tr>
          </tbody>
        ) : (
          <tbody>
            {body.map(({ node, hasChildren, collapsed }) => {
              const dim = rowDimensions[node.depth]!
              const label = dim.formatValue?.(node.key) ?? node.key
              return (
                <tr key={node.id} className={hasChildren ? 'ds-pivot__row ds-pivot__row--group' : 'ds-pivot__row'}>
                  <th
                    className="ds-pivot__rowhead"
                    scope="row"
                    style={{ '--ds-pivot-depth': node.depth } as React.CSSProperties}
                  >
                    {hasChildren ? (
                      <button
                        type="button"
                        className="ds-pivot__fold"
                        aria-expanded={!collapsed}
                        onClick={() => toggleRow(node.id)}
                      >
                        <Caret kind="branch" open={!collapsed} />
                        {label}
                      </button>
                    ) : label}
                  </th>
                  {valueCells(node.rows, node.id)}
                </tr>
              )
            })}
          </tbody>
        )}
        {grandTotalRow && !empty ? (
          <tfoot>
            <tr className="ds-pivot__row ds-pivot__row--total">
              <th className="ds-pivot__rowhead ds-pivot__rowhead--total" scope="row">{totalText}</th>
              {valueCells(allIndices, 'grand')}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  )
}
