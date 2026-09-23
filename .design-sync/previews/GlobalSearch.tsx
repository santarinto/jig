import { GlobalSearch } from '@santarinto/jig'
export const WithResults = () => (
  <div style={{ height: 220 }}>
    <GlobalSearch value="реал" onChange={() => {}} results={[
      { id: 'r1', label: 'Реализация №РТ-0001 от 24.07', group: 'Данные' },
      { id: 'r2', label: 'Реализация товаров и услуг', group: 'Меню' },
      { id: 'r3', label: 'Реализация (создать)', group: 'Избранное' },
    ]} onSelect={() => {}} />
  </div>
)
