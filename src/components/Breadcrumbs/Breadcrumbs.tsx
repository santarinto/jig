import { useDsText } from '../../dictionary/DsText.js'
import './Breadcrumbs.css'

export interface Crumb { id: string; label: string }

/**
 * Пропсы, которые крошка отдаёт потребителю в `renderItem`. Разложить их на
 * свой элемент — и он **становится** крошкой.
 */
export interface CrumbRenderProps {
  className: string
  children: React.ReactNode
  onClick: () => void
}

export interface BreadcrumbsProps {
  items: Crumb[]
  onNavigate?: (id: string) => void
  /**
   * Шов под роутер: **подменяет элемент крошки**, а не оборачивает наш.
   *
   * ```tsx
   * renderItem={(crumb, props) => <Link to={`/p/${crumb.id}`} {...props} />}
   * ```
   *
   * Последняя крошка — текущая страница, и она не ссылка: `renderItem` её не
   * получает. Иначе потребитель отрисовал бы ссылку на страницу, на которой
   * пользователь уже стоит.
   *
   * **Оборачивать нельзя:** `<Link>{наша кнопка}</Link>` даёт `<a><button>` —
   * невалидный HTML и два таб-стопа на одну крошку.
   */
  renderItem?: (crumb: Crumb, props: CrumbRenderProps) => React.ReactNode
}

export function Breadcrumbs({ items, onNavigate, renderItem }: BreadcrumbsProps) {
  const t = useDsText()
  return (
    <nav className="ds-crumbs" aria-label={t['breadcrumbs.nav']}>
      <ol className="ds-crumbs__list">
        {items.map((c, i) => {
          const isLast = i === items.length - 1
          const props: CrumbRenderProps = {
            className: 'ds-crumbs__link',
            children: c.label,
            onClick: () => onNavigate?.(c.id),
          }
          return (
            <li key={c.id} className="ds-crumbs__item">
              {isLast
                ? <span className="ds-crumbs__current" aria-current="page">{c.label}</span>
                : renderItem
                  ? renderItem(c, props)
                  : <button type="button" {...props} />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
