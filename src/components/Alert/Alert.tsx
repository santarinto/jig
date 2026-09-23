import { useDsText } from '../../dictionary/DsText.js'
import { ToneIcon } from '../../icons/index.js'
import './Alert.css'

export type AlertTone = 'info' | 'success' | 'warning' | 'error'

export interface AlertProps {
  tone?: AlertTone
  title?: string
  children?: React.ReactNode
  /** When provided, a close (×) button is shown. */
  onClose?: () => void
  className?: string
}

export function Alert({ tone = 'info', title, children, onClose, className }: AlertProps) {
  const t = useDsText()
  const role = tone === 'error' || tone === 'warning' ? 'alert' : 'status'
  return (
    <div className={['ds-alert', `ds-alert--${tone}`, className].filter(Boolean).join(' ')} role={role}>
      <ToneIcon tone={tone} className="ds-alert__icon" aria-hidden="true" />
      <div className="ds-alert__body">
        {title && <div className="ds-alert__title">{title}</div>}
        {children && <div className="ds-alert__content">{children}</div>}
      </div>
      {onClose && (
        <button type="button" className="ds-alert__close" aria-label={t['alert.close']} onClick={onClose}>×</button>
      )}
    </div>
  )
}
