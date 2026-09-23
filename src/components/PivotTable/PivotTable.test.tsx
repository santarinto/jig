import { render, screen, within, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PivotTable, pivotId, type PivotDimension, type PivotMeasure } from './PivotTable.js'

interface Ride { city: string; driver: string; day: string; fare: number }

/**
 * Числа подобраны так, чтобы КАЖДЫЙ неверный способ посчитать итог давал СВОЙ
 * ответ, отличный от верного. Иначе тест на арифметику зелен и у сломанной
 * реализации — а сложение показанных ячеек и есть тот дефект, ради которого
 * сводную вообще проверяют числами (`docs/writing-checks.md`, пункт 6).
 *
 * Общее среднее — 1310/5 = 262. Среднее показанных колоночных средних — 247.5.
 * Среднее показанных строчных итогов — 227.5. У «Москвы»: своё среднее 400,
 * среднее её ячеек 375, среднее средних её водителей 500. Ни одно не совпало.
 */
const rides: Ride[] = [
  { city: 'Москва', driver: 'Иванов', day: 'пн', fare: 100 },
  { city: 'Москва', driver: 'Иванов', day: 'вт', fare: 300 },
  { city: 'Москва', driver: 'Петров', day: 'пн', fare: 800 },
  { city: 'Казань', driver: 'Сидоров', day: 'вт', fare: 50 },
  { city: 'Казань', driver: 'Сидоров', day: 'пн', fare: 60 },
]

const city: PivotDimension<Ride> = { id: 'city', label: 'Город', value: (r) => r.city }
const driver: PivotDimension<Ride> = { id: 'driver', label: 'Водитель', value: (r) => r.driver }
const day: PivotDimension<Ride> = { id: 'day', label: 'День', value: (r) => r.day }

const avg: PivotMeasure<Ride> = { id: 'avg', label: 'Средний чек', agg: 'avg', value: (r) => r.fare }
const sum: PivotMeasure<Ride> = { id: 'sum', label: 'Сумма', agg: 'sum', value: (r) => r.fare }
const count: PivotMeasure<Ride> = { id: 'n', label: 'Поездок', agg: 'count' }

const pivot = (props: Partial<Parameters<typeof PivotTable<Ride>>[0]> = {}) =>
  render(
    <PivotTable
      rows={rides}
      rowDimensions={[city]}
      columnDimensions={[day]}
      measures={[avg]}
      aria-label="Сводка"
      {...props}
    />,
  )

/** Последнее значение строки — колонка общего итога. `Array.at` вне lib этого tsconfig. */
const last = <T,>(a: T[]): T | undefined => a[a.length - 1]

/** Текст ячеек значений одной строки, слева направо. */
const valuesOf = (row: HTMLElement) => within(row).getAllByRole('cell').map((c) => c.textContent)

const rowByName = (name: string | RegExp) =>
  screen.getByRole('rowheader', { name }).closest('tr') as HTMLElement

describe('PivotTable: разметка', () => {
  it('таблица с именем; угол называет измерения строк', () => {
    pivot()
    expect(screen.getByRole('table', { name: 'Сводка' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Город' })).toBeInTheDocument()
  })

  it('угол перечисляет ВСЕ измерения строк, а не только первое', () => {
    pivot({ rowDimensions: [city, driver] })
    expect(screen.getByRole('columnheader', { name: 'Город / Водитель' })).toBeInTheDocument()
  })

  it('видимая подпись — <caption>, и тогда aria-label не дублирует её', () => {
    pivot({ caption: 'Выручка по дням' })
    expect(screen.getByRole('table', { name: 'Выручка по дням' })).toBeInTheDocument()
  })

  it('значение колонки — columnheader, значение строки — rowheader', () => {
    pivot()
    expect(screen.getByRole('columnheader', { name: /пн/ })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Москва' })).toBeInTheDocument()
  })

  it('заголовок группы колонок объявлен colgroup, лист — col', () => {
    pivot({ columnDimensions: [day, driver] })
    expect(screen.getByRole('columnheader', { name: /пн/ })).toHaveAttribute('scope', 'colgroup')
    expect(screen.getAllByRole('columnheader', { name: /Иванов/ })[0]).toHaveAttribute('scope', 'col')
  })

  it('вложенная строка получает глубину швом --ds-pivot-depth', () => {
    pivot({ rowDimensions: [city, driver] })
    expect(rowByName('Москва').querySelector('th')).toHaveStyle({ '--ds-pivot-depth': '0' })
    expect(rowByName('Иванов').querySelector('th')).toHaveStyle({ '--ds-pivot-depth': '1' })
  })

  /**
   * Шов, а не украшение: без своего уровня у каждой строки шапки они липнут к
   * одному нулю и при прокрутке ложатся друг на друга. В jsdom этого не видно
   * (нет ни прокрутки, ни `position: sticky`), поэтому проверяется ОБЪЯВЛЕНИЕ —
   * то, что меняется вместе с дефектом. Само наложение замерено в chromium.
   */
  it('каждая строка шапки объявляет свой уровень швом --ds-pivot-level', () => {
    const { container } = pivot({ columnDimensions: [day, driver], measures: [avg, count] })
    const levels = [...container.querySelectorAll('thead tr')]
      .map((tr) => (tr as HTMLElement).style.getPropertyValue('--ds-pivot-level'))
    expect(levels).toEqual(['0', '1', '2'])
  })

  it('строка имён мер появляется, только когда мер несколько', () => {
    const one = pivot()
    expect(one.container.querySelectorAll('.ds-pivot__meashead')).toHaveLength(0)
    one.unmount()
    const two = pivot({ measures: [avg, count] })
    expect(two.container.querySelectorAll('.ds-pivot__meashead').length).toBeGreaterThan(0)
  })
})

describe('PivotTable: арифметика', () => {
  it('ячейка — агрегат по пересечению строки и колонки', () => {
    pivot()
    expect(valuesOf(rowByName('Москва'))).toEqual(['450', '300', '400'])
    expect(valuesOf(rowByName('Казань'))).toEqual(['60', '50', '55'])
  })

  /**
   * Главное утверждение компонента. Верное число — 262; сложение показанных
   * колонок дало бы 247.5, сложение показанных строк — 227.5. Тест обязан
   * отличать три состояния, а не подтверждать одно.
   */
  it('общий итог считается по исходным строкам, а не по показанным ячейкам', () => {
    pivot()
    const total = screen.getByRole('rowheader', { name: 'Итого' }).closest('tr') as HTMLElement
    expect(valuesOf(total)).toEqual(['320', '175', '262'])
  })

  it('подытог группы — тоже по исходным строкам, а не по средним детей', () => {
    pivot({ rowDimensions: [city, driver] })
    // Своё среднее «Москвы» — 400. Среднее средних Иванова (200) и Петрова (800) — 500.
    expect(last(valuesOf(rowByName('Москва')))).toBe('400')
    expect(last(valuesOf(rowByName('Иванов')))).toBe('200')
    expect(last(valuesOf(rowByName('Петров')))).toBe('800')
  })

  it('пересечение без строк — пусто для глаза и пусто для диктора, а не ноль', () => {
    // У Иванова нет поездок в Казани: пересечение пусто.
    pivot({ rowDimensions: [driver], columnDimensions: [city] })
    const cells = within(rowByName('Иванов')).getAllByRole('cell')
    const blank = cells[1]!
    expect(blank).toHaveTextContent('—')
    expect(blank.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })

  it('count пустого пересечения — тоже пусто: ноль был бы утверждением', () => {
    pivot({ rowDimensions: [driver], columnDimensions: [city], measures: [count] })
    expect(within(rowByName('Иванов')).getAllByRole('cell')[1]).toHaveTextContent('—')
  })

  it('format применяется к значению, а не к пустоте', () => {
    pivot({
      rowDimensions: [driver],
      columnDimensions: [city],
      measures: [{ ...sum, format: (v) => `${v} ₽` }],
    })
    const cells = within(rowByName('Иванов')).getAllByRole('cell')
    expect(cells[0]).toHaveTextContent('400 ₽')
    expect(cells[1]).toHaveTextContent('—')
  })

  it('без измерений колонок остаётся одна колонка значений на меру', () => {
    pivot({ columnDimensions: [], measures: [sum, count] })
    expect(valuesOf(rowByName('Москва'))).toEqual(['1200', '3'])
  })
})

describe('PivotTable: свёртка', () => {
  it('по умолчанию раскрыто всё', () => {
    pivot({ rowDimensions: [city, driver] })
    expect(screen.getByRole('rowheader', { name: /Иванов/ })).toBeInTheDocument()
  })

  it('свёртка строки убирает детей, сама строка и её числа остаются', () => {
    pivot({ rowDimensions: [city, driver] })
    fireEvent.click(within(rowByName('Москва')).getByRole('button'))
    expect(screen.queryByRole('rowheader', { name: /Иванов/ })).not.toBeInTheDocument()
    expect(last(valuesOf(rowByName('Москва')))).toBe('400')
  })

  it('кнопка свёртки объявляет состояние через aria-expanded', () => {
    pivot({ rowDimensions: [city, driver] })
    const button = within(rowByName('Москва')).getByRole('button')
    expect(button).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(button)
    expect(within(rowByName('Москва')).getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  })

  it('лист кареткой не обзаводится — сворачивать нечего', () => {
    pivot({ rowDimensions: [city] })
    expect(within(rowByName('Москва')).queryByRole('button')).toBeNull()
  })

  it('свёртка колонки схлопывает её в одну с итогом группы', () => {
    pivot({ columnDimensions: [day, driver], measures: [sum] })
    // Понедельник режется на трёх водителей, вторник — на двух; у «Москвы»
    // Сидорова нет ни там, ни там, отсюда прочерки.
    expect(valuesOf(rowByName('Москва'))).toEqual(['100', '800', '—', '300', '—', '1200'])
    fireEvent.click(screen.getByRole('button', { name: /пн/ }))
    // Три колонки понедельника схлопнулись в одну: 100 + 800, и Сидоров с его
    // пустотой в неё же — итог группы, а не сумма показанного.
    expect(valuesOf(rowByName('Москва'))).toEqual(['900', '300', '—', '1200'])
  })

  it('defaultCollapsedRows задаёт начальное состояние', () => {
    pivot({ rowDimensions: [city, driver], defaultCollapsedRows: [pivotId(['Москва'])] })
    expect(screen.queryByRole('rowheader', { name: /Иванов/ })).not.toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: /Сидоров/ })).toBeInTheDocument()
  })

  it('управляемый режим: своё состояние не заводится, наружу уходит новый набор', () => {
    const onChange = vi.fn()
    pivot({
      rowDimensions: [city, driver],
      collapsedRows: [],
      onCollapsedRowsChange: onChange,
    })
    fireEvent.click(within(rowByName('Москва')).getByRole('button'))
    expect(onChange).toHaveBeenCalledWith([pivotId(['Москва'])])
    // Проп не менялся — значит и вид не меняется: состояние снаружи.
    expect(screen.getByRole('rowheader', { name: /Иванов/ })).toBeInTheDocument()
  })
})

describe('PivotTable: границы', () => {
  it('пустой rowDimensions бросает, а не рисует пустоту', () => {
    expect(() => pivot({ rowDimensions: [] })).toThrow(/rowDimensions/)
  })

  it('пустой measures бросает', () => {
    expect(() => pivot({ measures: [] })).toThrow(/measures/)
  })

  it('мера без value на пути any бросает, а не разъезжается NaN-ами', () => {
    const broken = { id: 'bad', label: 'Плохая', agg: 'sum' } as unknown as PivotMeasure<Ride>
    expect(() => pivot({ measures: [broken] })).toThrow(/без value/)
  })

  it('нет строк — тело заменяется подсказкой, шапка остаётся', () => {
    pivot({ rows: [], emptyContent: 'Поездок не было' })
    expect(screen.getByText('Поездок не было')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Город' })).toBeInTheDocument()
  })
})

/**
 * DS-266. ЗДЕСЬ ПРОВЕРЯЕТСЯ ТОЛЬКО ОДНО ЗВЕНО — что проп доезжает до
 * обёртки, — и это сказано вслух, потому что звеньев два.
 *
 * Второе — что ограниченная по высоте обёртка ДЕЙСТВИТЕЛЬНО даёт `sticky`
 * опору — живёт в `make measure`, случай «PivotTable: липнет колонка, а шапка и
 * строка итога — нет, пока высоту обёртки не ограничили»: он держит обе
 * половины, с ограничением и без. Раскладку jsdom не считает, и проверить её
 * здесь нельзя ничем, кроме самообмана.
 *
 * Цепочка замыкается так: проп → инлайновый `max-height` (этот тест) →
 * липкая шапка (замер). Разорви любое звено — покраснеет своё.
 */
describe('PivotTable: maxHeight', () => {
  const wrap = () => document.querySelector('.ds-pivot') as HTMLElement

  it('числа — пиксели', () => {
    pivot({ maxHeight: 360 })
    expect(wrap().style.maxHeight).toBe('360px')
  })

  it('строка — любая длина CSS, и она не переписывается в пиксели', () => {
    pivot({ maxHeight: '60vh' })
    expect(wrap().style.maxHeight).toBe('60vh')
  })

  /**
   * Умолчания нет намеренно (довод в `PivotTable.css`): система не решает за
   * чужую страницу, сколько места занимает отчёт. Мутация «поставить умолчание»
   * роняет этот случай.
   */
  it('без пропа инлайнового ограничения НЕТ вовсе', () => {
    pivot({})
    expect(wrap().style.maxHeight).toBe('')
    expect(wrap().getAttribute('style')).toBeNull()
  })
})
