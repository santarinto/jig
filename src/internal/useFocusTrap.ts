import { useEffect, useRef } from 'react'

// Единственная копия селектора: раньше жил дословно в Modal и Drawer,
// и любая починка ловушки молча не попадала во второй файл.
const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export interface UseFocusTrapOptions {
  /** Ловушка активна только пока true (обычно — open). */
  enabled: boolean
  /** Контейнер ловушки: диалог или панель. */
  ref: React.RefObject<HTMLElement | null>
}

/**
 * Focus-trap модальных оверлеев: начальный фокус, цикл Tab, возврат фокуса.
 * Список опрашивается на каждый Tab — содержимое диалога может меняться.
 * Escape сюда не входит: его гейтит проп closeOnEscape самого оверлея.
 */
export function useFocusTrap({ enabled, ref }: UseFocusTrapOptions): void {
  const prevFocus = useRef<HTMLElement | null>(null)
  // Считает открытия этой же ловушки — метит, какому из них принадлежит
  // отложенный restore, чтобы быстрый close→open не отобрал фокус у
  // только что открывшейся ловушки (см. cleanup ниже).
  const generation = useRef(0)
  useEffect(() => {
    if (!enabled) return
    const myGeneration = ++generation.current
    prevFocus.current = document.activeElement as HTMLElement
    const node = ref.current
    const first = node?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? node)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !node) return
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) { e.preventDefault(); return }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus() }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const toRestore = prevFocus.current
      // Этот хук объявлен раньше useOverlayIsolation, поэтому его cleanup
      // выполняется первым — синхронно ДО того, как изоляция синхронно
      // снимет inert с фона (в том числе с опенера). Позвать focus() прямо
      // здесь означало бы звать его на узле, у которого предок ещё [inert]:
      // в реальных браузерах это no-op, фокус улетает на body (jsdom этого
      // не эмулирует, поэтому баг не виден «в лоб»). queueMicrotask
      // откладывает restore до момента, когда синхронные cleanup'ы всех
      // хуков коммита (включая снятие inert) уже отработали.
      queueMicrotask(() => {
        // Быстрое закрыть→открыть той же ловушки: если к моменту микротаски
        // уже включилось новое открытие — не отбираем у него фокус.
        if (generation.current !== myGeneration) return
        toRestore?.focus?.()
      })
    }
  }, [enabled, ref])
}
