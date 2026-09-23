import { Button } from '@santarinto/jig'

export const Variants = () => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
    <Button variant="primary">Провести</Button>
    <Button variant="secondary">Записать</Button>
    <Button variant="ghost">Ещё</Button>
    <Button variant="danger">Удалить</Button>
  </div>
)

export const Sizes = () => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <Button size="sm" variant="secondary">Малая</Button>
    <Button size="md">Обычная</Button>
    <Button size="lg">Крупная</Button>
  </div>
)

export const States = () => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <Button loading>Сохранение…</Button>
    <Button disabled>Недоступно</Button>
  </div>
)

/** Действие, которое запускает: «Старт», «Выкатить». Не «сохранено». */
export const Success = () => <Button variant="success">Старт</Button>

export const IconOnly = () => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <Button size="sm" iconOnly aria-label="Домой">⌂</Button>
    <Button size="md" iconOnly aria-label="Домой">⌂</Button>
    <Button size="lg" iconOnly aria-label="Домой">⌂</Button>
  </div>
)
