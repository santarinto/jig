import './Toggle.css'

export interface RadioProps extends Omit<React.ComponentPropsWithRef<'input'>, 'type'> {
  label?: string
}

export function Radio({ label, className, ...rest }: RadioProps) {
  return (
    <label className={['ds-radio', className].filter(Boolean).join(' ')}>
      <input type="radio" className="ds-radio__input" {...rest} />
      <span className="ds-radio__dot" aria-hidden="true" />
      {label && <span className="ds-radio__label">{label}</span>}
    </label>
  )
}
