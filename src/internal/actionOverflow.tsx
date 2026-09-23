/**
 * Свёртка хвоста действий в «Ещё» — ОДНА на систему (DS-239, вынесена на
 * DS-306).
 *
 * Здесь живёт всё, что у полосы действий общего: замер, счёт, разметка ряда и
 * кнопка «Ещё» с меню. Пользуются `CommandBar` и `AppBar`. У каждого из них
 * остаётся только СВОЁ: что ещё занимает ширину полосы (`reserved`) и что
 * вокруг ряда нарисовано. Второй реализации свёртки заводить нельзя по той же
 * причине, по какой у системы одна палитра категорий: два ответа на один
 * вопрос расходятся молча, и «Ещё» в шапке начала бы вести себя не так, как
 * «Ещё» в панели документа.
 *
 * Почему счёт — арифметика, а не флекс, и почему свёрнутые остаются в потоке,
 * записано в `overflow.ts` и в `CommandBar.css`; здесь не повторяется.
 *
 * КЛАССЫ ПРИХОДЯТ ОТ ВЛАДЕЛЬЦА (`classes`), целыми литералами. Ряд, разделитель
 * и «Ещё» называются классами компонента, который их нарисовал. Общий
 * блок-класс сломал бы гейт `block-ownership` (один блок — один компонент) и
 * заставил бы переименовать классы `CommandBar`, на которые уже смотрят
 * `measure` и тесты. Литералом, а не склейкой из префикса, — потому что гейт
 * `subcomponent-classes` ищет класс разделителя в исходнике владельца:
 * склеенное имя там не найти ни ему, ни `grep`.
 *
 * ЗНАЧКА СРЕДИ НИХ БОЛЬШЕ НЕТ (DS-360): `.ds-cmdbar__icon` и
 * `.ds-appbar__icon` каждый решали одно и то же на своей стороне — то, что уже
 * умеет `Button.icon`. Действие отдаёт значок кнопке ЧЕРЕЗ ЭТОТ ПРОП, а не
 * безымянным `children` со своим классом-обёрткой: метрику и отступ от подписи
 * держит `.ds-btn__icon` самой кнопки, а нормализацию чужого SVG (`<Icon>`,
 * гейт `icon-contract`) — теперь тоже она, внутри себя; оборачивать значок
 * здесь второй раз не нужно.
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '../components/Button/Button.js'
import { DropdownMenu, type DropdownItem } from '../components/DropdownMenu/DropdownMenu.js'
import type { CommandAction } from '../components/CommandBar/CommandBar.js'
import { useDsText } from '../dictionary/DsText.js'
import { fitCount, overflowCost, type OverflowItem } from './overflow.js'

/** `parseFloat` от пустой строки — `NaN`; в jsdom лист не подключён, и это норма. */
export const num = (v: string) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/** Полная ширина узла вместе с его полями. */
export function outerWidth(el: HTMLElement): number {
  const cs = getComputedStyle(el)
  return el.getBoundingClientRect().width + num(cs.marginLeft) + num(cs.marginRight)
}

/** Перед этим действием стоит разделитель. У нулевого — никогда. */
export const startsGroup = (actions: readonly CommandAction[], i: number) =>
  i > 0 && actions[i]!.group !== actions[i - 1]!.group

export interface ActionOverflowOptions {
  actions: readonly CommandAction[]
  /** Полоса: от её ширины за вычетом паддингов считается бюджет. */
  barRef: React.RefObject<HTMLElement | null>
  /** Ряд действий: из него читаются ширины действий, разделителя и `gap`. */
  rowRef: React.RefObject<HTMLElement | null>
  /** Обёртка «Ещё»: её ширина — слагаемое бюджета. */
  moreRef: React.RefObject<HTMLElement | null>
  /**
   * Сколько ширины полосы занято НЕ действиями, px, вместе с зазорами до них.
   * Получает `gap` ряда. Обязано быть величиной, от свёртки НЕ зависящей, —
   * иначе появление «Ещё» меняет бюджет, и счёт начинает колебаться.
   */
  reserved: (gap: number) => number
  /** Что ещё, кроме `actions`, меняет бюджет и требует перемерить. */
  deps?: readonly unknown[]
}

/**
 * Сколько действий видно и что ушло в меню.
 *
 * Начальное значение — ВСЕ: первый кадр полоса отдаёт целиком, а замер
 * приходит в `useLayoutEffect`, то есть до отрисовки. Обратный порядок
 * («сначала ничего, потом померим») дал бы мигание из «Ещё» в полный ряд на
 * каждой перерисовке потребителя.
 */
export function useActionOverflow({ actions, barRef, rowRef, moreRef, reserved, deps = [] }: ActionOverflowOptions) {
  const [count, setCount] = useState(actions.length)
  const [visibleWidth, setVisibleWidth] = useState<number | null>(null)
  const visible = Math.min(count, actions.length)

  // Последняя `reserved` без перезапуска эффектов: у вызывающего она — новая
  // стрелка на каждый рендер, и зависимость от неё переподключала бы
  // наблюдатель на каждой перерисовке.
  const reservedRef = useRef(reserved)
  reservedRef.current = reserved

  const measure = useCallback(() => {
    const bar = barRef.current
    const row = rowRef.current
    if (!bar || !row) return
    const gap = num(getComputedStyle(row).columnGap)
    const barCs = getComputedStyle(bar)

    // Ширины — с НАСТОЯЩИХ узлов: в DOM лежат ВСЕ действия и ВСЕ разделители,
    // не влезшие лишь спрятаны `visibility`. Поэтому натуральная ширина
    // читается у любого из них в любом состоянии, и не нужен ни скрытый
    // ряд-двойник, ни отращивание по одному действию за кадр.
    const nodes = [...row.querySelectorAll<HTMLElement>('[data-ds-action]')]
    const items: OverflowItem[] = actions.map((_, i) => ({
      width: nodes[i]?.getBoundingClientRect().width ?? 0,
      startsGroup: startsGroup(actions, i),
    }))
    const sep = row.querySelector<HTMLElement>('[role="separator"]')

    // Бюджет считается от ширины ПОЛОСЫ, а не ряда, и это главное место, где
    // свёртку легко сделать автоколебательной: ширина ряда зависит от того,
    // нарисована ли «Ещё», а «Ещё» — от того, что влезло в ряд. Полоса же не
    // зависит ни от чего внутри себя, а ширина «Ещё» входит в расчёт числом.
    const available = bar.clientWidth
      - num(barCs.paddingLeft) - num(barCs.paddingRight)
      - reservedRef.current(gap)

    const metrics = {
      gap,
      sepWidth: sep ? outerWidth(sep) : 0,
      moreWidth: moreRef.current ? moreRef.current.getBoundingClientRect().width : 0,
    }
    const k = fitCount(items, { ...metrics, available })
    setCount(k)
    // Два числа, а не объект: `useState` гасит повторный рендер только на
    // равном по `Object.is`, и объект перерисовывал бы полосу на каждый замер.
    setVisibleWidth(overflowCost(items, k, metrics))
    // `deps` раскрываются в список намеренно: длина у вызывающего постоянна, а
    // бюджет у шапки зависит от бренда и хвоста, которых в `actions` нет.
  }, [actions, barRef, rowRef, moreRef, ...deps])

  useLayoutEffect(() => {
    measure()
    const bar = barRef.current
    if (!bar || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(bar)
    return () => ro.disconnect()
  }, [measure, barRef])

  // Шрифт доезжает ПОСЛЕ первой раскладки, и до этого подписи уже, а полоса
  // сворачивает меньше, чем надо. Без этого прохода дефект виден только на
  // холодной загрузке и выглядит случайным.
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return
    let alive = true
    document.fonts.ready.then(() => { if (alive) measure() })
    return () => { alive = false }
  }, [measure])

  /**
   * `visibleWidth` — сколько ряд занимает видимыми действиями, px; `null` до
   * первого замера. Панели не нужен: её ряд забирает остаток полосы. Шапке
   * нужен (DS-309): ряд шириной «сколько осталось» оставлял бы пустоту
   * перед «Ещё» и отнимал ширину у центра.
   */
  return { visible, visibleWidth, folded: actions.slice(visible) }
}

export interface FoldingActionsClasses {
  row: string
  sep: string
  more: string
}

export interface FoldingActionsProps {
  /** Классы владельца. */
  classes: FoldingActionsClasses
  actions: readonly CommandAction[]
  visible: number
  rowRef: React.Ref<HTMLDivElement>
  moreRef: React.Ref<HTMLDivElement>
  /** Инлайновый стиль ряда: шапка ставит свёрнутому ряду ширину числом. */
  rowStyle?: React.CSSProperties
}

/**
 * Ряд действий и кнопка «Ещё» — две соседние ноды, без обёртки: куда их
 * положить и что стоит рядом, решает владелец.
 */
export function FoldingActions({ classes, actions, visible, rowRef, moreRef, rowStyle }: FoldingActionsProps) {
  const text = useDsText()
  const folded = actions.slice(visible)

  const menuItems: DropdownItem[] = folded.flatMap((a, i) => {
    const item: DropdownItem = {
      id: a.id,
      label: a.label,
      icon: a.icon,
      tone: a.tone,
      disabled: a.disabled,
      onSelect: () => {
        a.onSelect?.()
        if (a.href) window.location.assign(a.href)
      },
    }
    return startsGroup(folded, i) ? [{ separator: true }, item] : [item]
  })

  return (
    <>
      {/* Ряд рисует ВСЕ действия, не влезшие — спрятанными. Зажимать их
          `display: none` нельзя: вместе с узлом исчезла бы его ширина, а
          именно она и есть то, из чего считается следующий замер. */}
      <div className={[classes.row, visible < actions.length && 'is-folded'].filter(Boolean).join(' ')} ref={rowRef} style={rowStyle}>
        {actions.map((a, i) => {
          const hidden = i >= visible || undefined
          // Значок — проп `icon` кнопки (DS-360), не свой класс поверх
          // безымянного child: `Button` сама нормализует его через `<Icon>`
          // (контракт `icons/Icon.tsx`, гейт `icon-contract`) и держит отступ
          // от подписи своей `.ds-btn__icon` — второй раз оборачивать здесь
          // незачем.
          return (
            <Fragment key={a.id}>
              {startsGroup(actions, i) && (
                <span
                  className={classes.sep}
                  role="separator"
                  aria-orientation="vertical"
                  data-ds-folded={hidden}
                  aria-hidden={hidden}
                />
              )}
              {a.href != null ? (
                <Button
                  as="a" href={a.href} size="sm" variant={a.variant ?? 'ghost'} tone={a.tone === 'error' ? 'error' : undefined}
                  disabled={a.disabled} onClick={a.onSelect} icon={a.icon}
                  data-ds-action="" data-ds-folded={hidden} aria-hidden={hidden} inert={hidden}
                >{a.label}</Button>
              ) : (
                <Button
                  size="sm" variant={a.variant ?? 'ghost'} tone={a.tone === 'error' ? 'error' : undefined}
                  disabled={a.disabled} onClick={a.onSelect} icon={a.icon}
                  data-ds-action="" data-ds-folded={hidden} aria-hidden={hidden} inert={hidden}
                >{a.label}</Button>
              )}
            </Fragment>
          )
        })}
      </div>

      {/* «Ещё» стоит В DOM ВСЕГДА, даже когда сворачивать нечего, и это не
          расточительность. Ширина кнопки — слагаемое бюджета, и узнать её
          можно только с нарисованного узла; посчитай полоса бюджет без неё —
          и первое же сужение отдало бы лишнее документу. Холостая она выведена
          из потока (`is-idle`), так что ни места в ряду, ни имени в дереве, ни
          таб-стопа не занимает. */}
      <div
        ref={moreRef}
        className={[classes.more, folded.length === 0 && 'is-idle'].filter(Boolean).join(' ')}
        data-ds-folded={folded.length === 0 || undefined}
        aria-hidden={folded.length === 0 || undefined}
        inert={folded.length === 0 || undefined}
      >
        {/* Триггер — НАСТОЯЩИЙ `Button`, а не строка внутри чужой обёртки
            (DS-359). `ghost` и `sm` — тот же вид, что у действий полосы;
            прежде их приходилось перерисовывать токенами в `CommandBar.css` и
            `AppBar.css`, потому что на обёртку `.ds-dropdown__triggerwrap`
            класс `.ds-btn` можно было надеть только вложенным узлом. */}
        <DropdownMenu
          items={menuItems}
          align="end"
          ariaLabel={text['commandBar.more']}
          trigger={<Button size="sm" variant="ghost">{text['commandBar.more']}</Button>}
        />
      </div>
    </>
  )
}
