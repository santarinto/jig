import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

function Hello() {
  return <div>ds ready</div>
}

describe('scaffold', () => {
  it('renders a React component under jsdom', () => {
    render(<Hello />)
    expect(screen.getByText('ds ready')).toBeInTheDocument()
  })
})
