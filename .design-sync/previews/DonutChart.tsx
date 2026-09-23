import { DonutChart, type DonutSlice } from '@santarinto/jig'

const spend: DonutSlice[] = [
  { id: 'goods', label: 'Товары', value: 1240 },
  { id: 'services', label: 'Услуги', value: 860 },
  { id: 'salary', label: 'Зарплата', value: 980 },
  { id: 'rent', label: 'Аренда', value: 420 },
  { id: 'other', label: 'Прочее', value: 260 },
]

const traffic: DonutSlice[] = [
  { id: 'direct', label: 'Прямые заходы', value: 4210 },
  { id: 'search', label: 'Поиск', value: 3180 },
  { id: 'refer', label: 'Переходы', value: 1120 },
]

export const Breakdown = () => (
  <DonutChart data={spend} ariaLabel="Структура расходов" />
)

export const Percent = () => (
  <DonutChart data={traffic} legendValue="percent" centerLabel="Визитов" ariaLabel="Источники трафика" />
)

export const LegendBelow = () => (
  <div style={{ width: 300 }}>
    <DonutChart data={traffic} legend="bottom" ariaLabel="Источники трафика" />
  </div>
)

export const Compact = () => (
  <DonutChart
    data={traffic}
    size={120}
    thickness={0.28}
    center="sum"
    legend="none"
    ariaLabel="Источники трафика, компактно"
  />
)

export const InsideCard = () => (
  <div style={{
    width: 360, padding: 'var(--ds-space-5)',
    background: 'var(--ds-surface)', border: '1px solid var(--ds-border)',
    borderRadius: 'var(--ds-radius)',
  }}>
    <div style={{ fontSize: 'var(--ds-fs-xs)', color: 'var(--ds-text-muted)', marginBottom: 'var(--ds-space-3)' }}>
      Расходы за июль
    </div>
    <DonutChart data={spend} thickness={0.5} ariaLabel="Расходы за июль" />
  </div>
)

// Доля держит свой цвет, когда соседние отфильтрованы: `paletteSlot` живёт на
// доле и уезжает через фильтр вместе с ней. Без него «Аренда» на втором кольце
// стала бы цветом «Товаров».
const spendPinned: DonutSlice[] = [
  { id: 'goods', label: 'Товары', value: 1240, paletteSlot: 1 },
  { id: 'services', label: 'Услуги', value: 860, paletteSlot: 2 },
  { id: 'salary', label: 'Зарплата', value: 980, paletteSlot: 3 },
  { id: 'rent', label: 'Аренда', value: 420, paletteSlot: 4 },
  { id: 'other', label: 'Прочее', value: 260, paletteSlot: 5 },
]

export const PinnedSubset = () => (
  <div style={{ display: 'flex', gap: 'var(--ds-space-6)', flexWrap: 'wrap' }}>
    <DonutChart data={spendPinned} legend="bottom" ariaLabel="Расходы, все статьи" />
    <DonutChart
      data={spendPinned.filter((d) => d.id === 'rent' || d.id === 'other')}
      legend="bottom"
      ariaLabel="Аренда и прочее"
    />
  </div>
)
