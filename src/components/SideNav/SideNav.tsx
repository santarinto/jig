import { useEffect, useMemo, useRef, useState } from 'react'
import { Caret } from '../../internal/caret.js'
import { useAnchoredPosition } from '../../internal/useAnchoredPosition.js'
import { useDismiss } from '../../internal/useDismiss.js'
import { usePopupLayer } from '../../internal/usePopupLayer.js'
import './SideNav.css'
import { Icon } from '../../icons/index.js'

export interface SideNavItem {
  id: string
  label: string
  icon?: React.ReactNode
  /** Counter shown on the right (unread, pending, …). */
  count?: number
  /** Sub-items. A parent with children toggles them instead of being selected. */
  children?: SideNavItem[]
  disabled?: boolean
}

export interface SideNavGroup {
  id: string
  /** Uppercase caption above the group. Hidden while collapsed. */
  title?: string
  items: SideNavItem[]
  /** Draw a hairline above this group. */
  separator?: boolean
}

export interface SideNavProps {
  groups: SideNavGroup[]
  selectedId: string
  onSelect?: (id: string) => void
  /**
   * Icons only. Labels move to the native title, so items stay nameable — и
   * счётчик уходит туда же, ЧИСЛОМ, а на самом пункте остаётся точка. Ветка в
   * этом режиме раскрывается всплывающим подменю, а не выбирается.
   */
  collapsed?: boolean
  /** Panel width in px when expanded (default 212). */
  width?: number
  /** Product name in the header; omit to drop the header entirely. */
  title?: string
  /** Short mark next to the title, e.g. a logo glyph. */
  mark?: React.ReactNode
  /**
   * Шов под роутер: **подменяет элемент пункта**, а не оборачивает наш.
   *
   * ```tsx
   * renderItem={(item, props) => <Link to={`/${item.id}`} {...props} />}
   * ```
   *
   * До 1.17.0 шов отдавал готовую `<button>` и документировал обёртку
   * `<Link>{inner}</Link>`. Это давало `<a><button>`: содержимое `<a>` не может
   * быть интерактивным, а замер показывал **два таб-стопа на один пункт** —
   * панель из десяти пунктов требовала двадцати нажатий Tab, и на каждом втором
   * скринридер объявлял элемент, который никуда не ведёт. Средний клик и
   * открытие в новой вкладке при этом работали непредсказуемо: событие сначала
   * доставалось кнопке — то есть шов не давал того, ради чего его брали.
   *
   * Ветка с детьми остаётся кнопкой всегда: она раскрывает поддерево, а не
   * ведёт по ссылке, и `renderItem` её не получает. Листья ВНУТРИ всплывающего
   * подменю шву отдаются наравне с остальными: это те же разделы, и ссылками им
   * быть ровно так же нужно.
   */
  renderItem?: (item: SideNavItem, props: SideNavRenderProps) => React.ReactNode
  /** Branches open on first render (the active branch opens by itself). */
  defaultExpandedIds?: string[]
  className?: string
  id?: string
}

/**
 * Пропсы, которые пункт отдаёт потребителю в `renderItem`. Разложить их на свой
 * элемент — и он **становится** пунктом навигации.
 */
export interface SideNavRenderProps {
  className: string
  children: React.ReactNode
  title?: string
  tabIndex: number
  'aria-current'?: 'page'
  onClick: () => void
}

/** Ids of every ancestor of `selectedId`, so its branch can start open. */
function branchOf(groups: SideNavGroup[], selectedId: string): string[] {
  const trail: string[] = []
  const walk = (items: SideNavItem[], path: string[]): boolean =>
    items.some((it) => {
      if (it.id === selectedId) { trail.push(...path); return true }
      return it.children ? walk(it.children, [...path, it.id]) : false
    })
  walk(groups.flatMap((g) => g.items), [])
  return trail
}

/**
 * Имя пункта в иконочной рейке. Число входит В ИМЯ, а не остаётся картинкой:
 * точка на пункте говорит «непусто», а СКОЛЬКО — только здесь, и по-другому в
 * свёрнутом виде это не произносится вовсе.
 */
const nameOf = (item: SideNavItem) =>
  (item.count != null ? `${item.label}: ${item.count}` : item.label)

export function SideNav({
  groups, selectedId, onSelect, collapsed = false, width = 212,
  title, mark, renderItem, defaultExpandedIds = [], className, id,
}: SideNavProps) {
  const [expanded, setExpanded] = useState<string[]>(
    () => [...defaultExpandedIds, ...branchOf(groups, selectedId)],
  )
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Всплывающее подменю свёрнутой рейки: id раскрытой ветки или null.
  const [flyout, setFlyout] = useState<string | null>(null)
  const navRef = useRef<HTMLElement>(null)
  const flyoutRef = useRef<HTMLDivElement>(null)
  const flyoutAnchorRef = useRef<HTMLElement | null>(null)
  const zIndex = usePopupLayer(flyout !== null)

  const isOpen = (itemId: string) => expanded.includes(itemId)
  const toggle = (itemId: string) =>
    setExpanded((e) => (e.includes(itemId) ? e.filter((x) => x !== itemId) : [...e, itemId]))

  /**
   * Ветка активного пункта открывается и ПОСЛЕ монтирования (DS-242).
   *
   * `branchOf` считался только в инициализаторе `useState`, то есть один раз.
   * Смена `selectedId` снаружи — переход по ссылке из письма, «назад», любой
   * переход роутером — ветку не открывала, и активный пункт оказывался внутри
   * свёрнутой: ни ошибки, ни признака, панель выглядела так, будто ничего не
   * выбрано.
   *
   * Эффект ТОЛЬКО ДОБАВЛЯЕТ. Синхронизировать `expanded` с трассой целиком
   * (`setExpanded(trail)`) было бы проще и хуже: переход схлопнул бы всё, что
   * пользователь открыл руками, — то есть починка одного будничного сценария
   * сломала бы другой, ещё более будничный.
   *
   * Инициализатор `useState` при этом ОСТАЁТСЯ: без него первый кадр рисуется
   * со свёрнутой веткой, и на SSR — где эффектов нет вовсе — она такой и
   * уезжает к пользователю.
   */
  useEffect(() => {
    const trail = branchOf(groups, selectedId)
    if (!trail.length) return
    setExpanded((e) => (
      trail.every((tid) => e.includes(tid)) ? e : [...new Set([...e, ...trail])]
    ))
  }, [groups, selectedId])

  // Развернули панель — подменю больше не к чему привязывать: его якорь исчез.
  useEffect(() => { if (!collapsed) setFlyout(null) }, [collapsed])

  // Корень — вся `nav`, и подменю лежит ВНУТРИ неё, поэтому клик по подменю не
  // считается «мимо». Ровно ради этого `useAnchoredPosition` и считает
  // координаты вместо портала (см. его шапку).
  useDismiss({ enabled: flyout !== null, ref: navRef, onDismiss: () => setFlyout(null) })

  const anchored = useAnchoredPosition({
    enabled: flyout !== null,
    // Строка задаёт ВЫСОТУ, панель — СТОРОНУ (DS-243). Считай сторону от
    // плашки ветки, подменю уезжало бы внутрь панели: плашка утоплена на
    // падинг, а стоит рейке прокрутиться — ещё на ширину полосы прокрутки.
    // Замерено на шкале 1.5 в кадре 380px: 9.66px внутрь.
    anchorRef: flyoutAnchorRef,
    sideAnchorRef: navRef,
    floatingRef: flyoutRef,
    // Рейка растёт вниз и прижата к краю экрана — подменю выходит ВБОК, и
    // сторона здесь не предпочтение, а единственная, где есть место.
    side: 'right',
    align: 'start',
  })

  // Flat list of what is currently on screen — the order the arrow keys follow.
  const visible = useMemo(() => {
    const out: { item: SideNavItem; depth: number }[] = []
    const push = (items: SideNavItem[], depth: number) => {
      for (const it of items) {
        out.push({ item: it, depth })
        if (it.children && !collapsed && isOpen(it.id)) push(it.children, depth + 1)
      }
    }
    for (const g of groups) push(g.items, 0)
    return out
  }, [groups, expanded, collapsed])

  function onKeyDown(e: React.KeyboardEvent) {
    const from = btnRefs.current.findIndex((el) => el === document.activeElement)
    if (from < 0) return
    let ni = -1
    if (e.key === 'ArrowDown') ni = Math.min(from + 1, visible.length - 1)
    else if (e.key === 'ArrowUp') ni = Math.max(from - 1, 0)
    else if (e.key === 'Home') ni = 0
    else if (e.key === 'End') ni = visible.length - 1
    else return
    e.preventDefault()
    btnRefs.current[ni]?.focus()
  }

  /**
   * `inFlyout` — пункт нарисован ВНУТРИ всплывающего подменю, где места столько
   * же, сколько в развёрнутой панели. Свёрнутость там не действует, поэтому
   * решает не `collapsed`, а `iconOnly`: иначе подменю рисовало бы иконки без
   * подписей, то есть повторяло бы рейку вместо того, чтобы её раскрывать.
   */
  function renderRow(item: SideNavItem, depth: number, inFlyout = false) {
    const active = item.id === selectedId
    const hasChildren = !!item.children?.length
    const iconOnly = collapsed && !inFlyout
    const railBranch = iconOnly && hasChildren
    const index = inFlyout ? -1 : visible.findIndex((v) => v.item.id === item.id)

    const shared = {
      className: [
          'ds-sidenav__item',
          active && 'is-active',
          depth > 0 && 'ds-sidenav__item--child',
      ].filter(Boolean).join(' '),
      title: iconOnly ? nameOf(item) : undefined,
      tabIndex: active ? 0 : -1,
      'aria-current': active ? ('page' as const) : undefined,
      onClick: () => {
        // Три исхода, и ветка в рейке — третий, а не «лист по умолчанию».
        // Раньше её `onClick` проваливался в `onSelect(item.id)`: своей
        // страницы у ветки нет, и потребитель получал id, на который ему
        // нечем ответить (DS-242).
        if (railBranch) setFlyout((f) => (f === item.id ? null : item.id))
        else if (hasChildren) toggle(item.id)
        else { setFlyout(null); onSelect?.(item.id) }
      },
      children: (
        <>
          {item.icon && <Icon className="ds-sidenav__icon" aria-hidden="true">{item.icon}</Icon>}
          {!iconOnly && <span className="ds-sidenav__label">{item.label}</span>}
          {!iconOnly && item.count != null && (
            <span className="ds-sidenav__count">{item.count}</span>
          )}
          {!iconOnly && hasChildren && (
            <Caret kind="branch" open={isOpen(item.id)} />
          )}
          {/* Точка вместо числа: сказать «12» на сорока пикселях нечем, а
              сказать «непусто» — есть чем. Ноль точки НЕ получает намеренно —
              иначе «Заказы 12» и «Заказы 0» снова выглядели бы одинаково, то
              есть индикатор появился бы, ничего не различая. Число при этом не
              теряется: оно в `title` у обоих. */}
          {iconOnly && item.count != null && item.count > 0 && (
            <span className="ds-sidenav__dot" aria-hidden="true" />
          )}
          {/* Единственное, чем ветка в рейке отличается от листа. Тот же знак
              системы, что и в развёрнутой панели, только размером под рейку. */}
          {railBranch && (
            <Caret kind="branch" open={false} className="ds-caret--sm ds-sidenav__branchmark" />
          )}
        </>
      ),
    }

    // Ветка раскрывает поддерево, а не ведёт по ссылке, — она кнопка всегда.
    const asButton = (
      <button
        type="button"
        {...shared}
        style={depth > 1 ? { paddingLeft: `calc(var(--ds-space-5) * ${depth})` } : undefined}
        aria-expanded={hasChildren ? (railBranch ? flyout === item.id : isOpen(item.id)) : undefined}
        disabled={item.disabled}
        ref={(el) => {
          if (index >= 0) btnRefs.current[index] = el
          // Только на установке: отсоединение рефов идёт перед присоединением,
          // и без этой проверки открытое подменю теряло бы якорь на каждом
          // рендере — ровно перед тем, как `useAnchoredPosition` его померит.
          if (el && flyout === item.id) flyoutAnchorRef.current = el
        }}
      />
    )

    return (
      <li key={item.id} className="ds-sidenav__row">
        {renderItem && !hasChildren ? renderItem(item, shared) : asButton}
        {hasChildren && !iconOnly && isOpen(item.id) && (
          <ul className="ds-sidenav__sublist">
            {item.children!.map((c) => renderRow(c, depth + 1, inFlyout))}
          </ul>
        )}
        {railBranch && flyout === item.id && (
          <div
            ref={flyoutRef}
            className="ds-sidenav__flyout"
            style={{ ...anchored.style, zIndex }}
          >
            {/* Заголовок подменю — не украшение: в рейке подпись ветки не
                видна, и без него пользователь не знает, ЧТО он раскрыл. */}
            <div className="ds-sidenav__flyout-title">{item.label}</div>
            <ul className="ds-sidenav__sublist">
              {item.children!.map((c) => renderRow(c, 0, true))}
            </ul>
          </div>
        )}
      </li>
    )
  }

  return (
    <nav
      id={id}
      ref={navRef}
      className={['ds-sidenav', collapsed && 'ds-sidenav--collapsed', className]
        .filter(Boolean).join(' ')}
      // Multiplied by the scale like every metric token: a bare px width would
      // keep the panel at 212px while its rows and text grew past it.
      style={{ width: collapsed ? undefined : `calc(${width}px * var(--ds-ui-scale, 1))` }}
      onKeyDown={onKeyDown}
    >
      {title && (
        <div className="ds-sidenav__header">
          {mark && <span className="ds-sidenav__mark" aria-hidden="true">{mark}</span>}
          {!collapsed && <span className="ds-sidenav__title">{title}</span>}
        </div>
      )}
      {groups.map((g) => (
        <div key={g.id} className="ds-sidenav__group">
          {g.separator && <div className="ds-sidenav__separator" role="presentation" />}
          {g.title && !collapsed && <div className="ds-sidenav__group-title">{g.title}</div>}
          <ul className="ds-sidenav__list">{g.items.map((it) => renderRow(it, 0))}</ul>
        </div>
      ))}
    </nav>
  )
}
