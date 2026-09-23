import { Fragment, useMemo, useRef, useState } from 'react'
import { Caret } from '../../internal/caret.js'
import { colWidth } from '../../internal/columns.js'
import { flatten, filteredFlatten, leafIds, locate, isAncestor, checkStateOf } from './model.js'
import type { FlatNode, CheckState } from './model.js'
import './Tree.css'
import { Icon } from '../../icons/index.js'

export interface TreeNode {
  id: string
  label: React.ReactNode
  icon?: React.ReactNode
  children?: TreeNode[]
  disabled?: boolean
  /** Текст для фильтра, если `label` — не строка. */
  filterText?: string
  /** Значения дополнительных колонок в режиме tree-grid, по `column.id`. */
  cells?: Record<string, React.ReactNode>
}

export interface TreeColumn {
  id: string
  header: React.ReactNode
  /**
   * Ширина колонки: число (пиксели интерфейса) или любое CSS-значение трека
   * грида (`'12rem'`, `'20%'`, `'max-content'`, `'minmax(0, 1fr)'`).
   *
   * Разбор общий с `DataTable` (`colWidth`): число едет по `--ds-ui-scale`,
   * строка форвардится дословно. Высота строки дерева задана как
   * `calc(1.75rem * var(--ds-ui-scale))`, то есть едет всегда — и голое
   * `'90px'` под `.ds-scale` давало ровно тот разъезд, ради которого ширину и
   * задавали: строки выросли, колонки стоят (DS-83).
   *
   * Строка остаётся выразимой намеренно: доля и `max-content` числом не
   * записываются, и потребитель, которому нужна ширина БЕЗ масштаба, просит её
   * строкой — как в `Skeleton`.
   *
   * Колонка без `width` получает трек `auto`. Признак — ЗАДАННОСТЬ, а не
   * истинность: `width: 0` (колонка-нитка под маркер) — законное значение и
   * даёт нулевой трек, а не `auto`.
   */
  width?: number | string
  align?: 'start' | 'end'
  /** Кастомный рендер ячейки; по умолчанию — `node.cells[column.id]`. */
  render?: (node: TreeNode) => React.ReactNode
}

export type TreeDropPosition = 'before' | 'after' | 'inside'

export interface TreeRenderProps {
  role: 'treeitem'
  'aria-level': number
  'aria-expanded'?: boolean
  'aria-selected': boolean
  'aria-checked'?: true | false | 'mixed'
  'aria-disabled'?: true
  tabIndex: number
  className: string
  children: React.ReactNode
  onClick: () => void
}

export interface TreeProps {
  nodes: TreeNode[]
  expandedIds?: string[]
  defaultExpandedIds?: string[]
  onExpandedChange?: (ids: string[]) => void
  selectedId?: string
  onSelect?: (id: string) => void
  /** Включить чекбоксы с трёхстостоянием у веток. */
  checkable?: boolean
  /** Отмеченные **листья** (контролируемо); состояние веток вычисляется. */
  selectedIds?: string[]
  onSelectionChange?: (ids: string[]) => void
  /**
   * Фильтр: показывать узлы, чей `filterText ?? label` содержит подстроку
   * (регистронезависимо), и всех их предков; подходящие ветки авто-раскрыты.
   */
  filter?: string
  /**
   * Включает перенос узлов: перетаскивание мышью и `Ctrl+стрелки`
   * (↓/↑ — среди соседей, ← вынести к деду, → вложить в предыдущего). Дерево
   * само данные не меняет — новый порядок применяет потребитель.
   */
  onMove?: (dragId: string, targetId: string, position: TreeDropPosition) => void
  /** Доп. колонки справа. Задание переключает дерево в режим `treegrid`. */
  columns?: TreeColumn[]
  /** Заголовок колонки дерева в шапке grid-режима. */
  treeColumnHeader?: React.ReactNode
  /**
   * Шов под роутер: **подменяет элемент строки узла**, а не оборачивает наш —
   * один интерактивный элемент и один таб-стоп на узел (как у `Tabs`). Шеврон,
   * иконка и подпись приходят в `children`.
   */
  renderItem?: (node: TreeNode, props: TreeRenderProps) => React.ReactNode
  className?: string
  id?: string
  'aria-label'?: string
}

export function Tree({
  nodes, expandedIds, defaultExpandedIds = [], onExpandedChange,
  selectedId, onSelect, checkable = false, selectedIds, onSelectionChange, filter, onMove,
  columns, treeColumnHeader, renderItem, className, id, 'aria-label': ariaLabel,
}: TreeProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const [selfExpanded, setSelfExpanded] = useState<string[]>(defaultExpandedIds)
  const expanded = expandedIds ?? selfExpanded
  const expandedSet = useMemo(() => new Set(expanded), [expanded])
  const flat = useMemo(
    () => (filter ? filteredFlatten(nodes, filter.toLowerCase()) : flatten(nodes, expandedSet)),
    [nodes, expandedSet, filter],
  )

  // Роуминг: один фокусируемый узел. По умолчанию — выбранный либо первый.
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const activeId = focusedId ?? selectedId ?? flat[0]?.node.id ?? null

  function setExpanded(next: string[]) {
    onExpandedChange?.(next)
    if (expandedIds == null) setSelfExpanded(next)
  }
  function setOpen(nodeId: string, open: boolean) {
    if (open === expandedSet.has(nodeId)) return
    setExpanded(open ? [...expanded, nodeId] : expanded.filter((x) => x !== nodeId))
  }

  const checkedSet = useMemo(() => new Set(selectedIds ?? []), [selectedIds])
  function toggleCheck(node: TreeNode) {
    const leaves = leafIds(node)
    const set = new Set(checkedSet)
    // Полностью отмеченную ветку/лист снимаем, иначе — доставляем все листья.
    if (checkStateOf(node, checkedSet) === true) leaves.forEach((l) => set.delete(l))
    else leaves.forEach((l) => set.add(l))
    onSelectionChange?.([...set])
  }

  const indexOf = (nodeId: string | null) => flat.findIndex((f) => f.node.id === nodeId)
  function focusIndex(i: number) {
    const f = flat[i]
    if (!f) return
    setFocusedId(f.node.id)
    listRef.current?.querySelectorAll<HTMLElement>('.ds-tree__item')[i]?.focus()
  }
  // Текущий узел — по реальному DOM-фокусу (устойчиво к прямому .focus() и Tab),
  // с откатом на роуминг-активный.
  function currentIndex(): number {
    const items = listRef.current
      ? Array.from(listRef.current.querySelectorAll<HTMLElement>('.ds-tree__item'))
      : []
    const domI = items.indexOf(document.activeElement as HTMLElement)
    return domI >= 0 ? domI : indexOf(activeId)
  }

  const ARROWS = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']
  function moveByKeyboard(nodeId: string, key: string) {
    const loc = locate(nodes, nodeId)
    if (!loc) return
    const { parent, siblings, index } = loc
    if (key === 'ArrowDown') { const next = siblings[index + 1]; if (next) onMove!(nodeId, next.id, 'after') }
    else if (key === 'ArrowUp') { const prev = siblings[index - 1]; if (prev) onMove!(nodeId, prev.id, 'before') }
    else if (key === 'ArrowLeft') { if (parent) onMove!(nodeId, parent.id, 'after') }
    else if (key === 'ArrowRight') { const prev = siblings[index - 1]; if (prev) onMove!(nodeId, prev.id, 'inside') }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const i = currentIndex()
    if (i < 0) return
    const cur = flat[i]!
    // Ctrl+стрелка — перенос узла (если включён onMove). Ctrl зарезервирован:
    // без onMove модификатор глушит обычную навигацию.
    if (e.ctrlKey) {
      if (ARROWS.includes(e.key)) {
        e.preventDefault()
        if (onMove && !cur.node.disabled) moveByKeyboard(cur.node.id, e.key)
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); focusIndex(Math.min(i + 1, flat.length - 1)); break
      case 'ArrowUp': e.preventDefault(); focusIndex(Math.max(i - 1, 0)); break
      case 'Home': e.preventDefault(); focusIndex(0); break
      case 'End': e.preventDefault(); focusIndex(flat.length - 1); break
      case 'ArrowRight':
        e.preventDefault()
        if (cur.hasChildren && !cur.expanded) setOpen(cur.node.id, true)
        else if (cur.hasChildren && cur.expanded) focusIndex(i + 1)
        break
      case 'ArrowLeft':
        e.preventDefault()
        if (cur.hasChildren && cur.expanded) setOpen(cur.node.id, false)
        else if (cur.parentId) focusIndex(indexOf(cur.parentId))
        break
      case 'Enter':
        e.preventDefault()
        if (!cur.node.disabled) onSelect?.(cur.node.id)
        break
      case ' ':
        e.preventDefault()
        if (cur.node.disabled) break
        // При чекбоксах Space переключает отметку, иначе — выбирает узел.
        if (checkable) toggleCheck(cur.node)
        else onSelect?.(cur.node.id)
        break
    }
  }

  // --- Перенос мышью: pointer-события без библиотек, делегирование на контейнере ---
  const dragRef = useRef<{ id: string; x: number; y: number; started: boolean } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ index: number; pos: TreeDropPosition } | null>(null)

  function itemsInDom(): HTMLElement[] {
    return listRef.current ? Array.from(listRef.current.querySelectorAll<HTMLElement>('.ds-tree__item')) : []
  }
  function onPointerDown(e: React.PointerEvent) {
    if (!onMove || e.button !== 0) return
    const idx = itemsInDom().indexOf((e.target as HTMLElement).closest('.ds-tree__item') as HTMLElement)
    if (idx < 0 || flat[idx]!.node.disabled) return
    dragRef.current = { id: flat[idx]!.node.id, x: e.clientX, y: e.clientY, started: false }
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    if (!d.started) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return
      d.started = true
      setDragId(d.id)
    }
    const item = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.ds-tree__item') as HTMLElement | null
    const idx = item ? itemsInDom().indexOf(item) : -1
    if (!item || idx < 0) { setDrop(null); return }
    const target = flat[idx]!
    // Нельзя бросить узел в самого себя или в собственное поддерево.
    if (target.node.id === d.id || isAncestor(nodes, d.id, target.node.id)) { setDrop(null); return }
    const rect = item.getBoundingClientRect()
    const rel = rect.height ? (e.clientY - rect.top) / rect.height : 0.5
    const pos: TreeDropPosition = target.hasChildren && rel > 0.33 && rel < 0.67
      ? 'inside'
      : rel < 0.5 ? 'before' : 'after'
    setDrop({ index: idx, pos })
  }
  function onPointerUp() {
    const d = dragRef.current
    const dr = drop
    dragRef.current = null
    setDragId(null); setDrop(null)
    if (!d || !d.started || !dr || !onMove) return
    onMove(d.id, flat[dr.index]!.node.id, dr.pos)
  }

  const grid = !!columns?.length

  // Содержимое колонки дерева: отступ по уровню, шеврон, чекбокс, иконка, подпись.
  function treeCell(f: FlatNode, checkState: CheckState | null) {
    const { node, level, hasChildren, expanded: isOpen } = f
    return (
      <span className="ds-tree__row" style={{ paddingLeft: `calc(${level - 1} * var(--ds-space-6))` }}>
        {hasChildren ? (
          <span
            className="ds-tree__toggle"
            aria-hidden="true"
            // Тогл — не отдельный таб-стоп: клавиатура раскрывает стрелками, span под мышь.
            // ЦЕЛЬ ОБЪЯВЛЕНА (DS-353): ни тега, ни роли у него нет, и мимо
            // `scanTargets` он ехал в обоих указателях — а раскрыть ветку
            // указателем больше нечем, клик по строке выделяет узел.
            data-ds-target=""
            onClick={(ev) => { ev.stopPropagation(); setOpen(node.id, !isOpen) }}
          >
            <Caret kind="branch" open={isOpen} />
          </span>
        ) : (
          // Лист получил СВОЙ класс, а не модификатор шеврона (был
          // `.ds-tree__toggle.is-leaf`): под целью и под пустым местом стоят
          // разные утверждения. Объявление цели привязано к классу — и гейтом
          // `preview-classes`, и глазами читающего, — так что класс, который
          // носят и цель, и не-цель, требует атрибут там, где нажимать нечего.
          <span className="ds-tree__gutter" aria-hidden="true" />
        )}
        {checkable && (
          <span
            className={['ds-tree__check', checkState === true && 'is-checked', checkState === 'mixed' && 'is-mixed'].filter(Boolean).join(' ')}
            aria-hidden="true"
            // Объявление безусловно, включая отключённый узел: `scanTargets`
            // судит отключённую цель по размеру и не судит по попаданию, а
            // размер у флажка один и тот же.
            data-ds-target=""
            onClick={node.disabled ? undefined : (ev) => { ev.stopPropagation(); toggleCheck(node) }}
          />
        )}
        {node.icon && <Icon className="ds-tree__icon" aria-hidden="true">{node.icon}</Icon>}
        <span className="ds-tree__label">{node.label}</span>
      </span>
    )
  }

  // Общие атрибуты строки (без role/children) — одни для tree и grid.
  function rowCommon(f: FlatNode, idx: number) {
    const { node, level, hasChildren, expanded: isOpen } = f
    const selected = node.id === selectedId
    const checkState = checkable ? checkStateOf(node, checkedSet) : null
    const dropHere = drop?.index === idx ? drop.pos : null
    return {
      checkState,
      attrs: {
        'aria-level': level,
        ...(hasChildren ? { 'aria-expanded': isOpen } : {}),
        'aria-selected': selected,
        ...(checkState != null ? { 'aria-checked': checkState } : {}),
        ...(node.disabled ? { 'aria-disabled': true as const } : {}),
        // Роуминг: в порядок табуляции попадает один узел; disabled — никогда.
        tabIndex: node.id === activeId && !node.disabled ? 0 : -1,
        className: [
          'ds-tree__item', grid && 'ds-tree__item--grid',
          selected && 'is-selected', node.disabled && 'is-disabled',
          dragId === node.id && 'is-dragging', dropHere && `is-drop-${dropHere}`,
        ].filter(Boolean).join(' '),
        onClick: node.disabled ? () => {} : () => { setFocusedId(node.id); onSelect?.(node.id) },
      },
    }
  }

  const template = grid
    ? ['minmax(0, 1fr)', ...columns!.map((c) => (c.width === undefined ? 'auto' : colWidth(c.width)))].join(' ')
    : undefined

  return (
    <div
      ref={listRef} id={id} role={grid ? 'treegrid' : 'tree'} aria-label={ariaLabel}
      {...(checkable ? { 'aria-multiselectable': true } : {})}
      className={['ds-tree', grid && 'ds-tree--grid', dragId && 'is-dragging', className].filter(Boolean).join(' ')}
      style={grid ? ({ ['--ds-tree-cols']: template } as React.CSSProperties) : undefined}
      onKeyDown={onKeyDown}
      onPointerDown={onMove ? onPointerDown : undefined}
      onPointerMove={onMove ? onPointerMove : undefined}
      onPointerUp={onMove ? onPointerUp : undefined}
      onPointerLeave={onMove ? onPointerUp : undefined}
    >
      {grid && (
        <div className="ds-tree__gridhead" role="row">
          <span role="columnheader" className="ds-tree__cell ds-tree__cell--tree">{treeColumnHeader}</span>
          {columns!.map((c) => (
            <span key={c.id} role="columnheader" className="ds-tree__cell" style={c.align === 'end' ? { textAlign: 'end' } : undefined}>{c.header}</span>
          ))}
        </div>
      )}
      {flat.map((f, idx) => {
        const { node } = f
        const { checkState, attrs } = rowCommon(f, idx)
        const inner = treeCell(f, checkState)
        if (grid) {
          return (
            <div key={node.id} role="row" {...attrs}>
              <span role="rowheader" className="ds-tree__cell ds-tree__cell--tree">{inner}</span>
              {columns!.map((c) => (
                <span key={c.id} role="gridcell" className="ds-tree__cell" style={c.align === 'end' ? { textAlign: 'end' } : undefined}>
                  {c.render ? c.render(node) : node.cells?.[c.id]}
                </span>
              ))}
            </div>
          )
        }
        const props: TreeRenderProps = { role: 'treeitem', ...attrs, children: inner }
        return renderItem
          ? <Fragment key={node.id}>{renderItem(node, props)}</Fragment>
          : <div key={node.id} {...props} />
      })}
    </div>
  )
}
