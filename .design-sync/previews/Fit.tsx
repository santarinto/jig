import { Fit, Card } from '@santarinto/jig'

/** Область фикс-размера: без неё «на всю площадь» не с чем сравнить. */
const Stage = ({ children, height = 120 }: { children: React.ReactNode; height?: number }) => (
  <div style={{
    width: 340, height,
    border: '1px dashed var(--ds-border-strong)', borderRadius: 'var(--ds-radius-sm)',
  }}>{children}</div>
)

export const Stretched = () => (
  <Stage>
    <Fit>
      <div style={{
        display: 'grid', placeItems: 'center', background: 'var(--ds-accent-subtle)',
        borderRadius: 'var(--ds-radius-sm)', fontSize: 'var(--ds-fs-sm)',
      }}>
        контент на всю площадь контейнера
      </div>
    </Fit>
  </Stage>
)

/** Типичное применение: тело карточки отдаётся холсту или карте целиком. */
export const InCard = () => (
  <div style={{ width: 340 }}>
    <Card title="Загрузка склада" noPadding>
      <div style={{ height: 140 }}>
        <Fit>
          <div style={{
            display: 'grid', placeItems: 'center',
            background: 'var(--ds-surface-subtle)', fontSize: 'var(--ds-fs-sm)',
            color: 'var(--ds-text-secondary)',
          }}>
            холст занимает тело карточки без остатка
          </div>
        </Fit>
      </div>
    </Card>
  </div>
)
