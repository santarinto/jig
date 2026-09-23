import { Breadcrumbs } from '@santarinto/jig'

const items = [
  { id: 'home', label: 'Главная' },
  { id: 'sales', label: 'Продажи' },
  { id: 'doc', label: 'Реализация №РТ-0001' },
]

export const Default = () => <Breadcrumbs items={items} />

/**
 * Шов под роутер: пропсы раскладываются на ссылку потребителя, и она сама
 * становится крошкой. Последняя крошка в шов не отдаётся — это текущая
 * страница, а не ссылка на неё.
 */
export const RouterLinks = () => (
  <Breadcrumbs items={items} renderItem={(crumb, props) => <a href={`/${crumb.id}`} {...props} />} />
)
