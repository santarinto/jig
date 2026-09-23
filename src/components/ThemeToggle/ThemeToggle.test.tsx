import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { STORAGE_KEY } from '../../theme/theme.js'
import { ThemeToggle } from './ThemeToggle.js'

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('renders a button and toggles theme on click', async () => {
    render(<ThemeToggle />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveClass('ds-theme-toggle')

    await userEvent.click(btn)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
    expect(btn).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(btn)
    // С 1.38.0 светлая — тоже атрибут: «атрибута нет» значит «выбор не сделан»,
    // а тут пользователь выбрал явно, нажав переключатель.
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light')
    expect(btn).toHaveAttribute('aria-pressed', 'false')
  })
})
