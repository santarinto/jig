import { ProgressBar } from '@santarinto/jig'

const stack = { display: 'grid', gap: 'var(--ds-space-5)', width: 320 }

export const Default = () => (
  <div style={stack}>
    <ProgressBar label="Загрузка выписки" value={64} showValue />
    <ProgressBar label="Проведено документов" value={30} max={60} showValue tone="success" />
  </div>
)

export const Tones = () => (
  <div style={stack}>
    <ProgressBar label="Норма" value={45} tone="accent" />
    <ProgressBar label="Близко к лимиту" value={82} tone="warning" />
    <ProgressBar label="Превышение" value={97} tone="error" />
  </div>
)

export const Indeterminate = () => (
  <div style={stack}>
    <ProgressBar label="Обработка, срок неизвестен" indeterminate />
    <ProgressBar label="Компактный" value={40} size="sm" />
  </div>
)
