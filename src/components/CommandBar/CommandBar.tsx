import { useEffect, useRef } from 'react'
import { FoldingActions, outerWidth, useActionOverflow } from '../../internal/actionOverflow.js'
import type { CommandAction } from '../../internal/action.js'
import './CommandBar.css'

/**
 * Одно действие полосы — сужение общего `ActionBase` (DS-358): ядро плюс
 * `variant`, `group` и `href`, то есть ровно то, чего не умеет ни строка
 * таблицы, ни пункт меню. Объявление и доводы — `src/internal/action.ts`.
 *
 * ПОЧЕМУ ДАННЫЕ, А НЕ `children` (DS-239). До 4.3.0 панель принимала
 * произвольный `ReactNode` и о своих кнопках не знала ничего — ни подписи, ни
 * обработчика. Свернуть хвост в «Ещё» она поэтому не могла: склонировать чужой
 * узел в пункт меню значит либо потерять его вид (кнопка внутри меню — не
 * пункт меню), либо получить в дереве доступности ВТОРОЕ такое же имя. Ровно
 * эта граница была видна и раньше: `Tabs` умеет `overflow: 'menu'` потому, что
 * вкладки у него `items`.
 */
export type { CommandAction }

export interface CommandBarProps extends Omit<React.ComponentPropsWithRef<'div'>, 'children'> {
  actions: CommandAction[]
  /**
   * Хвост полосы: то, что действием НЕ является — бейдж состояния, счётчик,
   * отметка «не проведён». Прижат вправо, в свёртку не попадает и резервирует
   * свою ширину раньше действий.
   *
   * Отдельный слот, а не действие с `render`: у этих двух вещей разная судьба
   * при нехватке места. Действие обязано остаться достижимым — потому и
   * сворачивается; состояние документа в меню не прячут, его читают.
   */
  trailing?: React.ReactNode
}

/** Классы ряда и «Ещё»: разметку рисует общий механизм, имена — панели.
 *  Значка среди них нет (DS-360) — его несёт `Button.icon`, а не свой
 *  класс-обёртка поверх безымянного `children`. */
const FOLDING = {
  row: 'ds-cmdbar__row',
  sep: 'ds-cmdbar__sep',
  more: 'ds-cmdbar__more',
}

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'

/**
 * `role="toolbar"` — это обещание конкретной клавиатурной модели: внутрь ведёт
 * **один** Tab, дальше по кнопкам ходят стрелки, следующий Tab выводит наружу.
 * Панель объявляла роль и давала обычный таб-стоп на каждую кнопку — то есть
 * описывала виджет, которым не была. На панели из восьми действий это восемь
 * нажатий Tab там, где скринридер обещал одно.
 *
 * Роуминг по-прежнему ведётся ПО DOM, а не по массиву `actions`, и это не
 * пережиток: в обходе участвуют и кнопка «Ещё», и ссылка, нарисованная вместо
 * кнопки, — то есть узлы, которых в `actions` нет поштучно. Зато из обхода
 * выброшены свёрнутые действия и пункты открытого меню: у меню своя
 * клавиатурная модель, и две модели на один узел — это когда стрелка делает
 * два дела разом.
 */
export function CommandBar({ className, actions, trailing, ...rest }: CommandBarProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const trailingRef = useRef<HTMLSpanElement>(null)

  // --- Свёртка хвоста: механизм общий с `AppBar` (`internal/actionOverflow`) -
  //
  // Своё у панели — только то, что ещё занимает её ширину: хвост `trailing`
  // вместе с зазором до него.
  const { visible } = useActionOverflow({
    actions, barRef, rowRef, moreRef,
    reserved: (gap) => {
      const w = trailingRef.current ? outerWidth(trailingRef.current) : 0
      return w > 0 ? w + gap : 0
    },
  })

  // --- Роуминг --------------------------------------------------------------
  const focusables = () => [...(barRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
  /** Пункты открытого меню ведёт `DropdownMenu`; их `tabIndex` не наш. */
  const inMenu = (el: HTMLElement) => el.closest('[role="menu"]') != null
  const items = () => focusables().filter((el) => !inMenu(el) && !el.closest('[data-ds-folded]'))

  // Ровно один элемент в порядке табуляции. Пересчитывается после каждого
  // рендера: состав панели меняется (действие свернулось, кнопка стала
  // disabled), и зафиксированный однажды таб-стоп мог бы уехать на элемент,
  // которого в обходе больше нет, — панель стала бы недостижимой табом.
  useEffect(() => {
    const all = focusables()
    const list = items()
    // Не участвующее в обходе выводится из порядка табуляции ЯВНО, а не
    // оставляется браузеру. Свёрнутые действия и холостая «Ещё» помечены
    // `inert`, но `inert` — не `tabIndex`: узел, которому его никто не
    // проставил, остаётся нулевым, и панель отдавала бы лишние таб-стопы
    // ровно там, где обещает один.
    for (const el of all) if (!list.includes(el) && !inMenu(el)) el.tabIndex = -1
    if (!list.length) return
    // Если фокус уже внутри — таб-стоп остаётся на нём, иначе возврат в панель
    // после ухода и обратно швырял бы пользователя на первую кнопку.
    const focused = list.findIndex((el) => el === document.activeElement)
    const at = focused >= 0 ? focused : 0
    list.forEach((el, i) => { el.tabIndex = i === at ? 0 : -1 })
  })

  function onKeyDown(e: React.KeyboardEvent) {
    // Открытое меню живёт по своим клавишам. Без этой строки ArrowDown внутри
    // меню двигал бы ЗАОДНО таб-стоп полосы: событие всплывает, и обработчик
    // панели не знает, что его уже обслужили.
    if ((e.target as HTMLElement).closest('[role="menu"]')) return
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (step === 0 && e.key !== 'Home' && e.key !== 'End') return
    const list = items()
    const from = list.indexOf(document.activeElement as HTMLElement)
    if (from < 0) return
    e.preventDefault()
    // По кругу: панель — замкнутая группа, и упереться в её край нечем.
    const to = e.key === 'Home' ? 0
      : e.key === 'End' ? list.length - 1
      : (from + step + list.length) % list.length
    const next = list[to]
    if (!next) return
    list.forEach((el) => { el.tabIndex = -1 })
    next.tabIndex = 0
    next.focus()
  }

  return (
    <div
      ref={barRef}
      role="toolbar"
      className={['ds-cmdbar', className].filter(Boolean).join(' ')}
      onKeyDown={onKeyDown}
      {...rest}
    >
      <FoldingActions classes={FOLDING} actions={actions} visible={visible} rowRef={rowRef} moreRef={moreRef} />

      {trailing != null && <span className="ds-cmdbar__trailing" data-ds-trailing="" ref={trailingRef}>{trailing}</span>}
    </div>
  )
}
