import type { ReactNode } from 'react'
import { DemoSpec } from './demo-spec.js'
import './demo-matrix.css'

/**
 * Тот же каркас, что у `DemoMatrix`, но без осей: ячейки просто текут в колонки.
 * Для набора, где строка и колонка ничего не значат — варианты кнопки, размеры,
 * состояния. Без него такой набор приходится класть в `.demo-row`, а там
 * `demo-spec--inline` занимает всю ширину, и каждый образец уезжает на свою
 * строку — ряд из пяти кнопок растягивается на пол-экрана по вертикали.
 */
export function DemoGrid({
  title,
  items,
  columns = 4,
  minColumnWidth = '11rem',
  cellMinHeight = '4.5rem',
  toolbar,
}: {
  title: string
  items: { id: string; name: string; code?: string; render: () => ReactNode }[]
  columns?: number
  minColumnWidth?: string
  cellMinHeight?: string
  toolbar?: ReactNode
}) {
  return (
    <div className="demo-matrix-block">
      <p className="demo-matrix__title">{title}</p>
      {toolbar && <div className="demo-matrix__toolbar">{toolbar}</div>}
      <div className="demo-matrix-wrap">
        <div
          className="demo-matrix demo-matrix--flow"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(${minColumnWidth}, 1fr))` }}
        >
          {items.map((it) => (
            <div key={it.id} className="demo-matrix__cell" style={{ minHeight: cellMinHeight }}>
              <DemoSpec inline name={it.name} code={it.code}>
                {it.render()}
              </DemoSpec>
            </div>
          ))}
          {/*
            Хвост последнего ряда добирается пустыми ячейками. Без них сквозь
            сетку светит её собственный фон (`--ds-border`), и дырка читается
            как серая плашка — то есть как содержимое, которого нет.
          */}
          {Array.from({ length: (columns - (items.length % columns)) % columns }, (_, i) => (
            <div key={`filler-${i}`} className="demo-matrix__cell" aria-hidden />
          ))}
        </div>
      </div>
    </div>
  )
}

export interface MatrixAxis {
  id: string
  label: string
  /** Мелкая приписка под заголовком колонки — «нет такого варианта» и т.п. */
  note?: string
}

/**
 * Сетка «строка × колонка», в каждой ячейке — обычный DemoSpec.
 *
 * Один вид на всю галерею: матрица Button построена этим же компонентом, так что
 * рамки, подписи строк и заголовки колонок не могут разъехаться между секциями —
 * они описаны в одном месте.
 *
 * Ось с одним значением остаётся осью: колонка без подписи не рисует заголовок,
 * и матрица вырождается в подписанный столбец, а не в другой вид блока.
 */
export function DemoMatrix({
  title,
  columns,
  rows,
  render,
  code,
  name,
  toolbar,
  rowLabelWidth = '11rem',
  minColumnWidth = '7rem',
  cellMinHeight,
  maxWidth,
  stretch = false,
}: {
  title: string
  columns: MatrixAxis[]
  rows: MatrixAxis[]
  render: (row: MatrixAxis, col: MatrixAxis) => ReactNode
  /** JSX ячейки — уезжает в кнопку «скопировать». */
  code?: (row: MatrixAxis, col: MatrixAxis) => string
  /** Имя ячейки. По умолчанию «заголовок · строка · колонка». */
  name?: (row: MatrixAxis, col: MatrixAxis) => string
  toolbar?: ReactNode
  rowLabelWidth?: string
  minColumnWidth?: string
  cellMinHeight?: string
  /** Узкой матрице (одна колонка) полная ширина ни к чему — образец теряется в пустоте. */
  maxWidth?: string
  /**
   * Компонент, который сам занимает всю ширину (ProgressBar, Skeleton, Alert),
   * без этого ужимается по содержимому: полоса прогресса выходит 46px и перестаёт
   * быть полосой. Ячейка отдаёт ему всю ширину.
   */
  stretch?: boolean
}) {
  const showColumnHeads = columns.some((c) => c.label.trim() !== '')

  return (
    <div className="demo-matrix-block">
      <p className="demo-matrix__title">{title}</p>
      {toolbar && <div className="demo-matrix__toolbar">{toolbar}</div>}
      <div className="demo-matrix-wrap" style={maxWidth ? { maxWidth } : undefined}>
        <div
          className="demo-matrix"
          role="table"
          aria-label={title}
          style={{
            gridTemplateColumns: `${rowLabelWidth} repeat(${columns.length}, minmax(${minColumnWidth}, 1fr))`,
          }}
        >
          {showColumnHeads && (
            <>
              <div className="demo-matrix__corner" />
              {columns.map((col) => (
                <div key={col.id} className="demo-matrix__col-head" role="columnheader">
                  {col.label}
                  {col.note && <span className="demo-matrix__col-note">{col.note}</span>}
                </div>
              ))}
            </>
          )}
          {rows.map((row) => (
            <div key={row.id} className="demo-matrix__row" role="row">
              <div className="demo-matrix__row-label" role="rowheader">
                {row.label}
              </div>
              {columns.map((col) => (
                <div
                  key={col.id}
                  className={['demo-matrix__cell', stretch && 'demo-matrix__cell--stretch']
                    .filter(Boolean)
                    .join(' ')}
                  role="cell"
                  style={cellMinHeight ? { minHeight: cellMinHeight } : undefined}
                >
                  <DemoSpec
                    inline
                    name={
                      name?.(row, col) ??
                      [title, row.label, col.label].filter((p) => p.trim() !== '').join(' · ')
                    }
                    code={code?.(row, col)}
                  >
                    {render(row, col)}
                  </DemoSpec>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
