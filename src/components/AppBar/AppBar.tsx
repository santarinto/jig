import { isValidElement, useRef, useState } from 'react'
import type { CommandAction } from '../CommandBar/CommandBar.js'
import { FoldingActions, num, outerWidth, useActionOverflow } from '../../internal/actionOverflow.js'
import './AppBar.css'

export interface AppBarProps extends React.ComponentPropsWithRef<'header'> {
  brand: React.ReactNode
  /**
   * Действия шапки ДАННЫМИ (DS-306). Не влезший хвост сворачивается в
   * «Ещё» тем же механизмом, что у `CommandBar`: форма действия та же,
   * `CommandAction`.
   *
   * До 4.3.0 здесь был `ReactNode`, и шапка на узком экране уводила документ
   * вбок: чужие узлы она не знала и свернуть не могла.
   */
  actions?: CommandAction[]
  /**
   * То, что действием НЕ является: аватар, инициалы, счётчик уведомлений,
   * «Выйти». Прижат вправо, в свёртку не попадает и резервирует ширину
   * раньше действий. Имя слота то же, что у `CommandBar`: одно значение —
   * одно имя.
   */
  trailing?: React.ReactNode
  /**
   * Центр: поиск, верхняя навигация. Сжимается первым, но не ниже своего ПОЛА —
   * `max(12em, min-content содержимого)`. Не влезает и при полностью свёрнутых
   * действиях — уходит вторым рядом шапки на всю ширину (DS-309).
   */
  children?: React.ReactNode
}

/** Классы ряда и «Ещё»: разметку рисует общий механизм, имена — шапки.
 *  Значка среди них нет (DS-360) — его несёт `Button.icon`, а не свой
 *  класс-обёртка поверх безымянного `children`. */
const FOLDING = {
  row: 'ds-appbar__row',
  sep: 'ds-appbar__sep',
  more: 'ds-appbar__more',
}

/**
 * Старый вызов обязан БРОСАТЬ, а не деградировать: `actions={<Button/>}` под
 * `any` у потребителя иначе нарисовал бы пустую шапку без единой ошибки.
 * Массив узлов (`actions={[<Button/>, …]}`) — тот же старый вызов, и ловится
 * здесь же.
 */
function assertActions(actions: unknown): asserts actions is CommandAction[] | undefined {
  if (actions === undefined) return
  // `label` проверяется на ПРИСУТСТВИЕ, а не на `typeof === 'string'`: с
  // DS-358 подпись действия — `ReactNode` (`ActionBase`), и строгая
  // проверка бросала бы на законном `label={<b>Смена</b>}`. Старую форму она не
  // ловила и раньше: узел вместо действия отсекает `isValidElement`, а массив
  // вместо узла — `Array.isArray`.
  const ok = Array.isArray(actions) && actions.every((a) =>
    a != null && typeof a === 'object' && !isValidElement(a)
    && typeof (a as CommandAction).id === 'string' && 'label' in a)
  if (ok) return
  throw new TypeError(
    'AppBar: `actions` принимает CommandAction[] — `[{ id, label, onSelect }]`, как у CommandBar, '
    + 'а не ReactNode. Кнопки становятся элементами массива; то, что не действие '
    + '(аватар, бейдж, «Выйти»), переезжает в `trailing`.',
  )
}

export function AppBar({ brand, actions, trailing, className, children, ...rest }: AppBarProps) {
  assertActions(actions)
  const list = actions ?? []
  const barRef = useRef<HTMLElement>(null)
  const brandRef = useRef<HTMLDivElement>(null)
  const centerRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const trailingRef = useRef<HTMLSpanElement>(null)
  const [stacked, setStacked] = useState(false)

  // ПОРЯДОК УСТУПКИ МЕСТА (DS-306, DS-309): центр до своего пола →
  // свёртка действий → центр вторым рядом → перенос бренда.
  //
  // Всё решает один бюджет, и каждое слагаемое в нём — величина, от свёртки и
  // от второго ряда НЕ зависящая: бренд В ОДНУ СТРОКУ, пол центра, ширина
  // «Ещё» и хвоста. Возьми текущие ширины — и перенесённый бренд или центр,
  // ушедший вниз, освобождали бы место, раскладка возвращалась бы назад, и
  // так по кругу.
  const { visible, visibleWidth } = useActionOverflow({
    actions: list, barRef, rowRef, moreRef,
    deps: [brand, trailing, children],
    reserved: (gap) => {
      const bar = barRef.current
      if (!bar) return 0
      const cs = getComputedStyle(bar)
      const content = bar.clientWidth - num(cs.paddingLeft) - num(cs.paddingRight)
      const barGap = num(cs.columnGap)
      const brandW = brandMaxContent(brandRef.current)
      const floor = centerFloor(centerRef.current, bar)
      const trailingW = trailingRef.current ? outerWidth(trailingRef.current) : 0
      const trailingPart = trailingW > 0 ? trailingW + (list.length > 0 ? gap : 0) : 0
      // Действия, свёрнутые ЦЕЛИКОМ: пустой ряд, зазор и «Ещё».
      const moreW = moreRef.current ? moreRef.current.getBoundingClientRect().width : 0
      const foldedAll = list.length > 0 ? gap + moreW : 0
      // Второй ряд — только когда центр не влезает даже при всём свёрнутом.
      const stack = floor > 0 && brandW + barGap + floor + barGap + foldedAll + trailingPart > content + 0.5
      setStacked(stack)
      // Уступки НАКАПЛИВАЮТСЯ: второй ряд наступает после полной свёртки и её
      // не отменяет. Развернуть действия в освободившемся первом ряду значило
      // бы, что на более узкой шапке их видно БОЛЬШЕ, чем на более широкой, —
      // замер это давал: 320 px — два действия, 340 px — ни одного.
      if (stack) return content
      return brandW + trailingPart + 2 * barGap + floor
    },
  })
  const folded = visible < list.length
  const collapsed = list.length > 0 && visible === 0

  return (
    <header
      ref={barRef}
      className={['ds-appbar', stacked && 'is-stacked', collapsed && 'is-collapsed', className].filter(Boolean).join(' ')}
      {...rest}
    >
      <div className="ds-appbar__brand" ref={brandRef}>{brand}</div>
      <div className="ds-appbar__center" ref={centerRef}>
        {children != null && children !== false && <div className="ds-appbar__centerbox">{children}</div>}
      </div>
      <div className={['ds-appbar__actions', folded && 'is-folded'].filter(Boolean).join(' ')}>
        {/* Свёрнутому ряду ширина ставится ЧИСЛОМ — сколько занимают видимые
            действия. Иначе ряд забирал бы весь остаток: пустота перед «Ещё»
            и ширина, отнятая у центра (DS-309). */}
        <FoldingActions
          classes={FOLDING} actions={list} visible={visible} rowRef={rowRef} moreRef={moreRef}
          rowStyle={folded && visibleWidth != null ? { width: visibleWidth } : undefined}
        />
        {trailing != null && <span className="ds-appbar__trailing" data-ds-trailing="" ref={trailingRef}>{trailing}</span>}
      </div>
    </header>
  )
}

/**
 * Пол центра, px: его min-content. Объявленная часть пола живёт в ЛИСТЕ, а не
 * здесь: `.ds-appbar__centerbox` с полем ввода несёт `min-width: 12em`, и
 * min-content центра поэтому `max(12em, min-content начинки)`. Читается
 * снятием сжатия на время чтения, как ширина бренда.
 *
 * `is-stacked` СНИМАЕТСЯ на время чтения. Во втором ряду пол обнулён листом, и
 * замер, снятый там, отвечал бы «пол 18 px» (поле `width: 100%`), шапка
 * возвращалась бы в строку, где пол снова 12em, и уходила обратно — каждое
 * изменение высоты будило бы `ResizeObserver` на следующий круг. Пол обязан
 * быть величиной, от второго ряда не зависящей.
 */
function centerFloor(el: HTMLElement | null, bar: HTMLElement): number {
  if (!el || !el.firstElementChild) return 0
  const { flex, width } = el.style
  const stacked = bar.classList.contains('is-stacked')
  if (stacked) bar.classList.remove('is-stacked')
  el.style.flex = '0 0 auto'
  el.style.width = 'min-content'
  const w = el.getBoundingClientRect().width
  el.style.flex = flex
  el.style.width = width
  if (stacked) bar.classList.add('is-stacked')
  return w
}

/**
 * Ширина бренда в одну строку, в каком бы состоянии он ни был сейчас.
 * Перенесённый бренд уже, чем его строка, и прочесть строку можно только
 * сняв сжатие: инлайновый `flex: 0 0 auto` на время чтения. Записи и чтения идут
 * подряд, без кадра между ними, так что глазом этого не видно.
 */
function brandMaxContent(el: HTMLElement | null): number {
  if (!el) return 0
  const prev = el.style.flex
  el.style.flex = '0 0 auto'
  const w = el.getBoundingClientRect().width
  el.style.flex = prev
  return w
}
