import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { STORAGE_KEY } from './theme.js'
import { useTheme } from './useTheme.js'

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    vi.unstubAllGlobals()
  })

  it('returns current theme and applies system preference on mount when storage empty', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('dark'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
    const { result } = renderHook(() => useTheme())
    expect(result.current[0]).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('setTheme via hook updates theme and storage', () => {
    const { result } = renderHook(() => useTheme())
    act(() => {
      result.current[1]('dark')
    })
    expect(result.current[0]).toBe('dark')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
  })
})
