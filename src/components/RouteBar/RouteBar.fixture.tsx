import { defineFixture } from '../../internal/fixture.js'
import { RouteBar, type Route } from './RouteBar.js'

const ROUTES: Route[] = [
  { id: 'orders', label: 'Заказы', href: '/orders', count: 12 },
  { id: 'drivers', label: 'Водители', href: '/drivers' },
  { id: 'cars', label: 'Машины', href: '/cars' },
  { id: 'money', label: 'Финансы', href: '/money', count: 3 },
  { id: 'reports', label: 'Отчёты', href: '/reports' },
]

interface Props {
  selectedId: string
  embedded: boolean
  count: number
}

export default defineFixture<Props>({
  name: 'RouteBar',
  group: 'Навигация',
  kind: 'block',

  props: { selectedId: 'orders', embedded: false, count: 5 },

  controls: {
    selectedId: { kind: 'enum', values: ROUTES.map((r) => r.id), prop: true },
    embedded: { kind: 'bool', prop: true },
    count: { kind: 'number', min: 1, max: 5, prop: false },
  },

  data: {
    // Один раздел: полоса из одного пункта. Он всё равно текущий и всё равно
    // ссылка — в отличие от последней крошки в Breadcrumbs, и это разные
    // контракты, которые легко перепутать.
    single: { count: 1 },
    // Внутри чужой шапки: своей нижней линии полоса не рисует, иначе под ней
    // окажутся две линии подряд.
    embedded: { embedded: true },
  },

  cases: [
    { id: 'base', title: 'Обычная', note: 'Пять разделов, текущий помечен `aria-current="page"`.' },
    {
      id: 'links-not-buttons',
      title: 'Разделы — ссылки',
      note: 'Главное решение компонента: `href` обязателен. Полоса существует ради'
        + ' страниц, где клиентского JS нет вовсе, — там переход делает браузер.'
        + ' Проверьте средней кнопкой: раздел обязан открываться в новой вкладке.',
    },
    {
      id: 'current',
      title: 'Текущий раздел',
      note: 'Текущий отличается ДВУМЯ каналами: подсветкой и `aria-current`. Одной'
        + ' подсветки мало — она не доезжает до озвучки; одного атрибута мало — он'
        + ' не виден глазом. Вкладка axe покажет вторую половину.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {['orders', 'money', 'reports'].map((id) => (
            <RouteBar key={id} routes={ROUTES.slice(0, p.count)} selectedId={id} />
          ))}
        </div>
      ),
    },
    {
      id: 'embedded',
      title: 'В шапке страницы',
      props: { embedded: true },
      note: 'Полоса внутри чужой шапки, у которой своя линия уже есть. Признак'
        + ' называет РАСКЛАДКУ, а не вкус: убирать рамку осмысленно ровно там, где'
        + ' под полосой сразу идёт вторая линия.',
      render: (p) => (
        <div style={{ borderBlockEnd: '1px solid var(--ds-border)', paddingBlockEnd: '0' }}>
          <div style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Парк «Северный»</div>
          <RouteBar routes={ROUTES.slice(0, p.count)} selectedId={p.selectedId} embedded />
        </div>
      ),
    },
    {
      id: 'narrow',
      title: 'В узком окне',
      note: 'Пять разделов в 320px. Предмет — что происходит раньше: перенос,'
        + ' горизонтальная прокрутка или обрезка. Счётчик при этом не должен'
        + ' отрываться от своей подписи.',
      render: (p) => (
        <div style={{ inlineSize: '320px', outline: '1px dashed var(--ds-border)' }}>
          <RouteBar routes={ROUTES} selectedId={p.selectedId} />
        </div>
      ),
    },
  ],

  render: (p) => (
    <RouteBar
      routes={ROUTES.slice(0, Math.max(1, p.count))}
      selectedId={p.selectedId}
      embedded={p.embedded}
    />
  ),
})
