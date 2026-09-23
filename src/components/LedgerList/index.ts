// Полный набор типов, чтобы потребителю LedgerList не приходилось тянуть
// DataTable ради `Column`. `LedgerColumn` — местная, без `hideBelow`.
//
// `flattenTree` и `RowTreeNode` отсюда УБРАНЫ (DS-154): журнал не дерево,
// глубину он не рисует ни одним правилом, и выдавать своей же публичной
// поверхностью сборщик деревьев значило бы приглашать ровно тот вызов, который
// компилировался и молча расплющивался. Сборщик остался там, где иерархия
// работает и чинена (DS-143), — в `DataTable`. `groupByValue` остаётся:
// группировка по значению это то, что журнал умеет и рисует.
//
// `DisplayRow` ушёл вместе с ними: строка журнала теперь своя, `LedgerRow`.
export { LedgerList } from './LedgerList.js'
export type { LedgerListProps, LedgerColumn, LedgerRow } from './LedgerList.js'
export type { Column, DataColumn, DisplayColumn, ActionColumn, RowAction, HideBelow } from '../../internal/columns.js'
export { groupByValue } from '../../internal/rowModel.js'
