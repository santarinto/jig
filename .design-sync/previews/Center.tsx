import { Center, Card, EmptyState, Button } from '@santarinto/jig'

const Stage = ({ children, height = 120 }: { children: React.ReactNode; height?: number }) => (
  <div style={{
    width: 340, height,
    border: '1px dashed var(--ds-border-strong)', borderRadius: 'var(--ds-radius-sm)',
  }}>{children}</div>
)

export const BothAxes = () => (
  <Stage>
    <Center>
      <div style={{
        padding: '8px 12px', background: 'var(--ds-surface-subtle)',
        border: '1px solid var(--ds-border)', borderRadius: 'var(--ds-radius-sm)',
        fontSize: 'var(--ds-fs-sm)',
      }}>по центру обеих осей</div>
    </Center>
  </Stage>
)

/** Ради чего обычно и берут: пустое состояние по центру области списка. */
export const EmptyList = () => (
  <div style={{ width: 340 }}>
    <Card title="Заявки" noPadding>
      <div style={{ height: 180 }}>
        <Center>
          <EmptyState
            title="Заявок нет"
            description="За выбранный период ничего не найдено."
            action={<Button size="sm">Создать заявку</Button>}
          />
        </Center>
      </div>
    </Card>
  </div>
)
