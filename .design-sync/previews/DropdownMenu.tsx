import { Button, DropdownMenu, type DropdownItem } from '@santarinto/jig'

const items: DropdownItem[] = [
  { id: 'open', label: 'Открыть', onSelect: () => {} },
  { id: 'edit', label: 'Редактировать', onSelect: () => {} },
  { id: 'duplicate', label: 'Дублировать', onSelect: () => {} },
  { separator: true },
  { id: 'delete', label: 'Удалить', tone: 'error', onSelect: () => {} },
]

export const Open = () => (
  <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 160 }}>
    <DropdownMenu items={items} defaultOpen />
  </div>
)

export const RowActions = () => (
  <div style={{ display: 'flex', justifyContent: 'flex-end', width: 220 }}>
    <DropdownMenu items={items} />
  </div>
)

// Триггер — НАСТОЯЩАЯ кнопка. `<span className="ds-btn …">` здесь стоял до
// DS-359 и был обходом: компонент оборачивал переданное в свою кнопку, и
// настоящая дала бы кнопку в кнопке. Теперь такой вызов БРОСАЕТ.
export const CustomTrigger = () => (
  <DropdownMenu items={items} trigger={<Button variant="secondary">Действия ▾</Button>} />
)
