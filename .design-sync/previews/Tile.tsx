import { Tile } from '@santarinto/jig'
// Без `onClick` плитка — показатель (`<div>`, рамка `--ds-border`, без пальца);
// с `onClick` — кнопка (рамка `--ds-control-border`, подсветка на наведении).
// Отдельного пропа кликабельности нет: форму выбирает обработчик.
export const Tones = () => (
  <div style={{ display: 'flex', gap: 12 }}>
    <Tile title="Продажи за день" value="128 400" tone="accent" icon="₽" />
    <Tile title="Заказов" value="17" icon="📄" />
  </div>
)
export const Forms = () => (
  <div style={{ display: 'flex', gap: 12 }}>
    <Tile title="Заказов за смену" value="184" icon="📄" />
    <Tile title="Документов в очереди" value="9" icon="📄" onClick={() => {}} />
  </div>
)
