import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Close, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Dots,
} from '../../icons/glyphs.js'
import { rovingEntry, rovingTarget } from '../../internal/roving.js'
import { useDismiss } from '../../internal/useDismiss.js'
import { usePopupLayer } from '../../internal/usePopupLayer.js'
import '../../styles/disabled-item.css'
import { useDsText } from '../../dictionary/DsText.js'
import './Tabs.css'
import { Icon } from '../../icons/index.js'

export interface Tab {
  id: string
  label: string
  /**
   * Число рядом с подписью — сколько записей за вкладкой.
   *
   * Ноль показывается, а не прячется: «Готово: 0» это содержательный ответ,
   * а спрятанный счётчик читается как «не считали».
   */
  count?: number
  /**
   * Значок статуса перед подписью — точка, галка, часы.
   *
   * **Декоративен и в доступное имя не попадает** (`aria-hidden`). Это
   * противоположное решение соседнему `count`, и разница не случайна: число
   * записей нельзя узнать иначе, поэтому оно озвучивается; смысл же статуса
   * обязан нести текст подписи, а не значок.
   */
  icon?: React.ReactNode
  /**
   * Показать крестик закрытия. Закрытие зовёт `onClose(id)` у `Tabs`.
   *
   * Крестик — **отдельная кнопка рядом с вкладкой, а не внутри неё**: элемент
   * вкладки может быть `<button>` (или `<a>` через `renderItem`), а вложенная
   * интерактивность в интерактивном — невалидный HTML и лишний таб-стоп. Сосед
   * решает обе беды: две настоящие кнопки, порядок фокуса под контролем.
   */
  closable?: boolean
  /**
   * Недоступная вкладка: не выбирается, пропускается роуминг-фокусом
   * (стрелки, Home/End), помечена `aria-disabled`.
   */
  disabled?: boolean
}

export type TabPosition = 'top' | 'bottom' | 'left' | 'right'
export type TabOverflow = 'scroll' | 'menu'
export type TabVariant = 'framed' | 'plain'

/**
 * Пропсы, которые вкладка отдаёт потребителю в `renderItem`. Разложить их на
 * свой элемент — и он **становится** вкладкой.
 */
export interface TabRenderProps {
  /** Есть, только если у `Tabs` задан `id`. */
  id?: string
  /** Есть, только если у `Tabs` задан `id`. */
  'aria-controls'?: string
  className: string
  children: React.ReactNode
  role: 'tab'
  'aria-selected': boolean
  /** Есть только у disabled-вкладки. */
  'aria-disabled'?: true
  tabIndex: number
  onClick: () => void
}

export interface TabsProps {
  tabs: Tab[]
  selectedId: string
  onSelect?: (id: string) => void
  /**
   * Идентификатор виджета. Из него выводятся DOM-`id` вкладок
   * (`${id}-tab-${tab.id}`) и `aria-controls` на панель (`${id}-panel`).
   */
  id?: string
  /**
   * Шов под роутер: **подменяет элемент вкладки**, а не оборачивает наш.
   *
   * ```tsx
   * renderItem={(tab, props) => <Link to={`/t/${tab.id}`} {...props} />}
   * ```
   */
  renderItem?: (tab: Tab, props: TabRenderProps) => React.ReactNode
  /**
   * С какой стороны панели стоит бар вкладок (default `'top'`). Для `left`/
   * `right` бар вертикальный: `aria-orientation="vertical"`, роуминг по ↑/↓.
   *
   * `position` управляет только баром. Раскладку бар↔панель даёт CSS-обёртка
   * `.ds-tabs-layout` (+ модификатор направления) вокруг `Tabs` и `TabPanel`.
   *
   * **`left`/`right` — ПРОСЬБА, а не приказ: на узком контейнере бар приходит к
   * `top`** (DS-285). Порог — ширина обёртки, 17em, замер живёт в
   * `Tabs.css`. Боковой бар на телефоне отдаёт вкладкам больше половины ширины,
   * а длина подписей приходит от потребителя, то есть раскладкой это не
   * чинится. Решает ширина, как `hideBelow` у `DataTable`: ширину своего
   * контейнера в момент отрисовки потребитель не знает, а телефон — не
   * отдельная сборка, а тот же экран, сжатый рукой.
   */
  position?: TabPosition
  /** Клик по крестику / `Delete` на закрываемой вкладке. */
  onClose?: (id: string) => void
  /**
   * Что делать, когда вкладки не влезают (default `'scroll'`):
   * `'scroll'` — стрелки прокрутки по краям; `'menu'` — кнопка «⋯» со списком.
   */
  overflow?: TabOverflow
  /**
   * Включает переупорядочивание: перетаскивание мышью и `Ctrl+←/→`
   * (в вертикали `Ctrl+↑/↓`). Аргумент — новый порядок id целиком.
   * Без пропса переупорядочивание выключено.
   */
  onReorder?: (orderedIds: string[]) => void
  /** Слот в конце бара — сюда потребитель кладёт кнопку «+». */
  trailing?: React.ReactNode
  /**
   * `'framed'` (default) — вид «папок» с рамками; `'plain'` — без коробок,
   * активная помечена акцентным подчёркиванием.
   */
  variant?: TabVariant
}

export function Tabs({
  tabs, selectedId, onSelect, renderItem, id,
  position = 'top', onClose, overflow = 'scroll', onReorder, trailing, variant = 'framed',
}: TabsProps) {
  const text = useDsText()
  // Фокус ищется по `[role="tab"]` внутри списка, а не по рефам на кнопки:
  // элемент вкладки выбирает потребитель (шов), и держать ссылку на «свою»
  // кнопку значило бы, что клавиатура работает только без шва.
  const listRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const activeIndex = tabs.findIndex((t) => t.id === selectedId)
  const sideways = position === 'left' || position === 'right'
  /**
   * АВТОПОРОГ БОКОВОГО БАРА (DS-285): ниже него `left`/`right` приходит
   * к `top`.
   *
   * Само число живёт в CSS — `@container (max-width: 17em)` в `Tabs.css`, там
   * же и замер, из которого оно сложено. Здесь только ОТВЕТ запроса, снятый с
   * собственного узла: под порогом обёртка ставит бару `--ds-tabs-stack: 1`.
   *
   * Почему компонент вообще обязан это знать, а не только выглядеть иначе.
   * Боковой бар считает по ВЕРТИКАЛИ: переполнение меряется `scrollHeight`
   * против `clientHeight`, стрелки листают `scrollTop`, шевроны смотрят вверх
   * и вниз. Уложи его CSS в строку, не сказав об этом JS, — и переполнение
   * перестаёт находиться вовсе: по высоте лента влезает всегда, класса
   * `is-scrollable` нет, стрелок нет, а вкладки за правым краем не достать
   * ничем. Тихо и правдоподобно.
   *
   * Читается через каскад, а не своей арифметикой по ширине: порог — CSS-факт,
   * и второй его вычислитель в JS разошёлся бы с первым молча, как только
   * тронут число.
   */
  const [stacked, setStacked] = useState(false)
  /** Положение, в котором бар РИСУЕТСЯ и СЧИТАЕТ. Не то же, что проп. */
  const shown: TabPosition = sideways && stacked ? 'top' : position
  const vertical = shown === 'left' || shown === 'right'
  /**
   * Кто получает `tabIndex 0` (DS-221). Правило вынесено в
   * `src/internal/roving.ts` и общее для полос с роумингом — здесь его больше
   * нет, потому что здесь оно и разошлось: `active && !t.disabled ? 0 : -1`
   * оставляло полосу со всеми выключенными вкладками БЕЗ входа, `Tab`
   * перепрыгивал её на панель.
   */
  const entryIndex = rovingEntry(tabs, activeIndex)

  function focusTab(index: number) {
    listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[index]?.focus()
  }

  /**
   * Закрываемая вкладка, у которой фокус был НАШ. `null` — закрытия не было
   * либо фокус в момент закрытия был снаружи полосы.
   *
   * Хранится ИМЯ, а не флаг «надо вернуть». Флага не хватает: `tabs` приезжает
   * новым массивом на каждый рендер потребителя, эффект ниже срабатывает
   * каждый раз, и взведённый флаг однажды выстрелил бы в постороннем рендере —
   * то есть компонент забирал бы фокус у того, кто его не отдавал. По имени
   * видно, случилось ли то, чего ждём: вкладки с этим id в списке больше нет.
   */
  const closing = useRef<string | null>(null)

  /**
   * Единственная дверь к `onClose` (DS-218). Все три пути удаления —
   * `Delete`/`Backspace`, клик мышью по крестику и `Enter` на нём с
   * клавиатуры — ходят сюда, потому что дефект был один на всех: узел под
   * фокусом исчезал, и фокус уезжал в `body`.
   *
   * Условие «фокус был в полосе» снимается ДО вызова: после него узла уже нет.
   */
  function requestClose(id: string) {
    const inside = listRef.current?.contains(document.activeElement) ?? false
    closing.current = inside ? id : null
    onClose?.(id)
  }

  /**
   * Возврат фокуса после закрытия — В МАКЕТНОМ ЭФФЕКТЕ, а не в
   * `requestAnimationFrame`.
   *
   * Замер дефекта (DS-218) показывал `BODY` в микрозадаче, на первом
   * кадре, на втором и через 250 мс — то есть переноса не было НИ В КАКОМ
   * кадре. Правка обязана попасть между микрозадачей и первым кадром, и
   * `useLayoutEffect` — ровно это место: он идёт после мутации DOM и до
   * отрисовки. `requestAnimationFrame` дал бы то же самое на переднем плане и
   * НЕ ТИКАЛ БЫ на фоновой вкладке — там фокус остался бы потерянным, а
   * проверка на переднем плане этого не увидела бы.
   *
   * Цель — `[role="tab"][tabindex="0"]`, то есть та вкладка, которую роуминг
   * УЖЕ назначил своей. Не индекс: индекс пришлось бы считать заново и он
   * разошёлся бы с разметкой ровно в тех случаях, ради которых всё делается
   * (выключенная вкладка, выбор, сделанный потребителем в его `onClose`).
   * Разведка отдельно замерила, что роуминг после закрытия в порядке —
   * `tabIndex 0` ровно один, — так что цель есть, и брать надо её.
   *
   * ЧУЖОЙ ФОКУС НЕ ОТБИРАЕТСЯ. Между `onClose` и этим эффектом потребитель
   * может увести фокус куда угодно (подтверждение, тост, свой `focus()`), и
   * закрытие через асинхронное подтверждение — обычный случай. Возвращаем,
   * только если фокус ПОТЕРЯН: `body`, ничего или всё ещё внутри полосы.
   *
   * ЕДИНСТВЕННАЯ ОСТАВШАЯСЯ ВКЛАДКА закрывается — и цели не остаётся: полосы
   * нет. Тогда не делается НИЧЕГО, и фокус остаётся там, куда его уронил
   * браузер. Это осознанная граница, а не пропуск: своего таб-стопа у пустой
   * полосы нет, а тянуться к чужой панели по `id` значило бы фокусировать
   * узел, которым компонент не владеет. Край достижим с DS-220
   * (`?c=Tabs&data=one-closable`) и замерен.
   */
  useLayoutEffect(() => {
    const id = closing.current
    if (id === null) return
    // Вкладка ещё на месте — потребитель закрытие не выполнил (или выполнит
    // позже). Ждём того рендера, где её не станет.
    if (tabs.some((t) => t.id === id)) return
    closing.current = null
    const active = document.activeElement
    const lost = !active || active === document.body || (listRef.current?.contains(active) ?? false)
    if (!lost) return
    listRef.current?.querySelector<HTMLElement>('[role="tab"][tabindex="0"]')?.focus()
  }, [tabs])

  function onKeyDown(e: React.KeyboardEvent) {
    const nextKey = vertical ? 'ArrowDown' : 'ArrowRight'
    const prevKey = vertical ? 'ArrowUp' : 'ArrowLeft'

    // Переупорядочивание: Ctrl+стрелка двигает активную вкладку на шаг.
    // Единственный способ переставить вкладки без мыши, поэтому обязателен.
    if (onReorder && e.ctrlKey && (e.key === nextKey || e.key === prevKey)) {
      const dir = e.key === nextKey ? 1 : -1
      const to = activeIndex + dir
      if (to < 0 || to >= tabs.length) return
      e.preventDefault()
      const order = tabs.map((t) => t.id)
      ;[order[activeIndex], order[to]] = [order[to]!, order[activeIndex]!]
      onReorder(order)
      // Фокус едет за вкладкой: после перестановки она окажется на месте `to`.
      requestAnimationFrame(() => focusTab(to))
      return
    }

    // Закрытие с клавиатуры — на активной закрываемой вкладке.
    if ((e.key === 'Delete' || e.key === 'Backspace') && onClose && tabs[activeIndex]?.closable) {
      e.preventDefault()
      requestClose(selectedId)
      return
    }

    // Модификатор — не обычная навигация: Ctrl+стрелка без включённого reorder
    // просто ничего не делает, а не выбирает соседнюю вкладку.
    if (e.ctrlKey || e.metaKey || e.altKey) return

    // Математика индекса — общая с SectionPanel и FormTabs
    // (`src/internal/roving.ts`); своим остаётся то, чего у них нет:
    // перестановка по Ctrl+стрелке и закрытие с клавиатуры выше.
    const ni = rovingTarget(tabs, activeIndex, e.key, vertical ? 'vertical' : 'horizontal')
    if (ni === null) return
    e.preventDefault()
    if (ni < 0) return
    onSelect?.(tabs[ni]!.id)
    focusTab(ni)
  }

  // --- Overflow: измеряем, влезают ли вкладки, и чем листать ---------------
  const [scrollable, setScrollable] = useState(false)
  const [canStart, setCanStart] = useState(false)
  const [canEnd, setCanEnd] = useState(false)

  const updateOverflow = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const start = vertical ? el.scrollTop : el.scrollLeft
    const size = vertical ? el.clientHeight : el.clientWidth
    const total = vertical ? el.scrollHeight : el.scrollWidth
    setScrollable(total > size + 1)
    setCanStart(start > 1)
    setCanEnd(start + size < total - 1)
  }, [vertical])

  useLayoutEffect(() => {
    updateOverflow()
    const el = listRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(updateOverflow)
    ro.observe(el)
    return () => ro.disconnect()
  }, [updateOverflow, tabs.length])

  /**
   * Ответ автопорога, снятый с каскада (DS-285).
   *
   * Наблюдаются ДВА узла, и оба обязательны. Обёртка — потому что порог про
   * ЕЁ ширину, а бар сбоку своей ширины при этом не меняет вовсе
   * (`flex`/`grid` отдают ему ровно содержимое), то есть наблюдатель на одном
   * баре молчал бы ровно в том случае, ради которого заведён. Сам бар — потому
   * что шкалу (`--ds-ui-scale`) можно сменить БЕЗ изменения ширины обёртки:
   * порог в `em` тогда уезжает, а обёртка стоит на месте, и меняется как раз
   * бар.
   *
   * Обратной связи нет: селектор запроса смотрит на класс обёртки, а не на
   * `data-position`, поэтому сложившийся бар не может «расcложиться» от того,
   * что сложился.
   */
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || !sideways) { setStacked(false); return }
    const read = () => setStacked(
      getComputedStyle(root).getPropertyValue('--ds-tabs-stack').trim() === '1',
    )
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(root)
    if (root.parentElement) ro.observe(root.parentElement)
    return () => ro.disconnect()
  }, [sideways])

  // Активную вкладку доскролливаем в видимую зону при смене.
  useEffect(() => {
    scrollTabIntoView(activeIndex)
    // Список зависимостей полон по существу: `scrollTabIntoView` стабильна на
    // время жизни компонента — она замыкает только `listRef` и ищет вкладку в
    // DOM, замыкать ей нечего. Стережёт это не комментарий, а кейс «доскролл
    // активной вкладки»: рендер без смены `activeIndex` не доскролливает.
  }, [activeIndex])

  function scrollStep(dir: 1 | -1) {
    const el = listRef.current
    if (!el || typeof el.scrollBy !== 'function') return
    const size = vertical ? el.clientHeight : el.clientWidth
    const delta = dir * size * 0.8
    el.scrollBy(vertical ? { top: delta, behavior: 'smooth' } : { left: delta, behavior: 'smooth' })
  }

  function scrollTabIntoView(index: number) {
    const tab = listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[index]
    if (tab && typeof tab.scrollIntoView === 'function') {
      tab.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }

  // --- Reorder мышью: pointer-события без библиотек -------------------------
  const dragRef = useRef<{ id: string; started: boolean; x: number; y: number } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  function targetIndex(x: number, y: number): number {
    const els = listRef.current?.querySelectorAll<HTMLElement>('.ds-tabs__item') ?? []
    const rects = Array.from(els).map((el) => el.getBoundingClientRect())
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]!
      const mid = vertical ? r.top + r.height / 2 : r.left + r.width / 2
      if ((vertical ? y : x) < mid) return i
    }
    return rects.length - 1
  }

  function onItemPointerDown(e: React.PointerEvent, tabId: string) {
    if (!onReorder || e.button !== 0) return
    dragRef.current = { id: tabId, started: false, x: e.clientX, y: e.clientY }
  }
  function onListPointerMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    if (!d.started) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return
      d.started = true
      setDragId(d.id)
    }
    setDropIndex(targetIndex(e.clientX, e.clientY))
  }
  function endDrag() {
    const d = dragRef.current
    const to = dropIndex
    dragRef.current = null
    setDragId(null)
    setDropIndex(null)
    if (!d || !d.started || to == null || !onReorder) return
    const from = tabs.findIndex((t) => t.id === d.id)
    if (from < 0 || from === to) return
    const order = tabs.map((t) => t.id)
    const [moved] = order.splice(from, 1)
    order.splice(to, 0, moved!)
    onReorder(order)
  }

  const rootCls = [
    'ds-tabs',
    variant === 'plain' && 'ds-tabs--plain',
    dragId && 'is-dragging',
  ].filter(Boolean).join(' ')

  const ChevronStart = vertical ? ChevronUp : ChevronLeft
  const ChevronEnd = vertical ? ChevronDown : ChevronRight

  return (
    <div className={rootCls} data-position={shown} ref={rootRef}>
      {/* ОБЕ СТРЕЛКИ, ВСЕГДА, пока лента переполнена (DS-284).

          Приглушена та, чей край достигнут, а не удалена, и это не про вид, а
          про раскладку: стрелка — flex-сосед ленты, то есть тот, кто отнимает
          у бара ширину. Пока она приходила и уходила по положению прокрутки,
          раскладка бара ЗАВИСЕЛА ОТ ТОГО, ГДЕ СТОИТ ЛЕНТА: первое же
          пролистывание на кадре 360 при шкале 1.5 отдавало новой стрелке 54px
          из слота (102 → 48), «Добавить» уезжал за правый край, и кнопки
          дёргались вправо ровно на её ширину. Цена решения названа: две
          стрелки по 54 и пол ленты 144 — это 252 из 360, слоту остаётся 108. */}
      {overflow === 'scroll' && scrollable && (
        <button
          type="button" className="ds-tabs__scroller ds-tabs__scroller--start"
          aria-label={text['tabs.scrollStart']} disabled={!canStart} onClick={() => scrollStep(-1)}
        ><ChevronStart size={16} aria-hidden /></button>
      )}

      <div
        className={['ds-tabs__list', scrollable && 'is-scrollable'].filter(Boolean).join(' ')}
        role="tablist"
        aria-orientation={vertical ? 'vertical' : undefined}
        ref={listRef}
        onKeyDown={onKeyDown}
        onScroll={updateOverflow}
        onPointerMove={onReorder ? onListPointerMove : undefined}
        onPointerUp={onReorder ? endDrag : undefined}
        onPointerLeave={onReorder ? endDrag : undefined}
      >
        {tabs.map((t, i) => {
          const active = t.id === selectedId
          const props: TabRenderProps = {
            ...(id ? { id: `${id}-tab-${t.id}`, 'aria-controls': `${id}-panel` } : {}),
            className: [
              'ds-tabs__tab',
              active && 'is-active',
              t.closable && 'ds-tabs__tab--closable',
            ].filter(Boolean).join(' '),
            role: 'tab',
            'aria-selected': active,
            ...(t.disabled ? { 'aria-disabled': true as const } : {}),
            // Роуминг-фокус: в порядок табуляции попадает ровно ОДНА вкладка —
            // вход, посчитанный `rovingEntry`. Выключенность управляет выбором
            // (`onClick` ниже — пустышка, `aria-disabled` на месте), а не
            // достижимостью: до выключенной вкладки надо дойти и прочитать,
            // почему она не нажимается.
            tabIndex: i === entryIndex ? 0 : -1,
            onClick: t.disabled ? () => {} : () => onSelect?.(t.id),
            children: (
              <>
                {t.icon != null && <Icon className="ds-tabs__icon" aria-hidden="true">{t.icon}</Icon>}
                {t.label}
                {t.count != null && <span className="ds-tabs__count">{t.count}</span>}
              </>
            ),
          }
          return (
            <div
              key={t.id}
              className={['ds-tabs__item', dragId === t.id && 'is-dragging', dropIndex === i && 'is-drop'].filter(Boolean).join(' ')}
              onPointerDown={onReorder ? (e) => onItemPointerDown(e, t.id) : undefined}
            >
              {renderItem ? renderItem(t, props) : <button type="button" {...props} />}
              {t.closable && onClose && (
                <button
                  type="button"
                  className="ds-tabs__close"
                  aria-label={text['tabs.closeTab'](t.label)}
                  // По входу, а не по «активна»: при всех выключенных вкладках
                  // крестики были недостижимы вместе с полосой — закрыть
                  // вкладку с клавиатуры было нельзя никаким путём. Закрытие
                  // и выбор — разные действия: выключенная вкладка не
                  // выбирается, но закрывается.
                  tabIndex={i === entryIndex ? 0 : -1}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); requestClose(t.id) }}
                ><Close size={13} aria-hidden /></button>
              )}
            </div>
          )
        })}
      </div>

      {overflow === 'scroll' && scrollable && (
        <button
          type="button" className="ds-tabs__scroller ds-tabs__scroller--end"
          aria-label={text['tabs.scrollEnd']} disabled={!canEnd} onClick={() => scrollStep(1)}
        ><ChevronEnd size={16} aria-hidden /></button>
      )}

      {overflow === 'menu' && scrollable && (
        <OverflowMenu
          tabs={tabs} selectedId={selectedId}
          onPick={(pickedId, i) => { onSelect?.(pickedId); scrollTabIntoView(i) }}
        />
      )}

      {/* Слот в конце бара — СОСЕД списка, а не его последний ребёнок
          (DS-205).

          Раньше он жил ВНУТРИ `.ds-tabs__list`, то есть внутри прокручиваемого
          содержимого, и из этого следовали два дефекта сразу. Первый: замер
          `scrollWidth > clientWidth`, которым Tabs решает «вкладок больше, чем
          места», считал начинку слота ЗА ВКЛАДКУ — защита от переполнения
          отвечала не на свой вопрос. Второй, и он хуже: начинка уезжала вместе
          с лентой. На кадре 360 кнопка слота стояла на 416..551 при правом
          крае бара 330 — за экраном, достать её можно было только домотав
          ленту вкладок до конца; а в гонке, когда начинка приезжает асинхронно
          и `ResizeObserver` списка не срабатывает (его бокс не изменился),
          лента вообще не получала `is-scrollable`, и лишнее забирал документ:
          scrollWidth 551 при clientWidth 470.

          Соседом слот сначала РЕЗЕРВИРУЕТ свою ширину (`flex: 0 0 auto`), а
          лента берёт остаток (`flex: 1 1 auto; min-width: 0`) — и переполнение
          считается против остатка. Последним в баре, после стрелок и «⋯»:
          слот — постоянная принадлежность бара, а стрелки и меню приходят и
          уходят по замеру, и порядок, в котором они мигают, не должен двигать
          то, что стоит всегда. */}
      {trailing != null && <span className="ds-tabs__trailing">{trailing}</span>}
    </div>
  )
}

/**
 * Кнопка «⋯» со списком всех вкладок. Список полный, а не только скрытые:
 * так пункт всегда предсказуемо на месте, а выбор доскролливает вкладку в
 * видимую зону — «найти и перейти» работает одинаково для любой вкладки.
 */
function OverflowMenu({
  tabs, selectedId, onPick,
}: {
  tabs: Tab[]
  selectedId: string
  onPick: (id: string, index: number) => void
}) {
  const text = useDsText()
  const [open, setOpen] = useState(false)
  const zIndex = usePopupLayer(open)
  const wrapRef = useRef<HTMLDivElement>(null)

  useDismiss({ enabled: open, ref: wrapRef, onDismiss: () => setOpen(false) })

  return (
    <div className="ds-tabs__overflow" ref={wrapRef}>
      <button
        type="button" className="ds-tabs__overflow-btn"
        aria-label={text['tabs.more']} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      ><Dots size={16} aria-hidden /></button>
      {open && (
        <div className="ds-tabs__overflow-menu" role="menu" style={{ zIndex }}>
          {tabs.map((t, i) => (
            <button
              key={t.id}
              type="button" role="menuitem"
              className={['ds-tabs__overflow-item', t.id === selectedId && 'is-active'].filter(Boolean).join(' ')}
              disabled={t.disabled}
              onClick={() => { setOpen(false); onPick(t.id, i) }}
            >
              {t.icon != null && <Icon className="ds-tabs__icon" aria-hidden="true">{t.icon}</Icon>}
              {t.label}
              {t.count != null && <span className="ds-tabs__count">{t.count}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
