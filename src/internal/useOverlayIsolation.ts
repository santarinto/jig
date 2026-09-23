import { useEffect } from 'react'

// Модульное состояние: изоляция общая на все открытые оверлеи —
// фоном считается всё, что не является узлом какого-либо из них,
// поэтому верхний оверлей нижний не inert-ит.
let lockCount = 0
let savedOverflow = ''
let savedPaddingRight = ''
const overlayNodes = new Set<HTMLElement>()
const inerted = new Set<HTMLElement>()

function applyInert() {
  for (const child of Array.from(document.body.children)) {
    const el = child as HTMLElement
    if (overlayNodes.has(el) || el.tagName === 'SCRIPT') {
      // Узел мог получить inert раньше, до того как стал известным оверлеем
      // (два оверлея коммитятся в DOM разом, эффекты идут по очереди) —
      // откатываем свою же ошибку.
      if (inerted.has(el)) { el.removeAttribute('inert'); inerted.delete(el) }
      continue
    }
    if (!el.hasAttribute('inert')) { el.setAttribute('inert', ''); inerted.add(el) }
  }
}

function releaseInert() {
  for (const el of inerted) el.removeAttribute('inert')
  inerted.clear()
}

/**
 * Резервирует узел от inert, не участвуя в scroll-lock оверлеев: Toaster
 * рисуется поверх Modal/Drawer (шкала слоёв ставит toast выше modal), но не
 * должен ни блокировать страницу своим появлением, ни сам стать inert, если
 * его портал (document.body) совпадает с телом, которое инертит открытый
 * оверлей. Набор общий с overlayNodes — applyInert() пропускает узлы
 * оверлеев и узлы-исключения одинаково, разницы между ними для неё нет.
 *
 * Пересчёт нужен по обе стороны регистрации:
 * — при регистрации: узел мог существовать в DOM ДО вызова (Toaster и
 *   Modal смонтировались одним коммитом, эффект Modal'а успел проинертить
 *   ещё незарегистрированный узел раньше, чем добежал эффект Toaster'а) —
 *   applyInert() тут же откатывает свою же ошибку (та же ветка, что для
 *   оверлеев в applyInert() выше);
 * — при отписке: если изоляция всё ещё активна (Modal не закрылся, просто
 *   Toaster размонтировался), узел должен вернуться под общий inert как
 *   обычный фон — иначе он останется кликабельным дырой в изоляции.
 */
export function exemptFromIsolation(el: HTMLElement): () => void {
  overlayNodes.add(el)
  if (lockCount > 0) applyInert()
  return () => {
    overlayNodes.delete(el)
    if (lockCount > 0) applyInert()
  }
}

export interface UseOverlayIsolationOptions {
  /** Изоляция держится только пока true (обычно — open). */
  enabled: boolean
  /** Корневой узел оверлея (подложка) — его и других оверлеев inert не касается. */
  ref: React.RefObject<HTMLElement | null>
  /** Кастомный контейнер портала выключает изоляцию: превью-сцене нечего изолировать. */
  container?: HTMLElement
}

/**
 * Изоляция фона за модальным оверлеем: scroll-lock на body (с компенсацией
 * ширины скроллбара — иначе дёргается макет) и inert на детях body, кроме
 * узлов открытых оверлеев. Ловушка фокуса держит только Tab; без inert
 * виртуальный курсор скринридера выходил из «модалки» прямо в страницу.
 */
export function useOverlayIsolation({ enabled, ref, container }: UseOverlayIsolationOptions): void {
  useEffect(() => {
    if (!enabled || container) return
    const node = ref.current
    if (node) overlayNodes.add(node)
    if (lockCount === 0) {
      savedOverflow = document.body.style.overflow
      savedPaddingRight = document.body.style.paddingRight
      const gap = window.innerWidth - document.documentElement.clientWidth
      document.body.style.overflow = 'hidden'
      if (gap > 0) document.body.style.paddingRight = `${gap}px`
    }
    lockCount += 1
    applyInert()
    return () => {
      if (node) overlayNodes.delete(node)
      lockCount -= 1
      releaseInert()
      if (lockCount === 0) {
        document.body.style.overflow = savedOverflow
        document.body.style.paddingRight = savedPaddingRight
      } else {
        applyInert() // пересчёт: узел закрытого оверлея снова фон
      }
    }
  }, [enabled, ref, container])
}
