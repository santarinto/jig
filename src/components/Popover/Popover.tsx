import { cloneElement, useId, useRef, useState } from 'react'
import { useAnchoredPosition } from '../../internal/useAnchoredPosition.js'
import { useDismiss } from '../../internal/useDismiss.js'
import { usePopupLayer } from '../../internal/usePopupLayer.js'
import { assertTriggerElement, focusTriggerIn } from '../../internal/trigger.js'
import './Popover.css'
import '../../styles/trigger-floor.css'

export type PopoverPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'

/** Пропсы, которые Popover навешивает на триггер потребителя. */
export interface PopoverTriggerProps {
  onClick: (e: React.MouseEvent) => void
  type?: React.ButtonHTMLAttributes<HTMLButtonElement>['type']
  className: string
  'aria-expanded': boolean
  'aria-haspopup': 'dialog'
  'aria-controls'?: string
}

export interface PopoverProps {
  /**
   * Элемент, открывающий панель. Тип — **элемент**, а не `ReactNode`: на него
   * навешиваются `onClick`, `aria-expanded` и `aria-haspopup`, а навесить их
   * можно только на узел с пропсами.
   *
   * Прежде триггер оборачивался в `<span onClick>`: клик работал, но обёртка
   * не была ни фокусируемой, ни объявленной. Скринридер слышал содержимое
   * триггера и не слышал, что оно вообще что-то раскрывает; с клавиатуры
   * панель не открывалась, если внутрь не положили свою кнопку.
   *
   * **Триггер обязан быть фокусируемым элементом** (`Button`, `<button>`,
   * `<a href>`). Оборачивать его в свою кнопку компонент не станет — это дало
   * бы `<button><button>`, ровно ту вложенную интерактивность, которую держит
   * гейт `no-nested-interactive`.
   *
   * С DS-364 это не просьба, а БРОСОК в рендере: `<span>`, фрагмент,
   * `<a>` без `href` и ложное значение отказывают тем же
   * `assertTriggerElement`, что у `DropdownMenu`. Типом `<span>` от
   * `<button>` не отличить, а без броска он рисуется и молча не кнопка.
   */
  trigger: React.ReactElement<Partial<PopoverTriggerProps>>
  children: React.ReactNode
  /**
   * Доступное имя панели. `role="dialog"` без имени скринридер объявляет как
   * безымянный диалог — «диалог» и всё, без единого слова о том, какой.
   */
  label?: string
  /** Controlled open state; omit for uncontrolled. */
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  placement?: PopoverPlacement
  className?: string
}

export function Popover({
  trigger, children, label, open: controlledOpen, defaultOpen = false, onOpenChange,
  placement = 'bottom-start', className,
}: PopoverProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolled
  const zIndex = usePopupLayer(open)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  /**
   * Координаты — из вьюпорта (DS-240). Панель лежала `position: absolute`
   * внутри `.ds-popover`, и любой прокручиваемый предок её клиповал.
   *
   * ЯКОРЬ — КОРЕНЬ, А НЕ ТРИГГЕР, и это не лень: реф на элемент потребителя
   * здесь недоступен по той же причине, по которой ниже фокус возвращается
   * поиском в DOM, — чужой компонент не обязан реф пробрасывать. `.ds-popover`
   * — `inline-block` вокруг триггера, его прямоугольник равен триггерову;
   * панель в него не входит, потому что `fixed` в раскладке родителя не
   * участвует.
   */
  const [side, align] = placement.split('-') as ['top' | 'bottom', 'start' | 'end']
  const anchored = useAnchoredPosition({
    enabled: open, anchorRef: rootRef, floatingRef: panelRef, side, align,
  })

  /**
   * Триггер ищется в DOM, а не держится рефом; довод и панель-исключение —
   * в `src/internal/trigger.ts`. С DS-359 тот же код зовёт и
   * `DropdownMenu`: вопрос «куда вернуть фокус, закрыв оверлей» у них один.
   */
  const focusTrigger = () => focusTriggerIn(rootRef.current, panelId)

  const setOpen = (v: boolean) => {
    onOpenChange?.(v)
    if (!isControlled) setUncontrolled(v)
  }

  // Возврат фокуса по причине закрытия — тот же контракт, что у Combobox:
  // Esc это «я закончил здесь», клик мимо — «я уже в другом месте».
  useDismiss({
    enabled: open,
    ref: rootRef,
    onDismiss: (reason) => {
      setOpen(false)
      if (reason === 'escape') focusTrigger()
    },
  })

  // Бросок стоит в рендере, а не в эффекте: на сервере эффекта нет вовсе (там
  // это 500, а не тихий `<span>`), а у потребителя отказ обязан прилететь из
  // той фазы, где стоит его вызов. Встроенного триггера у Popover нет, поэтому
  // `undefined` — тоже отказ, и замена у него своя: условие снаружи.
  assertTriggerElement(trigger, 'Popover')
  const own = trigger.props as Partial<PopoverTriggerProps> & { href?: unknown }
  // Ссылке `type` не ставится — у `<a>` это тип содержимого; признака два по
  // той же причине, что в `DropdownMenu`: `<Button as="a" href>` — компонент.
  const isLink = trigger.type === 'a' || own.href != null
  const anchor = cloneElement(trigger, {
    onClick: (e: React.MouseEvent) => {
      own.onClick?.(e)
      setOpen(!open)
    },
    // Голая `<button>` без `type` внутри `<form>` потребителя — submit: клик
    // по триггеру отправлял бы форму заодно с открытием панели. Свой `type`
    // потребителя переживает клон (DS-359, то же у `DropdownMenu`).
    ...(isLink ? {} : { type: own.type ?? 'button' }),
    // ПОЛ ЦЕЛИ КЛИКА (DS-366) — тем же приёмом, что у `DropdownMenu`:
    // класс из общего листа `trigger-floor.css`, дописанный к своему
    // `className`, а не заменяющий его. До этой задачи `Popover` клону
    // класса не ставил вовсе, и голый `<button>` в триггере пола не держал —
    // см. докблок листа.
    className: [own.className, 'ds-popover__trigger'].filter(Boolean).join(' '),
    'aria-expanded': open,
    'aria-haspopup': 'dialog',
    ...(open ? { 'aria-controls': panelId } : {}),
  } as Partial<PopoverTriggerProps>)

  return (
    <div ref={rootRef} className={['ds-popover', className].filter(Boolean).join(' ')}>
      {anchor}
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          className={`ds-popover__panel ds-popover__panel--${placement}`}
          role="dialog"
          aria-label={label}
          // `right`/`bottom` гасит сам хук (DS-287): правила `--*-end` и
          // `--top-*` остаются в листе статическим фолбэком для ручной вёрстки.
          style={{ ...anchored.style, zIndex }}
        >
          {children}
        </div>
      )}
    </div>
  )
}
