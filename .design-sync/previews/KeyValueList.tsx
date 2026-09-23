import { KeyValueList, Badge } from '@santarinto/jig'

const items = [
  { id: 'org', label: 'Организация', value: 'ООО «Ромашка»' },
  { id: 'contract', label: 'Договор', value: '№ 14-П от 12.03.2026' },
  { id: 'sum', label: 'Сумма', value: '1 240 500,00 ₽' },
  { id: 'status', label: 'Статус', value: <Badge tone="warning">Не проведён</Badge> },
]

export const Default = () => <div style={{ width: 340 }}><KeyValueList items={items} /></div>
export const WithDividers = () => <div style={{ width: 340 }}><KeyValueList items={items} dividers /></div>
export const TwoColumns = () => <div style={{ width: 620 }}><KeyValueList items={items} columns={2} dividers /></div>
