import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react'
import { useAnchoredPosition } from '../../internal/useAnchoredPosition.js'
import './Tooltip.css'

export interface TooltipProps {
  label: string
  /**
   * Триггер подсказки. Тип — **элемент**, а не `ReactNode`: подсказку нужно
   * связать с триггером через `aria-describedby`, а связать можно только с
   * узлом, у которого есть пропсы. Строка или фрагмент компилироваться больше
   * не будут — прежде они молча давали `role="tooltip"`, который скринридер
   * никогда не зачитывал.
   *
   * **Триггер обязан быть фокусируемым**, иначе подсказка недостижима с
   * клавиатуры: показ не включится, и `aria-describedby` некому будет
   * зачитать. Компонент не добавляет `tabIndex` сам — это молча поменяло бы
   * порядок табуляции во всех местах, где подсказка висит на неинтерактивном
   * значке.
   */
  children: React.ReactElement<{ 'aria-describedby'?: string }>
}

/**
 * ПОКАЗ ДЕРЖИТ СОСТОЯНИЕ, А НЕ КАСКАД (DS-240).
 *
 * Прежде открытость держали `:hover` и `:focus-within` в листе. Каскад не умеет
 * ни мерить окно, ни слушать клавиатуру, и из этого росли сразу три дефекта:
 * пузырёк центрировался вслепую и у триггера возле края уезжал за экран
 * (замерено x = −40), у верхнего края обрезался сверху (top −13.68 при высоте
 * 37.69), и его нельзя было убрать с экрана ничем.
 *
 * Здесь появляется состояние и позиция считается от вьюпорта общим хуком —
 * первые два симптома закрываются как следствие. Третий (Escape) — DS-168:
 * состояние для него теперь есть, но слушателя ещё нет.
 *
 * УЗЕЛ ИЗ DOM НЕ ПРОПАДАЕТ И `aria-describedby` НЕ РВЁТСЯ. Состояние управляет
 * ПОКАЗОМ, а не рендером: скринридер зачитывает подсказку вместе с именем
 * триггера, не дожидаясь ни наведения, ни фокуса, и эта связь обязана уцелеть.
 */
export function Tooltip({ label, children }: TooltipProps) {
  const bubbleId = useId()
  const [shown, setShown] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const bubbleRef = useRef<HTMLSpanElement>(null)

  // Якорь — корень, а не сам триггер: `.ds-tooltip` это `inline-flex` вокруг
  // него, прямоугольники совпадают, а реф на чужой элемент недоступен —
  // потребитель не обязан его пробрасывать. Пузырёк в бокс корня не входит:
  // `fixed` в раскладке родителя не участвует.
  const anchored = useAnchoredPosition({
    enabled: shown, anchorRef: rootRef, floatingRef: bubbleRef, side: 'top', align: 'center',
  })

  /**
   * ESCAPE ГАСИТ ПОКАЗ — третья нога WCAG 1.4.13, Dismissible (DS-168).
   * Первые две, Hoverable и Persistent, выполнялись и до неё: мостик через
   * зазор есть, по времени подсказка не исчезает.
   *
   * НА ДОКУМЕНТЕ, а не на корне: подсказку показывает и наведение, при котором
   * фокус находится где угодно, — слушатель на корне тогда не услышал бы
   * ничего. Тот же выбор и по той же причине, что в `useDismiss`.
   *
   * `useDismiss` целиком НЕ берётся, хотя Escape там уже написан: он про
   * плавающие ПАНЕЛИ — закрывает ещё и по клику мимо и умеет возвращать фокус.
   * Подсказке не нужно ни то ни другое: фокус с триггера не уходил, а «клик
   * мимо» для неё не событие — она гаснет уходом курсора. Взять хук значило бы
   * повесить лишний слушатель `pointerdown` и завести причину закрытия,
   * которой у подсказки нет.
   *
   * Escape НЕ ГЛУШИТСЯ (`stopPropagation` нет): в системе он не глушится
   * нигде, и вложенные оверлеи закрываются оба.
   *
   * Гасится ПОКАЗ, а не компонент: увели курсор и вернули — подсказка снова
   * здесь. А пока курсор стоит на триггере, `pointerenter` повторно не
   * срабатывает, и подсказка остаётся убранной — ровно то, чего требует
   * Dismissible: убрать, НЕ уводя ни курсор, ни фокус.
   */
  useEffect(() => {
    if (!shown) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setShown(false) }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [shown])

  // Связь именем: `role="tooltip"` сам по себе ничего не объявляет — он лишь
  // помечает узел как подсказку. Зачитывает её `aria-describedby` на триггере,
  // и без него подсказка для скринридера не существовала вовсе.
  const trigger = isValidElement(children)
    ? cloneElement(children, { 'aria-describedby': bubbleId })
    : children

  return (
    <span
      ref={rootRef}
      className="ds-tooltip"
      // `pointerenter`/`pointerleave`, а не `mouse*`: показ работает пером и
      // тачем, тем же выбором, что у `useDismiss`. На потомка (сам пузырёк)
      // `pointerleave` не срабатывает — нога Hoverable из WCAG 1.4.13 цела.
      onPointerEnter={() => setShown(true)}
      onPointerLeave={() => setShown(false)}
      // `onFocus`/`onBlur` в React всплывают (это focusin/focusout), поэтому
      // фокус на триггере ловится здесь, а не на самом триггере, — и не
      // приходится перекрывать чужие обработчики в клонированном узле.
      onFocus={() => setShown(true)}
      onBlur={() => setShown(false)}
    >
      {trigger}
      <span
        ref={bubbleRef}
        className={[
          'ds-tooltip__bubble',
          shown && 'is-shown',
          // Мостик обязан переехать вместе с пузырьком: перевёрнутый вниз, он
          // закрывает зазор сверху, а не снизу. Иначе `:hover` рвётся в щели —
          // и уходит ровно то, что чинили в 1.4.13 Hoverable.
          anchored.side === 'bottom' && 'ds-tooltip__bubble--down',
        ].filter(Boolean).join(' ')}
        role="tooltip"
        id={bubbleId}
        // ЗАКРЫТЫЙ ПУЗЫРЁК НЕ ИМЕЕТ БОКСА (DS-308). Прежде он прятался
        // `visibility: hidden` листа и оставался в раскладке на статическом
        // фолбэке — `left: 50%` плюс ширина до `100vw − 2rem·шкала`, — и у
        // значка справа уводил документ вбок: +59 на кадре 360 ×1.5.
        // Невидимое не должно занимать место в прокрутке, а `visibility` бокс
        // оставляет. Положение всё равно считает хук при открытии.
        // Атрибутом, а не правилом `:not(.is-shown)` в листе: класс без
        // `is-shown` — это ещё и РУЧНАЯ вёрстка без JS, у которой фолбэк
        // обязан остаться боксом (случаи `measure` на мостик и потолок).
        // `aria-describedby` на скрытый узел по-прежнему даёт описание:
        // ссылка по id берёт текст и у `display: none`.
        hidden={!shown}
        // `transform: none` гасит `translateX(-50%)` из листа: центрирование
        // теперь считает хук, и оставленный сдвиг сложился бы с ним. Лист
        // держит центрирование как статический фолбэк для ручной вёрстки.
        style={shown ? { ...anchored.style, transform: 'none' } : undefined}
      >
        {label}
      </span>
    </span>
  )
}
