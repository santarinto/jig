import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getTheme, setTheme, initTheme, subscribeTheme, STORAGE_KEY } from './theme.js'

describe('theme API', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    vi.unstubAllGlobals()
  })

  it('setTheme("dark") sets data-theme and persists', () => {
    setTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
    expect(getTheme()).toBe('dark')
  })

  // С 1.38.0 светлая — тоже атрибут: «атрибута нет» теперь означает «выбор не
  // сделан», и это условие, по которому работает theme-auto.css.
  it('setTheme("light") ставит data-theme="light" and persists', () => {
    setTheme('dark')
    setTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light')
    expect(getTheme()).toBe('light')
  })

  it('initTheme uses prefers-color-scheme when storage is empty', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('dark'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
    const theme = initTheme()
    expect(theme).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    // system default is applied but not locked into storage
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('initTheme prefers stored choice over system', () => {
    localStorage.setItem(STORAGE_KEY, 'light')
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('dark'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
    expect(initTheme()).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('subscribeTheme notifies on setTheme', () => {
    const spy = vi.fn()
    const unsub = subscribeTheme(spy)
    setTheme('dark')
    expect(spy).toHaveBeenCalledWith('dark')
    unsub()
    setTheme('light')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('module never touches window/document at top level', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(resolve(__dirname, 'theme.ts'), 'utf8')
    // Strip block/line comments; remaining top-level must not reference DOM APIs.
    const bare = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    const beforeFirstExport = bare.split(/^export /m)[0] ?? bare
    expect(beforeFirstExport).not.toMatch(/\bwindow\b/)
    expect(beforeFirstExport).not.toMatch(/\bdocument\b/)
    expect(beforeFirstExport).not.toMatch(/\blocalStorage\b/)
  })
})

/**
 * Светлая — тоже атрибут, а не его отсутствие.
 *
 * Пока светлая означала «атрибута нет», это было неотличимо от «выбор не
 * сделан». Разница появилась вместе с `theme-auto.css` (1.37.0), который
 * матчится по `:root:not([data-theme])`: у пользователя, ЯВНО выбравшего
 * светлую на машине с системной тёмной, страница становилась тёмной — выбор
 * отменялся тем самым файлом, который обещает обратное.
 */
describe('theme · явный выбор отличим от несделанного', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    localStorage.clear()
  })

  it('светлая ставит data-theme="light", а не снимает атрибут', () => {
    setTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('тёмная по-прежнему data-theme="dark"', () => {
    setTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('обе темы читаются обратно — getTheme не сломался о новое значение', () => {
    setTheme('light')
    expect(getTheme()).toBe('light')
    setTheme('dark')
    expect(getTheme()).toBe('dark')
    setTheme('light')
    expect(getTheme()).toBe('light')
  })

  it('отсутствие атрибута значит «выбор не сделан» — это и матчит theme-auto.css', () => {
    // Ровно то условие, по которому работает `:root:not([data-theme])`.
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    setTheme('light')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(true)
  })
})
