import './ProgressBar.css'

export type ProgressTone = 'accent' | 'success' | 'warning' | 'error'

export interface ProgressBarProps extends Omit<React.ComponentPropsWithRef<'div'>, 'children'> {
  /** Current position; clamped into 0…max. Ignored when indeterminate. */
  value?: number
  max?: number
  label?: string
  /** Show "30 / 60" on the right of the label. */
  showValue?: boolean
  tone?: ProgressTone
  size?: 'sm' | 'md'
  /** Work is running but its extent is unknown — the bar animates instead. */
  indeterminate?: boolean
  /**
   * Доступное имя полосы, когда видимой подписи быть не должно.
   *
   * До 1.37.0 имя брать было неоткуда, кроме `label`, а `label` рисуется на
   * экране. В ячейке таблицы «Доля долга» это ставило потребителя перед
   * выбором из двух плохих: дубль подписи рядом с заголовком колонки — или
   * безымянный `role="progressbar"`. Третьего пропса не было.
   *
   * Видимая подпись сильнее: если задан `label`, она и есть имя, а `ariaLabel`
   * игнорируется — два имени на одном узле означают, что скринридер зачитает
   * одно из них, и какое именно, зависит от него.
   */
  ariaLabel?: string
}

export function ProgressBar({
  value = 0, max = 100, label, showValue = false,
  tone = 'accent', size = 'md', indeterminate = false, className, ariaLabel, ...rest
}: ProgressBarProps) {
  const clamped = Math.min(Math.max(value, 0), max)
  const pct = max > 0 ? (clamped / max) * 100 : 0

  return (
    <div className={['ds-progress', `ds-progress--${size}`, className].filter(Boolean).join(' ')} {...rest}>
      {(label || showValue) && (
        <div className="ds-progress__head">
          {label && <span className="ds-progress__label">{label}</span>}
          {showValue && !indeterminate && (
            <span className="ds-progress__count">{clamped} / {max}</span>
          )}
        </div>
      )}
      <div
        className="ds-progress__track"
        role="progressbar"
        // Видимая подпись сильнее скрытой: два имени на одном узле — это
        // «зачитает какое-то», а не «зачитает оба».
        aria-label={label ?? ariaLabel}
        // Indeterminate means the position is unknown — reporting a number here
        // would tell assistive tech something untrue.
        aria-valuenow={indeterminate ? undefined : clamped}
        aria-valuemin={indeterminate ? undefined : 0}
        aria-valuemax={indeterminate ? undefined : max}
      >
        <div
          className={[
            'ds-progress__fill',
            `ds-progress__fill--${tone}`,
            indeterminate && 'is-indeterminate',
          ].filter(Boolean).join(' ')}
          style={indeterminate ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
