import { useRef, useState } from 'react'
import { useDsText } from '../../dictionary/DsText.js'
import './Split.css'

export interface SplitProps extends React.ComponentPropsWithRef<'div'> {
  /** Ось раскладки. `row` (default) — пейны бок о бок, разделитель вертикальный. */
  direction?: 'row' | 'column'
  children: [React.ReactNode, React.ReactNode]
  /** Размер первого пейна, px (uncontrolled). */
  defaultSize?: number
  /** Размер первого пейна, px (controlled). */
  size?: number
  onSizeChange?: (size: number) => void
  /** Минимум первого пейна, px. */
  min?: number
  /** Максимум первого пейна, px. */
  max?: number
  /** Двойной клик по разделителю сворачивает первый пейн (и разворачивает обратно). */
  collapsible?: boolean
  /**
   * Запоминать размер между сессиями в `localStorage` под ключом
   * `ds-split:<storageKey>`. Работает только в неконтролируемом режиме
   * (при заданном `size` состоянием владеет потребитель — хранение его дело).
   */
  storageKey?: string
  /** Доступное имя разделителя. */
  'aria-label'?: string
}

const STEP = 16

/**
 * Шкала интерфейса В ТОМ МЕСТЕ, где стоит разделитель: `.ds-scale` вешают и на
 * поддерево, так что читать её с `:root` значило бы ответить про другой узел.
 *
 * Переменная не зарегистрирована `@property`, поэтому приходит строкой, как
 * написана. Договор системы — число (`--ds-ui-scale: 1.15`); `calc(…)` в ней
 * `parseFloat` не разберёт, и тогда шкала считается равной 1 — поведение до
 * DS-343, не хуже него. Ноль и отрицательное отсекаются туда же: на них
 * делят.
 */
function uiScale(el: Element): number {
  const v = parseFloat(getComputedStyle(el).getPropertyValue('--ds-ui-scale'))
  return v > 0 ? v : 1
}

function storeName(key: string) { return `ds-split:${key}` }

function readStored(key: string | undefined): number | null {
  if (!key || typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(storeName(key))
    const n = raw != null ? Number(raw) : NaN
    return Number.isFinite(n) ? n : null
  } catch { return null }
}

export function Split({
  direction = 'row', children, defaultSize = 240, size, onSizeChange,
  min = 80, max = Infinity, collapsible, storageKey, className, style,
  'aria-label': ariaLabel, ...rest
}: SplitProps) {
  const t = useDsText()
  const handleLabel = ariaLabel ?? t['split.resize']
  const rootRef = useRef<HTMLDivElement>(null)
  // Первая панель — по ссылке, потому что перетаскивание толкается от её
  // ОТРИСОВАННОГО размера, а не только от состояния (DS-349, `startSize`).
  const firstRef = useRef<HTMLDivElement>(null)
  const clamp = (v: number) => Math.max(min, Math.min(v, max))
  // Начальный размер: из хранилища либо defaultSize. Сохранённый 0 — это
  // «свёрнуто» (осознанно ниже min), его не клэмпим до min; прочее клэмпим.
  const [uncontrolled, setUncontrolled] = useState(() => {
    const stored = readStored(storageKey)
    if (stored == null) return defaultSize
    return stored <= 0 ? 0 : clamp(stored)
  })
  // Свёрнутое состояние помнит прежний размер, чтобы вернуть его при разворачивании.
  const collapsedFrom = useRef<number | null>(null)
  const current = size ?? uncontrolled
  const vertical = direction === 'column'

  // Запись — только для неконтролируемого режима: контролируемым владеет потребитель.
  function persist(v: number) {
    if (!storageKey || size != null || typeof localStorage === 'undefined') return
    try { localStorage.setItem(storeName(storageKey), String(v)) } catch { /* приватный режим */ }
  }
  // Применить уже финальное значение: уведомить, обновить локальное состояние, сохранить.
  const apply = (v: number) => {
    onSizeChange?.(v)
    if (size == null) setUncontrolled(v)
    persist(v)
  }
  const commit = (v: number) => apply(clamp(v))

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    const handle = e.currentTarget as HTMLElement
    handle.setPointerCapture?.(e.pointerId)
    const startPos = vertical ? e.clientY : e.clientX
    // Размер живёт в единицах шкалы (`flexBasis` ниже умножает его на
    // `--ds-ui-scale`), а ход мыши приходит в CSS px. Сложенные как есть, они
    // уводили разделитель в шкалу раз быстрее курсора: +60 px мыши давали +69
    // на 1.15 и +90 на 1.5 (DS-343). Шкала читается на нажатии, а не на
    // каждом движении: за одно перетаскивание она не меняется.
    const scale = uiScale(handle)
    /**
     * СТАРТ БЕРЁТСЯ С ОТРИСОВАННОГО, КОГДА КОНТЕЙНЕР ПРИЖАЛ ПАНЕЛЬ
     * (DS-349).
     *
     * С DS-326 первая панель `flex: 0 1 auto`: её размер
     * ПРЕДПОЧТИТЕЛЬНЫЙ, а потолок — контейнер. Состояние потолка не знает —
     * утянул разделитель за край, и `current` растёт дальше, чем панель
     * нарисована. Следующее перетаскивание стартовало с `current`, и пока ход
     * не съедал разницу, разделитель стоял на месте: мёртвая зона под рукой,
     * тем длиннее, чем дальше утянули. Замерено в chromium на хосте 400:
     * панель прижата к 376, состояние 500 — обратный ход на 60 px не двигал
     * полосу вовсе.
     *
     * Отброшено: КЛЭМПИТЬ СОСТОЯНИЕ по контейнеру на ходу. Тогда размер в
     * состоянии становится функцией ширины окна, а он — публичный договор
     * (`size`, `min`, `max`, `storageKey`): подобранная на широком экране
     * раскладка, открытая однажды на узком, сохранилась бы узкой НАВСЕГДА и
     * молча. Предпочтительный размер на то и предпочтительный, что переживает
     * тесный контейнер.
     *
     * Правка бьёт ровно туда, где живёт дефект: пока панель не прижата,
     * отрисованное равно состоянию, и старт тот же до бита. Порог в единицу —
     * против дробей `getBoundingClientRect` и деления на шкалу.
     *
     * Разметки может не быть вовсе (jsdom: все прямоугольники нулевые), и
     * тогда «панель прижата к нулю» неотличимо от «раскладки нет». Свидетель —
     * СОБСТВЕННАЯ толщина полосы: в браузере она не меньше `--ds-target-min`,
     * без раскладки — ноль. Панель на эту роль не годится: ноль у неё бывает
     * и настоящим (свёрнута).
     */
    const drawn = (firstRef.current?.getBoundingClientRect()[vertical ? 'height' : 'width'] ?? 0) / scale
    const laidOut = handle.getBoundingClientRect()[vertical ? 'height' : 'width'] > 0
    const startSize = laidOut && drawn < current - 1 ? drawn : current
    const move = (ev: PointerEvent) => {
      const delta = (vertical ? ev.clientY : ev.clientX) - startPos
      commit(startSize + delta / scale)
    }
    /**
     * У ЖЕСТА ТРИ КОНЦА, А НЕ ОДИН (DS-348).
     *
     * Снимался слушатель только по `pointerup`, и на таче этого конца может не
     * быть вовсе: браузер забирает жест под прокрутку и шлёт `pointercancel`.
     * `pointermove` оставался висеть на `window`, и СЛЕДУЮЩИЙ проход указателя
     * двигал разделитель без единого нажатия — с тем же `startPos`, то есть
     * скачком. От шкалы не зависит, было и до DS-343.
     *
     * `lostpointercapture` — третий, и он не про тач: захват теряется и когда
     * узел уходит из документа посреди перетаскивания (перерисовка родителя,
     * уход со страницы). Ни `pointerup`, ни `pointercancel` тогда не придут.
     *
     * Снятие ИДЕМПОТЕНТНО намеренно: концы приходят по одному, но какой именно
     * — решает браузер, и все три зовут одно и то же.
     */
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      handle.removeEventListener('lostpointercapture', end)
      // Снятие СНАЧАЛА, освобождение потом: `releasePointerCapture` сам шлёт
      // `lostpointercapture`, и обратный порядок звал бы `end` из `end`.
      //
      // Спрашиваем, а не ловим: `releasePointerCapture` БРОСАЕТ NotFoundError,
      // когда захвата уже нет, — ровно положение после `pointercancel`. Ветка
      // `?.` защищает от отсутствия самого метода (jsdom), а не от броска.
      if (handle.hasPointerCapture?.(e.pointerId)) handle.releasePointerCapture(e.pointerId)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    handle.addEventListener('lostpointercapture', end)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const dec = vertical ? 'ArrowUp' : 'ArrowLeft'
    const inc = vertical ? 'ArrowDown' : 'ArrowRight'
    if (e.key === inc) { e.preventDefault(); commit(current + STEP) }
    else if (e.key === dec) { e.preventDefault(); commit(current - STEP) }
    else if (e.key === 'Home') { e.preventDefault(); commit(min) }
    else if (e.key === 'End' && Number.isFinite(max)) { e.preventDefault(); commit(max) }
  }

  function onDoubleClick() {
    if (!collapsible) return
    // Толкаемся от текущего размера, а не от ref: свёрнутое состояние могло
    // прийти из хранилища (0) в новой сессии, где ref ещё пуст.
    if (current > 0) {
      // Свернуть: запоминаем размер и уводим пейн в 0 (мимо min — это осознанный
      // «свёрнут», а не «минимальный размер»). apply минует clamp намеренно.
      collapsedFrom.current = current
      apply(0)
    } else {
      const restore = collapsedFrom.current ?? defaultSize
      collapsedFrom.current = null
      apply(restore)
    }
  }

  // Для aria-valuemax при бесконечном max берём текущий размер контейнера.
  const containerMax = Number.isFinite(max)
    ? max
    : Math.round(rootRef.current?.getBoundingClientRect()[vertical ? 'height' : 'width'] ?? current)

  return (
    <div
      ref={rootRef}
      className={['ds-split', className].filter(Boolean).join(' ')}
      data-direction={direction}
      style={style}
      {...rest}
    >
      <div
        ref={firstRef}
        className="ds-split__pane ds-split__pane--first"
        // Размер пейна — интерфейсный размер: через --ds-ui-scale, как width у
        // SideNav и height у BarChart, иначе при масштабировании UI он отставал бы.
        style={{ flexBasis: `calc(${current}px * var(--ds-ui-scale, 1))` }}
      >{children[0]}</div>
      <div
        className="ds-split__bar"
        role="separator"
        aria-orientation={vertical ? 'horizontal' : 'vertical'}
        aria-label={handleLabel}
        aria-valuemin={min}
        aria-valuemax={containerMax}
        aria-valuenow={current}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        onDoubleClick={onDoubleClick}
      />
      <div className="ds-split__pane ds-split__pane--second">{children[1]}</div>
    </div>
  )
}
