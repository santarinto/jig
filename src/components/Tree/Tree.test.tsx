import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Tree, type TreeNode, type TreeColumn } from './Tree.js'

const nodes: TreeNode[] = [
  { id: 'src', label: 'src', children: [
    { id: 'comp', label: 'components', children: [{ id: 'btn', label: 'Button.tsx' }] },
    { id: 'idx', label: 'index.ts' },
  ] },
  { id: 'pkg', label: 'package.json' },
]

const tree = (props = {}) => render(<Tree nodes={nodes} aria-label="Файлы" {...props} />)

describe('Tree: ядро', () => {
  it('контейнер role=tree, элементы role=treeitem с уровнем', () => {
    tree({ defaultExpandedIds: ['src'] })
    expect(screen.getByRole('tree', { name: 'Файлы' })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: /^src/ })).toHaveAttribute('aria-level', '1')
    expect(screen.getByRole('treeitem', { name: /components/ })).toHaveAttribute('aria-level', '2')
  })

  it('ветка имеет aria-expanded; свёрнутая прячет детей', () => {
    tree()
    expect(screen.getByRole('treeitem', { name: /^src/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('treeitem', { name: /components/ })).toBeNull()
  })

  it('ArrowRight раскрывает, второй ArrowRight идёт к первому ребёнку', () => {
    tree()
    const src = screen.getByRole('treeitem', { name: /^src/ })
    src.focus()
    fireEvent.keyDown(src, { key: 'ArrowRight' })
    expect(screen.getByRole('treeitem', { name: /^src/ })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(screen.getByRole('treeitem', { name: /^src/ }), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: /components/ }))
  })

  it('ArrowLeft на свёрнутой ветке идёт к родителю', () => {
    tree({ defaultExpandedIds: ['src'] })
    const comp = screen.getByRole('treeitem', { name: /components/ })
    comp.focus()
    fireEvent.keyDown(comp, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: /^src/ }))
  })

  it('ArrowLeft на раскрытой ветке сворачивает её', () => {
    tree({ defaultExpandedIds: ['src'] })
    const src = screen.getByRole('treeitem', { name: /^src/ })
    src.focus()
    fireEvent.keyDown(src, { key: 'ArrowLeft' })
    expect(screen.getByRole('treeitem', { name: /^src/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('ArrowDown/Up ходят по видимым узлам', () => {
    tree({ defaultExpandedIds: ['src'] })
    const src = screen.getByRole('treeitem', { name: /^src/ })
    src.focus()
    fireEvent.keyDown(src, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: /components/ }))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: /^src/ }))
  })

  it('Home/End прыгают к первому/последнему видимому', () => {
    tree({ defaultExpandedIds: ['src', 'comp'] })
    const src = screen.getByRole('treeitem', { name: /^src/ })
    src.focus()
    fireEvent.keyDown(src, { key: 'End' })
    expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: /package.json/ }))
    fireEvent.keyDown(document.activeElement!, { key: 'Home' })
    expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: /^src/ }))
  })

  it('Enter выбирает узел', () => {
    const onSelect = vi.fn()
    tree({ onSelect })
    const pkg = screen.getByRole('treeitem', { name: /package.json/ })
    pkg.focus()
    fireEvent.keyDown(pkg, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('pkg')
  })

  it('клик выбирает; выбранный — aria-selected', async () => {
    const onSelect = vi.fn()
    tree({ onSelect, selectedId: 'pkg' })
    expect(screen.getByRole('treeitem', { name: /package.json/ })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByRole('treeitem', { name: /^src/ }))
    expect(onSelect).toHaveBeenCalledWith('src')
  })

  it('шеврон объявлен целью указателя, лист — распорка без объявления (DS-353)', () => {
    const { container } = tree({ checkable: true })
    const toggle = container.querySelector('.ds-tree__toggle')!
    expect(toggle, 'узел с детьми обязан нести шеврон').toBeTruthy()
    // `scanTargets` узнаёт цель по тегу, по роли или по объявлению. У span нет
    // ни того, ни другого: без атрибута замер не судит шеврон вовсе, и мутация
    // «шеврон 16×16» осталась бы зелёной.
    expect(toggle).toHaveAttribute('data-ds-target')
    expect(container.querySelector('.ds-tree__check')).toHaveAttribute('data-ds-target')
    // Лист нажатия не принимает, и объявление на нём соврало бы замеру про
    // цель, которой нет. Отсюда свой класс, а не модификатор шеврона.
    const gutter = container.querySelector('.ds-tree__gutter')!
    expect(gutter, 'лист обязан нести распорку').toBeTruthy()
    expect(gutter).not.toHaveAttribute('data-ds-target')
    expect(gutter.querySelector('svg'), 'у листа нет знака раскрытия').toBeNull()
  })

  it('клик по шеврону раскрывает, не выбирая', async () => {
    const onSelect = vi.fn()
    const { container } = tree({ onSelect })
    await userEvent.click(container.querySelector('.ds-tree__toggle')!)
    expect(screen.getByRole('treeitem', { name: /^src/ })).toHaveAttribute('aria-expanded', 'true')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('disabled узел не выбирается', () => {
    const onSelect = vi.fn()
    render(<Tree aria-label="t" onSelect={onSelect} nodes={[{ id: 'a', label: 'A', disabled: true }]} />)
    const a = screen.getByRole('treeitem', { name: 'A' })
    expect(a).toHaveAttribute('aria-disabled', 'true')
    fireEvent.keyDown(a, { key: 'Enter' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('renderItem подменяет элемент строки', () => {
    tree({ renderItem: (n: TreeNode, p: object) => <a href={`/${n.id}`} {...p} /> })
    expect(screen.getByRole('treeitem', { name: /^src/ }).tagName).toBe('A')
  })
})

describe('Tree: чекбоксы (tri-state)', () => {
  const checkTree = (props = {}) =>
    render(<Tree nodes={nodes} aria-label="t" checkable defaultExpandedIds={['src', 'comp']} {...props} />)

  it('role=tree помечен multiselectable при checkable', () => {
    checkTree({ selectedIds: [] })
    expect(screen.getByRole('tree')).toHaveAttribute('aria-multiselectable', 'true')
  })

  it('Space на ветке каскадит на её листья', () => {
    const onSelectionChange = vi.fn()
    checkTree({ selectedIds: [], onSelectionChange })
    const src = screen.getByRole('treeitem', { name: /^src/ })
    src.focus()
    fireEvent.keyDown(src, { key: ' ' })
    expect(onSelectionChange).toHaveBeenCalledTimes(1)
    const arg = onSelectionChange.mock.calls[0]![0]
    expect(arg).toEqual(expect.arrayContaining(['btn', 'idx']))
    expect(arg).toHaveLength(2)
  })

  it('частично отмеченная ветка — aria-checked=mixed', () => {
    checkTree({ selectedIds: ['btn'] }) // btn отмечен, idx нет → src mixed
    expect(screen.getByRole('treeitem', { name: /^src/ })).toHaveAttribute('aria-checked', 'mixed')
  })

  it('лист-потомок отмечает свою ветку целиком, если он единственный', () => {
    checkTree({ selectedIds: ['btn'] }) // comp содержит только btn → comp checked
    expect(screen.getByRole('treeitem', { name: /components/ })).toHaveAttribute('aria-checked', 'true')
  })

  it('полностью отмеченная ветка — aria-checked=true', () => {
    checkTree({ selectedIds: ['btn', 'idx'] })
    expect(screen.getByRole('treeitem', { name: /^src/ })).toHaveAttribute('aria-checked', 'true')
  })

  it('Space снимает отметку с полностью отмеченной ветки', () => {
    const onSelectionChange = vi.fn()
    checkTree({ selectedIds: ['btn', 'idx'], onSelectionChange })
    const src = screen.getByRole('treeitem', { name: /^src/ })
    src.focus()
    fireEvent.keyDown(src, { key: ' ' })
    expect(onSelectionChange).toHaveBeenCalledWith([])
  })

  it('Enter по-прежнему выбирает, не трогая чекбокс', () => {
    const onSelect = vi.fn()
    const onSelectionChange = vi.fn()
    checkTree({ selectedIds: [], onSelect, onSelectionChange })
    const pkg = screen.getByRole('treeitem', { name: /package.json/ })
    pkg.focus()
    fireEvent.keyDown(pkg, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('pkg')
    expect(onSelectionChange).not.toHaveBeenCalled()
  })

  it('без checkable aria-checked не проставляется', () => {
    tree({ defaultExpandedIds: ['src'] })
    expect(screen.getByRole('treeitem', { name: /^src/ })).not.toHaveAttribute('aria-checked')
  })
})

describe('Tree: фильтрация', () => {
  it('прячет неподходящие, оставляет предков и авто-раскрывает', () => {
    tree({ filter: 'button' })
    expect(screen.getByRole('treeitem', { name: /Button.tsx/ })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: /components/ })).toBeInTheDocument() // предок
    expect(screen.getByRole('treeitem', { name: /^src/ })).toBeInTheDocument()        // предок
    expect(screen.queryByRole('treeitem', { name: /package.json/ })).toBeNull()       // не матч
    expect(screen.queryByRole('treeitem', { name: /index.ts/ })).toBeNull()           // не матч
  })

  it('регистр не важен', () => {
    tree({ filter: 'BUTTON' })
    expect(screen.getByRole('treeitem', { name: /Button.tsx/ })).toBeInTheDocument()
  })

  it('пустой фильтр — обычное дерево (по умолчанию свёрнуто)', () => {
    tree({ filter: '' })
    expect(screen.queryByRole('treeitem', { name: /components/ })).toBeNull()
  })

  it('матч по filterText, когда label не строка', () => {
    render(
      <Tree
        aria-label="t"
        nodes={[{ id: 'x', label: <b>жирный</b>, filterText: 'секрет' }, { id: 'y', label: <b>другой</b>, filterText: 'прочее' }]}
        filter="секрет"
      />,
    )
    expect(screen.getByRole('treeitem', { name: /жирный/ })).toBeInTheDocument()
    expect(screen.queryByRole('treeitem', { name: /другой/ })).toBeNull()
  })
})

describe('Tree: drag-n-drop (клавиатура)', () => {
  const move = (props = {}, key: string, name: RegExp) => {
    const onMove = vi.fn()
    render(<Tree nodes={nodes} aria-label="t" onMove={onMove} defaultExpandedIds={['src', 'comp']} {...props} />)
    const el = screen.getByRole('treeitem', { name })
    el.focus()
    fireEvent.keyDown(el, { key, ctrlKey: true })
    return onMove
  }

  it('Ctrl+ArrowDown переносит после следующего соседа', () => {
    expect(move({}, 'ArrowDown', /^src/)).toHaveBeenCalledWith('src', 'pkg', 'after')
  })
  it('Ctrl+ArrowUp переносит перед предыдущим соседом', () => {
    expect(move({}, 'ArrowUp', /package.json/)).toHaveBeenCalledWith('pkg', 'src', 'before')
  })
  it('Ctrl+ArrowLeft выносит к деду (после родителя)', () => {
    expect(move({}, 'ArrowLeft', /components/)).toHaveBeenCalledWith('comp', 'src', 'after')
  })
  it('Ctrl+ArrowRight вкладывает в предыдущего соседа', () => {
    expect(move({}, 'ArrowRight', /index.ts/)).toHaveBeenCalledWith('idx', 'comp', 'inside')
  })
  it('нет предыдущего соседа — ArrowUp не зовёт', () => {
    expect(move({}, 'ArrowUp', /^src/)).not.toHaveBeenCalled()
  })
  it('нет родителя — ArrowLeft не зовёт', () => {
    expect(move({}, 'ArrowLeft', /^src/)).not.toHaveBeenCalled()
  })
  it('без onMove Ctrl+стрелка не двигает фокус (ctrl зарезервирован)', () => {
    render(<Tree nodes={nodes} aria-label="t" defaultExpandedIds={['src']} />)
    const src = screen.getByRole('treeitem', { name: /^src/ })
    src.focus()
    fireEvent.keyDown(src, { key: 'ArrowDown', ctrlKey: true })
    expect(document.activeElement).toBe(src)
  })
})

describe('Tree: tree-grid (колонки)', () => {
  const columns = [
    { id: 'size', header: 'Размер', render: (n: TreeNode) => n.cells?.size ?? '' },
    { id: 'mod', header: 'Изменён' },
  ]
  const gridNodes: TreeNode[] = [
    { id: 'src', label: 'src', cells: { size: '—', mod: '01.08' }, children: [
      { id: 'idx', label: 'index.ts', cells: { size: '2 КБ', mod: '31.07' } },
    ] },
  ]
  const grid = (props = {}) =>
    render(<Tree nodes={gridNodes} columns={columns} treeColumnHeader="Файл" defaultExpandedIds={['src']} aria-label="Файлы" {...props} />)

  it('контейнер treegrid; шапка из columnheader; ячейки gridcell', () => {
    grid()
    expect(screen.getByRole('treegrid', { name: 'Файлы' })).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Файл', 'Размер', 'Изменён'])
    expect(screen.getAllByRole('gridcell').length).toBeGreaterThan(0)
  })

  it('строка узла — role=row с уровнем и раскрытием; первая ячейка — rowheader', () => {
    grid()
    const rows = screen.getAllByRole('row')
    // rows[0] — шапка; rows[1] — src
    const src = rows.find((r) => r.textContent?.includes('src'))!
    expect(src).toHaveAttribute('aria-level', '1')
    expect(src).toHaveAttribute('aria-expanded', 'true')
    expect(src.querySelector('[role="rowheader"]')).not.toBeNull()
  })

  it('значения колонок берутся из render/cells', () => {
    grid()
    expect(screen.getByRole('gridcell', { name: '2 КБ' })).toBeInTheDocument()
    expect(screen.getByRole('gridcell', { name: '31.07' })).toBeInTheDocument()
  })

  it('клавиатура работает и в grid-режиме', () => {
    grid()
    const rows = screen.getAllByRole('row')
    const src = rows.find((r) => r.textContent?.includes('src'))!
    src.focus()
    fireEvent.keyDown(src, { key: 'ArrowDown' })
    const idxRow = screen.getAllByRole('row').find((r) => r.textContent?.includes('index.ts'))!
    expect(document.activeElement).toBe(idxRow)
  })
})

/**
 * Ширина колонки — размер интерфейса, а высота строки дерева задана как
 * `calc(1.75rem * var(--ds-ui-scale))` и едет всегда. Пока `TreeColumn.width`
 * был только строкой, единственный пример в системе (превью дизайн-агента)
 * показывал голое `'90px'`: под `.ds-scale` строки вырастали, колонки стояли
 * (DS-83, тот же дефект, что DS-82 в `DataTable`).
 *
 * Проверяется трек в `--ds-tree-cols` — единственное место, где ширина колонки
 * вообще выражена: раскладка грида читает эту переменную.
 */
describe('Tree: ширина колонки и масштаб', () => {
  const gridNodes: TreeNode[] = [{ id: 'pkg', label: 'package.json', cells: { size: '1,1 КБ' } }]
  const cols = (columns: TreeColumn[]) => {
    render(<Tree nodes={gridNodes} columns={columns} treeColumnHeader="Имя" aria-label="Файлы" />)
    return screen.getByRole('treegrid').style.getPropertyValue('--ds-tree-cols')
  }

  it('числовая ширина едет по --ds-ui-scale', () => {
    expect(cols([{ id: 'size', header: 'Размер', width: 90 }]))
      .toBe('minmax(0, 1fr) calc(90px * var(--ds-ui-scale, 1))')
  })

  it('строка форвардится дословно — ширину без масштаба просят строкой', () => {
    expect(cols([{ id: 'size', header: 'Размер', width: 'max-content' }]))
      .toBe('minmax(0, 1fr) max-content')
  })

  // Пара, а не два отдельных случая: `auto` и нулевой трек обязаны быть
  // различимы. На `c.width || 'auto'` они схлопываются в одно, и каждое
  // утверждение порознь этого не видит — колонка-нитка молча становится auto.
  it('нулевая ширина — нулевой трек, отсутствие ширины — auto', () => {
    expect(cols([{ id: 'mark', header: '', width: 0 }]))
      .toBe('minmax(0, 1fr) calc(0px * var(--ds-ui-scale, 1))')
    cleanup()
    expect(cols([{ id: 'mark', header: '' }])).toBe('minmax(0, 1fr) auto')
  })
})

describe('Tree: контролируемое раскрытие', () => {
  it('контролируемый: зовёт onExpandedChange, но не раскрывает сам', async () => {
    const onExpandedChange = vi.fn()
    const { container } = tree({ expandedIds: [], onExpandedChange })
    await userEvent.click(container.querySelector('.ds-tree__toggle')!)
    expect(onExpandedChange).toHaveBeenCalledTimes(1)
    expect(onExpandedChange).toHaveBeenCalledWith(['src'])
    expect(screen.getByRole('treeitem', { name: /^src/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('treeitem', { name: /components/ })).toBeNull()
  })

  it('контролируемый: хост раскрывает и сворачивает снаружи', () => {
    const { rerender } = tree({ expandedIds: [] })
    expect(screen.queryByRole('treeitem', { name: /components/ })).toBeNull()
    rerender(<Tree nodes={nodes} aria-label="Файлы" expandedIds={['src']} />)
    expect(screen.getByRole('treeitem', { name: /^src/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('treeitem', { name: /components/ })).toBeInTheDocument()
    rerender(<Tree nodes={nodes} aria-label="Файлы" expandedIds={[]} />)
    expect(screen.getByRole('treeitem', { name: /^src/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('treeitem', { name: /components/ })).toBeNull()
  })

  it('неконтролируемый: onExpandedChange уведомляет, DOM меняется сам', () => {
    const onExpandedChange = vi.fn()
    tree({ onExpandedChange })
    const src = screen.getByRole('treeitem', { name: /^src/ })
    src.focus()
    fireEvent.keyDown(src, { key: 'ArrowRight' })
    expect(screen.getByRole('treeitem', { name: /^src/ })).toHaveAttribute('aria-expanded', 'true')
    expect(onExpandedChange).toHaveBeenCalledWith(['src'])
  })

  // Неконтролируемое раскрытие кликом уведомляет хост РОВНО раз: двойное
  // уведомление прошло бы незамеченным без toHaveBeenCalledTimes (DS-12).
  it('неконтролируемое раскрытие кликом уведомляет хост ровно раз', () => {
    const onExpandedChange = vi.fn()
    render(<Tree nodes={nodes} aria-label="Файлы" onExpandedChange={onExpandedChange} />)
    const toggle = screen.getByRole('treeitem', { name: /^src/ }).querySelector('.ds-tree__toggle')!
    fireEvent.click(toggle)
    expect(onExpandedChange).toHaveBeenCalledTimes(1)
    expect(onExpandedChange).toHaveBeenCalledWith(['src'])
  })

  // Сворачивание кликом в контролируемом режиме (Tree.tsx:190 expanded.filter).
  it('контролируемое сворачивание кликом уведомляет с обновлённым списком', () => {
    const onExpandedChange = vi.fn()
    render(<Tree nodes={nodes} aria-label="Файлы" expandedIds={['src']} onExpandedChange={onExpandedChange} />)
    const toggle = screen.getByRole('treeitem', { name: /^src/ }).querySelector('.ds-tree__toggle')!
    fireEvent.click(toggle)
    expect(onExpandedChange).toHaveBeenCalledWith([])
  })
})
