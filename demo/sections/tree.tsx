import { useState } from 'react'
import { IconFolder, IconFile } from '@tabler/icons-react'
import { Tree, type TreeNode } from '../../src/components/Tree/index.js'
import { SearchBar } from '../../src/components/SearchBar/index.js'
import { DemoBlock } from '../demo-spec.js'

const IC = { size: 15, stroke: 1.75 } as const
const folder = <IconFolder {...IC} />
const file = <IconFile {...IC} />

const FILES: TreeNode[] = [
  {
    id: 'src', label: 'src', icon: folder, children: [
      {
        id: 'components', label: 'components', icon: folder, children: [
          { id: 'button', label: 'Button.tsx', icon: file },
          { id: 'tree', label: 'Tree.tsx', icon: file },
        ],
      },
      { id: 'index', label: 'index.ts', icon: file },
      { id: 'styles', label: 'styles.css', icon: file },
    ],
  },
  {
    id: 'docs', label: 'docs', icon: folder, children: [
      { id: 'readme', label: 'README.md', icon: file },
    ],
  },
  { id: 'pkg', label: 'package.json', icon: file },
]

const GRID_FILES: TreeNode[] = [
  {
    id: 'src', label: 'src', icon: folder, cells: { size: '—', mod: '01.08.2026' }, children: [
      { id: 'button', label: 'Button.tsx', icon: file, cells: { size: '4,2 КБ', mod: '31.07.2026' } },
      { id: 'tree', label: 'Tree.tsx', icon: file, cells: { size: '9,8 КБ', mod: '02.08.2026' } },
      { id: 'index', label: 'index.ts', icon: file, cells: { size: '0,4 КБ', mod: '28.07.2026' } },
    ],
  },
  { id: 'pkg', label: 'package.json', icon: file, cells: { size: '1,1 КБ', mod: '20.07.2026' } },
]

const GRID_COLUMNS = [
  { id: 'size', header: 'Размер', width: 90, align: 'end' as const },
  { id: 'mod', header: 'Изменён', width: 110 },
]

function BasicTree() {
  const [selected, setSelected] = useState('button')
  return (
    <div style={{ width: 320 }}>
      <Tree
        nodes={FILES}
        defaultExpandedIds={['src', 'components']}
        selectedId={selected}
        onSelect={setSelected}
        aria-label="Файлы проекта"
      />
    </div>
  )
}

function FilterTree() {
  const [query, setQuery] = useState('')
  return (
    <div style={{ width: 320 }}>
      <div style={{ marginBottom: 8 }}>
        <SearchBar value={query} onChange={setQuery} placeholder="Фильтр по имени…" />
      </div>
      <Tree
        nodes={FILES}
        defaultExpandedIds={['src', 'components']}
        filter={query}
        aria-label="Поиск по файлам"
      />
    </div>
  )
}

// --- Применение переноса к дереву данных (в потребителе, дерево не мутирует само) ---
function removeNode(nodes: TreeNode[], id: string): [TreeNode | null, TreeNode[]] {
  let removed: TreeNode | null = null
  const out: TreeNode[] = []
  for (const n of nodes) {
    if (n.id === id) { removed = n; continue }
    if (n.children) {
      const [r, kids] = removeNode(n.children, id)
      if (r) removed = r
      out.push({ ...n, children: kids })
    } else out.push(n)
  }
  return [removed, out]
}
function insertNode(nodes: TreeNode[], targetId: string, node: TreeNode, pos: 'before' | 'after' | 'inside'): TreeNode[] {
  const out: TreeNode[] = []
  for (const n of nodes) {
    if (n.id === targetId) {
      if (pos === 'before') out.push(node, n)
      else if (pos === 'after') out.push(n, node)
      else out.push({ ...n, children: [...(n.children ?? []), node] })
    } else {
      out.push(n.children ? { ...n, children: insertNode(n.children, targetId, node, pos) } : n)
    }
  }
  return out
}

function DndTree() {
  const [tree, setTree] = useState<TreeNode[]>(FILES)
  return (
    <div style={{ width: 320 }}>
      <Tree
        nodes={tree}
        defaultExpandedIds={['src', 'components', 'docs']}
        aria-label="Перетаскивание"
        onMove={(dragId, targetId, pos) => {
          setTree((cur) => {
            const [node, pruned] = removeNode(cur, dragId)
            return node ? insertNode(pruned, targetId, node, pos) : cur
          })
        }}
      />
    </div>
  )
}

function CheckTree() {
  const [checked, setChecked] = useState<string[]>(['button'])
  return (
    <div style={{ width: 320 }}>
      <Tree
        nodes={FILES}
        defaultExpandedIds={['src', 'components']}
        checkable
        selectedIds={checked}
        onSelectionChange={setChecked}
        aria-label="Выбор файлов"
      />
    </div>
  )
}

export function TreeSection() {
  return (
    <section className="demo-section" id="tree">
      <h2 className="demo-section__title">Tree</h2>
      <div className="demo-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <DemoBlock
          name="Tree · Basic"
          block
          code={'<Tree nodes={files} defaultExpandedIds={[…]} selectedId={id} onSelect={setId} />'}
        >
          <BasicTree />
        </DemoBlock>
        <DemoBlock
          name="Tree · Чекбоксы"
          block
          code={'<Tree checkable selectedIds={ids} onSelectionChange={setIds} … />'}
        >
          <CheckTree />
        </DemoBlock>
        <DemoBlock
          name="Tree · Фильтрация"
          block
          code={'<SearchBar value={q} onChange={setQ} />\n<Tree filter={q} … />'}
        >
          <FilterTree />
        </DemoBlock>
        <DemoBlock
          name="Tree · Drag-n-drop"
          block
          code={'<Tree onMove={(id, target, pos) => setTree(apply(id, target, pos))} … />'}
        >
          <DndTree />
        </DemoBlock>
        <DemoBlock
          name="Tree · Tree Grid"
          block
          code={'<Tree columns={[{ id, header, width, align }]} treeColumnHeader="Файл" … />'}
        >
          <div style={{ width: 360 }}>
            <Tree
              nodes={GRID_FILES}
              columns={GRID_COLUMNS}
              treeColumnHeader="Файл"
              defaultExpandedIds={['src']}
              aria-label="Файлы с колонками"
            />
          </div>
        </DemoBlock>
      </div>
    </section>
  )
}
