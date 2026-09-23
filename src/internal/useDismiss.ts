import { useEffect, useRef } from 'react'

export type DismissReason = 'outside' | 'escape'

export interface UseDismissOptions {
  /** Слушатели висят только пока true (обычно — open). */
  enabled: boolean
  /** Корень компонента: pointerdown внутри него — не «мимо». */
  ref: React.RefObject<HTMLElement | null>
  onDismiss: (reason: DismissReason) => void
}

/**
 * Закрытие «по клику мимо и по Esc» — общий механизм плавающих панелей
 * (DatePicker, Combobox, DropdownMenu, Popover, Tabs·OverflowMenu).
 * pointerdown, а не mousedown: закрытие работает пером и тачем.
 * Esc — на документе: срабатывает и когда фокус ушёл из компонента.
 * Esc не глушится: вложенные оверлеи закрываются оба (как и до хука),
 * маршрутизация Esc — территория будущей шкалы z/оверлеев.
 * Причина в колбэке — задел под возврат фокуса (a11y-пункты бэклога):
 * потребитель отличает Esc (вернуть фокус на триггер) от клика мимо.
 */
export function useDismiss({ enabled, ref, onDismiss }: UseDismissOptions): void {
  // Свежий колбэк в ref: новая стрелка на каждом рендере потребителя
  // не переподписывает документные слушатели.
  const cb = useRef(onDismiss)
  useEffect(() => { cb.current = onDismiss })

  useEffect(() => {
    if (!enabled) return
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) cb.current('outside')
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cb.current('escape')
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [enabled, ref])
}
