import { AppBar, Badge } from '@santarinto/jig'
export const Default = () => (
  <div style={{ width: 760 }}>
    <AppBar brand="Курьер 7" trailing={<Badge tone="accent">ИП</Badge>}>
      <input className="ds-input ds-input--sm" placeholder="Поиск везде (Ctrl+Shift+F)" style={{ width: 320 }} />
    </AppBar>
  </div>
)
