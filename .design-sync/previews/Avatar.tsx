import { Avatar } from '@santarinto/jig'

const row = { display: 'flex', gap: 'var(--ds-space-4)', alignItems: 'center' }

export const Sizes = () => (
  <div style={row}>
    <Avatar name="Иванов Пётр Сергеевич" size="sm" />
    <Avatar name="Иванов Пётр Сергеевич" size="md" />
    <Avatar name="Иванов Пётр Сергеевич" size="lg" />
  </div>
)

export const Accent = () => (
  <div style={row}>
    <Avatar name="Ромашка" tone="accent" />
    <Avatar name="Смирнова Анна" tone="accent" size="lg" />
  </div>
)

export const InHeader = () => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: 'var(--ds-space-3) var(--ds-space-5)',
    background: 'var(--ds-section-bar)', borderBottom: '1px solid var(--ds-border)',
  }}>
    <span style={{ fontWeight: 600, color: 'var(--ds-text-primary)' }}>Бухгалтерия предприятия</span>
    <div style={row}>
      <span style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-secondary)' }}>Смирнова А. И.</span>
      <Avatar name="Смирнова Анна" size="sm" />
    </div>
  </div>
)

/**
 * Присутствие: кольцо вокруг аватара. Состояние попадает и в доступное имя, а не
 * только в цвет. «Не в сети» — нейтральное кольцо, а не его отсутствие.
 */
export const Presence = () => (
  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
    <Avatar name="Пётр Иванов" presence="online" />
    <Avatar name="Анна Смирнова" presence="busy" />
    <Avatar name="Сергей Ким" presence="away" />
    <Avatar name="Ольга Петрова" presence="offline" />
  </div>
)
