import { Checkbox } from '@santarinto/jig'
export const States = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <Checkbox label="Проведён" defaultChecked />
    <Checkbox label="Архив" />
    <Checkbox label="Выбрать все" indeterminate />
  </div>
)
