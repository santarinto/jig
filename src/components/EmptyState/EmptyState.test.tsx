import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { EmptyState } from './EmptyState.js'

describe('EmptyState', () => {
  it('renders title, description and an action slot', () => {
    render(
      <EmptyState
        title="Пока нет заметок"
        description="Создайте первую заметку."
        action={<button>Создать</button>}
      />,
    )
    expect(screen.getByText('Пока нет заметок')).toBeInTheDocument()
    expect(screen.getByText('Создайте первую заметку.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Создать' })).toBeInTheDocument()
  })

  it('renders a default glyph when no icon is given', () => {
    const { container } = render(<EmptyState title="Пусто" />)
    expect(container.querySelector('.ds-empty__icon svg')).toBeInTheDocument()
    expect(container.querySelector('.ds-empty__desc')).toBeNull()
    expect(container.querySelector('.ds-empty__action')).toBeNull()
  })

  it('renders a custom icon when provided', () => {
    render(<EmptyState title="Поиск" icon={<span data-testid="my-icon">★</span>} />)
    expect(screen.getByTestId('my-icon')).toBeInTheDocument()
  })
})

describe('EmptyState inline', () => {
  /**
   * Инлайн — для ячейки таблицы и угла карточки, где блок целиком не помещается.
   * Ключевое: заглушку-иконку он НЕ подставляет — крупный глиф в строке
   * притворяется содержимым. Мутация: если инлайн рисует `icon ?? DefaultGlyph`
   * как блочный, `.ds-empty__icon svg` появится и проверка покраснеет.
   */
  it('однострочный, span, без блочной иконки-заглушки', () => {
    const { container } = render(<EmptyState variant="inline" title="Нет данных" />)
    const root = container.querySelector('.ds-empty--inline')!
    expect(root).not.toBeNull()
    expect(root.tagName).toBe('SPAN')
    expect(container.querySelector('.ds-empty__icon svg')).toBeNull()
  })

  it('несёт короткое объяснение и ссылку «откуда возьмётся»', () => {
    render(
      <EmptyState variant="inline" title="—"
        description="счёт появится после первой выписки"
        action={<a href="/import">Импорт</a>} />,
    )
    expect(screen.getByText('счёт появится после первой выписки')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Импорт' })).toBeInTheDocument()
  })

  it('блочный вариант по умолчанию по-прежнему рисует заглушку-иконку', () => {
    const { container } = render(<EmptyState title="Пусто" />)
    expect(container.querySelector('.ds-empty__icon svg')).toBeInTheDocument()
  })
})
