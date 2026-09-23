import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { DataTable, type Column } from './DataTable.js'
import { type Row, rows } from './DataTable.test-fixtures.js'

describe('DataTable · ширины колонок', () => {
  const debts = [{ id: 'd1', bank: 'ОЗОН Банк', products: 'Кредитная карта, рассрочка', debt: 82040 }]
  const cols = (width?: string) => [
    { key: 'bank' as const, header: 'Банк', ...(width ? { width } : {}) },
    { key: 'products' as const, header: 'Продукты' },
    { key: 'debt' as const, header: 'Долг', numeric: true, ...(width ? { width: '140px' } : {}) },
  ]

  it('без единой ширины colgroup не рисуется и режим не меняется', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id} columns={cols()} />,
    )
    expect(container.querySelector('colgroup')).toBeNull()
    expect(container.querySelector('table')).not.toHaveClass('ds-table--fixed')
  })

  it('одна заданная ширина включает fixed — режим выводится, а не задаётся', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id} columns={cols('180px')} />,
    )
    expect(container.querySelector('table')).toHaveClass('ds-table--fixed')
  })

  it('ширины едут на <col> в порядке колонок, без ширины — пустой <col>', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id} columns={cols('180px')} />,
    )
    const cells = [...container.querySelectorAll('colgroup col')] as HTMLElement[]
    expect(cells).toHaveLength(3)
    expect(cells[0]!.style.width).toBe('180px')
    // «auto внутри fixed» выражается ОТСУТСТВИЕМ значения, а не словом 'auto'.
    expect(cells[1]!.style.width).toBe('')
    expect(cells[2]!.style.width).toBe('140px')
  })

  it('колонка выбора получает свой <col> — иначе ширины съедут на одну', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id} columns={cols('180px')}
        selectedIds={[]} onSelectionChange={() => {}} />,
    )
    const cells = [...container.querySelectorAll('colgroup col')] as HTMLElement[]
    expect(cells).toHaveLength(4)
    expect(cells[0]!).toHaveClass('ds-table__sel-col')
    expect(cells[1]!.style.width).toBe('180px')
  })

  it('ширина работает и на display-колонке, не только на колонке данных', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id} columns={[
        { key: 'bank' as const, header: 'Банк' },
        { id: 'share', header: 'Доля', width: '120px', render: () => '75%' },
      ]} />,
    )
    const cells = [...container.querySelectorAll('colgroup col')] as HTMLElement[]
    expect(cells[1]!.style.width).toBe('120px')
  })
})

/**
 * Ширина колонки — размер интерфейса, а значит живёт по `--ds-ui-scale`, как
 * `height` у BarChart, `size` у DonutChart, `width` у SideNav и Skeleton.
 * Высота строки едет (`--ds-h-compact` — это `calc(rem * var(--ds-ui-scale))`),
 * а ширина колонки стояла: под `.ds-scale` в ту же ширину влезает меньше
 * текста при большей высоте строки — ровно тот разъезд сетки, ради которого
 * ширины и задавали (DS-82).
 */

describe('DataTable · ширина колонки и масштаб', () => {
  const debts = [{ id: 'd1', bank: 'ОЗОН Банк', debt: 82040 }]

  it('числовая ширина едет по --ds-ui-scale', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id} columns={[
        { key: 'bank' as const, header: 'Банк', width: 180 },
        { key: 'debt' as const, header: 'Долг', numeric: true },
      ]} />,
    )
    const col = container.querySelector('colgroup col') as HTMLElement
    expect(col.style.width).toBe('calc(180px * var(--ds-ui-scale, 1))')
  })

  it('строка форвардится дословно — фиксированную ширину просят строкой', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id} columns={[
        { key: 'bank' as const, header: 'Банк', width: '180px' },
        { key: 'debt' as const, header: 'Долг', numeric: true },
      ]} />,
    )
    const col = container.querySelector('colgroup col') as HTMLElement
    expect(col.style.width).toBe('180px')
  })

  it('числовая ширина включает fixed так же, как строковая', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id} columns={[
        { key: 'bank' as const, header: 'Банк', width: 180 },
        { key: 'debt' as const, header: 'Долг', numeric: true },
      ]} />,
    )
    // `width: 0` — единственное числовое значение, которое ложно: раскладка
    // должна включаться от ЗАДАННОСТИ ширины, а не от её истинности.
    expect(container.querySelector('table')).toHaveClass('ds-table--fixed')
  })

  it('нулевая ширина всё равно включает fixed — задана, а не истинна', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id} columns={[
        { key: 'bank' as const, header: 'Банк', width: 0 },
        { key: 'debt' as const, header: 'Долг', numeric: true },
      ]} />,
    )
    expect(container.querySelector('table')).toHaveClass('ds-table--fixed')
    const col = container.querySelector('colgroup col') as HTMLElement
    expect(col.style.width).toBe('calc(0px * var(--ds-ui-scale, 1))')
  })
})

/**
 * Пол ширины колонки (DS-137). Колонка без `width` берёт ОСТАТОК, а у
 * остатка пола нет: у потребителя при контейнере 342px и заданных 192+80+64
 * четвёртая колонка приходила 6px и показывала 0 символов из 30 — при том что
 * столбец объявлен диктору и подписан в шапке.
 *
 * Здесь проверяется только шов «колонки → слагаемые пола»: что колонка в
 * браузере действительно не уезжает под пол, меряет `measure-invariants`
 * (jsdom раскладки не считает).
 *
 * Слагаемых ТРИ, и живут они на обёртке (DS-138): сумму собирает лист,
 * а ненужные группы обнуляет container-запрос — тесноту знает только он.
 */
describe('DataTable · пол ширины колонки', () => {
  const debts = [{ id: 'd1', bank: 'ОЗОН Банк', products: 'Кредитная карта', debt: 82040 }]
  const wrap = (c: HTMLElement | null) => c!.querySelector('.ds-table-wrap') as HTMLElement
  const part = (c: HTMLElement | null, group: 'base' | 'sm' | 'md') =>
    wrap(c).style.getPropertyValue(`--ds-table-min-${group}`)

  it('пол = заданные ширины плюс метрика на каждую колонку без ширины', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id} columns={[
        { key: 'bank' as const, header: 'Банк', width: 192 },
        { key: 'products' as const, header: 'Продукты' },
        { key: 'debt' as const, header: 'Долг', numeric: true, width: '80px' },
      ]} />,
    )
    expect(part(container, 'base')).toBe(
      'calc(calc(192px * var(--ds-ui-scale, 1)) + var(--ds-w-col-min) + 80px)',
    )
    // Пустые группы — `0px`, а не пустая строка: пустой член роняет `calc()`
    // целиком, то есть пол исчез бы у ВСЕЙ таблицы.
    expect(part(container, 'sm')).toBe('0px')
    expect(part(container, 'md')).toBe('0px')
  })

  /**
   * Скрываемая колонка идёт в СВОЮ группу, а не в базовую (DS-138).
   * Слейся группы — пол продолжал бы держать таблицу широкой за колонку,
   * которой на экране нет: замерено, обёртка 342px, таблица 400px, и
   * `hideBelow` не лечил тесноту, ради которой объявлен.
   */
  it('колонка с hideBelow идёт в своё слагаемое, а не в базовое', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id} columns={[
        { key: 'bank' as const, header: 'Банк', width: 192 },
        { key: 'debt' as const, header: 'Долг', width: '80px', hideBelow: 'sm' },
        { key: 'products' as const, header: 'Продукты', width: '64px', hideBelow: 'md' },
      ]} />,
    )
    expect(part(container, 'base')).toBe('calc(calc(192px * var(--ds-ui-scale, 1)))')
    expect(part(container, 'sm')).toBe('calc(80px)')
    expect(part(container, 'md')).toBe('calc(64px)')
  })

  it('без ширин пол не ставится: в auto-раскладке колонке его даёт содержимое', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id} columns={[
        { key: 'bank' as const, header: 'Банк' },
        { key: 'debt' as const, header: 'Долг' },
      ]} />,
    )
    expect(part(container, 'base')).toBe('')
    expect(container.querySelector('table')!.className).not.toContain('ds-table--fixed')
  })

  it('колонка выбора входит в сумму — иначе пол занижен на её ширину', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id} columns={[
        { key: 'bank' as const, header: 'Банк', width: '192px' },
        { key: 'products' as const, header: 'Продукты' },
      ]} selectedIds={[]} onSelectionChange={() => {}} />,
    )
    expect(part(container, 'base')).toBe(
      'calc(var(--ds-h-default) + 192px + var(--ds-w-col-min))',
    )
  })

  /**
   * Различительная половина: `width: 0` — законное значение (колонка-нитка под
   * маркер состояния), и пол его перебивать не должен. Слитые случаи «ширины
   * нет» и «ширина ложна» уже стоили раскладки на DS-88.
   */
  it('заданный нуль остаётся нулём: пол — для колонки, которая размера не просила', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id} columns={[
        { key: 'bank' as const, header: 'Банк', width: 0 },
        { key: 'products' as const, header: 'Продукты' },
      ]} />,
    )
    expect(part(container, 'base')).toBe(
      'calc(calc(0px * var(--ds-ui-scale, 1)) + var(--ds-w-col-min))',
    )
  })

  /**
   * `max-content` на `<col>` не работал и до правки: chromium отбрасывает его в
   * пользу `auto` — замерено, колонка приходит той же ширины, что соседние
   * без ширины. Молчаливый ноль в `calc()` был бы хуже: невалидный член роняет
   * ВСЁ объявление, то есть пол исчез бы у всей таблицы.
   */
  it('нерастворимая ширина бросает, а не отменяет пол молча', () => {
    expect(() => render(
      <DataTable rows={debts} getRowId={(r) => r.id} columns={[
        { key: 'bank' as const, header: 'Банк', width: 'max-content' },
        { key: 'products' as const, header: 'Продукты' },
      ]} />,
    )).toThrow(/max-content/)
  })

  it('процент и rem проходят: это то, что `<col>` понимает', () => {
    const { container } = render(
      <DataTable rows={debts} getRowId={(r) => r.id} columns={[
        { key: 'bank' as const, header: 'Банк', width: '20%' },
        { key: 'debt' as const, header: 'Долг', width: '5.5rem' },
      ]} />,
    )
    expect(part(container, 'base')).toBe('calc(20% + 5.5rem)')
  })
})

/**
 * `wrap` — вторая половина fixed-раскладки. Заданная ширина означает ровную
 * сетку, поэтому ячейки в `--fixed` однострочны и сокращаются; но у первого же
 * потребителя (состав эпика) требование заказчика обратное для
 * двух колонок из трёх: код одной строкой, название и статус переносами и
 * целиком. Без пропа он ушёл бы гасить умолчание своим CSS поверх DS.
 *
 * Здесь проверяется только шов «проп → класс на ячейке»: что перенос
 * действительно случился, а сокращение — нет, jsdom увидеть не может (нет
 * движка раскладки). Это меряет `scripts/measure-invariants.mjs`.
 */
/**
 * Словарь выравнивания — логический (`start`/`end`), а не физический
 * (DS-86). `left`/`right` — края монитора; число прижимается к концу
 * СТРОКИ, и в RTL физический словарь просто неверен. `Tree` жил на логическом
 * с самого начала, таблицы — на физическом, и один признак колонки в одной
 * системе назывался двумя словами.
 *
 * Заодно разведены два смысла, которые нёс один класс `__num`: край
 * (`text-align`) и цифровая типографика (`font-feature-settings: tnum`).
 * Класс, означающий две вещи, — та же болезнь, что `width`, кодировавший три
 * решения (DS-88): он ставился при `align: 'end'` на текстовой колонке и
 * включал ей `tnum`, которого никто не просил.
 */

describe('DataTable · словарь выравнивания', () => {
  const rows2 = [{ id: 'r1', name: 'Иванов', sum: '12 400' }]

  // Пара, а не два случая порознь: утверждается РАЗЛИЧИМОСТЬ. Схлопни обе
  // ветки в одну — каждое утверждение по отдельности всё ещё проходит.
  it('end и start различимы классом края', () => {
    const { container } = render(
      <DataTable rows={rows2} getRowId={(r) => r.id} columns={[
        { key: 'name' as const, header: 'Имя', align: 'start' },
        { key: 'sum' as const, header: 'Сумма', align: 'end' },
      ]} />,
    )
    const cells = [...container.querySelectorAll('tbody td')]
    expect(cells[0]).not.toHaveClass('ds-table__end')
    expect(cells[1]).toHaveClass('ds-table__end')
  })

  // Два смысла порознь: числовая колонка получает ОБА класса, а текстовая с
  // `align: 'end'` — только край. На слитом классе второе утверждение падает.
  it('numeric даёт край и цифровую типографику, align — только край', () => {
    const { container } = render(
      <DataTable rows={rows2} getRowId={(r) => r.id} columns={[
        { key: 'sum' as const, header: 'Сумма', numeric: true },
        { key: 'name' as const, header: 'Имя', align: 'end' },
      ]} />,
    )
    const cells = [...container.querySelectorAll('tbody td')]
    expect(cells[0]).toHaveClass('ds-table__end')
    expect(cells[0]).toHaveClass('ds-table__num')
    expect(cells[1]).toHaveClass('ds-table__end')
    expect(cells[1]).not.toHaveClass('ds-table__num')
  })

  /**
   * Периода совместимости нет (CLAUDE.md): старая форма обязана ЛОМАТЬ
   * компиляцию, а не выравнивать молча в другую сторону. Проверяется и
   * рантайм — на случай `any` на пути потребителя, где типы не спасают:
   * `'right'` не равно `'end'`, и без явной проверки колонка тихо уехала бы
   * к началу строки, то есть проп остался бы заданным и перестал действовать.
   */
  it('align: right — ошибка типов', () => {
    type C = Parameters<typeof DataTable<{ id: string; name: string; sum: string }>>[0]['columns'][number]
    // @ts-expect-error — физический словарь удалён: 'right' → 'end'
    const col: C = { key: 'sum', header: 'Сумма', align: 'right' }
    expect(col).toBeDefined()
  })

  it('align: right бросает в рантайме, а не выравнивает в другую сторону', () => {
    expect(() => render(
      <DataTable rows={rows2} getRowId={(r) => r.id} columns={[
        // `any` здесь — предмет кейса: так выглядит вызов потребителя, у которого
        // на пути стёрлись типы. Компонент обязан бросить, а не выровнять вправо.
        { key: 'sum' as const, header: 'Сумма', align: 'right' as any },
      ]} />,
    )).toThrow(/align/)
  })
})

describe('DataTable: скрытие колонки по тесноте', () => {
  const cols: Column<Row>[] = [
    { key: 'name', header: 'Номенклатура' },
    { key: 'sum', header: 'Сумма', numeric: true, hideBelow: 'sm' },
  ]

  it('класс скрытия стоит и на заголовке, и на каждой ячейке колонки', () => {
    const { container } = render(<DataTable columns={cols} rows={rows} getRowId={(r) => r.id} />)
    const th = screen.getByRole('columnheader', { name: 'Сумма' })
    expect(th).toHaveClass('ds-table__hide-sm')
    const cells = [...container.querySelectorAll('tbody tr')].map((tr) => tr.children[1])
    expect(cells).toHaveLength(2)
    for (const c of cells) expect(c).toHaveClass('ds-table__hide-sm')
  })

  /**
   * Третий носитель того же класса — `<col>` (DS-138). В `fixed`-раскладке
   * ширины считаются по `<colgroup>`, и колонка, спрятанная только в ячейках,
   * оставляет свой ТРЕК: на месте таблицы мёртвая полоса шириной со скрытую
   * колонку (замерено 100px из 400). Здесь — только шов «колонка → `<col>`»;
   * что полоса действительно уходит, а место достаётся соседке, меряет
   * `measure-invariants`: jsdom раскладки не считает.
   *
   * Колонки с ширинами, а не те же `cols`: без единой заданной ширины раскладка
   * остаётся `auto`, `<colgroup>` не эмитится вовсе, и кейс проверял бы пустоту.
   */
  it('класс скрытия стоит и на <col> — иначе трек колонки продолжает числиться', () => {
    const withWidths: Column<Row>[] = [
      { key: 'name', header: 'Номенклатура', width: 192 },
      { key: 'sum', header: 'Сумма', numeric: true, width: 80, hideBelow: 'sm' },
    ]
    const { container } = render(<DataTable columns={withWidths} rows={rows} getRowId={(r) => r.id} />)
    const colEls = [...container.querySelectorAll('colgroup col')]
    expect(colEls).toHaveLength(2)
    // Различительная половина: класс на ВСЕХ `<col>` спрятал бы таблицу целиком,
    // и проверка «он есть у второй» прошла бы точно так же.
    expect(colEls[0]).not.toHaveClass('ds-table__hide-sm')
    expect(colEls[1]).toHaveClass('ds-table__hide-sm')
  })

  it('колонка без hideBelow класса не несёт — иначе прятались бы все', () => {
    render(<DataTable columns={cols} rows={rows} getRowId={(r) => r.id} />)
    expect(screen.getByRole('columnheader', { name: 'Номенклатура' })).not.toHaveClass('ds-table__hide-sm')
  })

  it('класс скрытия не вытесняет остальные классы ячейки', () => {
    const { container } = render(<DataTable columns={cols} rows={rows} getRowId={(r) => r.id} />)
    const th = screen.getByRole('columnheader', { name: 'Сумма' })
    expect(th).toHaveClass('ds-table__num')
    // Первая ячейка несёт ds-table__lead и не должна его потерять из-за нового класса.
    expect(container.querySelector('tbody tr td')).toHaveClass('ds-table__lead')
  })

  it('скелет загрузки прячет ту же колонку — иначе при загрузке столбцов больше, чем после', () => {
    const { container } = render(<DataTable columns={cols} rows={[]} getRowId={(r) => r.id} loading loadingRows={2} />)
    const skelCells = [...container.querySelectorAll('.ds-table__skelrow')].map((tr) => tr.children[1])
    for (const c of skelCells) expect(c).toHaveClass('ds-table__hide-sm')
  })

  it('таблица завёрнута в контейнер запроса: без обёртки @container не срабатывает', () => {
    const { container } = render(<DataTable columns={cols} rows={rows} getRowId={(r) => r.id} />)
    expect(container.querySelector('.ds-table-wrap > table.ds-table')).not.toBeNull()
  })
})
