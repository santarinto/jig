import './EmptyState.css'
import { Icon } from '../../icons/index.js'

export interface EmptyStateProps {
  /** Icon or glyph shown above the title. Falls back to a neutral box glyph. */
  icon?: React.ReactNode
  title: string
  description?: string
  /** Action slot (e.g. a Button) shown under the text. */
  action?: React.ReactNode
  /**
   * `block` (default) — крупный центрированный блок для пустой страницы или
   * секции. `inline` — компактный однострочный вариант для **ячейки таблицы и
   * угла карточки**, где блок целиком не помещается: короткое объяснение и
   * опц. ссылка «откуда возьмётся». В инлайне иконка-заглушка по умолчанию НЕ
   * рисуется (в строку она не лезет и притворяется содержимым).
   *
   * Граница с `Money.unknownHint`: тот — короткая причина, почему **число**
   * стало прочерком (интринзик суммы, прочерк на месте числа). `inline` здесь —
   * про пустую **область** (нет строк, пустой угол) и маршрут, откуда контент
   * возьмётся. Разные контейнеры, не одно состояние.
   *
   * **Ведущего прочерка тут нет и не будет — граница проходит ровно по нему.**
   * Прочерк, держащий числовую колонку, — это `Money value={null}`: он набран
   * моношрифтом с `tabular-nums`, встаёт по правому краю с остальными числами и
   * означает «здесь число, которого нет». `inline` живёт в другой раскладке —
   * текстом от левого края, — и прочерк перед ним не удержал бы колонку, а
   * притворился бы, что удерживает. Нужен прочерк в числовой ячейке — там стоит
   * `Money`, а не `EmptyState`.
   */
  variant?: 'block' | 'inline'
  className?: string
}

const DefaultGlyph = (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" />
  </svg>
)

export function EmptyState({ icon, title, description, action, variant = 'block', className }: EmptyStateProps) {
  if (variant === 'inline') {
    // Однострочный: <span>, чтобы помещаться в ячейку; иконка — только если
    // передана явно, заглушку не подставляем.
    return (
      <span className={['ds-empty', 'ds-empty--inline', className].filter(Boolean).join(' ')}>
        {icon && <Icon className="ds-empty__icon ds-icon--lg" aria-hidden="true">{icon}</Icon>}
        <span className="ds-empty__title">{title}</span>
        {description && <span className="ds-empty__desc">{description}</span>}
        {action && <span className="ds-empty__action">{action}</span>}
      </span>
    )
  }
  return (
    <div className={['ds-empty', className].filter(Boolean).join(' ')}>
      <Icon className="ds-empty__icon ds-icon--lg" aria-hidden="true">{icon ?? DefaultGlyph}</Icon>
      <div className="ds-empty__title">{title}</div>
      {description && <div className="ds-empty__desc">{description}</div>}
      {action && <div className="ds-empty__action">{action}</div>}
    </div>
  )
}
