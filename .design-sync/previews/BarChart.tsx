import { BarChart, type BarSeries } from '@santarinto/jig'

const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн']

const money: BarSeries[] = [
  { id: 'in', label: 'Поступления', values: [820, 940, 760, 1120, 1040, 1240] },
  { id: 'out', label: 'Списания', values: [610, 700, 690, 780, 720, 860] },
]

// Отклонение от плана: ради знаковых данных у шкалы две границы и нулевая линия.
const deviation: BarSeries[] = [
  { id: 'plan', label: 'Отклонение от плана', values: [120, -80, 45, -160, 70, -30] },
]

// Чарт замеряет свой контейнер и рисует 1:1 к его пикселям, поэтому карточка
// показывает его на всю доступную ширину — как он и будет жить на дашборде.
const Frame = ({ children }: { children: React.ReactNode }) => (
  <div>{children}</div>
)

export const Grouped = () => (
  <Frame>
    <BarChart categories={MONTHS} series={money} ariaLabel="Движение средств по месяцам" />
  </Frame>
)

export const Stacked = () => (
  <Frame>
    <BarChart
      categories={MONTHS}
      series={money}
      mode="stacked"
      ariaLabel="Движение средств, накопительно"
    />
  </Frame>
)

export const Horizontal = () => (
  <Frame>
    <BarChart
      categories={MONTHS}
      series={[money[0]!]}
      orientation="horizontal"
      ariaLabel="Поступления по месяцам"
    />
  </Frame>
)

export const Signed = () => (
  <Frame>
    <BarChart
      categories={MONTHS}
      series={deviation}
      format={(n) => `${n > 0 ? '+' : ''}${n.toLocaleString('ru-RU')}`}
      ariaLabel="Отклонение от плана по месяцам"
    />
  </Frame>
)

export const Bare = () => (
  <Frame>
    <BarChart
      categories={MONTHS}
      series={[money[0]!]}
      axis={false}
      grid={false}
      valueLabels={false}
      height={90}
      ariaLabel="Поступления, компактно"
    />
  </Frame>
)

// Поднабор, который обязан сохранить цвета полного графика: `paletteSlot` на
// серии закрепляет её цвет. Без него «Возвраты», оказавшись первой серией,
// приехала бы цветом «Поступлений» с соседнего графика.
const flows: BarSeries[] = [
  { id: 'in', label: 'Поступления', values: [820, 940, 760, 1120, 1040, 1240], paletteSlot: 1 },
  { id: 'out', label: 'Списания', values: [610, 700, 690, 780, 720, 860], paletteSlot: 2 },
  { id: 'refund', label: 'Возвраты', values: [40, 65, 30, 90, 55, 70], paletteSlot: 3 },
]

export const PinnedSubset = () => (
  <Frame>
    <BarChart categories={MONTHS} series={flows} ariaLabel="Движение средств, все статьи" />
    <BarChart
      categories={MONTHS}
      series={flows.filter((s) => s.id !== 'in')}
      ariaLabel="Списания и возвраты"
    />
  </Frame>
)
