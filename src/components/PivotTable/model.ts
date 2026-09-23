import type { ReactNode } from 'react'

/**
 * Модель сводной таблицы: всё, что считается по данным и не знает про React.
 *
 * Вынесено по тому же критерию, что и `Tree/model.ts` (DS-111), — НОВАЯ
 * ПРОВЕРЯЕМОСТЬ. Главное утверждение компонента («итог посчитан по исходным
 * строкам, а не по показанным подытогам») через рендер проверяется только на
 * глаз: в разметке лежат числа, и правильные от неправильных отличает
 * арифметика, а не разметка. Таблицей — проверяется.
 *
 * Типы измерения и меры объявлены ЗДЕСЬ, а не в `PivotTable.tsx` (как
 * `TreeNode` у дерева): у дерева публичный тип описывает узел, который рисуют,
 * а здесь — то, что считают. Компонент их реэкспортирует.
 */

export type PivotAgg = 'sum' | 'avg' | 'count' | 'min' | 'max'

/**
 * Измерение — колонка, по которой режут. `value` отдаёт КЛЮЧ корзины, и он же
 * по умолчанию её подпись; `formatValue` нужен, когда ключ технический
 * (`2026-01` показывается как «Январь»).
 */
export interface PivotDimension<T> {
  id: string
  label: ReactNode
  value: (row: T) => string
  formatValue?: (key: string) => ReactNode
  /**
   * Порядок корзин. По умолчанию — ПО ПЕРВОМУ ПОЯВЛЕНИЮ значения в данных, как
   * у `groupByValue`: порядок строк потребителя — это факт, и переставлять его
   * за него нельзя. `'asc'`/`'desc'` сравнивают через `localeCompare` (для
   * кириллицы порядок кодов и алфавит расходятся на «ё»), своя функция — для
   * порядка, который из ключа не выводится вовсе: месяцы, дни недели, статусы.
   */
  sort?: 'asc' | 'desc' | ((a: string, b: string) => number)
}

interface MeasureBase {
  id: string
  label: ReactNode
  /** Как показать число. Без него — как есть. Здесь живёт валюта и разрядность. */
  format?: (value: number) => ReactNode
}

/**
 * `count` не берёт `value` — считать нечего, считаются строки. Объявлено
 * `value?: never`, чтобы лишний аргумент был ОШИБКОЙ КОМПИЛЯЦИИ: молча
 * проигнорированный `value` выглядел бы работающим и означал бы, что мера
 * считает не то, что написано.
 */
export interface PivotCountMeasure extends MeasureBase {
  agg: 'count'
  value?: never
}

export interface PivotValueMeasure<T> extends MeasureBase {
  agg: Exclude<PivotAgg, 'count'>
  value: (row: T) => number
}

export type PivotMeasure<T> = PivotCountMeasure | PivotValueMeasure<T>

/** Узел оси: корзина одного измерения вместе с индексами попавших в неё строк. */
export interface PivotNode {
  /** Путь по ключам от корня. Уникален по всей оси — в отличие от `key`. */
  id: string
  /** Собственный ключ корзины. Одинаковый у разных веток — это норма. */
  key: string
  path: string[]
  depth: number
  /**
   * Индексы ИСХОДНЫХ строк, попавших в узел, по возрастанию. Индексы, а не
   * копии строк: пересечение оси строк с осью колонок — то, чем считается
   * каждая ячейка, и на массивах чисел оно дешёвое.
   */
  rows: number[]
  children: PivotNode[]
}

/**
 * Разделитель в `id` узла — «unit separator», управляющий символ U+001F. Не
 * дефис и не двоеточие: те встречаются в настоящих значениях (`ООО
 * «Ромашка-2»`, `12:00`), и склейка пути на них дала бы двум разным узлам один
 * id — молча.
 */
const SEP = '\u001F'

/**
 * Собрать id узла из пути. Потребитель, задающий свёрнутые узлы, зовёт ЭТУ
 * функцию, а не пишет разделитель руками: управляющий символ в исходнике не
 * виден и переживает не всякое копирование.
 */
export function pivotId(path: readonly string[]): string {
  return path.join(SEP)
}

function orderKeys(keys: string[], sort: NonNullable<PivotDimension<unknown>['sort']>): string[] {
  if (typeof sort === 'function') return [...keys].sort(sort)
  const asc = [...keys].sort((a, b) => a.localeCompare(b))
  return sort === 'asc' ? asc : asc.reverse()
}

/**
 * Дерево корзин по списку измерений. Строится ОДИН РАЗ на данные и не зависит
 * от того, что свёрнуто: свёртка — это выборка из готового дерева, и считать
 * дерево заново на каждый клик значило бы пересобирать всю арифметику ради
 * каретки.
 */
export function buildAxis<T>(rows: readonly T[], dims: readonly PivotDimension<T>[]): PivotNode[] {
  return build(rows, rows.map((_, i) => i), dims, 0, [])
}

function build<T>(
  rows: readonly T[],
  indices: readonly number[],
  dims: readonly PivotDimension<T>[],
  level: number,
  parentPath: readonly string[],
): PivotNode[] {
  const dim = dims[level]
  if (!dim) return []
  // Map держит порядок вставки — отсюда и «по первому появлению» без отдельного
  // списка порядка.
  const buckets = new Map<string, number[]>()
  for (const i of indices) {
    const key = dim.value(rows[i]!)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(i)
    else buckets.set(key, [i])
  }
  const keys = dim.sort ? orderKeys([...buckets.keys()], dim.sort) : [...buckets.keys()]
  return keys.map((key) => {
    const path = [...parentPath, key]
    const own = buckets.get(key)!
    return {
      id: pivotId(path), key, path, depth: level, rows: own,
      children: build(rows, own, dims, level + 1, path),
    }
  })
}

/**
 * Значение меры по НАБОРУ ИСХОДНЫХ СТРОК. Единственный способ получить число в
 * этом компоненте — и это главное решение модели: подытог и итог считаются
 * отсюда же, по своим строкам, а не складыванием показанных детей.
 *
 * Для `sum` и `count` разницы нет, поэтому дефект такого рода живёт незаметно
 * ровно до первой `avg`: среднее средних — не среднее.
 *
 * Пустой набор даёт `null` У ВСЕХ агрегатов, включая `count`. Ноль — это факт
 * («поездок было ноль»), а пересечение без строк — его отсутствие; печатать
 * `0` там значило бы утверждать то, чего в данных нет. Одно правило без
 * исключения по агрегату: исключение пришлось бы помнить.
 */
export function aggregate<T>(
  rows: readonly T[],
  indices: readonly number[],
  measure: PivotMeasure<T>,
): number | null {
  if (indices.length === 0) return null
  if (measure.agg === 'count') return indices.length
  // Имя и агрегат снимаются ДО проверки намеренно. `value` — псевдоним поля
  // размеченного объединения, и с TS 5.5 сужение псевдонима сужает сам объект:
  // после `typeof value !== 'function'` внутри ветки `measure` становится
  // `never`, потому что ни один член объединения такого не допускает, — и
  // сообщение об ошибке перестаёт компилироваться (TS2339 на `measure.id`).
  // Речь ровно о том случае, которого тип не допускает, а `any` у потребителя
  // допускает.
  const { id, agg } = measure
  const value = measure.value
  if (typeof value !== 'function') {
    throw new Error(
      `jig: PivotTable — мера «${id}» с агрегатом ${agg} без value. `
      + 'Значение брать неоткуда; value обязателен всем агрегатам, кроме count.',
    )
  }
  let acc = value(rows[indices[0]!]!)
  for (let i = 1; i < indices.length; i++) {
    const v = value(rows[indices[i]!]!)
    if (measure.agg === 'min') acc = Math.min(acc, v)
    else if (measure.agg === 'max') acc = Math.max(acc, v)
    else acc += v
  }
  return measure.agg === 'avg' ? acc / indices.length : acc
}

/** Общие индексы двух списков, отсортированных по возрастанию. */
export function intersectSorted(a: readonly number[], b: readonly number[]): number[] {
  const out: number[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const x = a[i]!
    const y = b[j]!
    if (x === y) { out.push(x); i++; j++ }
    else if (x < y) i++
    else j++
  }
  return out
}

/** Строка сводной: узел оси строк плюс то, что о нём нужно знать разметке. */
export interface PivotRow {
  node: PivotNode
  hasChildren: boolean
  collapsed: boolean
}

/**
 * Видимые строки. Свёрнутый узел ОСТАЁТСЯ в выдаче — иначе нечего было бы
 * нажимать, чтобы развернуть обратно; уходят только его дети.
 *
 * Узел без детей не бывает свёрнутым, даже если его id попал в набор: иначе
 * набор, переживший смену измерений, погасил бы каретку у листа.
 */
export function visibleRows(nodes: readonly PivotNode[], collapsed: ReadonlySet<string>): PivotRow[] {
  const out: PivotRow[] = []
  for (const node of nodes) {
    const hasChildren = node.children.length > 0
    const isCollapsed = hasChildren && collapsed.has(node.id)
    out.push({ node, hasChildren, collapsed: isCollapsed })
    if (hasChildren && !isCollapsed) out.push(...visibleRows(node.children, collapsed))
  }
  return out
}

/** Сколько видимых колонок занимает поддерево. Свёрнутое — ровно одну. */
function leafCount(node: PivotNode, collapsed: ReadonlySet<string>): number {
  if (node.children.length === 0 || collapsed.has(node.id)) return 1
  let n = 0
  for (const child of node.children) n += leafCount(child, collapsed)
  return n
}

/**
 * Видимые листья оси колонок — по одной колонке значений на каждый. Свёрнутый
 * узел САМ становится листом: колонка остаётся, в ней стоит итог группы. Так
 * свёртка колонки убирает подробность, а не данные.
 */
export function visibleLeaves(nodes: readonly PivotNode[], collapsed: ReadonlySet<string>): PivotNode[] {
  const out: PivotNode[] = []
  for (const node of nodes) {
    if (node.children.length === 0 || collapsed.has(node.id)) out.push(node)
    else out.push(...visibleLeaves(node.children, collapsed))
  }
  return out
}

export interface PivotHeaderCell {
  node: PivotNode
  colSpan: number
  rowSpan: number
  /** Лист — та ячейка, под которой стоят значения, а не другие заголовки. */
  leaf: boolean
}

/**
 * Шапка колонок по строкам — по строке на измерение.
 *
 * Свёрнутый (или последний) узел не оставляет под собой пустых ячеек, а тянется
 * вниз через `rowSpan`. Пустая ячейка была бы не косметикой: диктор объявил бы
 * колонке лишний безымянный уровень, а `scope` перестал бы указывать на то, что
 * колонку называет.
 */
export function headerCells(
  nodes: readonly PivotNode[],
  collapsed: ReadonlySet<string>,
  levels: number,
): PivotHeaderCell[][] {
  const rows: PivotHeaderCell[][] = Array.from({ length: levels }, () => [])
  const walk = (ns: readonly PivotNode[], depth: number): void => {
    for (const node of ns) {
      const open = node.children.length > 0 && !collapsed.has(node.id)
      if (open) {
        rows[depth]!.push({ node, colSpan: leafCount(node, collapsed), rowSpan: 1, leaf: false })
        walk(node.children, depth + 1)
      } else {
        rows[depth]!.push({ node, colSpan: 1, rowSpan: levels - depth, leaf: true })
      }
    }
  }
  walk(nodes, 0)
  return rows
}
