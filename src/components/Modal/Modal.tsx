import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../../internal/useFocusTrap.js'
import { useOverlayIsolation } from '../../internal/useOverlayIsolation.js'
import { useDsText } from '../../dictionary/DsText.js'
import './Modal.css'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  footer?: React.ReactNode
  children: React.ReactNode
  /** Куда монтировать портал оверлея. Default document.body. С кастомным контейнером изоляция фона не применяется. */
  container?: HTMLElement
  /** Закрывать по клику по подложке. Default true. false — случайный клик мимо не стирает форму. */
  closeOnBackdrop?: boolean
  /** Закрывать по Escape. Default true. */
  closeOnEscape?: boolean
}

export function Modal({
  open,
  onClose,
  title,
  footer,
  children,
  container,
  closeOnBackdrop = true,
  closeOnEscape = true,
}: ModalProps) {
  const t = useDsText()
  const dialogRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useFocusTrap({ enabled: open, ref: dialogRef })
  useOverlayIsolation({ enabled: open, ref: overlayRef, container })

  useEffect(() => {
    if (!open || !closeOnEscape) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, closeOnEscape])

  if (!open) return null

  return createPortal(
    <div className="ds-modal__overlay" ref={overlayRef} onClick={closeOnBackdrop ? onClose : undefined}>
      <div
        className="ds-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="ds-modal__header">
            <span className="ds-modal__title" id={titleId}>{title}</span>
            <button type="button" className="ds-modal__close" aria-label={t['modal.close']} onClick={onClose}>×</button>
          </div>
        )}
        <div className="ds-modal__body">{children}</div>
        {footer && <div className="ds-modal__footer">{footer}</div>}
      </div>
    </div>,
    container ?? document.body,
  )
}
