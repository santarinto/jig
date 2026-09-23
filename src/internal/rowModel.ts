/**
 * Модель строк списка: то, что в платформе умеет список, а таблица — нет.
 *
 * Функции здесь чистые: состояние раскрытия принадлежит потребителю и приходит
 * аргументом. Компонент не знает, откуда взялся массив — иерархия это,
 * группировка по значению или плоский список.
 */

/**
 * Узел дерева СТРОК: сама строка плюс подчинённые, если они есть.
 *
 * Имя с приставкой `Row`, а не `TreeNode`, потому что канонический `TreeNode`
 * в пакете — узел компонента `Tree` (`id`/`label`/`children`), и это другая
 * вещь. Два одноимённых типа с разной семантикой жили бы до первой путаницы
 * (DS-115).
 */
export interface RowTreeNode<T> {
  row: T
  children?: RowTreeNode<T>[]
}

/**
 * Строка в том виде, в котором её рисует таблица.
 *
 * `data` — строка данных; `group` — служебный заголовок группы. Вариант для
 * строки раскрытия (`detail`) добавится вместе с `renderExpanded`.
 */
export type DisplayRow<T> =
  | {
      kind: 'data'
      id: string
      row: T
      depth: number
      hasChildren: boolean
      expanded: boolean
    }
  | {
      kind: 'group'
      id: string
      depth: number
      label: React.ReactNode
      /**
       * Число записей в группе, если компоненту оно нужно. `DataTable` рисует
       * его как fallback, когда не задан `aside`; `LedgerList` не читает поле
       * (у него `aside` или ничего). Опционально, чтобы не обязывать потребителя
       * `LedgerList` задавать значение, ни на что не влияющее.
       */
      count?: number
      /**
       * Раскрыта ли группа. `DataTable` рулит раскрытием через `onToggleExpand`
       * и читает флаг для каретки; `LedgerList` группы не сворачивает (он
       * раскрывает записи через `<details>`), поэтому для него поле бесполезно.
       * Опционально по той же причине, что и `count`.
       */
      expanded?: boolean
      /** Значения по колонкам (colId → узел). Итог под колонкой; ReactNode, не скаляр. */
      cells?: Partial<Record<string, React.ReactNode>>
      /** Произвольный правый узел шапки группы. Заменяет отображение count. */
      aside?: React.ReactNode
    }

/**
 * Разворачивает дерево в плоский массив, показывая детей только у раскрытых
 * узлов. Свёрнутый узел остаётся в выдаче с `hasChildren: true` — иначе
 * потребителю нечего было бы нажимать.
 *
 * `getRowId` обязан возвращать идентификатор, уникальный по всему дереву, а
 * не только среди соседей одного уровня. Раскрытие сопоставляется по `id`
 * через один общий `Set`, без учёта пути до узла: если два узла в разных
 * ветках получат одинаковый id, раскрытие одного раскроет и другой. Функция
 * не может это проверить — `getRowId` отдаёт голую строку, и «два узла с
 * одним id» неотличимо от «тот же узел встретился дважды по ссылке».
 */
export function flattenTree<T>(
  nodes: readonly RowTreeNode<T>[],
  getRowId: (row: T) => string,
  expandedIds: readonly string[],
): DisplayRow<T>[] {
  // Set строится один раз на весь обход. Раньше он пересобирался в каждом
  // рекурсивном вызове из одного и того же expandedIds — на результат это не
  // влияло (Set от одних данных даёт то же самое), но на дереве с K
  // раскрытыми узлами так набегает K лишних построений одного и того же Set.
  //
  // Глубина обхода — внутренний аккумулятор рекурсии, у корня она всегда 0.
  // `flattenTree` — публичный экспорт пакета, поэтому у неё нет параметра
  // depth: после 1.8.0 он стал бы публичным API, которое по правилам проекта
  // можно только расширять, а не убрать. `flattenOpen` параметр depth
  // сохраняет — он внутренний и в подпись пакета не попадает.
  return flattenOpen(nodes, getRowId, new Set(expandedIds), 0)
}

function flattenOpen<T>(
  nodes: readonly RowTreeNode<T>[],
  getRowId: (row: T) => string,
  expanded: ReadonlySet<string>,
  depth: number,
): DisplayRow<T>[] {
  const out: DisplayRow<T>[] = []
  for (const node of nodes) {
    const id = getRowId(node.row)
    const hasChildren = !!node.children?.length
    const isOpen = hasChildren && expanded.has(id)
    out.push({ kind: 'data', id, row: node.row, depth, hasChildren, expanded: isOpen })
    // Проверяем node.children напрямую (не через hasChildren) — так TS сужает
    // тип сам, и не нужен `!` для утверждения, что children точно есть.
    if (isOpen && node.children) out.push(...flattenOpen(node.children, getRowId, expanded, depth + 1))
  }
  return out
}

/**
 * Собирает плоский список в группы по значению колонки — как группировка в
 * отчёте. Порядок групп — по первому появлению значения: сортировка это
 * отдельное решение потребителя, и переставлять группы за него нельзя.
 *
 * Идентификатор группы — `group:<значение>`. Префикс не косметика: id группы
 * попадает в тот же `expandedKeys`, что и id строк, и без префикса значение
 * колонки могло бы случайно совпасть с чьим-то id строки.
 *
 * Значения колонки группировки должны быть одного типа: ключом служит их
 * строковое представление (`String(value)`), поэтому число `1` и строка
 * `'1'`, либо `null` и строка `"null"`, схлопнутся в одну группу. Функция
 * этого не заметит и не проверяет — колонка со смешанными типами это уже
 * сломанные данные, а не то, что стоит усложнять контракт ради обнаружения.
 */
export function groupByValue<T>(
  rows: readonly T[],
  getRowId: (row: T) => string,
  key: keyof T & string,
  expandedKeys: readonly string[],
  formatLabel?: (value: unknown, rows: T[]) => React.ReactNode,
  options?: {
    summarize?: (rows: T[]) => Partial<Record<string, React.ReactNode>>
    aside?: (value: unknown, rows: T[]) => React.ReactNode
  },
): DisplayRow<T>[] {
  const expanded = new Set(expandedKeys)
  const buckets = new Map<string, { value: unknown; rows: T[] }>()
  for (const row of rows) {
    const value = row[key]
    const groupId = `group:${String(value)}`
    const bucket = buckets.get(groupId) ?? { value, rows: [] }
    bucket.rows.push(row)
    buckets.set(groupId, bucket)
  }

  const out: DisplayRow<T>[] = []
  for (const [groupId, { value, rows: inGroup }] of buckets) {
    const isOpen = expanded.has(groupId)
    out.push({
      kind: 'group',
      id: groupId,
      depth: 0,
      label: formatLabel ? formatLabel(value, inGroup) : String(value),
      count: inGroup.length,
      expanded: isOpen,
      cells: options?.summarize?.(inGroup),
      aside: options?.aside?.(value, inGroup),
    })
    if (isOpen) {
      for (const row of inGroup) {
        out.push({ kind: 'data', id: getRowId(row), row, depth: 1, hasChildren: false, expanded: false })
      }
    }
  }
  return out
}
