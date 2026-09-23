import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { DataTable, type Column } from './DataTable.js'
import { type Row, columns, rows } from './DataTable.test-fixtures.js'

describe('DataTable: колонка без поля строки', () => {
  const withDisplay: Column<Row>[] = [
    ...columns,
    { id: 'actions', header: 'Действия', render: (r) => <button type="button">Открыть {r.name}</button> },
  ]

  it('рисует display-колонку из render, а не из поля строки', () => {
    render(<DataTable columns={withDisplay} rows={rows} getRowId={(r) => r.id} />)
    expect(screen.getByText('Действия')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Открыть Товар А' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Открыть Товар Б' })).toBeInTheDocument()
  })

  it('не печатает undefined в ячейке: у display-колонки нет поля, и его отсутствие не должно протекать в разметку', () => {
    render(<DataTable columns={withDisplay} rows={rows} getRowId={(r) => r.id} />)
    const cells = screen.getAllByRole('cell').map((c) => c.textContent)
    expect(cells.some((t) => t?.includes('undefined'))).toBe(false)
  })

  it('сортировка ходит по id display-колонки — сортирует потребитель, мы только зовём onSort', async () => {
    const onSort = vi.fn()
    render(
      <DataTable
        columns={[...columns, { id: 'progress', header: 'Прогресс', sortable: true, render: () => '50%' }]}
        rows={rows}
        getRowId={(r) => r.id}
        sortKey="progress"
        sortDir="desc"
        onSort={onSort}
      />,
    )
    const th = screen.getByRole('columnheader', { name: /Прогресс/ })
    expect(th).toHaveAttribute('aria-sort', 'descending')
    await userEvent.click(within(th).getByRole('button'))
    expect(onSort).toHaveBeenCalledWith('progress')
  })

  it('data-колонка без render печатает поле — прежнее поведение не тронуто', () => {
    render(<DataTable columns={withDisplay} rows={rows} getRowId={(r) => r.id} />)
    expect(screen.getByText('1200')).toBeInTheDocument()
  })
})

describe('DataTable · перенос в колонке', () => {
  const debts = [{ id: 'd1', bank: 'ОЗОН Банк', products: 'Кредитная карта, рассрочка', debt: 82040 }]

  // У соседей ширина задана намеренно: с DS-88 однострочность выводится
  // из ЗАДАННОСТИ ширины, и колонка без неё переносит сама. Сосед без ширины
  // проверял бы тогда умолчание, а не то, что `wrap` не течёт на чужие ячейки.
  const wrapCols = [
    { key: 'bank' as const, header: 'Банк', width: '5rem' },
    { key: 'products' as const, header: 'Продукты', wrap: true },
    { key: 'debt' as const, header: 'Долг', numeric: true, width: 96 },
  ]

  it('wrap помечает ячейки своей колонки и не трогает соседние', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id} columns={wrapCols} />,
    )
    const heads = [...container.querySelectorAll('thead th')]
    const cells = [...container.querySelectorAll('tbody td')]
    expect(heads[1]).toHaveClass('ds-table__wrap')
    expect(cells[1]).toHaveClass('ds-table__wrap')
    // Соседи названы поимённо: класс на всех ячейках вернул бы прежнее
    // поведение под новым именем, и проверка выше этого бы не заметила.
    expect(heads[0]).not.toHaveClass('ds-table__wrap')
    expect(cells[0]).not.toHaveClass('ds-table__wrap')
    expect(heads[2]).not.toHaveClass('ds-table__wrap')
    expect(cells[2]).not.toHaveClass('ds-table__wrap')
  })

  // Регрессия, найденная ревью: под nowrap подпись сортируемого заголовка
  // выталкивала стрелку за пределы ячейки (92.9px за краем th шириной 80px), и
  // колонка выглядела несортируемой. Сокращаться должна подпись, а не
  // аффорданс, — а для этого у подписи должен быть свой класс.
  it('подпись сортируемого заголовка отделена от стрелки классом', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id}
        columns={[{ key: 'bank' as const, header: 'Банк', width: 80, sortable: true }]}
        onSort={() => {}} />,
    )
    const label = container.querySelector('.ds-table__sortbtn .ds-table__sortlabel')
    expect(label).not.toBeNull()
    expect(label).toHaveTextContent('Банк')
    // Стрелка — отдельный элемент, а не часть подписи: сокращать её нельзя.
    expect(label!.querySelector('.ds-table__sortarrow')).toBeNull()
  })

  /**
   * Умолчание, а не проп (DS-88). Раньше однострочность включалась
   * РЕЖИМОМ таблицы: хватало ширины у одной колонки, чтобы перестали
   * переноситься все — включая ту, у которой ширины нет и в которую как раз
   * кладут прозу. Счёт по потребителям показал, что ширину задают короткому
   * (код, статус, badge, кнопки), а длинное оставляют делить остаток, — то
   * есть правило применялось ровно наоборот.
   *
   * Пара в ОДНОМ рендере, а не два случая порознь: утверждается различимость
   * колонок. Порознь оба проходят и на реализации, которая метит все ячейки
   * подряд, и на той, которая не метит ни одной.
   */
  it('умолчание: колонка с шириной однострочна, колонка без ширины переносит', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id} columns={[
        { key: 'bank' as const, header: 'Банк', width: '5rem' },
        { key: 'products' as const, header: 'Продукты' },
      ]} />,
    )
    const heads = [...container.querySelectorAll('thead th')]
    const cells = [...container.querySelectorAll('tbody td')]
    expect(heads[0]).not.toHaveClass('ds-table__wrap')
    expect(cells[0]).not.toHaveClass('ds-table__wrap')
    expect(heads[1]).toHaveClass('ds-table__wrap')
    expect(cells[1]).toHaveClass('ds-table__wrap')
  })

  /**
   * Обе стороны явного пропа — тоже парой. `wrap` перестал быть люком в одну
   * сторону: `true` возвращает перенос колонке с шириной, `false` возвращает
   * однострочность колонке без неё. Проверять только `true` значит не заметить,
   * что `false` схлопнулся в «то же, что не задано».
   */
  it('явный wrap побеждает умолчание в обе стороны', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id} columns={[
        { key: 'bank' as const, header: 'Банк', width: '5rem', wrap: true },
        { key: 'products' as const, header: 'Продукты', wrap: false },
      ]} />,
    )
    const cells = [...container.querySelectorAll('tbody td')]
    expect(cells[0]).toHaveClass('ds-table__wrap')
    expect(cells[1]).not.toHaveClass('ds-table__wrap')
  })

  /**
   * Таблица без единой ширины в `fixed` не переходит, и правило переноса в
   * листе к ней не относится вовсе. Класс там был бы мусором в разметке
   * КАЖДОЙ колонки у каждого потребителя, который ширин не задаёт (проверено
   * счётом: во `frontend-react` таких таблиц девять файлов и ноль ширин) — и
   * первый, кто увидит его в DevTools, начнёт на него стилизовать.
   */
  it('без единой ширины таблица не fixed — и класса нет ни на одной ячейке', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id} columns={[
        { key: 'bank' as const, header: 'Банк' },
        { key: 'products' as const, header: 'Продукты' },
      ]} />,
    )
    expect(container.querySelector('table')).not.toHaveClass('ds-table--fixed')
    expect(container.querySelector('.ds-table__wrap')).toBeNull()
  })

  /**
   * Числовая колонка ширины обычно не имеет — и умолчание «нет ширины →
   * переносит» разрывало бы сумму по разрядам: они разделены ОБЫЧНЫМ пробелом
   * (`'12 400,00'` в фикстуре). Замерено в браузере: 34px против эталонных
   * 32px в той же колонке без переноса, то есть строка действительно росла.
   * Разорванное число читается как два числа — ошибка, которая себя не
   * показывает, в отличие от многоточия.
   *
   * Пара с текстовой колонкой той же таблицы: порознь «numeric не помечена»
   * проходит и на реализации, которая не метит вообще ничего.
   */
  it('умолчание не переносит числовую колонку, но переносит текстовую рядом', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id} columns={[
        { key: 'bank' as const, header: 'Банк', width: '5rem' },
        { key: 'products' as const, header: 'Продукты' },
        { key: 'debt' as const, header: 'Долг', numeric: true },
      ]} />,
    )
    const cells = [...container.querySelectorAll('tbody td')]
    expect(cells[1]).toHaveClass('ds-table__wrap')
    expect(cells[2]).not.toHaveClass('ds-table__wrap')
  })

  // Исключён только ВЫВОД: сказать словом потребитель по-прежнему вправе —
  // в числовой колонке не обязательно сумма.
  it('явный wrap на числовой колонке работает', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id} columns={[
        { key: 'bank' as const, header: 'Банк', width: '5rem' },
        { key: 'debt' as const, header: 'Долг', numeric: true, wrap: true },
      ]} />,
    )
    expect([...container.querySelectorAll('tbody td')][1]).toHaveClass('ds-table__wrap')
  })

  // Колонка действий ширины часто не имеет, но переносить в ней нечего:
  // внутри кнопки. Умолчание «нет ширины → переносит» её задело бы, и
  // `wrap?: never` при этом молчал бы — запрет типа не мешает КОМПОНЕНТУ
  // навесить класс самому.
  it('колонка действий не переносит даже без ширины', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id} columns={[
        { key: 'bank' as const, header: 'Банк', width: '5rem' },
        { id: 'act', header: '', actions: () => [{ id: 'edit', icon: <span>✎</span>, label: 'Изменить', onSelect: () => {} }] },
      ]} />,
    )
    const cells = [...container.querySelectorAll('tbody td')]
    expect(cells[1]).not.toHaveClass('ds-table__wrap')
  })

  // Колонка действий уже сокращает по-своему (`text-overflow: clip`): в ней
  // кнопки, а не текст, и переносить там нечего. Молчаливое игнорирование
  // было бы хуже отказа — потребитель увидел бы проп, задал его и не понял,
  // почему ничего не изменилось.
  it('wrap нет в типе колонки действий — переносить в ней нечего', () => {
    type C = Parameters<typeof DataTable>[0]['columns'][number]
    // @ts-expect-error — ActionColumn не имеет wrap (внутри кнопки, не текст)
    const col: C = { id: 'act', actions: () => [], wrap: true }
    expect(col).toBeDefined()
  })

  it('wrap доезжает до display-колонки и до строки-итога', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id}
        columns={[
          { key: 'bank' as const, header: 'Банк', width: '5rem' },
          { id: 'note', header: 'Примечание', wrap: true, render: () => 'длинное примечание' },
        ]}
        footer={{ label: 'Всего', cells: { note: 'итоговое примечание' } }} />,
    )
    const body = [...container.querySelectorAll('tbody td')]
    expect(body[1]).toHaveClass('ds-table__wrap')
    // Итог живёт в отдельной ветке рендера: колонка, переносящаяся в теле и
    // сокращающаяся в подвале, — разъехавшаяся колонка, а не два режима.
    const foot = [...container.querySelectorAll('tfoot td')]
    expect(foot[foot.length - 1]).toHaveClass('ds-table__wrap')
  })
})

describe('DataTable · колонка без видимой подписи названа', () => {
  interface AR { id: string; name: string }
  const arows: AR[] = [{ id: '1', name: 'Присед' }]
  const withActions = (header?: string): Column<AR>[] => [
    { key: 'name', header: 'Упражнение' },
    { id: 'act', ...(header !== undefined ? { header } : {}), actions: () => [{ id: 'edit', icon: <span>✎</span>, label: 'Изменить', onSelect: () => {} }] },
  ]

  it('колонка выбора названа для диктора и не видна глазами', () => {
    render(<DataTable columns={withActions()} rows={arows} getRowId={(r) => r.id} onSelectionChange={vi.fn()} />)
    const th = screen.getByRole('columnheader', { name: 'Выбор' })
    expect(th.querySelector('.ds-visually-hidden')).not.toBeNull()
  })

  it('колонка действий без header названа «Действия» — имя следует из типа, а не угадано', () => {
    render(<DataTable columns={withActions()} rows={arows} getRowId={(r) => r.id} />)
    const th = screen.getByRole('columnheader', { name: 'Действия' })
    expect(th.querySelector('.ds-visually-hidden')).not.toBeNull()
  })

  it('заданный header у колонки действий виден глазами и не задваивается невидимым', () => {
    render(<DataTable columns={withActions('Операции')} rows={arows} getRowId={(r) => r.id} />)
    const th = screen.getByRole('columnheader', { name: 'Операции' })
    // Различимость: видимая подпись и скрытая — РАЗНЫЕ состояния одного места.
    // Без этой строки проверка проходила бы и на разметке, где скрытое имя
    // ставится всегда, поверх видимого.
    expect(th.querySelector('.ds-visually-hidden')).toBeNull()
    expect(th).toHaveTextContent('Операции')
  })

  it('ни один <th> шапки не пуст — то, на что смотрит axe', () => {
    render(<DataTable columns={withActions()} rows={arows} getRowId={(r) => r.id} onSelectionChange={vi.fn()} />)
    const empty = [...document.querySelectorAll('thead th')].filter((th) => !th.textContent?.trim())
    expect(empty).toEqual([])
  })
})

/**
 * Третий источник пустого `<th>`: `header: ''` у обычной колонки (DS-80).
 *
 * Здесь компоненту взять имя неоткуда — в отличие от колонки действий, где имя
 * следует из типа. И написать пустую строку потребителя вынуждал сам API:
 * `header: string` обязателен, значит «подписи не надо» выражалось единственным
 * доступным способом — пустотой. То есть дефект производил не потребитель, а
 * форма пропа.
 *
 * Поэтому пара: `headerHidden` даёт сказать «подпись есть, глазами не нужна», а
 * пустой `header` перестаёт быть выразимым молча.
 */

describe('DataTable · пустой header у обычной колонки', () => {
  const rows2 = [{ id: '1', name: 'Товар А', sum: 10 }]
  const base = { key: 'name' as const, header: 'Номенклатура' }

  it('пустой header бросает и говорит, что делать вместо него', () => {
    expect(() => render(
      <DataTable rows={rows2} getRowId={(r) => r.id} columns={[base, { key: 'sum', header: '' }]} />,
    )).toThrow(/headerHidden/)
  })

  it('headerHidden: подпись есть в дереве доступности и скрыта глазами', () => {
    render(<DataTable rows={rows2} getRowId={(r) => r.id}
      columns={[base, { key: 'sum', header: 'Сумма', headerHidden: true }]} />)
    const th = screen.getByRole('columnheader', { name: 'Сумма' })
    expect(th.querySelector('.ds-visually-hidden')).not.toBeNull()
  })

  it('обычный header остаётся видимым — headerHidden не протекает на соседей', () => {
    render(<DataTable rows={rows2} getRowId={(r) => r.id}
      columns={[base, { key: 'sum', header: 'Сумма', headerHidden: true }]} />)
    const th = screen.getByRole('columnheader', { name: 'Номенклатура' })
    expect(th.querySelector('.ds-visually-hidden')).toBeNull()
  })

  it('headerHidden с пустым header бросает так же: скрывать нечего', () => {
    expect(() => render(
      <DataTable rows={rows2} getRowId={(r) => r.id}
        columns={[base, { key: 'sum', header: '', headerHidden: true }]} />,
    )).toThrow(/headerHidden/)
  })

  /**
   * Различительная проверка, без которой предыдущие ничего не стоят: пустой
   * header у КОЛОНКИ ДЕЙСТВИЙ законен и означает «возьми умолчание». Схлопни
   * эти два случая в один — и либо колонка действий начнёт бросать на ровном
   * месте, либо обычная перестанет.
   */
  it('у колонки действий пустой header законен: там умолчание, а не пустота', () => {
    expect(() => render(
      <DataTable rows={rows2} getRowId={(r) => r.id} columns={[
        base,
        { id: 'act', header: '', actions: () => [{ id: 'del', icon: <span>×</span>, label: 'Удалить', onSelect: () => {} }] },
      ]} />,
    )).not.toThrow()
    expect(screen.getByRole('columnheader', { name: 'Действия' })).toBeInTheDocument()
  })

  /**
   * Шов локализации имени колонки действий (DS-137). Умолчание `Действия`
   * зашито в компоненте по-русски; заданный `header` делает подпись ВИДИМОЙ, то
   * есть сказать «моё имя, по-прежнему невидимое» было нечем — на `?_locale=en`
   * колонка объявлялась диктору по-русски, и обхода не существовало.
   */
  it('header + headerHidden у колонки действий: имя потребителя, по-прежнему невидимое', () => {
    render(
      <DataTable rows={rows2} getRowId={(r) => r.id} columns={[
        base,
        { id: 'act', header: 'Actions', headerHidden: true,
          actions: () => [{ id: 'del', icon: <span>×</span>, label: 'Delete', onSelect: () => {} }] },
      ]} />,
    )
    const th = screen.getByRole('columnheader', { name: 'Actions' })
    // Различительная половина: имя пришло от потребителя И осталось скрытым.
    // Без неё тест прошёл бы и на видимой подписи, то есть на другом дефекте.
    expect(th.querySelector('.ds-visually-hidden')).toHaveTextContent('Actions')
    expect(screen.queryByRole('columnheader', { name: 'Действия' })).toBeNull()
  })

  it('без header колонка действий по-прежнему называет себя сама', () => {
    render(
      <DataTable rows={rows2} getRowId={(r) => r.id} columns={[
        base,
        { id: 'act', headerHidden: true, actions: () => [] },
      ]} />,
    )
    expect(screen.getByRole('columnheader', { name: 'Действия' })).toBeInTheDocument()
  })
})
