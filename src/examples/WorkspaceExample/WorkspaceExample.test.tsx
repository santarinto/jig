import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { WorkspaceExample } from './WorkspaceExample.js'

describe('WorkspaceExample', () => {
  it('renders the app bar, section nav and dashboard tiles', () => {
    render(<WorkspaceExample />)
    expect(screen.getByRole('banner')).toHaveTextContent('Курьер 7')
    expect(screen.getByRole('tab', { name: /Продажи/ })).toBeInTheDocument()
    expect(screen.getByText('Продажи за день')).toBeInTheDocument()
  })
})
