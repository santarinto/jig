import type { TreeNode } from './Tree.js'

/**
 * Модель дерева: всё, что считается по данным и не знает про React.
 *
 * Вынесено из `Tree.tsx` не ради длины файла — та метрика в этом репозитории
 * ведёт не туда, у самых объяснённых файлов четверть объёма занимают решения.
 * Критерий здесь другой: НОВАЯ ПРОВЕРЯЕМОСТЬ. `isAncestor` — это запрет
 * «нельзя бросить узел внутрь собственного потомка», `checkStateOf` —
 * трёхзначное состояние чекбокса с протяжкой по детям. До выноса оба
 * проверялись только через DnD-рендер и клики: тест длинный, хрупкий, и на
 * глубине три его никто не писал. Таблицей — пишется (DS-111).
 *
 * `TreeNode` остаётся объявлен в `Tree.tsx`: это публичный тип компонента, и
 * его пояснения стоят рядом с ним. Импорт типовой, в сборке он стирается.
 */

export interface FlatNode {
  node: TreeNode
  level: number
  parentId: string | null
  hasChildren: boolean
  expanded: boolean
}

export function flatten(nodes: TreeNode[], expanded: Set<string>, level = 1, parentId: string | null = null): FlatNode[] {
  const out: FlatNode[] = []
  for (const node of nodes) {
    const hasChildren = !!node.children?.length
    const isOpen = hasChildren && expanded.has(node.id)
    out.push({ node, level, parentId, hasChildren, expanded: isOpen })
    if (isOpen) out.push(...flatten(node.children!, expanded, level + 1, node.id))
  }
  return out
}

/** id всех листьев поддерева (сам узел, если он лист). Чекбоксы держим на листьях. */
export function leafIds(node: TreeNode): string[] {
  if (!node.children?.length) return [node.id]
  return node.children.flatMap(leafIds)
}

export function nodeMatches(node: TreeNode, q: string): boolean {
  const text = node.filterText ?? (typeof node.label === 'string' ? node.label : '')
  return text.toLowerCase().includes(q)
}

/**
 * Плоский список для режима фильтра: узел виден, если сам подходит или подходит
 * потомок; подходящие ветки авто-раскрыты. `expanded` пользователя не трогаем —
 * это вычисляемый слой поверх.
 */
export function filteredFlatten(nodes: TreeNode[], q: string, level = 1, parentId: string | null = null): FlatNode[] {
  const out: FlatNode[] = []
  for (const node of nodes) {
    const childFlat = node.children?.length ? filteredFlatten(node.children, q, level + 1, node.id) : []
    if (nodeMatches(node, q) || childFlat.length > 0) {
      const hasChildren = !!node.children?.length
      out.push({ node, level, parentId, hasChildren, expanded: childFlat.length > 0 })
      out.push(...childFlat)
    }
  }
  return out
}

export interface NodeLocation { parent: TreeNode | null; siblings: TreeNode[]; index: number }
/** Найти узел в дереве данных: его список-соседей, индекс и родителя. */
export function locate(nodes: TreeNode[], nodeId: string, parent: TreeNode | null = null): NodeLocation | null {
  const index = nodes.findIndex((n) => n.id === nodeId)
  if (index >= 0) return { parent, siblings: nodes, index }
  for (const n of nodes) {
    if (n.children) {
      const found = locate(n.children, nodeId, n)
      if (found) return found
    }
  }
  return null
}
/** Является ли `maybeAncestorId` предком `nodeId` (или им самим). */
export function isAncestor(nodes: TreeNode[], maybeAncestorId: string, nodeId: string): boolean {
  const anc = find(nodes, maybeAncestorId)
  if (!anc) return false
  const walk = (n: TreeNode): boolean => n.id === nodeId || !!n.children?.some(walk)
  return walk(anc)
}
export function find(nodes: TreeNode[], nodeId: string): TreeNode | null {
  for (const n of nodes) {
    if (n.id === nodeId) return n
    const c = n.children && find(n.children, nodeId)
    if (c) return c
  }
  return null
}

export type CheckState = true | false | 'mixed'
/** Состояние чекбокса узла из набора отмеченных листьев. */
export function checkStateOf(node: TreeNode, checked: Set<string>): CheckState {
  const leaves = leafIds(node)
  const on = leaves.filter((l) => checked.has(l)).length
  if (on === 0) return false
  if (on === leaves.length) return true
  return 'mixed'
}
