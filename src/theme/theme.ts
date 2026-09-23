export type Theme = 'light' | 'dark'

export const STORAGE_KEY = 'ds-theme'

type Listener = (theme: Theme) => void

const listeners = new Set<Listener>()

function hasDom(): boolean {
  return typeof document !== 'undefined' && !!document?.documentElement
}

function hasStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

function readStorage(): Theme | null {
  if (!hasStorage()) return null
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw === 'light' || raw === 'dark' ? raw : null
}

function writeStorage(theme: Theme): void {
  if (!hasStorage()) return
  localStorage.setItem(STORAGE_KEY, theme)
}

function systemTheme(): Theme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light'
  }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function applyToDom(theme: Theme): void {
  if (!hasDom()) return
  // Светлая — ТОЖЕ атрибут, а не его отсутствие.
  //
  // До 1.38.0 `setTheme('light')` атрибут снимал: `:root` и так светлый, и
  // разницы не было, пока не появился `theme-auto.css`. Он матчится по
  // `:root:not([data-theme])` — то есть у пользователя, ЯВНО выбравшего
  // светлую на машине с системной тёмной, атрибут снимался и страница
  // становилась тёмной. Выбор молча отменялся ровно тем файлом, который
  // обещает «явный выбор побеждает системный».
  //
  // Найдено потребителем до того, как кто-либо на это наступил: у него нет
  // переключателя, он читал контракт.
  //
  // `[data-theme="light"]` в токенах не объявлен и не нужен: светлая живёт в
  // `:root`, атрибут здесь работает как отметка «выбор сделан», а не как
  // селектор темы.
  document.documentElement.setAttribute('data-theme', theme)
}

function notify(theme: Theme): void {
  for (const listener of listeners) listener(theme)
}

/**
 * Current theme. With a DOM: reflects `data-theme` on `documentElement`.
 * Without a DOM (SSR): storage, then `prefers-color-scheme`, then `'light'`.
 */
export function getTheme(): Theme {
  if (hasDom()) {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  }
  return readStorage() ?? systemTheme()
}

/** Persist and apply theme. Safe when `document` / `localStorage` are missing (SSR). */
export function setTheme(theme: Theme): void {
  writeStorage(theme)
  applyToDom(theme)
  notify(theme)
}

/**
 * Apply stored theme, or system preference when storage is empty.
 * Does not write localStorage for a system-derived choice (first visit).
 */
export function initTheme(): Theme {
  const theme = readStorage() ?? systemTheme()
  applyToDom(theme)
  notify(theme)
  return theme
}

export function subscribeTheme(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
