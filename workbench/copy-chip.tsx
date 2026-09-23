/**
 * Кнопка «скопировать» с галочкой на 1200 мс.
 *
 * КОПИЯ из `demo/demo-spec.tsx`, а не импорт: импорт связал бы верстак с
 * другим приложением — у него свои стили, свой жизненный цикл и своё право
 * сломаться. Тридцать строк дублирования дешевле связи, которую придётся
 * расплетать.
 *
 * Не один в один: в оригинале копирование вынесено в отдельную функцию
 * `copyText()`, которая возвращает `boolean` успеха; здесь та же обработка
 * сведена в один обработчик — отдельная функция ради единственного места
 * вызова не заводилась. Поведение при отказе то же самое: `try/catch` вокруг
 * `await`, галочка ставится ТОЛЬКО при успехе. Без `catch` отказ буфера
 * (не-secure контекст, запрещённое разрешение) давал бы необработанное
 * отклонение промиса, а кнопка молча не реагировала бы ни на что.
 *
 * Отказ не показывается человеку намеренно: молчание честнее лишнего
 * состояния в хроме дев-инструмента, а причина отказа кнопкой не чинится —
 * достаточно того, что галочка не появляется.
 */
import { useCallback, useState } from 'react'

export function CopyChip({
  label,
  value,
  title,
  disabled,
}: {
  label: string
  value: string
  title?: string
  /** Нечего копировать (значение ещё не готово) — кнопка на месте, но неактивна. */
  disabled?: boolean
}) {
  const [flash, setFlash] = useState(false)

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      return
    }
    setFlash(true)
    window.setTimeout(() => setFlash(false), 1200)
  }, [value])

  return (
    <button
      type="button"
      className="wb__chip"
      title={title ?? `Скопировать: ${value}`}
      onClick={onCopy}
      disabled={disabled}
    >
      {flash ? '✓' : label}
    </button>
  )
}
