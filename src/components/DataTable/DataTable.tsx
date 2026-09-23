import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Skeleton } from '../Skeleton/index.js'
import { Caret } from '../../internal/caret.js'
import { Button } from '../Button/index.js'
import type { DisplayRow } from '../../internal/rowModel.js'
import '../../styles/visually-hidden.css'
import { useDsText } from '../../dictionary/DsText.js'
import './DataTable.css'

import { Icon } from '../../icons/index.js'
import {
  isActionColumn, isRowHeader, rowHeaderText, colId, colClass as colClassBase, colHideClass, colWraps, firstProjected, colWidth, hasWidth,
  tableMinWidth,
  type Column, type DataColumn, type RowHeaderColumn, type DisplayColumn, type ActionColumn, type RowAction, type HideBelow,
} from '../../internal/columns.js'
import { assertAction } from '../../internal/action.js'
export type { Column, DataColumn, RowHeaderColumn, DisplayColumn, ActionColumn, RowAction, HideBelow }

/**
 * Старая форма действия строки (`onClick`, без `id` — DS-358) обязана
 * БРОСАТЬ, а не деградировать: под `any` у потребителя колонка нарисовала бы
 * кнопки, которые ничего не делают по нажатию, и ни одной ошибки.
 *
 * Проверяется то, что вернула `actions(row)`, а не объявление колонки:
 * `actions` — функция, и её результат — единственное место, где действие вообще
 * есть.
 */
function assertRowActions(actions: RowAction[]): RowAction[] {
  actions.forEach((a) => assertAction(a, 'DataTable: `ActionColumn.actions`'))
  return actions
}

export type SortDir = 'asc' | 'desc'

/**
 * `onRowClick` без колонки, называющей строку, — это мышиное поведение,
 * выданное за поведение. Ровно тот дефект, ради которого шов и написан:
 * потребитель перевёл рукописную таблицу на компонент, ячейка кода потеряла
 * `<button>`, и выбрать строку с клавиатуры стало нечем — при этом замер по
 * классам показывал улучшение (своих классов ноль), а свойство пропало.
 *
 * Ошибкой типов это сделать нечем: типы не видят СОДЕРЖИМОЕ массива колонок,
 * а перенести назначение в пропсы (`rowHeader: 'code'`) значило бы соединять
 * колонку с пропом по строковому ключу — тот самый класс опечатки, ради
 * которого `DisplayColumn` назван `id`, а не `key`. Поэтому бросок, и на
 * первом же рендере: он громкий, детерминированный и наступает раньше, чем
 * кто-нибудь успеет решить, что клавиатура тут просто не нужна.
 *
 * Двух назначенных колонок тоже не бывает: `<th scope="row">` объявляет ИМЯ
 * строки, а два имени у одной строки означают, что диктор прочитает оба, и
 * непонятно, какая из двух кнопок открывает.
 */
function assertRowHeader<T>(columns: Column<T>[], clickable: boolean): void {
  const n = columns.filter(isRowHeader).length
  if (n > 1) {
    throw new Error(
      `jig: DataTable — колонок с rowHeader ${n}, а строку называет одна. `
      + 'Оставьте ту, что несёт имя строки (код, наименование).',
    )
  }
  if (clickable && n === 0) {
    throw new Error(
      'jig: DataTable — onRowClick без колонки rowHeader. Клик по строке '
      + 'существовал бы только для мыши: сама <tr> интерактивной не станет (в ней '
      + 'кнопки действий), а клавиатурный путь живёт в ячейке, называющей строку. '
      + 'Пометьте её rowHeader: true (DS-92).',
    )
  }
}


interface BaseProps<T> {
  columns: Column<T>[]
  /** Выбранные строки (подсветка). Без `onSelectionChange` — только подсветка, чекбоксов нет. */
  selectedIds?: string[]
  /** Controlled: компонент считает новый полный набор и отдаёт его целиком
   *  (не toggle-by-id) — потребитель хранит его как есть. */
  onSelectionChange?: (ids: string[]) => void
  /** Плотная раскладка: высота строк по `--ds-h-compact`. По умолчанию `--ds-h-default`. */
  dense?: boolean
  sortKey?: string
  sortDir?: SortDir
  onSort?: (key: string) => void
  /** Show skeleton placeholder rows instead of data. */
  loading?: boolean
  /** Number of skeleton rows while loading (default 5). */
  loadingRows?: number
  /** Rendered in place of the body when there are no rows and not loading. */
  emptyContent?: React.ReactNode
  /**
   * Открытие строки. Мышью — клик по строке целиком; с клавиатуры — кнопка в
   * колонке, назначенной `rowHeader`, и БЕЗ такой колонки проп бросает.
   *
   * Сама строка интерактивным элементом не становится и не станет: в строках
   * лежит колонка действий с кнопками, и фокусируемая `<tr>` дала бы
   * интерактивное внутри интерактивного. Клик по строке — сокращение для мыши,
   * поведение живёт в ячейке (клик по чекбоксу и по кнопкам действий исключён).
   */
  onRowClick?: (row: T) => void
  /** Строка-итог в <tfoot>. Значения — ReactNode (мульти-валюта), не скаляр. */
  footer?: { label?: React.ReactNode; cells: Partial<Record<string, React.ReactNode>> }
  /**
   * Состояние строки данных. `muted` — приглушённый ТЕКСТ, не фон
   * (DS-137). Знак/цвет суммы — забота ячейки, не класса. Возврат —
   * объект (точка расширения на будущие состояния), а не голый boolean.
   */
  rowState?: (row: T) => { muted?: boolean } | undefined
}

/** Плоский список — путь, существовавший до 1.8.0. */
interface FlatProps<T> extends BaseProps<T> {
  rows: T[]
  getRowId: (row: T) => string
  displayRows?: never
}

/**
 * Готовая модель строк: иерархия или группировка, развёрнутая потребителем
 * через `flattenTree` / `groupByValue`.
 */
interface ModeledProps<T> extends BaseProps<T> {
  displayRows: DisplayRow<T>[]
  rows?: never
  getRowId?: never
  /** Раскрытие узла или группы. Без него строки не раскрываются. */
  onToggleExpand?: (id: string) => void
}

export type DataTableProps<T> = FlatProps<T> | ModeledProps<T>

export function DataTable<T>(props: DataTableProps<T>) {
  const t = useDsText()
  const {
    columns, selectedIds, onSelectionChange, dense = false,
    sortKey, sortDir = 'asc', onSort,
    loading, loadingRows = 5, emptyContent, onRowClick, footer, rowState,
  } = props

  const managed = props.displayRows != null
  const onToggleExpand = managed ? props.onToggleExpand : undefined
  // Плоский путь заворачивается в ту же модель, чтобы ниже была одна ветка
  // рендера, а не две расходящиеся.
  //
  // Восклицательные знаки здесь не нужны и добавлять их не надо: `displayRows?:
  // never` делает объединение различимым, а `const managed = …` сужает его и
  // внутри тернара (проверено на этом tsconfig).
  const display: DisplayRow<T>[] = managed
    ? props.displayRows
    : props.rows.map((row) => ({
        kind: 'data' as const, id: props.getRowId(row), row,
        depth: 0, hasChildren: false, expanded: false,
      }))

  // Дерево ли перед нами — вопрос к ДАННЫМ, а не к наличию `onToggleExpand`:
  // проп есть и у таблицы, собранной `groupByValue`, где строки данных все до
  // одной листья. Резервировать там место каретки значило бы сдвинуть первую
  // колонку у каждого потребителя группировки — за иерархию, которой у него
  // нет. Свёрнутый узел из выдачи не пропадает (`flattenTree` оставляет его с
  // `hasChildren: true`), поэтому признак не мигает при сворачивании.
  const treeMode = onToggleExpand != null && display.some((d) => d.kind === 'data' && d.hasChildren)

  const selectable = !!onSelectionChange
  const selected = new Set(selectedIds ?? [])
  // Controlled-переключение: новый набор считается здесь, колбэк уходит целиком
  // (не toggle-by-id) — как onCheckedChange у Tree, единый паттерн мультивыбора.
  const toggleRow = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    onSelectionChange?.([...next])
  }
  const colCount = columns.length + (selectable ? 1 : 0)
  assertRowHeader(columns, !!onRowClick)
  // Режим раскладки выводится из данных, а не задаётся пропом: см. `width`.
  const fixedLayout = columns.some(hasWidth)

  /**
   * Классы ячейки — ОДИН шов на `<th>`, `<td>`, ячейку display-строки и подвал.
   * Обёртка, а не пять вызовов с одинаковым хвостом: класс переноса обязан
   * совпадать у шапки и тела (иначе колонка переносится в одной половине и
   * сокращается в другой — это разъехавшаяся колонка, а не два режима), и
   * шестой вызов, добавленный завтра, не должен уметь про него забыть.
   *
   * `fixedLayout &&` здесь, а не внутри `colWraps`: вне `fixed` правила
   * переноса в листе нет вовсе, и класс был бы мусором в разметке каждой
   * колонки у каждого потребителя, который ширин не задаёт.
   */
  const colCls = (c: Column<T>, ...extra: (string | false | undefined)[]) =>
    colClassBase('ds-table', c, fixedLayout && colWraps(c) && 'ds-table__wrap', ...extra)

  // Обёртка нужна как контейнер для `@container`. Проверено в браузере:
  // `container-type: inline-size` на самой `<table>` парсится (computed style
  // отдаёт `inline-size`), но запрос не срабатывает — ячейка остаётся
  // `table-cell`. То есть проверка «свойство применилось» здесь врёт, и без
  // обёртки `hideBelow` был бы пропом, который задан и молча ничего не делает.
  /* Слагаемые пола ширины (`internal/columns.ts`, `tableMinWidth`) — на ОБЁРТКЕ,
     а сумма собирается в листе (`.ds-table--fixed`). Порядок носителей обратный
     привычному, и он вынужденный (DS-138): скрытую по тесноте колонку пол
     держать не должен, обнулить её слагаемое умеет только `@container` — а
     инлайн на самой таблице лист бы перебил. Наследование от обёртки правило
     `@container` на `.ds-table` перебивает законно.

     Ширина колонки выбора приходит от её ячейки, а не от `<col>`, поэтому
     подставляется тем же токеном, что и в `.ds-table__sel`. */
  const minParts = fixedLayout
    ? tableMinWidth(columns, selectable ? 'var(--ds-h-default)' : undefined)
    : undefined

  /**
   * СВОЙ ГОРИЗОНТАЛЬНЫЙ СКРОЛЛЕР, включаемый замером (DS-169).
   *
   * У таблицы осмысленный `min-width` (пол ширины колонки, DS-137):
   * зажимать её нельзя — колонки уже пола нечитаемы. Значит распор уходил
   * наружу и двигал ДОКУМЕНТ: кадр 360 при шкале 1.5 — таблица торчала до 395.
   * Уехавшая вбок страница ломает не таблицу, а всё вокруг неё.
   *
   * Класс, а не постоянный `overflow`, — то же решение и по той же причине,
   * что у `CommandBar` и `.ds-tabs__list`: цену прокрутки нельзя платить там,
   * где листать нечего. Цена здесь ВЫШЕ, чем у полосы действий, и названа в
   * `DataTable.css`: пока скроллер включён, липкая шапка таблицы перестаёт
   * липнуть к экрану.
   */
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scrollable, setScrollable] = useState(false)

  const updateOverflow = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    setScrollable(el.scrollWidth > el.clientWidth + 1)
  }, [])

  // `useLayoutEffect`: замер до отрисовки кадра, иначе первый кадр страница
  // отдаёт уехавшей. В зависимостях `columns` и `rows` — состав таблицы
  // меняется без движения бокса обёртки, а `ResizeObserver` о таком молчит.
  useLayoutEffect(() => {
    updateOverflow()
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(updateOverflow)
    ro.observe(el)
    return () => ro.disconnect()
  }, [updateOverflow, columns, props.rows, props.displayRows])

  return (
    <div
      ref={wrapRef}
      className={['ds-table-wrap', scrollable && 'is-scrollable'].filter(Boolean).join(' ')}
      style={minParts && ({
        '--ds-table-min-base': minParts.base,
        '--ds-table-min-sm': minParts.sm,
        '--ds-table-min-md': minParts.md,
      } as React.CSSProperties)}
    >
    <table
      className={['ds-table', dense && 'ds-table--dense', fixedLayout && 'ds-table--fixed'].filter(Boolean).join(' ')}
      data-ds-managed-rows={managed ? '' : undefined}
    >
      {/* Класс скрытия — и на `<col>`, а не только на ячейках (DS-138).
          `display: none` на ячейках убирает содержимое, но НЕ трек: в
          `fixed`-раскладке ширины считаются по `<colgroup>`, и трек скрытой
          колонки продолжает числиться. Замерено: обёртка 400px, колонки
          100/100/100/остаток — после скрытия второй видимые занимают 300px, а
          последние 100 остаются мёртвой полосой. Убрать `<col>` — и место
          уходит колонке-остатку (замерено: она берёт 199 вместо 100), причём
          ячейки остаются каждая в своём треке: их сопоставление треку
          позиционное, и одна половина правки без другой всё портит. */}
      {fixedLayout && (
        <colgroup>
          {selectable && <col className="ds-table__sel-col" />}
          {columns.map((c) => (
            <col
              key={colId(c)}
              className={colHideClass('ds-table', c)}
              style={hasWidth(c) ? { width: colWidth(c.width!) } : undefined}
            />
          ))}
        </colgroup>
      )}
      <thead>
        <tr>
          {selectable && (
            // Имя, а не пустота. Колонка выбора — единственная, чью разметку
            // потребитель не пишет вовсе, значит назвать её обязан компонент:
            // сказать ему «подпиши» здесь было бы просьбой подписать то, чего
            // он не создавал. Глазами подпись не нужна (чекбоксы говорят сами),
            // но безымянный столбец диктор объявляет пустым местом.
            <th className="ds-table__sel" scope="col">
              <span className="ds-visually-hidden">{t['dataTable.selectColumn']}</span>
            </th>
          )}
          {columns.map((c) => {
            const active = colId(c) === sortKey
            const canSort = !!c.sortable && !!onSort
            return (
              <th
                key={colId(c)}
                scope="col"
                className={colCls(c)}
                aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : canSort ? 'none' : undefined}
              >
                {canSort ? (
                  <button type="button" className="ds-table__sortbtn" onClick={() => onSort!(colId(c))}>
                    <span className="ds-table__sortlabel">{c.header}</span>
                    <span className={['ds-table__sortarrow', active && 'is-active'].filter(Boolean).join(' ')} aria-hidden="true">
                      {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </button>
                ) : isActionColumn(c) && !c.header ? (
                  // Умолчание, а не догадка: `actions` в типе ГАРАНТИРУЕТ, что
                  // колонка про действия, — назвать её так компонент вправе.
                  // Обычной колонке с пустым `header` такого умолчания не
                  // придумать, и там решение другое (см. `assertHeader`).
                  <span className="ds-visually-hidden">{t['dataTable.actionsColumn']}</span>
                ) : c.headerHidden ? (
                  <span className="ds-visually-hidden">{c.header}</span>
                ) : c.header}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {loading ? (
          Array.from({ length: loadingRows }, (_, i) => (
            <tr key={`skel-${i}`} className="ds-table__skelrow" aria-hidden="true">
              {/* 16, как флажок, который она замещает: иначе строка дёргается на
                  месте выбора при догрузке. Цель клика тут ни при чём — у
                  скелета её нет вовсе, кликать нечего. */}
              {selectable && <td className="ds-table__sel"><Skeleton variant="rect" width={16} height={16} /></td>}
              {columns.map((c) => (
                <td key={colId(c)} className={colCls(c)}>
                  <Skeleton variant="text" width={c.numeric ? '50%' : '80%'} />
                </td>
              ))}
            </tr>
          ))
        ) : display.length === 0 && emptyContent != null ? (
          <tr>
            <td className="ds-table__empty" colSpan={colCount}>{emptyContent}</td>
          </tr>
        ) : (
          (() => {
            let dataIndex = 0
            return display.map((dr) => {
              if (dr.kind === 'group') {
                const depthStyle = dr.depth > 0 ? ({ '--ds-row-depth': dr.depth } as React.CSSProperties) : undefined
                // `expanded`/`count` опциональны в типе группы (LedgerList их не
                // читает); здесь fallback до прежнего поведения DataTable.
                const isOpen = dr.expanded ?? false
                const head = onToggleExpand ? (
                  <button type="button" className="ds-table__toggle" aria-expanded={isOpen}
                    onClick={() => onToggleExpand(dr.id)}>
                    <Caret kind="branch" open={isOpen} />
                    <span>{dr.label}</span>
                  </button>
                ) : (
                  <span>{dr.label}</span>
                )
                const right = dr.aside ?? (dr.count != null ? <span className="ds-table__count">{dr.count}</span> : null)

                if (dr.cells) {
                  const from = firstProjected(columns, dr.cells)
                  const leadSpan = (selectable ? 1 : 0) + from
                  return (
                    <tr key={dr.id} className="ds-table__group">
                      <td colSpan={leadSpan} className="ds-table__lead" style={depthStyle}>
                        <div className="ds-table__grouphead">{head}{right}</div>
                      </td>
                      {columns.slice(from).map((c) => (
                        <td key={colId(c)} className={colCls(c)}>{dr.cells![colId(c)] ?? null}</td>
                      ))}
                    </tr>
                  )
                }
                if (dr.aside) {
                  return (
                    <tr key={dr.id} className="ds-table__group">
                      <td colSpan={colCount} className="ds-table__lead" style={depthStyle}>
                        <div className="ds-table__grouphead">{head}{right}</div>
                      </td>
                    </tr>
                  )
                }
                // Прежнее поведение (без cells/aside) — не трогаем разметку существующих потребителей.
                // ds-table__lead — не про «первую колонку» здесь (у группы она одна,
                // на весь colSpan), а про то, что именно этот класс несёт CSS-переменную
                // --ds-row-depth. Сегодня groupByValue всегда отдаёт depth 0, поэтому
                // видимо это не меняет ничего; для вложенных групп, которые собирает
                // потребитель вручную, отступ появится.
                return (
                  <tr key={dr.id} className="ds-table__group">
                    <td colSpan={colCount} className="ds-table__lead" style={depthStyle}>
                      {onToggleExpand ? (
                        <button type="button" className="ds-table__toggle"
                          aria-expanded={isOpen}
                          onClick={() => onToggleExpand(dr.id)}>
                          <Caret kind="branch" open={isOpen} />
                          <span>{dr.label}</span>
                          {dr.count != null && <span className="ds-table__count">{dr.count}</span>}
                        </button>
                      ) : (
                        <>
                          <span>{dr.label}</span>
                          {dr.count != null && <span className="ds-table__count">{dr.count}</span>}
                        </>
                      )}
                    </td>
                  </tr>
                )
              }
              // Только чётные строки несут класс полосы: переопределения фона
              // потребитель адресует по семантике строки (удалено, выделено,
              // служебная), а не по чётности, поэтому `--odd` ему не нужен —
              // и держать мёртвый класс "на всякий случай" не стоит.
              const isEven = dataIndex++ % 2 === 1
              const isSel = selected.has(dr.id)
              const rs = rowState?.(dr.row)
              return (
                <tr
                  key={dr.id}
                  className={[
                    managed && isEven && 'ds-table__row--even',
                    rs?.muted && 'ds-table__row--muted',
                    isSel && 'is-selected',
                    onRowClick && 'is-clickable',
                  ].filter(Boolean).join(' ') || undefined}
                  // `aria-current`, а не `aria-selected`: последний законен
                  // только под ролью grid/listbox, которой у таблицы нет, и на
                  // обычной `<tr>` он выражение без грамматики.
                  //
                  // Только в режиме ПОДСВЕТКИ. `selectedIds` без
                  // `onSelectionChange` означает «вот эта строка сейчас
                  // открыта» — одна из набора, ровно `current`. С
                  // `onSelectionChange` это мультивыбор галочками, состояние
                  // каждой строки уже произносит её чекбокс, и `aria-current`
                  // соврал бы: «текущих» строк стало бы столько, сколько
                  // отмечено.
                  aria-current={isSel && !selectable ? 'true' : undefined}
                  onClick={onRowClick ? () => onRowClick(dr.row) : undefined}
                >
                  {selectable && (
                    <td className="ds-table__sel" onClick={(e) => e.stopPropagation()}>
                      {/* `<label>` — не обёртка ради обёртки, а САМА ЦЕЛЬ клика.
                          Критерий про размер цели (SC 2.5.8) меряет область,
                          принимающую указатель, а у флажка внутри label это
                          вся ячейка, а не коробка флажка. Отсюда флажок
                          остаётся мелким (его размер — вопрос вида), а попасть
                          в него можно по всей ячейке 32×33. Пустой текст label
                          доступное имя не отбирает: `aria-label` на самом
                          флажке сильнее. */}
                      <label className="ds-table__selbox">
                        <input type="checkbox" aria-label={t['dataTable.selectRow'](dr.id)}
                          checked={isSel} onChange={() => toggleRow(dr.id)} />
                      </label>
                    </td>
                  )}
                  {columns.map((c, i) => {
                    // Назначенная колонка — `<th scope="row">`, а не `<td>`:
                    // диктор объявляет её при переходе по ячейкам строки. Тег
                    // считается здесь, чтобы ниже осталась одна ветка
                    // содержимого, а не две расходящиеся копии.
                    const head = isRowHeader(c)
                    const Cell = head ? 'th' : 'td'
                    return (
                    <Cell key={colId(c)}
                      scope={head ? 'row' : undefined}
                      className={colCls(c,
                        i === 0 && 'ds-table__lead',
                        // Гуттер каретки держат ВСЕ строки дерева, а не одни
                        // листья: каретка лежит в нём абсолютом, вне потока, и
                        // текст у узла и у листа начинается в одном месте.
                        // Отличать лист классом больше нечего — и не надо:
                        // отличие было бы верным ровно до первого блочного
                        // соседа у текста (`__rowbtn`).
                        i === 0 && treeMode && 'ds-table__lead--tree',
                        head && 'ds-table__rowhead',
                        // Ячейке действий сокращение содержимого не нужно: в ней
                        // кнопки, а не текст (DS-57).
                        isActionColumn(c) && 'ds-table__actions-cell')}
                      style={i === 0 && dr.depth > 0
                        ? ({ '--ds-row-depth': dr.depth } as React.CSSProperties)
                        : undefined}>
                      {i === 0 && dr.hasChildren && onToggleExpand && (
                        <button type="button" className="ds-table__toggle ds-table__toggle--row"
                          aria-expanded={dr.expanded}
                          aria-label={t[dr.expanded ? 'dataTable.collapseRow' : 'dataTable.expandRow'](dr.id)}
                          onClick={(e) => { e.stopPropagation(); onToggleExpand(dr.id) }}>
                          <Caret kind="branch" open={dr.expanded} />
                        </button>
                      )}
                      {/* Колонка действий — своя ветка: ячейка гасит всплытие,
                          иначе клик по «удалить» дошёл бы до onRowClick и открыл
                          строку. Гасим и клавиатурный Enter: активация кнопки с
                          клавиатуры порождает click, который всплывает так же.
                          Первая из оставшихся ветвей — `DataColumn` без `render`:
                          только там есть поле строки, которое можно напечатать.
                          Дальше `render` есть по построению — у `DisplayColumn` он
                          обязателен. */}
                      {isActionColumn(c) ? (
                        <div className="ds-table__actions"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}>
                          {assertRowActions(c.actions(dr.row)).map((a) => (
                            <Button key={a.id} type="button" variant="ghost" size="sm" iconOnly
                              tone={a.tone === 'error' ? 'error' : undefined}
                              disabled={a.disabled} aria-label={a.label}
                              onClick={a.onSelect}>
                              <Icon>{a.icon}</Icon>
                            </Button>
                          ))}
                        </div>
                      ) : head && onRowClick ? (
                        // Гашение всплытия обязательно, а не гигиенично: кнопка
                        // лежит внутри `<tr onClick>`, и без него один клик мышью
                        // позвал бы `onRowClick` ДВАЖДЫ. Активация кнопки с
                        // клавиатуры порождает такой же всплывающий click, то
                        // есть удвоение пришло бы и оттуда, — поэтому гасится
                        // событие, а не путь ввода.
                        <button type="button" className="ds-table__rowbtn"
                          onClick={(e) => { e.stopPropagation(); onRowClick(dr.row) }}>
                          {rowHeaderText(c, dr.row)}
                        </button>
                      ) : head ? rowHeaderText(c, dr.row)
                        : c.id === undefined && !c.render ? String(dr.row[c.key]) : c.render?.(dr.row)}
                    </Cell>
                  )})}
                </tr>
              )
            })
          })()
        )}
      </tbody>
      {footer && (() => {
        const from = firstProjected(columns, footer.cells)
        const leadSpan = (selectable ? 1 : 0) + from
        return (
          <tfoot>
            <tr className="ds-table__foot">
              {leadSpan > 0 && (
                <td colSpan={leadSpan} className="ds-table__lead">{footer.label}</td>
              )}
              {columns.slice(from).map((c) => (
                <td key={colId(c)} className={colCls(c)}>{footer.cells[colId(c)] ?? null}</td>
              ))}
            </tr>
          </tfoot>
        )
      })()}
    </table>
    </div>
  )
}
