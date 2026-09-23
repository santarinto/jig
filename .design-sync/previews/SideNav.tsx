import { SideNav, type SideNavGroup } from '@santarinto/jig'

const icon = (d: string) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
)

const groups: SideNavGroup[] = [
  {
    id: 'accounting',
    title: 'Учёт',
    items: [
      { id: 'main', label: 'Главная', icon: icon('M3 9.5 12 3l9 6.5V21H3z') },
      {
        id: 'docs', label: 'Документы', count: 12, icon: icon('M6 2h8l4 4v16H6zM14 2v4h4'),
        children: [
          { id: 'sale', label: 'Реализация' },
          { id: 'purchase', label: 'Поступление' },
        ],
      },
      { id: 'refs', label: 'Справочники', icon: icon('M4 6h16M4 12h16M4 18h16') },
    ],
  },
  {
    id: 'analysis',
    title: 'Анализ',
    separator: true,
    items: [
      { id: 'reports', label: 'Отчёты', count: 3, icon: icon('M4 20V10M10 20V4M16 20v-7M22 20H2') },
      { id: 'settings', label: 'Настройки', icon: icon('M12 8a4 4 0 100 8 4 4 0 000-8zM2 12h2m16 0h2M12 2v2m0 16v2') },
    ],
  },
]

const frame = (children: React.ReactNode) => (
  <div style={{ display: 'flex', height: 320, background: 'var(--ds-bg-app)' }}>{children}</div>
)

export const Default = () => frame(
  <SideNav groups={groups} selectedId="sale" title="Управление" mark="◆" />,
)

export const Collapsed = () => frame(
  <SideNav groups={groups} selectedId="reports" title="Управление" mark="◆" collapsed />,
)

export const AsLinks = () => frame(
  <SideNav
    groups={groups}
    selectedId="main"
    title="Управление"
    mark="◆"
    // Ссылка потребителя **становится** пунктом: пропсы раскладываются на неё.
    // Обёртка `<a>{наша кнопка}</a>` дала бы `<a><button>` и два таб-стопа на пункт.
    renderItem={(item, props) => <a href={`/${item.id}`} {...props} />}
  />,
)
