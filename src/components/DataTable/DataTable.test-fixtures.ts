import type { Column } from './DataTable.js'
import type { DisplayRow } from '../../internal/rowModel.js'

/**
 * Общие фикстуры кейсов `DataTable`. Вынесены при разрезании файла на 1202
 * строки (DS-116): пять наборов кейсов используют одни и те же две
 * колонки и две строки, и держать их копиями значило бы, что «Товар А» в одном
 * файле однажды разойдётся с «Товаром А» в другом.
 */
export interface Row { id: string; name: string; sum: number }
export const columns: Column<Row>[] = [
  { key: 'name', header: 'Номенклатура' },
  { key: 'sum', header: 'Сумма', numeric: true },
]
export const rows: Row[] = [
  { id: '1', name: 'Товар А', sum: 1200 },
  { id: '2', name: 'Товар Б', sum: 3400 },
]

export const modeled: DisplayRow<Row>[] = [
  { kind: 'data', id: '1', row: rows[0]!, depth: 0, hasChildren: false, expanded: false },
  { kind: 'data', id: '2', row: rows[1]!, depth: 1, hasChildren: false, expanded: false },
]

// Служебная строка группы между двумя data-строками: с задачи 4 компонент её
// рисует своей строкой (tr.ds-table__group), но она не участвует в счёте
// чётности — счётчик, который компонент ведёт сам по data-строкам, отсекает
// не-data строки гвардом до инкремента.
export const modeledWithGroup: DisplayRow<Row>[] = [
  { kind: 'data', id: '1', row: rows[0]!, depth: 0, hasChildren: false, expanded: false },
  { kind: 'group', id: 'group:x', depth: 0, label: 'X', count: 1, expanded: true },
  { kind: 'data', id: '2', row: rows[1]!, depth: 1, hasChildren: false, expanded: false },
]

export const grouped: DisplayRow<Row>[] = [
  { kind: 'group', id: 'group:Товары', depth: 0, label: 'Товары', count: 2, expanded: true },
  { kind: 'data', id: '1', row: rows[0]!, depth: 1, hasChildren: false, expanded: false },
  { kind: 'data', id: '2', row: rows[1]!, depth: 1, hasChildren: false, expanded: false },
]
