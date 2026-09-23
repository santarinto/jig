import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { initTheme, setTheme, STORAGE_KEY } from '../src/theme/index.js'
import { ThemeToggle } from '../src/components/ThemeToggle/index.js'
import '../src/styles.css'
import '../fonts/inter.css'
import './demo-app.css'

import { ActionsSection, FeedbackSection } from './sections/actions-feedback.js'
import { FormsSection } from './sections/forms.js'
import { ChartsSection } from './sections/charts.js'
import { DataSection } from './sections/data.js'
import { NavLayoutSection } from './sections/nav-layout.js'
import { TabsSection } from './sections/tabs.js'
import { ToggleGroupSection } from './sections/togglegroup.js'
import { LayoutsSection } from './sections/layouts.js'
import { CardSection } from './sections/card.js'
import { TreeSection } from './sections/tree.js'
import { OverlaysSection } from './sections/overlays.js'
import { ShellSection } from './sections/shell.js'
import { ToneDialectsSection } from './sections/tone-dialects.js'

type NavItem = { id: string; label: string; children?: { id: string; label: string }[] }

const NAV: NavItem[] = [
  {
    id: 'actions',
    label: 'Actions',
    children: [
      { id: 'actions-button', label: 'Button' },
      { id: 'actions-badge', label: 'Badge' },
      { id: 'actions-dropdown', label: 'DropdownMenu' },
      { id: 'actions-codeblock', label: 'CodeBlock' },
    ],
  },
  { id: 'feedback', label: 'Feedback' },
  {
    id: 'overlays',
    label: 'Overlays',
    children: [
      { id: 'overlays-modal', label: 'Modal' },
      { id: 'overlays-drawer', label: 'Drawer' },
      { id: 'overlays-popover', label: 'Popover' },
      { id: 'overlays-tooltip', label: 'Tooltip' },
    ],
  },
  { id: 'forms', label: 'Forms' },
  { id: 'tabs', label: 'Tabs' },
  { id: 'togglegroup', label: 'ToggleGroup' },
  { id: 'charts', label: 'Charts' },
  { id: 'data', label: 'Data' },
  { id: 'tree', label: 'Tree' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'layout', label: 'Layout' },
  { id: 'shell', label: 'Shell' },
  { id: 'tone', label: 'Tone dialects' },
  { id: 'card', label: 'Card' },
  { id: 'layouts', label: 'Layouts' },
]

const LABS = [
  { href: '/sidenav.html', label: 'SideNav lab' },
  { href: '/charts.html', label: 'Charts lab' },
  { href: '/card.html', label: 'Card lab' },
  { href: '/calendar.html', label: 'Calendar lab' },
  { href: '/constraints.html', label: 'Master–detail lab' },
]

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function allNavIds(items: NavItem[]): string[] {
  return items.flatMap((item) => [item.id, ...(item.children?.map((c) => c.id) ?? [])])
}

function App() {
  const [active, setActive] = useState<string>('actions-button')
  const observeIds = useMemo(() => allNavIds(NAV), [])

  useEffect(() => {
    // Демо открываем в тёмной теме по умолчанию; выбор пользователя (тумблер) уважаем.
    if (!localStorage.getItem(STORAGE_KEY)) setTheme('dark')
    initTheme()
  }, [])

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible?.target.id) setActive(visible.target.id)
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: [0, 0.2, 0.5] },
    )
    for (const id of observeIds) {
      const el = document.getElementById(id)
      if (el) obs.observe(el)
    }
    return () => obs.disconnect()
  }, [observeIds])

  return (
    <div className="demo-app ds-root">
      <nav className="demo-app__nav" aria-label="Разделы демо">
        <p className="demo-app__brand">jig</p>
        <p className="demo-app__hint">Полная галерея компонентов. Переключатель темы — справа.</p>
        {NAV.map((item) => (
          <div key={item.id}>
            <button
              type="button"
              className={['demo-app__link', active === item.id ? 'is-active' : ''].filter(Boolean).join(' ')}
              onClick={() => scrollTo(item.children?.[0]?.id ?? item.id)}
            >
              {item.label}
            </button>
            {item.children?.map((child) => (
              <button
                key={child.id}
                type="button"
                className={['demo-app__link', 'demo-app__sublink', active === child.id ? 'is-active' : ''].filter(Boolean).join(' ')}
                onClick={() => scrollTo(child.id)}
              >
                {child.label}
              </button>
            ))}
          </div>
        ))}
        <div className="demo-app__labs">
          <p className="demo-app__labs-title">Лаборатории</p>
          {LABS.map((l) => (
            <a key={l.href} className="demo-app__lab" href={l.href}>{l.label}</a>
          ))}
        </div>
      </nav>

      <main className="demo-app__main">
        <div className="demo-app__toolbar">
          <div>
            <h1 className="demo-app__title">Component gallery</h1>
            <p className="demo-app__subtitle">Название и размер — по клику в буфер; иконка — JSX.</p>
          </div>
          <ThemeToggle />
        </div>

        <ActionsSection />
        <FeedbackSection />
        <OverlaysSection />
        <FormsSection />
        <TabsSection />
        <ToggleGroupSection />
        <ChartsSection />
        <DataSection />
        <TreeSection />
        <NavLayoutSection />
        <ShellSection />
        <ToneDialectsSection />
        <CardSection />
        <LayoutsSection />
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
