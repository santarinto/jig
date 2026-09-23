import { MetricStrip } from '@santarinto/jig'

const metrics = [
  { id: 'revenue', label: 'Выручка', value: '1 240 500 ₽', hint: 'за июль' },
  { id: 'debt', label: 'Задолженность', value: '86 300 ₽', tone: 'warning' as const },
  { id: 'paid', label: 'Оплачено', value: '94 %', tone: 'success' as const },
  { id: 'docs', label: 'Документов', value: 42 },
]

export const Default = () => <MetricStrip metrics={metrics} />
export const Dense = () => <MetricStrip metrics={metrics} dense />
export const TwoFigures = () => <MetricStrip metrics={metrics.slice(0, 2)} />
