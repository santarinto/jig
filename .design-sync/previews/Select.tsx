import { Select } from '@santarinto/jig'
const cur = [{ value: 'rub', label: 'Рубль' }, { value: 'usd', label: 'Доллар США' }, { value: 'eur', label: 'Евро' }]
export const Default = () => <div style={{ width: 240 }}><Select label="Валюта" options={cur} defaultValue="rub" /></div>
export const Small = () => <div style={{ width: 240 }}><Select label="Организация" size="sm" options={[{ value: 'a', label: 'ООО «Ромашка»' }, { value: 'b', label: 'ИП Иванов' }]} /></div>
