import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { DocumentFormExample } from './DocumentFormExample.js'

describe('DocumentFormExample', () => {
  it('renders the command bar, requisites and line-items table', () => {
    render(<DocumentFormExample />)
    expect(screen.getByRole('button', { name: 'Провести и закрыть' })).toBeInTheDocument()
    expect(screen.getByText('Организация')).toBeInTheDocument()
    expect(screen.getByText('Номенклатура')).toBeInTheDocument()
    expect(screen.getByText('Ноутбук ASUS')).toBeInTheDocument()
  })
})
