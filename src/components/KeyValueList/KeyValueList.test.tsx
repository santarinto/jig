import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { KeyValueList } from './KeyValueList.js'

const items = [
  { id: 'org', label: 'Организация', value: 'ООО «Ромашка»' },
  { id: 'sum', label: 'Сумма', value: '1 240 500,00 ₽' },
  { id: 'date', label: 'Дата', value: '26.07.2026' },
]

describe('KeyValueList', () => {
  it('pairs every label with its value in a definition list', () => {
    const { container } = render(<KeyValueList items={items} />)
    expect(container.querySelector('dl')).toBeInTheDocument()
    expect(container.querySelectorAll('dt')).toHaveLength(3)
    expect(container.querySelectorAll('dd')).toHaveLength(3)
    expect(screen.getByText('Организация')).toBeInTheDocument()
    expect(screen.getByText('1 240 500,00 ₽')).toBeInTheDocument()
  })

  it('lays out in two columns when asked', () => {
    const { container } = render(<KeyValueList items={items} columns={2} />)
    expect(container.querySelector('dl')).toHaveClass('ds-kv--cols-2')
  })

  it('renders a node value as-is, so a Badge can sit in the value slot', () => {
    render(<KeyValueList items={[{ id: 'st', label: 'Статус', value: <em>Проведён</em> }]} />)
    expect(screen.getByText('Проведён').tagName).toBe('EM')
  })
})
