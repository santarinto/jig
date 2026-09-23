import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { SideNav, type SideNavGroup } from './SideNav.js'

const groups: SideNavGroup[] = [
  {
    id: 'accounting',
    title: 'Учёт',
    items: [
      { id: 'main', label: 'Главная' },
      {
        id: 'docs',
        label: 'Документы',
        count: 12,
        children: [
          { id: 'sale', label: 'Реализация' },
          { id: 'purchase', label: 'Поступление' },
        ],
      },
    ],
  },
  {
    id: 'analysis',
    title: 'Анализ',
    separator: true,
    items: [{ id: 'reports', label: 'Отчёты', count: 3 }],
  },
]

describe('SideNav', () => {
  it('renders group titles and items, marking the active one', () => {
    render(<SideNav groups={groups} selectedId="main" />)
    expect(screen.getByText('Учёт')).toBeInTheDocument()
    expect(screen.getByText('Анализ')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Главная/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: /Отчёты/ })).not.toHaveAttribute('aria-current')
  })

  it('selects a leaf item on click', async () => {
    const onSelect = vi.fn()
    render(<SideNav groups={groups} selectedId="main" onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: /Отчёты/ }))
    expect(onSelect).toHaveBeenCalledWith('reports')
  })

  it('toggles children instead of selecting when the item has any', async () => {
    const onSelect = vi.fn()
    render(<SideNav groups={groups} selectedId="main" onSelect={onSelect} />)
    expect(screen.queryByRole('button', { name: /Реализация/ })).toBeNull()

    const parent = screen.getByRole('button', { name: /Документы/ })
    expect(parent).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(parent)

    expect(screen.getByRole('button', { name: /Реализация/ })).toBeInTheDocument()
    expect(parent).toHaveAttribute('aria-expanded', 'true')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('expands the branch that holds the active item', () => {
    render(<SideNav groups={groups} selectedId="sale" />)
    expect(screen.getByRole('button', { name: /Реализация/ })).toHaveAttribute('aria-current', 'page')
  })

  it('hides labels when collapsed but keeps items reachable by name', () => {
    render(<SideNav groups={groups} selectedId="main" collapsed />)
    const item = screen.getByRole('button', { name: 'Главная' })
    expect(item).toHaveAttribute('title', 'Главная')
    expect(screen.queryByText('Учёт')).toBeNull()
  })

  it('lets the host wrap every item — this is how the portal supplies its router Link', async () => {
    const onSelect = vi.fn()
    const { container } = render(
      <SideNav
        groups={groups}
        selectedId="main"
        onSelect={onSelect}
        renderItem={(item, props) => <a href={`/${item.id}`} data-testid={`link-${item.id}`} {...props} />}
      />,
    )
    const link = screen.getByTestId('link-main')
    expect(link).toHaveAttribute('href', '/main')
    // Шов ПОДМЕНЯЕТ элемент: ссылка сама и есть пункт, а не обёртка вокруг
    // нашей кнопки. Прежний шов давал <a><button> — невалидный HTML и два
    // таб-стопа на один пункт.
    expect(link.querySelector('button')).toBeNull()
    expect(link).toHaveClass('ds-sidenav__item', 'is-active')
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(link.textContent).toContain('Главная')

    // Ровно один интерактивный элемент на пункт-лист.
    const perItem = container.querySelectorAll('.ds-sidenav__row > a, .ds-sidenav__row > button')
    expect(perItem.length).toBe(
      container.querySelectorAll('.ds-sidenav__row').length,
    )
  })

  it('ветка с детьми остаётся кнопкой — она раскрывает, а не ведёт', () => {
    // Отдать ветку в renderItem значило бы предложить потребителю сделать
    // ссылкой то, что должно раскрывать поддерево.
    const seen: string[] = []
    render(
      <SideNav
        groups={groups}
        selectedId="main"
        renderItem={(item, props) => {
          seen.push(item.id)
          return <a href={`/${item.id}`} {...props} />
        }}
      />,
    )
    const branches = groups.flatMap((g) => g.items).filter((i) => i.children?.length)
    for (const b of branches) expect(seen).not.toContain(b.id)
  })

  // The panel width is the one metric that comes from JS, so the CSS sweep to
  // rem could not reach it: at --ds-ui-scale > 1 the rows would grow while the
  // panel stayed 212px and the labels started truncating.
  it('scales its width with --ds-ui-scale', () => {
    const { container } = render(<SideNav groups={groups} selectedId="main" width={212} />)
    const nav = container.querySelector('nav')!
    // The fallback in var(--ds-ui-scale, 1) keeps the panel sane if the token
    // block was never loaded, so match the prefix rather than the exact call.
    expect(nav.getAttribute('style')).toContain('calc(212px * var(--ds-ui-scale')
  })

  // ── Свёрнутая рейка и переход снаружи (DS-242) ────────────────────

  it('свёрнутый пункт со счётчиком несёт ВИДИМЫЙ индикатор и число в имени', () => {
    const { container } = render(<SideNav groups={groups} selectedId="main" collapsed />)
    // Имя — не «Документы», а «Документы: 12»: точка говорит «непусто», число
    // сказать нечем, и без имени оно пропадало бы совсем.
    expect(screen.getByRole('button', { name: 'Документы: 12' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Отчёты: 3' })).toBeInTheDocument()
    // Ровно у пунктов со счётчиком, а не у всех: «Главная» без счётчика.
    expect(container.querySelectorAll('.ds-sidenav__dot')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Главная' })).toBeInTheDocument()
  })

  it('НОЛЬ точки не получает — иначе индикатор появился бы, ничего не различая', () => {
    const zeroed: SideNavGroup[] = groups.map((g) => ({
      ...g,
      items: g.items.map((i) => (i.count != null ? { ...i, count: 0 } : i)),
    }))
    const { container } = render(<SideNav groups={zeroed} selectedId="main" collapsed />)
    expect(container.querySelectorAll('.ds-sidenav__dot')).toHaveLength(0)
    // Само число при этом не теряется: «0» произносится, просто не рисуется.
    expect(screen.getByRole('button', { name: 'Документы: 0' })).toBeInTheDocument()
  })

  it('развёрнутая панель счётчик рисует ЧИСЛОМ и точки не заводит', () => {
    const { container } = render(<SideNav groups={groups} selectedId="main" />)
    expect(container.querySelectorAll('.ds-sidenav__count')).toHaveLength(2)
    expect(container.querySelectorAll('.ds-sidenav__dot')).toHaveLength(0)
  })

  it('свёрнутая ветка РАСКРЫВАЕТ подменю, а не выбирается', async () => {
    const onSelect = vi.fn()
    const { container } = render(
      <SideNav groups={groups} selectedId="main" onSelect={onSelect} collapsed />,
    )
    const branch = screen.getByRole('button', { name: 'Документы: 12' })
    expect(branch).toHaveAttribute('aria-expanded', 'false')
    // Ветку от листа в рейке отличает знак — до починки не отличало ничто.
    expect(branch.querySelector('.ds-sidenav__branchmark')).not.toBeNull()

    await userEvent.click(branch)

    // Главное утверждение: `onSelect('docs')` НЕ зовётся. Своей страницы у
    // ветки нет, и потребителю на этот id ответить нечем.
    expect(onSelect).not.toHaveBeenCalled()
    expect(branch).not.toHaveAttribute('aria-current')
    expect(branch).toHaveAttribute('aria-expanded', 'true')
    expect(container.querySelector('.ds-sidenav__flyout')).not.toBeNull()
    expect(screen.getByRole('button', { name: /Реализация/ })).toBeInTheDocument()
  })

  it('лист подменю выбирается и закрывает подменю', async () => {
    const onSelect = vi.fn()
    const { container } = render(
      <SideNav groups={groups} selectedId="main" onSelect={onSelect} collapsed />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Документы: 12' }))
    await userEvent.click(screen.getByRole('button', { name: /Реализация/ }))
    expect(onSelect).toHaveBeenCalledWith('sale')
    expect(container.querySelector('.ds-sidenav__flyout')).toBeNull()
  })

  it('подменю закрывается по Esc и по клику мимо', async () => {
    const { container } = render(<SideNav groups={groups} selectedId="main" collapsed />)
    const branch = screen.getByRole('button', { name: 'Документы: 12' })

    await userEvent.click(branch)
    await userEvent.keyboard('{Escape}')
    expect(container.querySelector('.ds-sidenav__flyout')).toBeNull()

    await userEvent.click(branch)
    await userEvent.click(document.body)
    expect(container.querySelector('.ds-sidenav__flyout')).toBeNull()
  })

  it('РАЗВЁРНУТАЯ ветка подменю не заводит — она по-прежнему разворачивает поддерево', async () => {
    const { container } = render(<SideNav groups={groups} selectedId="main" />)
    await userEvent.click(screen.getByRole('button', { name: /Документы/ }))
    expect(container.querySelector('.ds-sidenav__flyout')).toBeNull()
    expect(container.querySelector('.ds-sidenav__branchmark')).toBeNull()
    expect(screen.getByRole('button', { name: /Реализация/ })).toBeInTheDocument()
  })

  it('СМЕНА selectedId снаружи открывает ветку — а не только монтирование', () => {
    const { rerender } = render(<SideNav groups={groups} selectedId="main" />)
    expect(screen.queryByRole('button', { name: /Реализация/ })).toBeNull()
    // Так выглядит переход по ссылке из письма или кнопка «назад»: панель уже
    // смонтирована, меняется только проп. Инициализатор `useState` этого не
    // видел вовсе, и активный пункт оставался внутри свёрнутой ветки.
    rerender(<SideNav groups={groups} selectedId="sale" />)
    expect(screen.getByRole('button', { name: /Реализация/ })).toHaveAttribute('aria-current', 'page')
  })

  it('переход НЕ закрывает ветку, открытую пользователем — иначе он схлопывал бы его работу', async () => {
    const { rerender } = render(<SideNav groups={groups} selectedId="main" />)
    await userEvent.click(screen.getByRole('button', { name: /Документы/ }))
    expect(screen.getByRole('button', { name: /Реализация/ })).toBeInTheDocument()

    // Переход на пункт ВНЕ этой ветки. Синхронизация `expanded` с трассой
    // целиком закрыла бы «Документы»; эффект только ДОБАВЛЯЕТ предков.
    rerender(<SideNav groups={groups} selectedId="reports" />)
    expect(screen.getByRole('button', { name: /Реализация/ })).toBeInTheDocument()
  })

  it('moves focus between items with the arrow keys', async () => {
    render(<SideNav groups={groups} selectedId="main" />)
    const first = screen.getByRole('button', { name: /Главная/ })
    first.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Документы/ }))
    await userEvent.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(first)
    await userEvent.keyboard('{End}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Отчёты/ }))
  })
})
