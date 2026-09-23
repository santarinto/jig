import { Dots, Icon, Button } from '@santarinto/jig'

// Многоточие переполнения: меню действий, которые не влезли в строку.
//
// Системный глиф: его рисует компонент системы, и потребитель берёт этот же,
// а не копию из своей библиотеки. Размер и толщину штриха задаёт `<Icon>`
// (от `--ds-size-icon` и `--ds-ui-scale`), цвет — `currentColor` места.

/** В обёртке `<Icon>`: размер от шкалы, цвет — текущий цвет текста. */
export const Default = () => (
  <div style={{ display: 'flex', gap: 20, alignItems: 'center', fontSize: 'var(--ds-fs-md)' }}>
    <Icon><Dots /></Icon>
    <Icon style={{ color: 'var(--ds-text-secondary)' }}><Dots /></Icon>
    <Icon style={{ color: 'var(--ds-accent)' }}><Dots /></Icon>
  </div>
)

/** В кнопке — так, как его ставят компоненты системы. */
export const InButton = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <Button variant="secondary">Действия <Icon><Dots /></Icon></Button>
    <Button variant="ghost" iconOnly aria-label="Ещё действия"><Icon><Dots /></Icon></Button>
  </div>
)
