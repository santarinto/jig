import { Stack, Badge, Button } from '@santarinto/jig'

/** Видимая ячейка — чтобы читалась сама раскладка, а не содержимое. */
const Cell = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    padding: '8px 12px', background: 'var(--ds-surface-subtle)',
    border: '1px solid var(--ds-border)', borderRadius: 'var(--ds-radius-sm)',
    fontSize: 'var(--ds-fs-sm)', whiteSpace: 'nowrap',
  }}>{children}</div>
)

export const Row = () => (
  <Stack direction="row" gap={3}>
    <Cell>Раз</Cell><Cell>Два</Cell><Cell>Три</Cell>
  </Stack>
)

export const Column = () => (
  <Stack gap={2}>
    <Cell>Первый</Cell><Cell>Второй</Cell><Cell>Третий</Cell>
  </Stack>
)

/** Шапка списка: заголовок слева, действия справа — самый частый случай `row`. */
export const JustifyBetween = () => (
  <Stack direction="row" justify="between" align="center">
    <Stack direction="row" gap={3} align="center">
      <strong style={{ fontSize: 'var(--ds-fs-base)' }}>Реализация №РТ-0001</strong>
      <Badge tone="warning">Не проведён</Badge>
    </Stack>
    <Stack direction="row" gap={2}>
      <Button variant="ghost" size="sm">Печать</Button>
      <Button size="sm">Провести</Button>
    </Stack>
  </Stack>
)

/** `align="center"` выравнивает разновысокие дети по общей оси. */
export const AlignCenter = () => (
  <Stack direction="row" gap={4} align="center">
    <Cell>маленький</Cell>
    <div style={{
      padding: '20px 12px', background: 'var(--ds-accent-subtle)',
      borderRadius: 'var(--ds-radius-sm)', fontSize: 'var(--ds-fs-sm)',
    }}>высокий</div>
    <Cell>маленький</Cell>
  </Stack>
)

export const Wrap = () => (
  <Stack direction="row" gap={2} wrap>
    {['Договоры', 'Счета', 'Акты', 'Накладные', 'Отчёты', 'Заявки', 'Оплаты', 'Возвраты', 'Списания']
      .map((t) => <Cell key={t}>{t}</Cell>)}
  </Stack>
)
