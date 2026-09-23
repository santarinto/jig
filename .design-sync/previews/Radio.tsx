import { Radio } from '@santarinto/jig'
export const Group = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <Radio name="pay" label="Наличные" defaultChecked />
    <Radio name="pay" label="Карта" />
    <Radio name="pay" label="Безналичный" />
  </div>
)
