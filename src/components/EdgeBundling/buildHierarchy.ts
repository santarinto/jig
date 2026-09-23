import { hierarchy, cluster, type HierarchyNode } from 'd3-hierarchy'
import { lineRadial, curveBundle } from 'd3-shape'

export interface EdgeBundlingItem {
  /** Уникальный id; при `delimiter` путь вида `pkg.sub.Leaf` строит дерево. */
  id: string
  label?: string
  /** Связи с другими листьями (их id). Осмысленны только на листьях — см. AGENTS.md. */
  links?: string[]
}

interface TreeDatum {
  id: string
  label: string
  links?: string[]
  children?: TreeDatum[]
}

const SYNTH_ROOT_ID = '__root__'

function syntheticRoot(children: TreeDatum[]): TreeDatum {
  return { id: SYNTH_ROOT_ID, label: '', children }
}

/** Собирает дерево из плоского списка с разделителем в id — как flare-imports. */
export function buildTreeFromItems(items: EdgeBundlingItem[], delimiter: string): TreeDatum {
  if (items.length === 0) return syntheticRoot([])

  const byId = new Map<string, TreeDatum>()
  const rootIds = new Set<string>()

  function find(item: EdgeBundlingItem): TreeDatum {
    const fullId = item.id
    const cached = byId.get(fullId)
    if (cached) {
      if (item.links !== undefined) cached.links = item.links
      return cached
    }

    const node: TreeDatum = {
      id: fullId,
      label: item.label ?? fullId,
      links: item.links,
    }
    byId.set(fullId, node)

    // Пустой разделитель — это «иерархии нет», каждый id сам себе корень.
    // Без этой ветки `''.lastIndexOf('')` возвращает длину строки, узел становится
    // собственным родителем, корней не остаётся вовсе и граф рисуется пустым.
    const i = delimiter === '' ? -1 : fullId.lastIndexOf(delimiter)
    if (i >= 0) {
      const parent = find({ id: fullId.slice(0, i) })
      parent.children ??= []
      parent.children.push(node)
      node.label = item.label ?? fullId.slice(i + 1)
    } else {
      rootIds.add(fullId)
      node.label = item.label ?? fullId
    }
    return node
  }

  for (const item of items) find(item)

  const roots = [...rootIds].map((id) => byId.get(id)!).filter(Boolean)
  if (roots.length === 1) return roots[0]!
  return syntheticRoot(roots)
}

export interface LayoutNode {
  id: string
  label: string
  x: number
  y: number
}

export interface LayoutEdge {
  id: string
  /** Оба конца, отсортированы — одна кривая на неупорядоченную пару. */
  endpoints: [string, string]
  d: string
}

function edgePairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`
}

export function layoutEdgeBundling(
  items: EdgeBundlingItem[],
  opts: { size: number; innerPadding: number; delimiter: string; tension: number },
): { nodes: LayoutNode[]; edges: LayoutEdge[]; viewSize: number } {
  const { size, innerPadding, delimiter, tension } = opts
  const viewSize = size + 80

  if (items.length === 0) {
    return { nodes: [], edges: [], viewSize }
  }

  const treeRoot = buildTreeFromItems(items, delimiter)
  const root = hierarchy(treeRoot, (d) => d.children)
  root.sort((a, b) => a.height - b.height || a.data.id.localeCompare(b.data.id))

  cluster<TreeDatum>().size([2 * Math.PI, size / 2 - innerPadding])(root)

  // Без фильтра по SYNTH_ROOT_ID: синтетический корень бездетным сюда не доходит.
  // Пустой список отсекается выше, а непустой всегда даёт хотя бы один настоящий
  // корень — включая `delimiter: ''`, где корнем становится каждый id.
  const leaves = root.leaves()
  const nodeById = new Map(leaves.map((n) => [n.data.id, n]))

  const lineGen = lineRadial<{ x: number; y: number }>()
    .curve(curveBundle.beta(tension))
    .radius((d) => d.y)
    .angle((d) => d.x)

  const seen = new Set<string>()
  const edges: LayoutEdge[] = []
  let edgeIdx = 0

  for (const leaf of leaves) {
    for (const targetId of leaf.data.links ?? []) {
      const a = leaf.data.id
      const b = targetId
      const key = edgePairKey(a, b)
      if (seen.has(key)) continue
      seen.add(key)

      const target = nodeById.get(targetId)
      if (!target) continue

      const from = nodeById.get(a < b ? a : b)!
      const to = nodeById.get(a < b ? b : a)!
      const path = from.path(to) as HierarchyNode<TreeDatum>[]
      const coords = path.map((n) => ({ x: n.x!, y: n.y! }))
      const d = lineGen(coords)
      if (!d) continue

      const endpoints: [string, string] = a < b ? [a, b] : [b, a]
      edges.push({ id: `e-${edgeIdx++}`, endpoints, d })
    }
  }

  const nodes: LayoutNode[] = leaves.map((n) => ({
    id: n.data.id,
    label: n.data.label,
    x: n.x!,
    y: n.y!,
  }))

  return { nodes, edges, viewSize }
}

/**
 * Доступное имя: сводка графа, не перечисление листьев.
 *
 * Сводку присылает вызывающий — ровно как `chartLabel` принимает вид
 * диаграммы. Текст и русское склонение по числу живут в словаре
 * (`edgeBundling.summary`, DS-139): правило склонения — часть русского
 * текста, у другого языка оно своё, и переопределяющий ключ переопределяет и
 * его. Здесь остаётся только выбор между явным именем и сводкой.
 */
export function bundlingAriaLabel(explicit: string | undefined, summary: string): string {
  return explicit?.trim() ? explicit : summary
}
