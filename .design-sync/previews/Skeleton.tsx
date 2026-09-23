import { Skeleton } from '@santarinto/jig'

export const TextLines = () => (
  <div style={{ width: 260 }}>
    <Skeleton variant="text" lines={3} />
  </div>
)

export const Card = () => (
  <div style={{ width: 260, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
    <Skeleton variant="circle" width={40} height={40} />
    <div style={{ flex: 1, display: 'grid', gap: 10 }}>
      <Skeleton variant="text" lines={2} />
      <Skeleton variant="rect" height={56} />
    </div>
  </div>
)

export const Retro = () => (
  <div style={{ width: 260 }}>
    <Skeleton variant="rect" height={20} anim="retro" />
  </div>
)
