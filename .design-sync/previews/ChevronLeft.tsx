import { ChevronLeft, Icon, Button } from '@santarinto/jig'

// Шеврон назад: предыдущая страница, месяц, неделя.
//
// Системный глиф: его рисует компонент системы, и потребитель берёт этот же,
// а не копию из своей библиотеки. Размер и толщину штриха задаёт `<Icon>`
// (от `--ds-size-icon` и `--ds-ui-scale`), цвет — `currentColor` места.

/** В обёртке `<Icon>`: размер от шкалы, цвет — текущий цвет текста. */
export const Default = () => (
  <div style={{ display: 'flex', gap: 20, alignItems: 'center', fontSize: 'var(--ds-fs-md)' }}>
    <Icon><ChevronLeft /></Icon>
    <Icon style={{ color: 'var(--ds-text-secondary)' }}><ChevronLeft /></Icon>
    <Icon style={{ color: 'var(--ds-accent)' }}><ChevronLeft /></Icon>
  </div>
)

/** В кнопке — так, как его ставят компоненты системы. */
export const InButton = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <Button variant="secondary">Назад <Icon><ChevronLeft /></Icon></Button>
    <Button variant="ghost" iconOnly aria-label="Предыдущий месяц"><Icon><ChevronLeft /></Icon></Button>
  </div>
)
