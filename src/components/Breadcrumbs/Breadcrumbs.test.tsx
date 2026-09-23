import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Breadcrumbs } from './Breadcrumbs.js'

const items = [
  { id: 'home', label: 'Главная' },
  { id: 'sales', label: 'Продажи' },
  { id: 'doc', label: 'Реализация №1' },
]

describe('Breadcrumbs', () => {
  it('marks the last crumb as current and fires onNavigate for earlier ones', async () => {
    const onNavigate = vi.fn()
    render(<Breadcrumbs items={items} onNavigate={onNavigate} />)
    expect(screen.getByText('Реализация №1')).toHaveAttribute('aria-current', 'page')
    await userEvent.click(screen.getByRole('button', { name: 'Продажи' }))
    expect(onNavigate).toHaveBeenCalledWith('sales')
  })
})

describe('Breadcrumbs: шов под роутер', () => {
  const items = [
    { id: 'root', label: 'Настройки' },
    { id: 'cli', label: 'CLI' },
    { id: 'keys', label: 'Ключи' },
  ]

  it('renderItem подменяет элемент — одна ссылка, без кнопки внутри', () => {
    const { container } = render(
      <Breadcrumbs items={items} renderItem={(c, p) => <a href={`/${c.id}`} {...p} />} />,
    )
    expect(container.querySelectorAll('button')).toHaveLength(0)
    // Ссылок две, а не три: последняя крошка это текущая страница.
    expect(container.querySelectorAll('a')).toHaveLength(2)
    expect(container.querySelector('a')).toHaveClass('ds-crumbs__link')
  })

  it('последняя крошка не отдаётся в renderItem — она не ссылка', () => {
    // Иначе потребитель отрисовал бы ссылку на страницу, где пользователь
    // уже стоит.
    const seen: string[] = []
    render(
      <Breadcrumbs items={items}
        renderItem={(c, p) => { seen.push(c.id); return <a href={`/${c.id}`} {...p} /> }} />,
    )
    expect(seen).toEqual(['root', 'cli'])
  })

  it('текущая страница помечена aria-current', () => {
    const { container } = render(
      <Breadcrumbs items={items} renderItem={(c, p) => <a href={`/${c.id}`} {...p} />} />,
    )
    expect(container.querySelector('[aria-current="page"]')!.textContent).toBe('Ключи')
  })

  it('без renderItem разметка прежняя', () => {
    const { container } = render(<Breadcrumbs items={items} />)
    expect(container.querySelectorAll('button')).toHaveLength(2)
  })
})
