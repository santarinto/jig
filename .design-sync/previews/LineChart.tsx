import { LineChart, type ChartSeries } from '@santarinto/jig'

const weight: ChartSeries[] = [{
  id: 'w', label: 'Вес',
  points: [72.9, 72.6, 72.3, 72.1, 71.8, 71.6, 71.4, 71.2, 71.0].map((y, i) => ({ x: `${i + 1}.07`, y })),
}]

const money: ChartSeries[] = [
  { id: 'in', label: 'Доход', points: [120, 132, 128, 145, 150, 162].map((y, i) => ({ x: ['Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл'][i], y })) },
  { id: 'out', label: 'Расход', points: [98, 110, 102, 118, 121, 130].map((y, i) => ({ x: ['Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл'][i], y })) },
]

// Ширину задаёт контейнер: полный чарт занимает её целиком, а высота остаётся
// своей (1.6.4). Обёртка фиксированной ширины здесь была бы ровно тем костылём,
// от которого этот релиз избавил потребителя, — и дизайн-агент скопировал бы её.
export const Single = () => <LineChart series={weight} yUnit="кг" />

export const MultiSeries = () => <LineChart series={money} yUnit="т₽" />

export const Area = () => <LineChart series={weight} yUnit="кг" fill="area" />

// Тот же чарт в узкой колонке: подписи оси X прореживаются под ширину.
export const Narrow = () => (
  <div style={{ width: 320 }}>
    <LineChart series={money} yUnit="т₽" />
  </div>
)

const trend = {
  id: 'balance', label: 'Остаток',
  points: [12, 15, 13, 18, 17, 21, 24, 22, 27].map((y, i) => ({ x: `Н${i + 1}`, y })),
}

export const Sparkline = () => (
  <div style={{
    width: 260, padding: 'var(--ds-space-5)',
    background: 'var(--ds-surface)', border: '1px solid var(--ds-border)',
    borderRadius: 'var(--ds-radius)',
  }}>
    <div style={{ fontSize: 'var(--ds-fs-xs)', color: 'var(--ds-text-muted)' }}>Остаток на счетах</div>
    <div style={{ fontSize: 'var(--ds-fs-xl)', fontWeight: 700, color: 'var(--ds-text-primary)' }}>
      1 240 500 ₽
    </div>
    <LineChart series={[trend]} variant="spark" lastPoint />
  </div>
)
