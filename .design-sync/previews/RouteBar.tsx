import { RouteBar } from '@santarinto/jig'

const routes = [
  { id: 'home', label: 'Сводка', href: '/' },
  { id: 'accounts', label: 'Счета', href: '/accounts' },
  { id: 'debts', label: 'Долги', href: '/debts', count: 2 },
  { id: 'strategy', label: 'Стратегия', href: '/strategy' },
  { id: 'feed', label: 'Лента', href: '/feed' },
]

/**
 * Плоский набор равноправных разделов. Каждый — ссылка и обычный таб-стоп:
 * роуминга здесь нет намеренно, поэтому полоса работает на странице, где
 * клиентского JS нет вовсе.
 */
export const Default = () => <RouteBar routes={routes} selectedId="accounts" />

/**
 * Полоса внутри шапки приложения: своя нижняя линия не рисуется, потому что
 * разделительная у шапки уже есть — иначе выходят две подряд.
 *
 * Признак называет раскладку, а не действие. Гасить границу «просто так»
 * незачем: отдельно стоящая полоса тем и отделена от содержимого страницы.
 */
export const InHeader = () => (
  // Шапка нарисована целиком намеренно: без ряда с заголовком карточка выглядит
  // ровно как Default (одна линия там и там), и признак нечему научить.
  <div style={{
    background: 'var(--ds-surface)',
    borderBottom: '1px solid var(--ds-border)',
  }}>
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: 'var(--ds-h-comfortable)', padding: '0 var(--ds-space-6)',
    }}>
      <strong style={{ fontSize: 'var(--ds-fs-md)', color: 'var(--ds-text-primary)' }}>Финансы</strong>
      <span style={{ fontSize: 'var(--ds-fs-xs)', color: 'var(--ds-text-muted)' }}>ООО «Ромашка»</span>
    </div>
    <RouteBar routes={routes} selectedId="debts" embedded />
  </div>
)

/**
 * Шов под роутер: пропсы раскладываются на ссылку потребителя, и она сама
 * становится разделом. **Оборачивать нельзя** — `<Link>{наш элемент}</Link>`
 * даёт `<a><a>`: два таб-стопа на один раздел.
 */
export const RouterLinks = () => (
  <RouteBar
    routes={routes}
    selectedId="feed"
    renderItem={(route, props) => <a {...props} href={route.href} />}
  />
)
