import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { RouteBar } from './RouteBar.js'

const routes = [
  { id: 'home', label: 'Сводка', href: '/' },
  { id: 'accounts', label: 'Счета', href: '/accounts' },
  { id: 'debts', label: 'Долги', href: '/debts', count: 2 },
  { id: 'strategy', label: 'Стратегия', href: '/strategy' },
  { id: 'feed', label: 'Лента', href: '/feed' },
]

describe('RouteBar', () => {
  /**
   * Главное утверждение компонента, и оно про клавиатуру, а не про вид.
   *
   * `Tabs` и `SectionPanel` раздают roving `tabIndex` (`active ? 0 : -1`), а
   * фокус остальным пунктам возвращает обработчик стрелок. На странице без
   * гидрации обработчик не подключается — и полоса из пяти разделов отдаёт
   * клавиатуре ровно один. Мышью это незаметно, скриншотом тоже.
   *
   * Проверка мутирована: `tabIndex: active ? 0 : -1` в пунктах роняет её на
   * `-1` у четырёх ссылок из пяти.
   */
  it('каждый раздел — таб-стоп, роуминга нет', () => {
    const { container } = render(<RouteBar routes={routes} selectedId="accounts" />)
    const links = [...container.querySelectorAll('a')]

    // Счётчик рядом с утверждением: пустая полоса прошла бы проверку «ни у
    // кого нет tabindex=-1» просто потому, что проверять нечего.
    expect(links).toHaveLength(routes.length)
    expect(links.filter((a) => a.tabIndex === -1)).toEqual([])
  })

  /**
   * Второе утверждение того же свойства: переход делает браузер. Ссылка без
   * адреса переносит работу на обработчик, которого на статической странице
   * некому подключить.
   */
  it('у каждого раздела непустой href', () => {
    const { container } = render(<RouteBar routes={routes} selectedId="home" />)
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['/', '/accounts', '/debts', '/strategy', '/feed'])
  })

  it('текущий раздел помечен ровно один', () => {
    const { container } = render(<RouteBar routes={routes} selectedId="debts" />)
    const current = container.querySelectorAll('[aria-current="page"]')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent('Долги')
  })

  it('полоса — именованная навигация со списком', () => {
    render(<RouteBar routes={routes} selectedId="home" ariaLabel="Разделы отчёта" />)
    const nav = screen.getByRole('navigation', { name: 'Разделы отчёта' })
    expect(nav).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(routes.length)
  })

  /**
   * Признак раскладки, а не действия: полоса внутри шапки, у которой своя
   * разделительная линия уже есть. Что линия действительно одна, а не две
   * подряд, утверждает замер в браузере — здесь стережём модификатор.
   */
  it('embedded помечает полосу модификатором, по умолчанию его нет', () => {
    const { container, rerender } = render(<RouteBar routes={routes} selectedId="home" />)
    expect(container.querySelector('.ds-routebar')).not.toHaveClass('ds-routebar--embedded')
    rerender(<RouteBar routes={routes} selectedId="home" embedded />)
    expect(container.querySelector('.ds-routebar')).toHaveClass('ds-routebar--embedded')
  })

  /**
   * Шов отдаёт `href`, а не только классы: потребитель, написавший
   * `<a {...props} />`, обязан получить рабочую ссылку. Без `href` в наборе
   * шов молча давал бы `<a>` без адреса — то есть ровно тот дефект, ради
   * которого компонент и написан.
   */
  it('шов получает адрес и пометку текущего', () => {
    const seen: { href: string; current?: string }[] = []
    render(
      <RouteBar routes={routes} selectedId="feed"
        renderItem={(r, props) => {
          seen.push({ href: props.href, current: props['aria-current'] })
          return <a key={r.id} {...props} />
        }} />,
    )
    expect(seen.map((s) => s.href)).toEqual(['/', '/accounts', '/debts', '/strategy', '/feed'])
    expect(seen.filter((s) => s.current === 'page')).toHaveLength(1)
  })
})
