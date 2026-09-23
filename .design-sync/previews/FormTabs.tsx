import { FormTabs } from '@santarinto/jig'
export const Tabs = () => (
  <FormTabs
    tabs={[{ id: 't1', label: 'Начальная страница' }, { id: 't2', label: 'Реализация №РТ-0001' }, { id: 't3', label: 'Контрагент «Ромашка»', disabled: true }]}
    selectedId="t2" onSelect={() => {}} onClose={() => {}}
  />
)
