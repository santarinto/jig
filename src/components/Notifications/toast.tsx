import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Toast, type ToastTone } from './Notifications.js'
import { exemptFromIsolation } from '../../internal/useOverlayIsolation.js'
import './toast.css'

export interface ToastItem {
  id: string
  tone: ToastTone
  message: React.ReactNode
  duration: number
}

export interface ToastOptions {
  id?: string
  tone?: ToastTone
  /** Auto-dismiss after N ms; 0 disables auto-dismiss. Default 4000. */
  duration?: number
}

let items: ToastItem[] = []
const listeners = new Set<(items: ToastItem[]) => void>()
let counter = 0

const emit = () => { for (const l of listeners) l(items) }

function add(message: React.ReactNode, opts?: ToastOptions): string {
  const id = opts?.id ?? `toast-${++counter}`
  const item: ToastItem = { id, tone: opts?.tone ?? 'info', message, duration: opts?.duration ?? 4000 }
  items = [...items.filter((t) => t.id !== id), item]
  emit()
  return id
}

export function dismissToast(id: string) {
  items = items.filter((t) => t.id !== id)
  emit()
}

export function clearToasts() {
  items = []
  emit()
}

function subscribe(listener: (items: ToastItem[]) => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Imperative toast API: `toast.success('Сохранено')`, `toast.error(...)`, etc. */
export const toast = Object.assign(
  (message: React.ReactNode, opts?: ToastOptions) => add(message, opts),
  {
    success: (message: React.ReactNode, opts?: ToastOptions) => add(message, { ...opts, tone: 'success' }),
    error: (message: React.ReactNode, opts?: ToastOptions) => add(message, { ...opts, tone: 'error' }),
    warning: (message: React.ReactNode, opts?: ToastOptions) => add(message, { ...opts, tone: 'warning' }),
    info: (message: React.ReactNode, opts?: ToastOptions) => add(message, { ...opts, tone: 'info' }),
    dismiss: dismissToast,
    clear: clearToasts,
  },
)

export type ToasterPosition =
  | 'top-right' | 'top-left' | 'top-center'
  | 'bottom-right' | 'bottom-left' | 'bottom-center'

export interface ToasterProps {
  position?: ToasterPosition
  /** Куда монтировать портал тостов. Default document.body. См. container у Modal. */
  container?: HTMLElement
}

function ToastCard({ item }: { item: ToastItem }) {
  // WCAG 2.2.1: у исчезающего содержимого должна быть возможность его
  // остановить. Тост с кнопкой гас через 4с посреди Tab к ней — то есть
  // добраться до действия клавиатурой было нельзя в принципе.
  const [paused, setPaused] = useState(false)
  // Остаток, а не полная длительность: курсор, случайно прошедший над стопкой,
  // не должен продлевать жизнь тоста на все четыре секунды заново.
  const remaining = useRef(item.duration)

  useEffect(() => {
    if (item.duration <= 0 || paused) return
    const startedAt = Date.now()
    const h = setTimeout(() => dismissToast(item.id), remaining.current)
    return () => {
      clearTimeout(h)
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt))
    }
  }, [item.id, item.duration, paused])

  const hold = () => setPaused(true)
  const release = () => setPaused(false)

  return (
    <Toast
      tone={item.tone}
      announce={false}
      onClose={() => dismissToast(item.id)}
      onMouseEnter={hold}
      onMouseLeave={release}
      onFocus={hold}
      onBlur={release}
    >
      {item.message}
    </Toast>
  )
}

/** Mount once near the app root; renders the imperative toast queue. */
export function Toaster({ position = 'bottom-right', container }: ToasterProps) {
  const list = useSyncExternalStore(subscribe, () => items, () => items)
  const rootRef = useRef<HTMLDivElement>(null)

  // Портал в document.body: тост живёт выше Modal/Drawer по шкале слоёв
  // (toast 500 > modal 400), но раньше рендерился внутри дерева приложения —
  // при открытом оверлее это дерево целиком уходит под inert, и крестик
  // тоста немел для мыши/клавиатуры, а role="status" переставал объявляться
  // скринридером. exemptFromIsolation бронирует корень тостера от inert,
  // как это делают сами Modal/Drawer для своих оверлеев — иначе портал в
  // body просто подставил бы тостер под тот же inert-свип на общих основаниях.
  // С кастомным container (сцена превью) регистрировать нечего: изоляция
  // фона там не запускается вовсе (см. useOverlayIsolation).
  useEffect(() => {
    if (container) return
    const el = rootRef.current
    if (!el) return
    return exemptFromIsolation(el)
  }, [container])

  // Живая область — на корне стопки, а не на карточке. Область обязана быть в
  // DOM до вставки текста: NVDA и VoiceOver молчат, когда сама область
  // появляется вместе со своим содержимым, — а карточка появлялась именно так,
  // и `toast.success(...)` для пользователя скринридера не происходил вовсе.
  // Корень тостера смонтирован всё время жизни приложения, поэтому вставка
  // тоста в него — изменение внутри уже наблюдаемой области.
  return createPortal(
    <div
      className={`ds-toaster ds-toaster--${position}`}
      ref={rootRef}
      role="status"
      aria-live="polite"
    >
      {list.map((item) => <ToastCard key={item.id} item={item} />)}
    </div>,
    container ?? document.body,
  )
}
