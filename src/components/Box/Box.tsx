import './Box.css'

export interface FitProps extends React.ComponentPropsWithRef<'div'> { children: React.ReactNode }
export interface CenterProps extends React.ComponentPropsWithRef<'div'> { children: React.ReactNode }

/** Единственный ребёнок растянут на всю площадь контейнера. */
export function Fit({ className, children, ...rest }: FitProps) {
  return <div className={['ds-fit', className].filter(Boolean).join(' ')} {...rest}>{children}</div>
}

/** Ребёнок отцентрирован по обеим осям. */
export function Center({ className, children, ...rest }: CenterProps) {
  return <div className={['ds-center', className].filter(Boolean).join(' ')} {...rest}>{children}</div>
}
