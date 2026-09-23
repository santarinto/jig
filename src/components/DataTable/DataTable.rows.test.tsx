import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { DataTable } from './DataTable.js'
import type { DisplayRow } from '../../internal/rowModel.js'
import { type Row, columns, rows, modeled, modeledWithGroup, grouped } from './DataTable.test-fixtures.js'

describe('DataTable: модель строк', () => {
  it('рисует displayRows и помечает таблицу как управляемую моделью', () => {
    const { container } = render(<DataTable columns={columns} displayRows={modeled} />)
    expect(container.querySelector('table')).toHaveAttribute('data-ds-managed-rows')
    expect(screen.getByText('Товар А')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(3) // шапка + 2
  })

  it('чётность проставляется классом, а не позицией в DOM: нечётная строка класса не несёт, служебная строка группы не сбивает счёт', () => {
    const { container } = render(<DataTable columns={columns} displayRows={modeledWithGroup} />)
    const body = container.querySelectorAll('tbody tr')
    expect(body).toHaveLength(3) // группа теперь тоже своя строка
    const dataRows = Array.from(body).filter((tr) => !tr.classList.contains('ds-table__group'))
    expect(dataRows).toHaveLength(2)
    expect(dataRows[0]).not.toHaveClass('ds-table__row--even')
    expect(dataRows[1]).toHaveClass('ds-table__row--even')
  })

  it('глубина уезжает в CSS-переменную первой ячейки', () => {
    const { container } = render(<DataTable columns={columns} displayRows={modeled} />)
    const secondRowFirstCell = container.querySelectorAll('tbody tr')[1]!.querySelector('td')!
    expect(secondRowFirstCell.style.getPropertyValue('--ds-row-depth')).toBe('1')
  })

  it('плоский путь не получает ни атрибута, ни классов чётности', () => {
    const { container } = render(<DataTable columns={columns} rows={rows} getRowId={(r) => r.id} />)
    expect(container.querySelector('table')).not.toHaveAttribute('data-ds-managed-rows')
    // Вторая строка (индекс 1) — та, что получила бы ds-table__row--even,
    // если бы `managed &&` перестал охранять простановку класса: у первой
    // строки isEven ложный независимо от managed, и проверка на ней ничего
    // не стережёт.
    const bodyRows = container.querySelectorAll('tbody tr')
    expect(bodyRows[0]).not.toHaveClass('ds-table__row--even')
    expect(bodyRows[1]).not.toHaveClass('ds-table__row--even')
  })
})

describe('DataTable: группы и раскрытие', () => {
  it('заголовок группы занимает всю ширину и показывает счётчик', () => {
    const { container } = render(<DataTable columns={columns} displayRows={grouped} />)
    const groupCell = container.querySelector('tr.ds-table__group td')!
    expect(groupCell).toHaveAttribute('colspan', '2')
    expect(groupCell).toHaveTextContent('Товары')
    expect(groupCell).toHaveTextContent('2')
  })

  it('colspan учитывает колонку выбора', () => {
    const { container } = render(
      <DataTable columns={columns} displayRows={grouped} selectedIds={[]} onSelectionChange={vi.fn()} />)
    expect(container.querySelector('tr.ds-table__group td')).toHaveAttribute('colspan', '3')
  })

  it('нажатие на заголовок группы зовёт onToggleExpand с её id', async () => {
    const onToggleExpand = vi.fn()
    render(<DataTable columns={columns} displayRows={grouped} onToggleExpand={onToggleExpand} />)
    await userEvent.click(screen.getByRole('button', { name: /Товары/ }))
    expect(onToggleExpand).toHaveBeenCalledWith('group:Товары')
  })

  it('узел с детьми получает кнопку раскрытия, лист — нет', async () => {
    const onToggleExpand = vi.fn()
    const tree: DisplayRow<Row>[] = [
      { kind: 'data', id: '1', row: rows[0]!, depth: 0, hasChildren: true, expanded: false },
      { kind: 'data', id: '2', row: rows[1]!, depth: 0, hasChildren: false, expanded: false },
    ]
    render(<DataTable columns={columns} displayRows={tree} onToggleExpand={onToggleExpand} />)
    // Поиск по роли и доступному имени, а не по классу: кнопка обязана быть
    // проговариваемой скринридером, а не просто присутствовать в разметке.
    const toggle = screen.getByRole('button', { name: 'Развернуть строку 1' })
    expect(screen.queryByRole('button', { name: /строку 2/ })).toBeNull()
    await userEvent.click(toggle)
    expect(onToggleExpand).toHaveBeenCalledWith('1')
  })

  it('в дереве гуттер каретки держат ВСЕ строки; в группировке и в плоской таблице его нет ни у кого', () => {
    // Утверждение геометрическое, а место держит CSS — здесь проверяется ровно
    // то, что умеет jsdom: попал ли класс на ту ячейку. Что текст встаёт на
    // свою глубину и каретка не уводит его на вторую строку, меряет
    // `make measure`, случай «Иерархия: текст ведущей колонки стоит на своей
    // глубине». Одной проверки мало ни в ту, ни в другую сторону.
    const lead = (c: HTMLElement) =>
      Array.from(c.querySelectorAll('tbody tr:not(.ds-table__group) > :first-child'))
    const tree: DisplayRow<Row>[] = [
      { kind: 'data', id: '1', row: rows[0]!, depth: 0, hasChildren: true, expanded: true },
      { kind: 'data', id: '2', row: rows[1]!, depth: 1, hasChildren: false, expanded: false },
    ]
    const asTree = render(<DataTable columns={columns} displayRows={tree} onToggleExpand={vi.fn()} />)
    // Длина проверяется в КАЖДОЙ ветке: `lead()` — селектор из трёх частей, и
    // одна обёртка или одно переименование класса превратили бы отрицательные
    // ветки ниже в пустой цикл, оставив их зелёными (ловушка 1 из
    // docs/writing-checks.md).
    expect(lead(asTree.container)).toHaveLength(2)
    for (const cell of lead(asTree.container)) expect(cell).toHaveClass('ds-table__lead--tree')
    // Каретка узла несёт свой модификатор: она лежит в гуттере абсолютом, и без
    // него встала бы в поток соседом текста.
    expect(asTree.container.querySelector('.ds-table__toggle--row')).toBeInTheDocument()
    asTree.unmount()

    // Группировка: `onToggleExpand` задан, но ни одна строка данных детей не
    // имеет — резервировать нечего, и первая колонка обязана остаться на
    // месте. Без этой ветки правка сдвинула бы каждую сгруппированную таблицу
    // потребителя, и ни один тест дерева этого бы не заметил.
    const asGroups = render(<DataTable columns={columns} displayRows={grouped} onToggleExpand={vi.fn()} />)
    expect(lead(asGroups.container)).toHaveLength(2)
    for (const cell of lead(asGroups.container)) expect(cell).not.toHaveClass('ds-table__lead--tree')
    asGroups.unmount()

    const flat = render(<DataTable columns={columns} rows={rows} getRowId={(r) => r.id} />)
    expect(lead(flat.container)).toHaveLength(2)
    for (const cell of lead(flat.container)) expect(cell).not.toHaveClass('ds-table__lead--tree')
  })

  it('доступное имя кнопки раскрытия зависит от состояния expanded', () => {
    const collapsed: DisplayRow<Row>[] = [
      { kind: 'data', id: '1', row: rows[0]!, depth: 0, hasChildren: true, expanded: false },
    ]
    const { rerender } = render(
      <DataTable columns={columns} displayRows={collapsed} onToggleExpand={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Развернуть строку 1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Свернуть строку 1' })).toBeNull()

    const expanded: DisplayRow<Row>[] = [
      { kind: 'data', id: '1', row: rows[0]!, depth: 0, hasChildren: true, expanded: true },
    ]
    rerender(<DataTable columns={columns} displayRows={expanded} onToggleExpand={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Свернуть строку 1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Развернуть строку 1' })).toBeNull()
  })

  it('без onToggleExpand кнопок раскрытия нет', () => {
    render(<DataTable columns={columns} displayRows={grouped} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('группа с cells проецирует значение под свою колонку, ведущая ячейка держит подпись', () => {
    const displayRows: DisplayRow<Row>[] = [
      { kind: 'group', id: 'g', depth: 0, label: 'Итого', count: 2, expanded: true, cells: { sum: '4 600' } },
    ]
    render(<DataTable columns={columns} displayRows={displayRows} />)
    const groupRow = screen.getByText('Итого').closest('tr')!
    const cells = within(groupRow).getAllByRole('cell')
    expect(cells).toHaveLength(2) // ведущая (label) + колонка суммы
    const last = cells[cells.length - 1]!
    expect(last).toHaveTextContent('4 600')
    expect(last).toHaveClass('ds-table__num') // выравнивание наследуется от numeric-колонки
  })

  it('группа с aside показывает aside вместо счётчика', () => {
    const displayRows: DisplayRow<Row>[] = [
      { kind: 'group', id: 'g', depth: 0, label: 'пятница', count: 5, expanded: true,
        aside: <span>потрачено 100 ₽</span> },
    ]
    render(<DataTable columns={columns} displayRows={displayRows} />)
    expect(screen.getByText('потрачено 100 ₽')).toBeInTheDocument()
    expect(screen.queryByText('5')).not.toBeInTheDocument()
  })

  it('группа без cells/aside — прежний один colSpan со счётчиком', () => {
    const displayRows: DisplayRow<Row>[] = [
      { kind: 'group', id: 'g', depth: 0, label: 'Группа', count: 3, expanded: true },
    ]
    render(<DataTable columns={columns} displayRows={displayRows} />)
    const groupRow = screen.getByText('Группа').closest('tr')!
    const cells = within(groupRow).getAllByRole('cell')
    expect(cells).toHaveLength(1)
    expect(cells[0]).toHaveAttribute('colspan', '2')
    expect(within(groupRow).getByText('3')).toBeInTheDocument()
  })
})

describe('DataTable: строка-итог tfoot', () => {
  it('footer рендерит tfoot со значением под колонкой', () => {
    render(<DataTable columns={columns} rows={rows} getRowId={(r) => r.id}
      footer={{ label: 'Всего', cells: { sum: '4 600' } }} />)
    const foot = document.querySelector('tfoot')
    expect(foot).not.toBeNull()
    expect(within(foot!).getByText('Всего')).toBeInTheDocument()
    const cells = within(foot!).getAllByRole('cell')
    const last = cells[cells.length - 1]!
    expect(last).toHaveTextContent('4 600')
    expect(last).toHaveClass('ds-table__num')
  })

  it('без footer нет tfoot', () => {
    render(<DataTable columns={columns} rows={rows} getRowId={(r) => r.id} />)
    expect(document.querySelector('tfoot')).toBeNull()
  })
})

describe('DataTable: состояния строки', () => {
  it('rowState вешает класс muted на строку данных', () => {
    render(<DataTable columns={columns} rows={rows} getRowId={(r) => r.id}
      rowState={(r) => ({ muted: r.id === '1' })} />)
    const body = screen.getAllByRole('row').slice(1)
    expect(body[0]).toHaveClass('ds-table__row--muted')
    expect(body[1]).not.toHaveClass('ds-table__row--muted')
  })

  it('без rowState класс muted не появляется', () => {
    render(<DataTable columns={columns} rows={[rows[0]!]} getRowId={(r) => r.id} />)
    const row = screen.getAllByRole('row')[1]!
    expect(row.className).not.toMatch(/ds-table__row--muted/)
  })

  it('rowState не трогает строки-группы — только data', () => {
    const displayRows: DisplayRow<Row>[] = [
      { kind: 'group', id: 'g', depth: 0, label: 'Группа', count: 1, expanded: true },
      { kind: 'data', id: '1', row: rows[0]!, depth: 1, hasChildren: false, expanded: false },
    ]
    render(<DataTable columns={columns} displayRows={displayRows} rowState={() => ({ muted: true })} />)
    const groupRow = screen.getByText('Группа').closest('tr')!
    expect(groupRow.className).not.toMatch(/ds-table__row--muted/)
  })
})

/**
 * Клавиатурный путь строки (DS-92).
 *
 * `onRowClick` вешал только `onClick` на `<tr>` и класс `is-clickable`, в
 * котором лежит один `cursor: pointer`. Поведение существовало для мыши и не
 * существовало ни для клавиатуры, ни для диктора. Нашёл потребитель, переводя
 * рукописную `<table class="ds-table">` на компонент: у него ячейка кода была
 * `<button>`, после перехода стала обычным текстом, и выбрать строку стало
 * нечем — замер по классам при этом показывал улучшение (своих классов ноль).
 *
 * Строка НЕ становится интерактивным элементом: в строках лежит колонка
 * действий с кнопками, и фокусируемая строка дала бы интерактивное внутри
 * интерактивного. Контрол живёт в ячейке, которая называет строку, и эту
 * ячейку назначает потребитель — `rowHeader`.
 */

describe('DataTable · текущая строка против выбранных', () => {
  it('подсветка без onSelectionChange: выбранная строка помечена aria-current, соседняя — нет', () => {
    render(<DataTable columns={columns} rows={rows} getRowId={(r) => r.id} selectedIds={['1']} />)
    const [, first, second] = screen.getAllByRole('row')
    expect(first).toHaveAttribute('aria-current', 'true')
    // Сосед — не формальность: без него проверка проходила бы и на разметке,
    // которая метит ВСЕ строки.
    expect(second).not.toHaveAttribute('aria-current')
  })

  it('мультивыбор (есть onSelectionChange): aria-current не ставится — состояние строки произносит её чекбокс', () => {
    render(<DataTable columns={columns} rows={rows} getRowId={(r) => r.id} selectedIds={['1']} onSelectionChange={vi.fn()} />)
    const first = screen.getAllByRole('row')[1]!
    expect(first).not.toHaveAttribute('aria-current')
    expect(within(first).getByRole('checkbox')).toBeChecked()
  })

  it('видимое состояние в обоих режимах одно и то же: aria-current ничего не подменяет, а добавляет', () => {
    const { unmount } = render(<DataTable columns={columns} rows={rows} getRowId={(r) => r.id} selectedIds={['1']} />)
    expect(screen.getAllByRole('row')[1]).toHaveClass('is-selected')
    unmount()
    render(<DataTable columns={columns} rows={rows} getRowId={(r) => r.id} selectedIds={['1']} onSelectionChange={vi.fn()} />)
    expect(screen.getAllByRole('row')[1]).toHaveClass('is-selected')
  })
})

/**
 * Пустой `<th>` — колонка без видимой подписи (DS-80).
 *
 * axe (`empty-table-header`) горит на КАЖДОМ случае фикстуры DataTable, включая
 * тот, где колонки выбора нет вовсе: источников три, а задача была заведена на
 * один. Пустой заголовок не экономит место — он просто молчит, и колонка,
 * очевидная глазами, для диктора остаётся безымянной.
 *
 * Двумя из трёх колонок владеет сам компонент, и назвать их он обязан сам:
 * у колонки выбора разметки потребителя нет вовсе, а у колонки действий ИМЯ
 * СЛЕДУЕТ ИЗ ТИПА — `actions` гарантирует, что это действия, и умолчание тут
 * не догадка. Третий источник (`header: ''` у обычной колонки) — отдельный
 * разговор: там компоненту взять имя неоткуда.
 */
