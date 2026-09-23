import { Dashboard, Tile } from '@santarinto/jig'
export const StartPage = () => (
  <div style={{ width: 720 }}>
    <Dashboard>
      <Tile title="Продажи за день" value="128 400" tone="accent" icon="₽" />
      <Tile title="Заказов в работе" value="17" icon="📄" />
      <Tile title="Позиций на складе" value="2 431" icon="📦" />
      <Tile title="Контрагентов" value="356" icon="👥" />
    </Dashboard>
  </div>
)
