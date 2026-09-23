import { describe, it, expect } from 'vitest'
import {
  buildAxis, aggregate, intersectSorted, visibleRows, visibleLeaves, headerCells, pivotId,
  type PivotDimension, type PivotMeasure,
} from './model.js'

interface Ride { city: string; driver: string; day: string; fare: number }

/**
 * Данные подобраны так, чтобы среднее по всем поездкам НЕ совпадало ни со
 * средним средних по городам, ни со средним по водителям. Иначе тест про
 * «итог считается по исходным строкам» был бы зелен и у сломанной реализации:
 * 650/4 = 162.5, а среднее двух городских средних — (200+50)/2 = 125.
 */
const rides: Ride[] = [
  { city: 'Москва', driver: 'Иванов', day: 'пн', fare: 100 },
  { city: 'Москва', driver: 'Иванов', day: 'вт', fare: 300 },
  { city: 'Москва', driver: 'Петров', day: 'пн', fare: 200 },
  { city: 'Казань', driver: 'Сидоров', day: 'вт', fare: 50 },
]

const city: PivotDimension<Ride> = { id: 'city', label: 'Город', value: (r) => r.city }
const driver: PivotDimension<Ride> = { id: 'driver', label: 'Водитель', value: (r) => r.driver }
const day: PivotDimension<Ride> = { id: 'day', label: 'День', value: (r) => r.day }

const sum: PivotMeasure<Ride> = { id: 'fare', label: 'Сумма', agg: 'sum', value: (r) => r.fare }
const avg: PivotMeasure<Ride> = { id: 'avg', label: 'Средний', agg: 'avg', value: (r) => r.fare }
const count: PivotMeasure<Ride> = { id: 'n', label: 'Поездок', agg: 'count' }

describe('buildAxis', () => {
  it('порядок значений — по первому появлению, как у groupByValue', () => {
    expect(buildAxis(rides, [city]).map((n) => n.key)).toEqual(['Москва', 'Казань'])
  })

  it('sort: asc переставляет значения, не трогая исходные данные', () => {
    const sorted = buildAxis(rides, [{ ...city, sort: 'asc' }])
    expect(sorted.map((n) => n.key)).toEqual(['Казань', 'Москва'])
    expect(rides[0]!.city).toBe('Москва')
  })

  /**
   * Данные и порядок подобраны так, что ТРИ ответа различны: по данным (ср, пн,
   * вт), по алфавиту (вт, пн, ср — «в» раньше «п»), по неделе (пн, вт, ср).
   * Первая версия теста брала длину имени водителя и получала тот же порядок,
   * что и без сортировки вовсе, — мутация «sort игнорируется» её пережила.
   */
  it('sort: своя функция — порядок, который не даёт ни алфавит, ни данные', () => {
    const week = ['пн', 'вт', 'ср']
    const shuffled: Ride[] = [
      { city: 'Москва', driver: 'Иванов', day: 'ср', fare: 1 },
      { city: 'Москва', driver: 'Иванов', day: 'пн', fare: 2 },
      { city: 'Москва', driver: 'Иванов', day: 'вт', fare: 3 },
    ]
    const byWeek = buildAxis(shuffled, [{ ...day, sort: (a, b) => week.indexOf(a) - week.indexOf(b) }])
    expect(byWeek.map((n) => n.key)).toEqual(['пн', 'вт', 'ср'])
    expect(buildAxis(shuffled, [day]).map((n) => n.key)).toEqual(['ср', 'пн', 'вт'])
    expect(buildAxis(shuffled, [{ ...day, sort: 'asc' }]).map((n) => n.key)).toEqual(['вт', 'пн', 'ср'])
  })

  it('второе измерение даёт детей, и строки родителя — объединение детских', () => {
    const axis = buildAxis(rides, [city, driver])
    const moscow = axis[0]!
    expect(moscow.rows).toEqual([0, 1, 2])
    expect(moscow.children.map((c) => c.key)).toEqual(['Иванов', 'Петров'])
    expect(moscow.children[0]!.rows).toEqual([0, 1])
    expect(moscow.children[1]!.rows).toEqual([2])
  })

  it('id узла — путь, а не собственный ключ: одноимённые ветки различимы', () => {
    const axis = buildAxis(
      [{ city: 'A', driver: 'x', day: 'пн', fare: 1 }, { city: 'B', driver: 'x', day: 'пн', fare: 2 }],
      [city, driver],
    )
    const [a, b] = [axis[0]!.children[0]!, axis[1]!.children[0]!]
    expect(a.key).toBe(b.key)
    expect(a.id).not.toBe(b.id)
    expect(a.id).toBe(pivotId(['A', 'x']))
  })

  it('без измерений — ни одного узла', () => {
    expect(buildAxis(rides, [])).toEqual([])
  })
})

describe('aggregate', () => {
  const all = [0, 1, 2, 3]

  it('sum / avg / count / min / max', () => {
    expect(aggregate(rides, all, sum)).toBe(650)
    expect(aggregate(rides, all, avg)).toBe(162.5)
    expect(aggregate(rides, all, count)).toBe(4)
    expect(aggregate(rides, all, { ...sum, agg: 'min' })).toBe(50)
    expect(aggregate(rides, all, { ...sum, agg: 'max' })).toBe(300)
  })

  it('пустое пересечение — null у ВСЕХ агрегатов, включая count', () => {
    expect(aggregate(rides, [], sum)).toBeNull()
    expect(aggregate(rides, [], avg)).toBeNull()
    expect(aggregate(rides, [], count)).toBeNull()
  })

  it('среднее по узлу считается по его строкам, а не по средним детей', () => {
    const axis = buildAxis(rides, [city])
    const byCity = axis.map((n) => aggregate(rides, n.rows, avg))
    expect(byCity).toEqual([200, 50])
    // Итог — не среднее этих двух (125), а среднее исходных строк.
    expect(aggregate(rides, all, avg)).toBe(162.5)
  })
})

describe('intersectSorted', () => {
  it('общие индексы двух отсортированных списков', () => {
    expect(intersectSorted([0, 1, 2, 5], [1, 2, 3])).toEqual([1, 2])
  })

  it('без общих — пусто', () => {
    expect(intersectSorted([0, 1], [2, 3])).toEqual([])
  })
})

describe('visibleRows', () => {
  const axis = buildAxis(rides, [city, driver])

  it('раскрыто по умолчанию: свёрнутых нет — видно всех', () => {
    expect(visibleRows(axis, new Set()).map((r) => r.node.key))
      .toEqual(['Москва', 'Иванов', 'Петров', 'Казань', 'Сидоров'])
  })

  it('свёрнутый узел остаётся в выдаче, его дети — нет', () => {
    const shown = visibleRows(axis, new Set([pivotId(['Москва'])]))
    expect(shown.map((r) => r.node.key)).toEqual(['Москва', 'Казань', 'Сидоров'])
    expect(shown[0]!.collapsed).toBe(true)
    expect(shown[0]!.hasChildren).toBe(true)
  })

  it('лист не считается свёрнутым, даже если его id попал в набор', () => {
    const leaf = pivotId(['Казань', 'Сидоров'])
    const shown = visibleRows(axis, new Set([leaf]))
    expect(shown.find((r) => r.node.id === leaf)!.collapsed).toBe(false)
  })
})

describe('visibleLeaves', () => {
  const axis = buildAxis(rides, [city, driver])

  it('листья дерева, когда ничего не свёрнуто', () => {
    expect(visibleLeaves(axis, new Set()).map((n) => n.key)).toEqual(['Иванов', 'Петров', 'Сидоров'])
  })

  it('свёрнутый узел САМ становится листом — колонка одна, с итогом группы', () => {
    expect(visibleLeaves(axis, new Set([pivotId(['Москва'])])).map((n) => n.key))
      .toEqual(['Москва', 'Сидоров'])
  })
})

describe('headerCells', () => {
  const axis = buildAxis(rides, [city, driver])

  it('строк шапки столько же, сколько измерений', () => {
    expect(headerCells(axis, new Set(), 2)).toHaveLength(2)
  })

  it('родитель занимает столько колонок, сколько под ним видимых листьев', () => {
    const [top] = headerCells(axis, new Set(), 2)
    expect(top!.map((c) => [c.node.key, c.colSpan, c.rowSpan]))
      .toEqual([['Москва', 2, 1], ['Казань', 1, 1]])
  })

  it('свёрнутый узел уходит вглубь ростом rowSpan, а не пустой ячейкой', () => {
    const rows = headerCells(axis, new Set([pivotId(['Москва'])]), 2)
    expect(rows[0]!.map((c) => [c.node.key, c.colSpan, c.rowSpan]))
      .toEqual([['Москва', 1, 2], ['Казань', 1, 1]])
    expect(rows[1]!.map((c) => c.node.key)).toEqual(['Сидоров'])
  })

  it('три измерения: лист первого уровня тянется на все три строки', () => {
    const deep = buildAxis(rides, [city, driver, day])
    const rows = headerCells(deep, new Set(), 3)
    expect(rows).toHaveLength(3)
    expect(rows[2]!.map((c) => c.node.key)).toEqual(['пн', 'вт', 'пн', 'вт'])
    expect(rows[0]![0]!.colSpan).toBe(3)
  })
})
