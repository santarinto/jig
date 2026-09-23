import { EmptyState } from '@santarinto/jig'

export const Empty = () => (
  <div style={{ width: 360, border: '1px solid var(--ds-border)', borderRadius: 3, background: 'var(--ds-surface)' }}>
    <EmptyState
      title="Пока нет заметок"
      description="Создайте первую заметку — она появится в этом списке."
      action={<button className="ds-btn ds-btn--primary">Создать заметку</button>}
    />
  </div>
)

export const NoResults = () => (
  <div style={{ width: 360, border: '1px solid var(--ds-border)', borderRadius: 3, background: 'var(--ds-surface)' }}>
    <EmptyState
      icon={<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>}
      title="Ничего не найдено"
      description="Попробуйте изменить условия поиска или сбросить фильтры."
    />
  </div>
)
