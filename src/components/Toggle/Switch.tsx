import './Toggle.css'

export interface SwitchProps extends Omit<React.ComponentPropsWithRef<'input'>, 'type'> {
  label?: string
}

export function Switch({ label, className, ...rest }: SwitchProps) {
  return (
    <label className={['ds-switch', className].filter(Boolean).join(' ')}>
      <input type="checkbox" role="switch" className="ds-switch__input" {...rest} />
      <span className="ds-switch__track" aria-hidden="true"><span className="ds-switch__thumb" /></span>
      {label && <span className="ds-switch__label">{label}</span>}
    </label>
  )
}
