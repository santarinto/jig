import { TextField } from '@santarinto/jig'

export const Default = () => (
  <div style={{ width: 260 }}>
    <TextField label="Наименование" defaultValue="ООО «Ромашка»" />
  </div>
)

export const WithHint = () => (
  <div style={{ width: 260 }}>
    <TextField label="Код" placeholder="000000001" hint="До 9 символов" />
  </div>
)

export const WithError = () => (
  <div style={{ width: 260 }}>
    <TextField label="ИНН" defaultValue="77" error="Обязательное поле" />
  </div>
)
