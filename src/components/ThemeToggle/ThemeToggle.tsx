import { useTheme } from '../../theme/useTheme.js'
import '../../styles/button-surface.css'
import { useDsText } from '../../dictionary/DsText.js'
import './ThemeToggle.css'

export interface ThemeToggleProps {
  className?: string
  /** Accessible name; defaults to a Russian light/dark label. */
  label?: string
}

/** Compact control that toggles light/dark theme via the public theme API. */
export function ThemeToggle({ className, label }: ThemeToggleProps) {
  const t = useDsText()
  const [theme, setTheme] = useTheme()
  const isDark = theme === 'dark'
  const text = label ?? t[isDark ? 'themeToggle.toLight' : 'themeToggle.toDark']

  return (
    <button
      type="button"
      className={['ds-theme-toggle', className].filter(Boolean).join(' ')}
      aria-pressed={isDark}
      aria-label={text}
      title={text}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      <span className="ds-theme-toggle__icon" aria-hidden="true">
        {isDark ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M3.2 12.8l1.1-1.1M11.7 4.3l1.1-1.1"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M13.5 9.2A5.5 5.5 0 0 1 6.8 2.5 5.5 5.5 0 1 0 13.5 9.2Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span className="ds-theme-toggle__label">{text}</span>
    </button>
  )
}
