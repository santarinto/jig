import './Stat.css'

export interface StatDelta {
  value: string | number
  direction: 'up' | 'down'
  /** Colour of the delta. Defaults to up=positive, down=negative. */
  tone?: 'positive' | 'negative' | 'neutral'
}

export interface StatProps {
  label: string
  value: string | number
  /**
   * Единица измерения рядом со значением — «мс», «commits/hour».
   *
   * Отдельным пропом, а не частью `value`: значение набрано `--ds-fs-2xl` весом
   * 600, и единица строкой получила бы тот же кегль и вес, что число. Она
   * подпись к величине, а не сама величина.
   */
  unit?: string
  delta?: StatDelta
  /**
   * Статус плитки — бейдж «новый коммит», «live». Читается **вместе с
   * подписью**: скринридер произносит «за последний час, новый коммит».
   *
   * Стоит в строке подписи, а не значения, намеренно. В строке значения уже
   * живёт `delta`; третий элемент встал бы вплотную к ней, и «▲ 12 · live»
   * прочиталось бы одним утверждением, хотя это два разных.
   *
   * Слот **под статус, не под действие**: фокусируемую кнопку сюда класть
   * нельзя — она попадёт в чтение подписи как её часть.
   */
  adornment?: React.ReactNode
  hint?: string
  className?: string
}

export function Stat({ label, value, unit, delta, adornment, hint, className }: StatProps) {
  const tone = delta?.tone ?? (delta?.direction === 'up' ? 'positive' : 'negative')
  return (
    <div className={['ds-stat', className].filter(Boolean).join(' ')}>
      <div className="ds-stat__labelrow">
        <div className="ds-stat__label">{label}</div>
        {adornment != null && <span className="ds-stat__adornment">{adornment}</span>}
      </div>
      <div className="ds-stat__row">
        <div className="ds-stat__value">{value}</div>
        {unit != null && <span className="ds-stat__unit">{unit}</span>}
        {delta && (
          <span className={`ds-stat__delta ds-stat__delta--${tone}`}>
            <span className="ds-stat__arrow" aria-hidden="true">{delta.direction === 'up' ? '▲' : '▼'}</span>
            {delta.value}
          </span>
        )}
      </div>
      {hint && <div className="ds-stat__hint">{hint}</div>}
    </div>
  )
}
