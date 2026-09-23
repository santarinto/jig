/**
 * Разделитель на верхней границе дока — мышь и клавиатура.
 *
 * ПИШЕТСЯ ЗДЕСЬ, А НЕ БЕРЁТСЯ ИЗ СИСТЕМЫ. Закон хрома (шапка `shell.css`): ни
 * одного `ds-*` компонента в оболочке — инструмент, которым чинят Select, не
 * должен стоять на Select. `Split` из системы дал бы связь, которую потом
 * расплетать, а разделитель — это десяток строк.
 *
 * РАЗДЕЛИТЕЛЬ, ОТВЕЧАЮЩИЙ ТОЛЬКО НА МЫШЬ, ДЛЯ КЛАВИАТУРЫ НЕ СУЩЕСТВУЕТ.
 * Поэтому `tabindex`, `aria-valuenow/min/max` и стрелки — не довесок к тяге, а
 * половина работы. Слой таб-стопов и слой axe в верстаке увидят его сами.
 *
 * `role="separator"` с `tabindex` — это ФОКУСИРУЕМЫЙ разделитель, у которого
 * ARIA требует `aria-valuenow`. Без него получается «статический разделитель»,
 * которому по спеке нечем сказать, где он стоит, — а он двигается.
 */
import { useRef, useState } from 'react'
import { clampDockH, maxDockH, DOCK_MIN_H, DOCK_STEP } from './dock-height.js'

interface Props {
  /** Действующая высота дока, px. */
  h: number
  /** Высота области «тело + док» — из неё считается потолок. */
  availH: number
  /** Тяга в процессе: только состояние оболочки, без записи. */
  onResize: (h: number) => void
  /** Тяга кончилась или нажата клавиша: значение можно запоминать. */
  onSettle: (h: number) => void
}

export function DockGrip({ h, availH, onResize, onSettle }: Props): React.JSX.Element {
  const drag = useRef<{ y0: number; h0: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const max = maxDockH(availH)

  /**
   * Захват указателя обязателен по той же причине, что у рукоятки ширины:
   * первое же движение уводит курсор на территорию `<iframe>`, события
   * достаются документу кадра, и тяга залипает на месте.
   *
   * Не левая кнопка тягу не начинает: правый клик и средняя кнопка ресайз не
   * подразумевают.
   */
  const onDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    drag.current = { y0: e.clientY, h0: h }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
  }

  /** Курсор вверх — док растёт: рукоятка стоит на ВЕРХНЕЙ границе дока. */
  const onMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!drag.current) return
    onResize(
      clampDockH(drag.current.h0 + (drag.current.y0 - e.clientY), availH),
    )
  }

  /**
   * И `pointerup`, и `pointercancel`. После `pointercancel` указатель уже
   * неактивен, и `releasePointerCapture` по спецификации бросает
   * `NotFoundError`. Порядок назначен чтением спеки: состояние тяги снимается
   * ДО освобождения захвата, иначе бросок оставил бы `is-dragging` навсегда и
   * кадр перестал бы принимать мышь до перезагрузки оболочки.
   */
  const onUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!drag.current) return
    drag.current = null
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    onSettle(h)
  }

  /**
   * Стрелки ходят шагом сетки хрома, Home/End — в границы.
   *
   * Вверх увеличивает док, а не уменьшает: клавиша повторяет направление
   * мыши, а мышь тянет саму границу. Home — к нижней границе значения (док
   * минимальный), End — к верхней, как у любого слайдера.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const next =
      e.key === 'ArrowUp'
        ? h + DOCK_STEP
        : e.key === 'ArrowDown'
          ? h - DOCK_STEP
          : e.key === 'Home'
            ? DOCK_MIN_H
            : e.key === 'End'
              ? max
              : null
    if (next === null) return
    e.preventDefault()
    onSettle(clampDockH(next, availH))
  }

  return (
    <div
      className={`wb__dock-grip${dragging ? ' is-dragging' : ''}`}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Высота панели"
      aria-valuenow={h}
      aria-valuemin={DOCK_MIN_H}
      aria-valuemax={Number.isFinite(max) ? max : undefined}
      tabIndex={0}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKeyDown}
    />
  )
}
