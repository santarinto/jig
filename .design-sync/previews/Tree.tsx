import { useState } from 'react'
import { Tree, type TreeNode } from '@santarinto/jig'

const glyph = (d: string) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)
const folder = glyph('M3 7h6l2 2h10v9a2 2 0 0 1-2 2H3z')
const file = glyph('M6 2h8l4 4v16H6zM14 2v4h4')

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

/** Канонический случай: дерево файлов с выбранным узлом. */
export const Files = () => {
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

/** Чекбоксы: отмечаются листья, состояние веток вычисляется (в том числе «частично»). */
export const Checkable = () => {
  const [checked, setChecked] = useState(['button', 'index'])
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

/** Доп. колонки переводят дерево в режим `treegrid` — файловый менеджер. */
export const TreeGrid = () => (
  <div style={{ width: 460 }}>
    <Tree
      nodes={GRID_FILES}
      defaultExpandedIds={['src']}
      treeColumnHeader="Имя"
      columns={[
        { id: 'size', header: 'Размер', width: 90, align: 'end' },
        { id: 'mod', header: 'Изменён', width: 110 },
      ]}
      aria-label="Файлы с реквизитами"
    />
  </div>
)
