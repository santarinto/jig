import { CommandBar, type CommandAction } from '@santarinto/jig'

const actions: CommandAction[] = [
  { id: 'create', label: 'Создать', variant: 'primary', group: 'edit' },
  { id: 'copy', label: 'Скопировать', group: 'edit' },
  { id: 'refresh', label: 'Обновить', group: 'view' },
  { id: 'print', label: 'Печать', group: 'view' },
]

export const Toolbar = () => (
  <div style={{ width: 560 }}>
    <CommandBar aria-label="Команды" actions={actions} />
  </div>
)
