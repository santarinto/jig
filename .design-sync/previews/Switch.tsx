import { Switch } from '@santarinto/jig'
export const States = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <Switch label="Активна" defaultChecked />
    <Switch label="Отключена" />
  </div>
)
