import { FormRow, TextField } from '@santarinto/jig'
export const Default = () => (
  <div style={{ width: 420 }}>
    <FormRow label="Наименование"><TextField defaultValue="ООО «Ромашка»" /></FormRow>
  </div>
)
