import { ThemeToggle } from '@santarinto/jig'

/* The control reads the live theme through useTheme, so the cells cannot fake a
   state: OnDark shows how it looks on a dark surface, with its label and icon
   still reporting the truth. Overriding the label here would have paired
   "Светлая тема" with the moon icon. */

export const Default = () => (
  <div style={{ padding: 'var(--ds-space-5)', background: 'var(--ds-bg-app)' }}>
    <ThemeToggle />
  </div>
)

export const OnDark = () => (
  <div data-theme="dark" style={{ padding: 'var(--ds-space-5)', background: 'var(--ds-bg-app)' }}>
    <ThemeToggle />
  </div>
)

export const InAppBar = () => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 'var(--ds-space-4)', padding: 'var(--ds-space-3) var(--ds-space-5)',
    background: 'var(--ds-section-bar)', borderBottom: '1px solid var(--ds-border)',
  }}>
    <span style={{ fontWeight: 600, color: 'var(--ds-text-primary)' }}>Бухгалтерия предприятия</span>
    <ThemeToggle />
  </div>
)
