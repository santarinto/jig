import { useRef } from 'react'
import { rovingTarget } from '../../internal/roving.js'
import '../../styles/disabled-item.css'
import '../../styles/visually-hidden.css'
import './ToggleGroup.css'
import { Icon } from '../../icons/index.js'

export interface ToggleItem {
  id: string
  /**
   * Подпись — СТРОКА, не ReactNode (как Tab.label): вложить `<a>`/`<button>` в
   * подпись невозможно по типу, весь класс no-nested-interactive закрыт
   * компилятором, а не гейтом. Закон CLAUDE.md «ломать компиляцию».
   */
  label: string
  /**
   * Значок перед подписью. Декоративен: оборачивается в
   * `<span aria-hidden="true">`, что вырезает всё поддерево из дерева
   * доступности — включая собственный aria-label потомка (спека ARIA), поэтому
   * cloneElement не нужен. Смысл несёт label, не значок (контракт Tab.icon).
   */
  icon?: React.ReactNode
  /** Число рядом с подписью. Озвучивается, ноль показывается, рендерится сырым (Tab.count). */
  count?: number
  /** Недоступный: не выбирается, пропускается roving-фокусом. */
  disabled?: boolean
}

/**
 * Пункт свотч-группы: та же семантика «один из группы», но носитель — ЦВЕТ.
 *
 * `swatch` — CSS-цвет плашки, и он приходит из ДАННЫХ приложения: какой цвет у
 * метки «bug», знает потребитель, а не система. Система знает другое — из
 * какого НАБОРА выбирать: восемь `--ds-chart-*` (закон CLAUDE.md, категориальная
 * палитра системы), про которые доказано, что любые два различимы, в том числе
 * при трёх видах дальтонизма. Восемь хексов, лежащие в коде страницы, — дефект
 * не стиля, а поведения: в тёмной теме они не переключатся.
 *
 * `label` в свотче обязателен и визуально скрыт: он ОСТАЁТСЯ доступным именем.
 * Хекс именем не годится — это значение, а не имя.
 */
export interface SwatchItem extends ToggleItem {
  /** Цвет плашки. Ожидается `var(--ds-chart-N)`; литерал допустим — цвет метки это данные. */
  swatch: string
}

interface ToggleGroupBaseProps {
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
}

/**
 * Вид и набор связаны ТИПОМ, а не соглашением: `variant="swatch"` требует
 * `SwatchItem[]`, то есть цвет у каждого пункта. Плашка без цвета — не «плашка
 * по умолчанию», а пустой квадрат, который читается как «цвет не выбран»; закон
 * CLAUDE.md про ломать компиляцию, а не деградировать.
 */
type ToggleGroupItemsProps =
  | { variant?: 'framed' | 'plain'; items: ToggleItem[]; size?: 'sm' | 'md' }
  /**
   * У свотча `size` НЕТ, и это отказ, а не забывчивость: размер плашки задаёт
   * `--ds-size-swatch`, а `--sm`/`--md` правят высоту и падинг сегмента, до
   * которых свотчу дела нет. Принять проп и ничего им не сделать — деградация,
   * запрещённая законом CLAUDE.md: `size="sm"` рисовался бы неотличимо от `md`,
   * и разбираться в этом пришлось бы потребителю. Найдено на ревью.
   */
  | { variant: 'swatch'; items: SwatchItem[] }

export type ToggleGroupProps = ToggleGroupBaseProps & ToggleGroupItemsProps & (
  | { mode: 'single'; value: string; onChange: (id: string) => void }
  | { mode: 'multiple'; value: string[]; onChange: (ids: string[]) => void }
)

export function ToggleGroup(props: ToggleGroupProps) {
  const { items, variant = 'framed', className } = props
  const isSwatch = variant === 'swatch'
  // Размер читается только там, где он есть в типе. Класс размера свотчу не
  // ставится вовсе — правила `--sm`/`--md` трогают высоту и падинг сегмента, а
  // у плашки они свои; лишний класс читался бы как «размер учтён».
  // Сужение идёт по `props.variant`, а не по локальному `isSwatch`: TypeScript
  // связывает члены union только с проверкой самого дискриминанта.
  const size = props.variant === 'swatch' ? null : (props.size ?? 'md')
  const listRef = useRef<HTMLDivElement>(null)

  // Пустой набор: рамка вокруг пустоты — баг вёрстки, заглушка избыточна.
  if (items.length === 0) return null

  const firstEnabled = items.findIndex((i) => !i.disabled)
  // Якорь таб-порядка деривируется из value, не хранится в стейте (паттерн Tabs):
  // single — выбранный (или первый доступный, если value не совпал); multiple —
  // всегда первый доступный. -1 (всё выключено) → tabIndex=0 не получает никто.
  const selectedIndex = props.mode === 'single'
    ? items.findIndex((i) => i.id === props.value && !i.disabled)
    : -1
  const anchor = selectedIndex >= 0 ? selectedIndex : firstEnabled

  const isChecked = (item: ToggleItem) =>
    props.mode === 'single' ? item.id === props.value : props.value.includes(item.id)

  const itemEls = () => listRef.current?.querySelectorAll<HTMLElement>('.ds-togglegroup__item')
  const focusItem = (i: number) => itemEls()?.[i]?.focus()
  function focusedIndex() {
    const els = itemEls()
    if (els) for (let i = 0; i < els.length; i++) if (els[i] === document.activeElement) return i
    return anchor
  }

  function select(item: ToggleItem) {
    if (item.disabled) return
    if (props.mode === 'single') {
      props.onChange(item.id)
    } else {
      const has = props.value.includes(item.id)
      const next = has ? props.value.filter((id) => id !== item.id) : [...props.value, item.id]
      // Возвращаем в порядке items, а не порядке кликов — стабильный контракт.
      props.onChange(items.filter((it) => next.includes(it.id)).map((it) => it.id))
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    // Space/Enter не наши — их обрабатывает нативная <button> (клик → select).
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const ni = rovingTarget(items, focusedIndex(), e.key, 'horizontal')
    if (ni === null) return // клавиша не наша — событие не трогаем
    e.preventDefault()
    if (ni < 0) return // идти некуда (край/всё выключено)
    if (props.mode === 'single') props.onChange(items[ni]!.id) // стрелка ВЫБИРАЕТ
    focusItem(ni)
  }

  const rootCls = [
    'ds-togglegroup',
    `ds-togglegroup--${variant}`,
    size && `ds-togglegroup--${size}`,
    className,
  ].filter(Boolean).join(' ')

  return (
    <div
      className={rootCls}
      ref={listRef}
      role={props.mode === 'single' ? 'radiogroup' : 'group'}
      aria-label={props['aria-label']}
      aria-labelledby={props['aria-labelledby']}
      onKeyDown={onKeyDown}
    >
      {items.map((item, i) => {
        const checked = isChecked(item)
        return (
          <button
            key={item.id}
            type="button"
            className={['ds-togglegroup__item', checked && 'is-active'].filter(Boolean).join(' ')}
            role={props.mode === 'single' ? 'radio' : undefined}
            aria-checked={props.mode === 'single' ? checked : undefined}
            aria-pressed={props.mode === 'multiple' ? checked : undefined}
            aria-disabled={item.disabled || undefined}
            tabIndex={i === anchor ? 0 : -1}
            onClick={() => select(item)}
          >
            {isSwatch ? (
              <>
                {/* Плашка декоративна: смысл несёт label, как icon у обычного
                    пункта. Цвет уезжает в переменную, а не в background
                    напрямую, — CSS сам решает, чем её красить (плашка, медальон,
                    обводка), и правило живёт в листе, а не в разметке. */}
                <span
                  className="ds-togglegroup__swatch"
                  aria-hidden="true"
                  style={{ ['--ds-swatch-color' as string]: (item as SwatchItem).swatch }}
                />
                <span className="ds-visually-hidden">{item.label}</span>
              </>
            ) : (
              <>
                {item.icon != null && <Icon className="ds-togglegroup__icon" aria-hidden="true">{item.icon}</Icon>}
                {item.label}
                {item.count != null && <span className="ds-togglegroup__count">{item.count}</span>}
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}
