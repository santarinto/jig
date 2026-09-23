import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Avatar } from './Avatar.js'

describe('Avatar', () => {
  it('derives initials from a Russian full name, first and last only', () => {
    render(<Avatar name="Иванов Пётр Сергеевич" />)
    expect(screen.getByText('ИП')).toBeInTheDocument()
  })

  it('falls back to one letter for a single-word name', () => {
    render(<Avatar name="Ромашка" />)
    expect(screen.getByText('Р')).toBeInTheDocument()
  })

  it('names itself for screen readers even though initials are decorative', () => {
    render(<Avatar name="Иванов Пётр" />)
    expect(screen.getByLabelText('Иванов Пётр')).toBeInTheDocument()
  })

  // The photo carries alt="" on purpose: the wrapper already announces the name,
  // so an alt here would make a screen reader read it twice.
  it('shows the photo when one is given, and keeps it out of the a11y tree', () => {
    const { container } = render(<Avatar name="Иванов Пётр" src="/p.jpg" />)
    const img = container.querySelector('img')!
    expect(img).toHaveAttribute('src', '/p.jpg')
    expect(img).toHaveAttribute('alt', '')
    expect(screen.queryByText('ИП')).toBeNull()
    expect(screen.getAllByRole('img', { name: 'Иванов Пётр' })).toHaveLength(1)
  })

  it('falls back to initials when the photo fails to load', () => {
    const { container } = render(<Avatar name="Иванов Пётр" src="/broken.jpg" />)
    fireEvent.error(container.querySelector('img')!)
    expect(screen.getByText('ИП')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })
})

describe('Avatar: присутствие', () => {
  it('присутствие попадает в доступное имя, а не только в цвет', () => {
    render(<Avatar name="Пётр Иванов" presence="online" />)
    expect(screen.getByRole('img', { name: 'Пётр Иванов, в сети' })).toBeInTheDocument()
  })

  it('все четыре состояния названы по-русски', () => {
    const cases: [string, string][] = [
      ['online', 'в сети'], ['busy', 'занят'], ['away', 'отошёл'], ['offline', 'не в сети'],
    ]
    for (const [key, word] of cases) {
      const { unmount } = render(<Avatar name="А Б" presence={key as never} />)
      expect(screen.getByRole('img', { name: `А Б, ${word}` }), key).toBeInTheDocument()
      unmount()
    }
  })

  it('presenceLabel заменяет слово — язык у потребителя может быть не наш', () => {
    render(<Avatar name="Peter Ivanov" presence="online" presenceLabel="online" />)
    expect(screen.getByRole('img', { name: 'Peter Ivanov, online' })).toBeInTheDocument()
  })

  it('без присутствия имя остаётся прежним и класса нет', () => {
    const { container } = render(<Avatar name="Пётр Иванов" />)
    expect(screen.getByRole('img', { name: 'Пётр Иванов' })).toBeInTheDocument()
    expect(container.querySelector('[class*="ds-avatar--presence-"]')).toBeNull()
  })

  it('title совпадает с доступным именем — иначе подсказка и скринридер расходятся', () => {
    render(<Avatar name="Пётр Иванов" presence="busy" />)
    expect(screen.getByRole('img')).toHaveAttribute('title', 'Пётр Иванов, занят')
  })

  it('«не в сети» — это кольцо, а не его отсутствие: пустота значила бы «неизвестно»', () => {
    const { container } = render(<Avatar name="А Б" presence="offline" />)
    expect(container.querySelector('.ds-avatar--presence-offline')).not.toBeNull()
  })
})
