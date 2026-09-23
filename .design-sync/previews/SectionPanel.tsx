import { SectionPanel } from '@santarinto/jig'
const s = [{ id: 'sales', label: 'Продажи' }, { id: 'buy', label: 'Закупки' }, { id: 'stock', label: 'Склад' }, { id: 'bank', label: 'Банк и касса', disabled: true }, { id: 'reports', label: 'Отчёты' }]
export const Vertical = () => <div style={{ height: 220 }}><SectionPanel sections={s} selectedId="sales" onSelect={() => {}} /></div>
