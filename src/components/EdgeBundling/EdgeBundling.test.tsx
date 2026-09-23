import { describe, it, expect } from 'vitest'
import { hierarchy, cluster, type HierarchyNode } from 'd3-hierarchy'
import { lineRadial, curveBundle } from 'd3-shape'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buildTreeFromItems, layoutEdgeBundling } from './buildHierarchy.js'
import { EdgeBundling } from './EdgeBundling.js'

const OPTS = { size: 400, innerPadding: 40, delimiter: '.', tension: 0.85 }

/**
 * Одна кривая, пройденная в обратном порядке, даёт те же точки в обратном
 * порядке. Живёт в тесте, а не в модуле: это хелпер сравнения, а не часть
 * компонента. Проверено, что он различает два РАЗНЫХ ребра, — иначе сравнение
 * было бы истинным всегда и ничего не утверждало.
 */
function absNormalizePathD(d: string): string {
  const nums = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []
  return nums.map((n) => Math.abs(Number(n)).toFixed(4)).join(',')
}

type TreeDatum = { id: string; label: string; links?: string[]; children?: TreeDatum[] }

const SAMPLE = [
  { id: 'root.a.A', links: ['root.a.B', 'root.b.C'] },
  { id: 'root.a.B', links: ['root.a.A'] },
  { id: 'root.b.C', links: [] },
]

describe('buildTreeFromItems', () => {
  it('groups dotted ids into a tree', () => {
    const tree = buildTreeFromItems(SAMPLE, '.')
    expect(tree.id).toBe('root')
    expect(tree.children?.map((c) => c.id)).toEqual(['root.a', 'root.b'])
    const aLeaves = tree.children?.find((c) => c.id === 'root.a')?.children?.map((c) => c.id)
    expect(aLeaves).toEqual(['root.a.A', 'root.a.B'])
  })

  it('wraps several top-level ids under a synthetic root', () => {
    const tree = buildTreeFromItems([{ id: 'alpha.A' }, { id: 'beta.B' }], '.')
    expect(tree.id).toBe('__root__')
    expect(tree.children?.map((c) => c.id).sort()).toEqual(['alpha', 'beta'])
    const leaves = tree.children?.flatMap((c) => c.children?.map((ch) => ch.id) ?? []) ?? []
    expect(leaves.sort()).toEqual(['alpha.A', 'beta.B'])
  })

  it('returns an empty synthetic root for an empty list', () => {
    expect(buildTreeFromItems([], '.')).toEqual({ id: '__root__', label: '', children: [] })
  })
})

describe('layoutEdgeBundling', () => {
  it('produces bundled paths between linked leaves (single shared root)', () => {
    const { nodes, edges } = layoutEdgeBundling(SAMPLE, OPTS)
    expect(nodes.map((n) => n.id).sort()).toEqual(['root.a.A', 'root.a.B', 'root.b.C'])
    expect(edges).toHaveLength(2)
    for (const e of edges) {
      expect(e.d).toMatch(/^M/)
      expect(e.d).not.toContain('NaN')
    }
  })

  it('keeps both subtrees when ids have no common root', () => {
    const items = [{ id: 'alpha.A', links: ['beta.B'] }, { id: 'beta.B' }]
    const { nodes, edges } = layoutEdgeBundling(items, OPTS)
    expect(nodes.map((n) => n.id).sort()).toEqual(['alpha.A', 'beta.B'])
    expect(edges).toHaveLength(1)
    expect(edges[0]!.endpoints).toEqual(['alpha.A', 'beta.B'])
  })

  it('keeps every flat id as its own leaf', () => {
    const items = [
      { id: 'A', links: ['B'] },
      { id: 'B' },
      { id: 'C', links: ['A'] },
    ]
    const { nodes, edges } = layoutEdgeBundling(items, OPTS)
    expect(nodes.map((n) => n.id).sort()).toEqual(['A', 'B', 'C'])
    expect(edges).toHaveLength(2)
  })

  it('returns nothing for an empty graph', () => {
    const out = layoutEdgeBundling([], OPTS)
    expect(out.nodes).toHaveLength(0)
    expect(out.edges).toHaveLength(0)
  })

  it('does not invent a phantom leaf for an empty synthetic root', () => {
    const { nodes } = layoutEdgeBundling([], OPTS)
    expect(nodes.some((n) => n.id === '__root__')).toBe(false)
  })

  it('draws one path for a mutual pair', () => {
    const items = [
      { id: 'root.a.A', links: ['root.a.B'] },
      { id: 'root.a.B', links: ['root.a.A'] },
    ]
    const { edges } = layoutEdgeBundling(items, OPTS)
    expect(edges).toHaveLength(1)
    expect(edges[0]!.endpoints).toEqual(['root.a.A', 'root.a.B'])
  })

  it('traces the same geometry in both directions', () => {
    const items = [
      { id: 'root.a.A', links: ['root.a.B'] },
      { id: 'root.a.B', links: ['root.a.A'] },
    ]
    const tree = buildTreeFromItems(items, '.')
    const root = hierarchy(tree, (d) => d.children) as HierarchyNode<TreeDatum>
    cluster<TreeDatum>().size([2 * Math.PI, 160])(root)
    const leaves = root.leaves().filter((n) => n.data.id !== '__root__')
    const byId = new Map(leaves.map((n) => [n.data.id, n]))
    const lineGen = lineRadial<{ x: number; y: number }>()
      .curve(curveBundle.beta(0.85))
      .radius((d) => d.y)
      .angle((d) => d.x)
    const a = byId.get('root.a.A')!
    const b = byId.get('root.a.B')!
    const toCoords = (path: HierarchyNode<TreeDatum>[]) =>
      path.map((n) => ({ x: n.x!, y: n.y! }))
    const forward = absNormalizePathD(lineGen(toCoords(a.path(b)))!)
    const backward = absNormalizePathD(lineGen(toCoords(b.path(a)))!)
    expect(forward).toBe(backward)
  })

  it('treats an empty delimiter as "no hierarchy", not as an empty graph', () => {
    const items = [{ id: 'AB', links: ['CD'] }, { id: 'CD' }]
    const { nodes, edges } = layoutEdgeBundling(items, { ...OPTS, delimiter: '' })
    expect(nodes.map((n) => n.id).sort()).toEqual(['AB', 'CD'])
    expect(edges).toHaveLength(1)
  })

  it('never emits the synthetic root as a leaf', () => {
    const cases: { items: { id: string }[]; delimiter: string }[] = [
      { items: [], delimiter: '.' },
      { items: [{ id: 'AB' }, { id: 'CD' }], delimiter: '' },
      { items: [{ id: 'alpha.A' }, { id: 'beta.B' }], delimiter: '.' },
    ]
    for (const { items, delimiter } of cases) {
      const { nodes } = layoutEdgeBundling(items, { ...OPTS, delimiter })
      expect(nodes.some((n) => n.id === '__root__')).toBe(false)
      expect(nodes.some((n) => n.label === '')).toBe(false)
    }
  })

  it('ignores links declared on non-leaf nodes', () => {
    const items = [{ id: 'root', links: ['root.a.A'] }, { id: 'root.a.A' }]
    const { edges } = layoutEdgeBundling(items, OPTS)
    expect(edges).toHaveLength(0)
  })
})

describe('EdgeBundling', () => {
  it('names itself for screen readers when ariaLabel is given', () => {
    render(<EdgeBundling items={SAMPLE} ariaLabel="Зависимости модулей" />)
    expect(screen.getByRole('img', { name: 'Зависимости модулей' })).toBeInTheDocument()
  })

  it('derives a structural summary when no ariaLabel is given', () => {
    render(<EdgeBundling items={SAMPLE} size={320} />)
    expect(screen.getByRole('img', { name: 'Иерархическое связывание: 3 узла, 2 связи' }))
      .toBeInTheDocument()
  })

  it('draws one label per leaf', () => {
    const { container } = render(<EdgeBundling items={SAMPLE} size={320} />)
    expect(container.querySelectorAll('.ds-edge-bundle__label')).toHaveLength(3)
  })

  it('highlights a node bundle on label hover', async () => {
    const user = userEvent.setup()
    const { container } = render(<EdgeBundling items={SAMPLE} size={320} />)
    const label = screen.getByText('A')
    await user.hover(label)
    expect(container.querySelectorAll('.ds-edge-bundle__link.is-highlight').length).toBeGreaterThan(0)
    expect(label.closest('.ds-edge-bundle__label')).toHaveClass('is-hover')
  })

  it('highlights both endpoints when hovering a link', async () => {
    const user = userEvent.setup()
    const items = [{ id: 'root.a.A', links: ['root.a.B'] }, { id: 'root.a.B' }]
    const { container } = render(<EdgeBundling items={items} size={320} />)
    const path = container.querySelector('.ds-edge-bundle__link')!
    await user.hover(path)
    expect(container.querySelectorAll('.ds-edge-bundle__label.is-hover')).toHaveLength(2)
    expect(container.querySelectorAll('.ds-edge-bundle__link.is-highlight')).toHaveLength(1)
  })

  it('scales with --ds-ui-scale via container width', () => {
    const { container } = render(<EdgeBundling items={SAMPLE} size={400} />)
    const root = container.querySelector('.ds-edge-bundle') as HTMLElement
    expect(root.style.width).toContain('calc(')
    expect(root.style.width).toContain('--ds-ui-scale')
  })
})
