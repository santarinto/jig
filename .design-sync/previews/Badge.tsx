import { Badge } from '@santarinto/jig'
export const Tones = () => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
    <Badge tone="success" dot>Проведён</Badge>
    <Badge tone="neutral">Черновик</Badge>
    <Badge tone="warning">Ожидает</Badge>
    <Badge tone="error">Ошибка</Badge>
    <Badge tone="info">Новый</Badge>
    <Badge tone="accent">12</Badge>
  </div>
)
