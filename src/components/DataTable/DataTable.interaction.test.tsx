import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { DataTable, type Column } from './DataTable.js'
import { type Row, columns, rows } from './DataTable.test-fixtures.js'

describe('DataTable: колонка действий', () => {
  interface ARow { id: string; name: string }
  const arows: ARow[] = [
    { id: '1', name: 'Присед' },
    { id: '2', name: 'Жим' },
  ]

  // Колонка действий не несёт key/поля данных — данные ей не нужны, нужна строка.
  const actionCols = (onEdit: (r: ARow) => void, onDelete: (r: ARow) => void): Column<ARow>[] => [
    // `rowHeader` здесь не украшение: тесты ниже передают `onRowClick`, а он с
    // DS-92 без назначенной колонки бросает.
    { key: 'name', header: 'Упражнение', rowHeader: true },
    {
      id: 'actions',
      actions: (row) => [
        { id: 'edit', icon: <span>✎</span>, label: `Изменить ${row.name}`, onSelect: () => onEdit(row) },
        { id: 'del', icon: <span>🗑</span>, label: `Удалить ${row.name}`, tone: 'error', onSelect: () => onDelete(row) },
      ],
    },
  ]

  it('рисует кнопку на каждое действие с aria-label из строки', () => {
    render(<DataTable columns={actionCols(() => {}, () => {})} rows={arows} getRowId={(r) => r.id} />)
    expect(screen.getByRole('button', { name: 'Изменить Присед' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Удалить Присед' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Удалить Жим' })).toBeInTheDocument()
  })

  it('действие получает свою строку целиком, без поля данных в модели', async () => {
    const onDelete = vi.fn()
    render(<DataTable columns={actionCols(() => {}, onDelete)} rows={arows} getRowId={(r) => r.id} />)
    await userEvent.click(screen.getByRole('button', { name: 'Удалить Жим' }))
    expect(onDelete).toHaveBeenCalledWith(arows[1])
  })

  it('клик по действию не всплывает до onRowClick — иначе удаление открыло бы строку', async () => {
    const onRowClick = vi.fn()
    const onDelete = vi.fn()
    render(
      <DataTable columns={actionCols(() => {}, onDelete)} rows={arows} getRowId={(r) => r.id}
        onRowClick={onRowClick} />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Удалить Присед' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('клик по самой строке (вне действий) до onRowClick доходит', async () => {
    const onRowClick = vi.fn()
    render(
      <DataTable columns={actionCols(() => {}, () => {})} rows={arows} getRowId={(r) => r.id}
        onRowClick={onRowClick} />
    )
    await userEvent.click(screen.getByText('Присед'))
    expect(onRowClick).toHaveBeenCalledWith(arows[0])
  })

  it('tone="error" уходит в Button как ds-btn--tone-error, обычное действие — нет', () => {
    render(<DataTable columns={actionCols(() => {}, () => {})} rows={arows} getRowId={(r) => r.id} />)
    expect(screen.getByRole('button', { name: 'Удалить Присед' })).toHaveClass('ds-btn--tone-error')
    expect(screen.getByRole('button', { name: 'Изменить Присед' })).not.toHaveClass('ds-btn--tone-error')
  })

  it('кнопки действий — ghost-iconOnly размера sm (форма, к которой сходились руками)', () => {
    render(<DataTable columns={actionCols(() => {}, () => {})} rows={arows} getRowId={(r) => r.id} />)
    expect(screen.getByRole('button', { name: 'Изменить Присед' }))
      .toHaveClass('ds-btn--ghost', 'ds-btn--sm', 'ds-btn--icon')
  })

  it('disabled-действие рисует выключенную кнопку и не зовёт onSelect', async () => {
    const onSelect = vi.fn()
    const cols: Column<ARow>[] = [
      { key: 'name', header: 'Упражнение' },
      { id: 'actions', actions: (row) => [{ id: 'del', icon: <span>🗑</span>, label: `Удалить ${row.name}`, disabled: true, onSelect }] },
    ]
    render(<DataTable columns={cols} rows={arows} getRowId={(r) => r.id} />)
    const btn = screen.getByRole('button', { name: 'Удалить Присед' })
    expect(btn).toBeDisabled()
    await userEvent.click(btn)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('колонка действий по умолчанию прижата к концу строки, а подписи не видно — но она есть', () => {
    render(<DataTable columns={actionCols(() => {}, () => {})} rows={arows} getRowId={(r) => r.id} />)
    const headers = screen.getAllByRole('columnheader')
    const actionsHeader = headers[headers.length - 1]!
    expect(actionsHeader).toHaveClass('ds-table__end')
    // Кнопки — не числа: цифровая типографика колонке действий не полагается.
    // До DS-86 класс был один, и `tnum` доставался ей заодно с краем.
    expect(actionsHeader).not.toHaveClass('ds-table__num')
    // Здесь до DS-80 стояло `toHaveTextContent('')`, и это утверждение
    // ЗАКРЕПЛЯЛО дефект: axe (`empty-table-header`) горел ровно на нём, а тест
    // называл пустоту нормой. Подпись есть и всегда была нужна — глазами её нет.
    expect(actionsHeader).toHaveAccessibleName('Действия')
    expect(actionsHeader.querySelector('.ds-visually-hidden')).not.toBeNull()
    const firstRow = screen.getAllByRole('row')[1]!
    const cells = within(firstRow).getAllByRole('cell')
    expect(cells[cells.length - 1]!).toHaveClass('ds-table__end')
  })

  it('align="start" возвращает колонку действий к началу строки', () => {
    const cols: Column<ARow>[] = [
      { key: 'name', header: 'Упражнение' },
      { id: 'actions', align: 'start', actions: (row) => [{ id: 'edit', icon: <span>✎</span>, label: `Изменить ${row.name}`, onSelect: () => {} }] },
    ]
    render(<DataTable columns={cols} rows={arows} getRowId={(r) => r.id} />)
    const headers = screen.getAllByRole('columnheader')
    expect(headers[headers.length - 1]!).not.toHaveClass('ds-table__end')
  })
})

/**
 * Ширины колонок. У `auto`-раскладки текстовая колонка забирает место у
 * числовых — «Продукты» растягивается, суммы жмутся. Это поведение по
 * умолчанию, а не особенность данных, поэтому упирается в него любой
 * потребитель таблиц с колонкой сумм.
 *
 * Режим раскладки НЕ отдельный проп: задать ширины и забыть включить
 * `table-layout: fixed` — значит получить пропсы, которые заданы и молча
 * ничего не делают. Один проп сделать наполовину нельзя.
 */

describe('DataTable · клавиатурный путь строки', () => {
  const cols: Column<Row>[] = [
    { key: 'name', header: 'Номенклатура', rowHeader: true },
    { key: 'sum', header: 'Сумма', numeric: true },
  ]

  it('назначенная колонка — <th scope="row">, остальные ячейки строки остаются <td>', () => {
    render(<DataTable columns={cols} rows={rows} getRowId={(r) => r.id} />)
    const first = screen.getAllByRole('row')[1]!
    const head = within(first).getByRole('rowheader')
    expect(head).toHaveTextContent('Товар А')
    expect(head.getAttribute('scope')).toBe('row')
    // Сумма рядом — обычная ячейка. Иначе «rowheader» означал бы «первая
    // ячейка», а не «ячейка, называющая строку», и проверка выше проходила бы
    // на любой таблице.
    expect(within(first).getByRole('cell')).toHaveTextContent('1200')
  })

  it('без rowHeader ведущая ячейка остаётся <td> — прежнее поведение не тронуто', () => {
    render(<DataTable columns={columns} rows={rows} getRowId={(r) => r.id} />)
    const first = screen.getAllByRole('row')[1]!
    expect(within(first).queryByRole('rowheader')).toBeNull()
  })

  it('с onRowClick содержимое назначенной ячейки — кнопка, и её имя берётся из строки, а не выдумывается', () => {
    render(<DataTable columns={cols} rows={rows} getRowId={(r) => r.id} onRowClick={vi.fn()} />)
    const first = screen.getAllByRole('row')[1]!
    expect(within(first).getByRole('button', { name: 'Товар А' })).toBeInTheDocument()
  })

  it('строка берётся с КЛАВИАТУРЫ: Tab доводит до контрола, Enter зовёт onRowClick с этой строкой', async () => {
    const onRowClick = vi.fn()
    render(<DataTable columns={cols} rows={rows} getRowId={(r) => r.id} onRowClick={onRowClick} />)
    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Товар А' }))
    await userEvent.keyboard('{Enter}')
    expect(onRowClick).toHaveBeenCalledWith(rows[0])
  })

  /**
   * Кнопка лежит внутри `<tr onClick>`, и её клик всплывает до строки —
   * мышиный клик позвал бы `onRowClick` ДВАЖДЫ. Ровно так же всплывает click,
   * порождённый активацией кнопки с клавиатуры, поэтому счёт проверяется на
   * обоих путях, а не на одном.
   *
   * Считается именно ЧИСЛО вызовов: `toHaveBeenCalledWith` зелёный и на двух.
   */
  it('вызов ровно один — и мышью, и с клавиатуры: клик кнопки не всплывает до строки', async () => {
    const onRowClick = vi.fn()
    render(<DataTable columns={cols} rows={rows} getRowId={(r) => r.id} onRowClick={onRowClick} />)
    await userEvent.click(screen.getByRole('button', { name: 'Товар А' }))
    expect(onRowClick).toHaveBeenCalledTimes(1)
    onRowClick.mockClear()
    await userEvent.tab()
    await userEvent.keyboard('{Enter}')
    expect(onRowClick).toHaveBeenCalledTimes(1)
  })

  it('без onRowClick кнопки нет: таб-стоп на строку, которую нечем открыть, — это шум в обходе', () => {
    render(<DataTable columns={cols} rows={rows} getRowId={(r) => r.id} />)
    expect(screen.queryByRole('button', { name: 'Товар А' })).toBeNull()
  })

  /**
   * Типы не видят содержимое массива колонок, поэтому `onRowClick` без
   * назначенной колонки ошибкой компиляции стать не может. Значит — бросок на
   * первом рендере, как у `assertAlign`: молча отдать мышиное поведение
   * означало бы вернуть ровно тот дефект, ради которого всё это написано.
   */
  it('onRowClick без назначенной колонки бросает, а не отдаёт мышиное поведение молча', () => {
    expect(() => render(
      <DataTable columns={columns} rows={rows} getRowId={(r) => r.id} onRowClick={vi.fn()} />,
    )).toThrow(/rowHeader/)
  })

  it('rowHeader на колонке с render — ошибка типов: произвольный узел внутри кнопки дал бы вложенное интерактивное', () => {
    type C = Column<Row>
    // @ts-expect-error — назначенная колонка печатает поле строки, render ей запрещён
    const col: C = { key: 'name', header: 'Номенклатура', rowHeader: true, render: (r) => <a href="#x">{r.name}</a> }
    expect(col).toBeDefined()
  })

  /**
   * `format` — та же подпись, что у `render`, с возвратом, суженным до строки
   * (повод — факт от потребителя). Запрет на `render` держался ровно на
   * произвольном УЗЛЕ внутри кнопки; строка вкладывать нечего, и запрет ей не
   * нужен. Пустота рядом с запретом была настоящей: у потребителя все четыре
   * колонки журнала веса шли через `render`, и назвать строку стало нечем —
   * пришлось заводить второе поле в модели.
   */
  describe('format — напечатать поле не как есть', () => {
    interface DateRow { id: string; at: string; sum: number }
    const dateRows: DateRow[] = [
      { id: '1', at: '2026-08-25T00:00:00Z', sum: 12 },
      { id: '2', at: '2026-01-03T00:00:00Z', sum: 34 },
    ]
    const short = (r: DateRow) => r.at.slice(8, 10) + '.' + r.at.slice(5, 7) + '.' + r.at.slice(0, 4)
    const dateCols: Column<DateRow>[] = [
      { key: 'at', header: 'Дата', rowHeader: true, format: short },
      { key: 'sum', header: 'Вес', numeric: true },
    ]

    it('печатает результат format, а не поле', () => {
      render(<DataTable columns={dateCols} rows={dateRows} getRowId={(r) => r.id} />)
      const head = within(screen.getAllByRole('row')[1]!).getByRole('rowheader')
      expect(head).toHaveTextContent('25.08.2026')
      expect(head).not.toHaveTextContent('2026-08-25T00:00:00Z')
    })

    /**
     * Обе ветки, а не одна: имя строки печатается в ДВУХ местах — внутри кнопки
     * при `onRowClick` и без неё. Разошедшиеся копии дали бы форматирование в
     * одном режиме и голое поле в другом, и увидеть это можно было бы только
     * переключив режим. Мутация проверена: вернуть в любую из веток
     * `String(row[key])` — краснеет ровно один из этих двух тестов.
     */
    it('форматирует и внутри кнопки строки — там же становится её ДОСТУПНЫМ ИМЕНЕМ', () => {
      render(<DataTable columns={dateCols} rows={dateRows} getRowId={(r) => r.id} onRowClick={vi.fn()} />)
      expect(screen.getByRole('button', { name: '25.08.2026' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '2026-08-25T00:00:00Z' })).toBeNull()
    })

    it('без format поле печатается как есть — умолчание не тронуто', () => {
      const plain: Column<DateRow>[] = [{ key: 'at', header: 'Дата', rowHeader: true }]
      render(<DataTable columns={plain} rows={dateRows} getRowId={(r) => r.id} />)
      expect(within(screen.getAllByRole('row')[1]!).getByRole('rowheader'))
        .toHaveTextContent('2026-08-25T00:00:00Z')
    })

    it('format на колонке данных — ошибка типов: там для этого есть render', () => {
      type C = Column<Row>
      // @ts-expect-error — две формы для одного дали бы молчаливый выбор одной
      const col: C = { key: 'name', header: 'Номенклатура', format: (r) => r.name }
      expect(col).toBeDefined()
    })

    it('format вместе с render — ошибка типов: запрет на узел форматом не обходится', () => {
      type C = Column<Row>
      // @ts-expect-error — render у назначенной колонки запрещён, format его не отпирает
      const col: C = { key: 'name', header: 'Имя', rowHeader: true, format: (r) => r.name, render: (r) => <b>{r.name}</b> }
      expect(col).toBeDefined()
    })
  })
})

/**
 * Текущая строка против выбранных (DS-92).
 *
 * Потребитель, переводя рукописную таблицу на компонент, потерял вместе с
 * кнопкой и `aria-selected` и восстановил его как `aria-current`. Замена
 * верная, а не компромисс: `aria-selected` законен только под ролью
 * `grid`/`listbox`, которой у таблицы нет, — на обычном `<tr>` он выражение
 * без грамматики.
 *
 * Но вешать его на всякую выбранную строку нельзя. `selectedIds` живёт в двух
 * РАЗНЫХ режимах, и они означают разное: без `onSelectionChange` это подсветка
 * «вот эта строка сейчас открыта» (одна из набора — то самое `current`), а с
 * ним — мультивыбор галочками, где состояние каждой строки уже произносит её
 * чекбокс. `aria-current` во втором режиме соврал бы: «текущих» строк стало бы
 * столько, сколько отмечено.
 */
