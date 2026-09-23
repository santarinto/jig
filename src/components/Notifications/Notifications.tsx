import { useDsText } from '../../dictionary/DsText.js'
import { ToneIcon } from '../../icons/index.js'
import '../../styles/visually-hidden.css'
import './Notifications.css'

export type ToastTone = 'success' | 'warning' | 'error' | 'info'

export interface ToastProps extends Omit<React.ComponentPropsWithRef<'div'>, 'children'> {
  tone?: ToastTone
  onClose?: () => void
  /**
   * Карточка объявляет себя скринридеру сама (`role="status"`). Default `true` —
   * для отдельно поставленного `<Toast>`, у которого живой области вокруг нет.
   *
   * `Toaster` передаёт `false`: живая область там одна на всю стопку и висит на
   * её корне, который смонтирован **до** появления тостов. Вложенная область
   * внутри области — тот же дефект, что кнопка внутри опции: два механизма на
   * одном узле, и какой сработает, зависит от скринридера.
   */
  announce?: boolean
  children: React.ReactNode
}

export function Toast({ tone = 'info', onClose, announce = true, className, children, ...rest }: ToastProps) {
  const t = useDsText()
  return (
    <div
      className={['ds-toast', `ds-toast--${tone}`, className].filter(Boolean).join(' ')}
      // `alert` у ошибки и предупреждения, `status` у остальных — как у `Alert`.
      // `status` уходит вежливо, дожидаясь очереди: ошибка, объявленная им,
      // доезжает до слушателя ПОСЛЕ всего остального. Срочность — свойство
      // тона, а не пропа, поэтому `announce` только выбирает, объявлять ли
      // вообще (внутри `Toaster` живая область одна на стопку).
      role={announce ? (tone === 'error' || tone === 'warning' ? 'alert' : 'status') : undefined}
      {...rest}
    >
      {/* ЗНАК ТОНА, второй носитель рядом с цветом (DS-157). Полоса слева
          различала четыре тона на 2 единицы серого из 255 — на ч-б снимке они
          не различались вовсе. */}
      <ToneIcon tone={tone} className="ds-toast__icon" aria-hidden="true" />
      {/* СЛОВО ТОНА — третий носитель, для того, кто карточку не видит. Значок
          для него молчит: он `aria-hidden`, и по делу — диктор, читающий
          «графический объект», хуже, чем не читающий ничего. */}
      <span className="ds-visually-hidden">{t[`tone.${tone}`]} </span>
      <span className="ds-toast__msg">{children}</span>
      {onClose && <button type="button" className="ds-toast__close" aria-label={t['toast.close']} onClick={onClose}>×</button>}
    </div>
  )
}

export interface NotificationItem {
  id: string
  tone?: ToastTone
  title: string
  text?: string
}

export interface NotificationCenterProps {
  items: NotificationItem[]
  onDismiss?: (id: string) => void
}

export function NotificationCenter({ items, onDismiss }: NotificationCenterProps) {
  const t = useDsText()
  return (
    <div className="ds-notifs" role="log" aria-label={t['notificationCenter.region']}>
      {items.map((n) => (
        <div key={n.id} className={`ds-notifs__item ds-notifs__item--${n.tone ?? 'info'}`}>
          <ToneIcon tone={n.tone ?? 'info'} className="ds-notifs__icon" aria-hidden="true" />
          <div className="ds-notifs__body">
            <div className="ds-notifs__title">
              <span className="ds-visually-hidden">{t[`tone.${n.tone ?? 'info'}`]} </span>
              {n.title}
            </div>
            {n.text && <div className="ds-notifs__text">{n.text}</div>}
          </div>
          {onDismiss && (
            <button type="button" className="ds-notifs__dismiss" aria-label={t['notificationCenter.dismiss'](n.title)} onClick={() => onDismiss(n.id)}>×</button>
          )}
        </div>
      ))}
    </div>
  )
}
