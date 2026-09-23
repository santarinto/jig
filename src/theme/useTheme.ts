import { useEffect, useSyncExternalStore } from 'react'
import { getTheme, initTheme, setTheme, subscribeTheme, type Theme } from './theme.js'

function subscribe(onStoreChange: () => void): () => void {
  return subscribeTheme(() => onStoreChange())
}

function getSnapshot(): Theme {
  return getTheme()
}

function getServerSnapshot(): Theme {
  return 'light'
}

/**
 * Theme + setter. On mount, applies stored or system preference via `initTheme`.
 * Subscribes to subsequent `setTheme` calls (including other components).
 */
export function useTheme(): [Theme, (theme: Theme) => void] {
  useEffect(() => {
    initTheme()
  }, [])

  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return [theme, setTheme]
}
