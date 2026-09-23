import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { DataTable, type Column } from './DataTable.js'
import { type Row, columns, rows } from './DataTable.test-fixtures.js'

describe('DataTable', () => {
  it('renders headers and all rows', () => {
    render(<DataTable columns={columns} rows={rows} getRowId={(r) => r.id} />)
    expect(screen.getByText('Номенклатура')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(3) // header + 2
  })

  it('marks numeric columns and selected rows', async () => {
    const onToggle = vi.fn()
    render(
      <DataTable columns={columns} rows={rows} getRowId={(r) => r.id}
        selectedIds={['1']} onSelectionChange={onToggle} />
    )
    const firstBody = screen.getAllByRole('row')[1]
    expect(firstBody).toHaveClass('is-selected')
    await userEvent.click(within(firstBody).getByRole('checkbox'))
    expect(onToggle).toHaveBeenCalledWith([])
    expect(screen.getByRole('columnheader', { name: 'Сумма' })).toHaveClass('ds-table__num')
    const cells = within(screen.getAllByRole('row')[1]).getAllByRole('cell')
    const sumCell = cells[cells.length - 1]!
    expect(sumCell).toHaveClass('ds-table__num')
  })

  it('renders no selection column when onSelectionChange is absent', () => {
    render(<DataTable columns={columns} rows={rows} getRowId={(r) => r.id} />)
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('renders sortable header as a button, marks aria-sort on the active column, and fires onSort', async () => {
    const onSort = vi.fn()
    const sortCols: Column<Row>[] = [
      { key: 'name', header: 'Номенклатура', sortable: true },
      { key: 'sum', header: 'Сумма', numeric: true, sortable: true },
    ]
    render(<DataTable columns={sortCols} rows={rows} getRowId={(r) => r.id} sortKey="name" sortDir="asc" onSort={onSort} />)
    expect(screen.getByRole('columnheader', { name: /Номенклатура/ })).toHaveAttribute('aria-sort', 'ascending')
    expect(screen.getByRole('columnheader', { name: /Сумма/ })).toHaveAttribute('aria-sort', 'none')
    await userEvent.click(screen.getByRole('button', { name: /Сумма/ }))
    expect(onSort).toHaveBeenCalledWith('sum')
  })

  it('does not render sort buttons when onSort is absent', () => {
    const sortCols: Column<Row>[] = [{ key: 'name', header: 'Номенклатура', sortable: true }]
    render(<DataTable columns={sortCols} rows={rows} getRowId={(r) => r.id} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('columnheader', { name: 'Номенклатура' })).not.toHaveAttribute('aria-sort')
  })

  it('renders skeleton rows and no data when loading', () => {
    const { container } = render(<DataTable columns={columns} rows={rows} getRowId={(r) => r.id} loading loadingRows={3} />)
    expect(container.querySelectorAll('.ds-table__skelrow')).toHaveLength(3)
    expect(screen.queryByText('Товар А')).toBeNull()
  })

  it('renders emptyContent when there are no rows', () => {
    render(<DataTable columns={columns} rows={[]} getRowId={(r) => r.id} emptyContent={<span>Ничего нет</span>} />)
    expect(screen.getByText('Ничего нет')).toBeInTheDocument()
  })

  it('fires onRowClick with the row, but not when the checkbox is toggled', async () => {
    const onRowClick = vi.fn(), onToggle = vi.fn()
    // Колонка, называющая строку, обязательна при onRowClick (DS-92) —
    // без неё поведение существовало бы только для мыши.
    const clickCols: Column<Row>[] = [
      { key: 'name', header: 'Номенклатура', rowHeader: true },
      { key: 'sum', header: 'Сумма', numeric: true },
    ]
    render(<DataTable columns={clickCols} rows={rows} getRowId={(r) => r.id} onRowClick={onRowClick} onSelectionChange={onToggle} />)
    const firstBody = screen.getAllByRole('row')[1]!
    expect(firstBody).toHaveClass('is-clickable')
    await userEvent.click(within(firstBody).getByRole('checkbox'))
    expect(onToggle).toHaveBeenCalledWith(['1'])
    expect(onRowClick).not.toHaveBeenCalled()
    // Клик по ячейке ВНЕ кнопки — мышиное сокращение по строке, оно осталось.
    await userEvent.click(within(firstBody).getByText('1200'))
    expect(onRowClick).toHaveBeenCalledWith(rows[0])
  })

  // СКРОЛЛЕР ВКЛЮЧАЕТСЯ ЗАМЕРОМ (DS-169). Пара случаев, и второй НЕ
  // зеркало первого: постоянный `overflow` закрыл бы первый и молча испортил
  // обычную таблицу — там, где листать нечего, обёртка не должна становиться
  // контейнером прокрутки, иначе липкая шапка перестаёт липнуть без всякой
  // на то причины.
  //
  // jsdom раскладку не считает: `scrollWidth` и `clientWidth` там всегда 0, и
  // без подмены оба случая сошлись бы на нулях, ничего не проверив. Подмена на
  // прототипе, потому что элемент обёртки создаёт сам компонент; замер идёт в
  // `useLayoutEffect`, то есть ДО возврата из `render`, — стелить надо заранее.
  describe('свой горизонтальный скроллер', () => {
    const stub = (scrollW: number, clientW: number) => {
      const sw = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth')
      const cw = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')
      Object.defineProperty(Element.prototype, 'scrollWidth', { configurable: true, get: () => scrollW })
      Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => clientW })
      return () => {
        Object.defineProperty(Element.prototype, 'scrollWidth', sw!)
        Object.defineProperty(Element.prototype, 'clientWidth', cw!)
      }
    }
    const cols = [{ key: 'a', header: 'А', width: 200 }, { key: 'b', header: 'Б', width: 200 }] as const
    const data = [{ a: '1', b: '2' }]

    it('таблица не влезла — обёртка берёт прокрутку себе', () => {
      const restore = stub(432, 360)
      try {
        const { container } = render(
          <DataTable columns={[...cols]} rows={data} getRowId={(r) => r.a} />,
        )
        expect(container.querySelector('.ds-table-wrap')).toHaveClass('is-scrollable')
      } finally { restore() }
    })

    it('таблица влезла — прокрутки НЕТ, и липкая шапка остаётся липкой', () => {
      const restore = stub(360, 360)
      try {
        const { container } = render(
          <DataTable columns={[...cols]} rows={data} getRowId={(r) => r.a} />,
        )
        expect(container.querySelector('.ds-table-wrap')).not.toHaveClass('is-scrollable')
      } finally { restore() }
    })
  })
})
