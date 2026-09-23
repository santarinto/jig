import './PageShell.css'

export interface PageShellProps extends Omit<React.ComponentPropsWithRef<'div'>, 'title'> {
  /** Заголовок страницы в шапке (слева). Узел, а не нативный `title`-атрибут. */
  title?: React.ReactNode
  /** Узел справа в шапке — действия. */
  actions?: React.ReactNode
  /** Полностью своя шапка; перекрывает `title`/`actions`. */
  header?: React.ReactNode
  /**
   * Ограничить ширину контента и центрировать. По умолчанию контент
   * full-width. Число трактуется как px.
   */
  maxWidth?: number | string
  children?: React.ReactNode
}

/**
 * Оболочка страницы: шапка (заголовок + действия) и тело с едиными отступами.
 * Тело по умолчанию во всю ширину; `maxWidth` ограничивает и центрирует его.
 * Тонкий контейнер — раскладку внутри собирают из `Split`/`Stack`/`Grid`.
 */
export function PageShell({
  title, actions, header, maxWidth, children, className, ...rest
}: PageShellProps) {
  const showHeader = header != null || title != null || actions != null
  const bodyStyle = maxWidth != null
    ? { maxWidth, marginInline: 'auto', width: '100%' }
    : undefined
  return (
    <div className={['ds-page', className].filter(Boolean).join(' ')} {...rest}>
      {showHeader && (
        <div className="ds-page__header">
          {header ?? (
            <>
              {title != null && <h1 className="ds-page__title">{title}</h1>}
              {actions != null && <div className="ds-page__actions">{actions}</div>}
            </>
          )}
        </div>
      )}
      <div className="ds-page__body" style={bodyStyle}>{children}</div>
    </div>
  )
}
