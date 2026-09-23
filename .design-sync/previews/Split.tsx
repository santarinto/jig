import { Split } from '@santarinto/jig'

/** Пейн с заливкой — чтобы границы областей читались на карточке. */
const Pane = ({ children, tone = 'subtle' }: { children: React.ReactNode; tone?: 'subtle' | 'accent' }) => (
  <div style={{
    boxSizing: 'border-box', height: '100%', display: 'grid', placeItems: 'center', padding: 8,
    background: tone === 'accent' ? 'var(--ds-accent-subtle)' : 'var(--ds-surface-subtle)',
    fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-secondary)', textAlign: 'center',
  }}>{children}</div>
)

/** Рамка с высотой обязательна: пейны тянутся по контейнеру, своей высоты у них нет. */
const Frame = ({ children, height = 180 }: { children: React.ReactNode; height?: number }) => (
  <div style={{
    width: '100%', height, overflow: 'hidden',
    border: '1px solid var(--ds-border)', borderRadius: 'var(--ds-radius-sm)',
  }}>{children}</div>
)

export const Horizontal = () => (
  <Frame>
    <Split defaultSize={180} min={100} style={{ height: '100%' }} aria-label="Ширина левой панели">
      <Pane tone="accent">Список документов</Pane>
      <Pane>Содержимое выбранного</Pane>
    </Split>
  </Frame>
)

export const Vertical = () => (
  <Frame height={220}>
    <Split direction="column" defaultSize={90} min={48} style={{ height: '100%' }} aria-label="Высота верхней панели">
      <Pane tone="accent">Реквизиты</Pane>
      <Pane>Табличная часть</Pane>
    </Split>
  </Frame>
)

/** Рабочее место целиком: сайдбар + шапка над содержимым. */
export const Nested = () => (
  <Frame height={240}>
    <Split defaultSize={140} min={80} style={{ height: '100%' }} aria-label="Ширина сайдбара">
      <Pane tone="accent">Сайдбар</Pane>
      <Split direction="column" defaultSize={60} min={40} style={{ height: '100%' }} aria-label="Высота шапки">
        <Pane>Шапка</Pane>
        <Pane>Контент</Pane>
      </Split>
    </Split>
  </Frame>
)

/** `collapsible` — двойной клик по разделителю сворачивает первый пейн. */
export const Collapsible = () => (
  <Frame>
    <Split defaultSize={180} min={100} collapsible style={{ height: '100%' }} aria-label="Ширина панели (двойной клик — свернуть)">
      <Pane tone="accent">Двойной клик по разделителю →</Pane>
      <Pane>свернёт левую панель</Pane>
    </Split>
  </Frame>
)
