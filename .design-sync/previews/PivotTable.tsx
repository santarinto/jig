import { PivotTable, pivotId } from '@santarinto/jig'
import type { PivotDimension, PivotMeasure } from '@santarinto/jig'

// Сводный отчёт по поездкам: парки × дни недели. Данные — строки выгрузки
// как есть; сводит их компонент, а итоги и подытоги считаются по ИСХОДНЫМ
// строкам, не сложением показанного (для среднего это разные числа).

interface Ride { park: string; driver: string; day: string; service: string; fare: number }

const DAYS = ['пн', 'вт', 'ср', 'чт', 'пт']

const RIDES: Ride[] = [
  { park: 'Северный', driver: 'Иванов И. И.', day: 'пн', service: 'Эконом', fare: 480 },
  { park: 'Северный', driver: 'Иванов И. И.', day: 'вт', service: 'Эконом', fare: 520 },
  { park: 'Северный', driver: 'Иванов И. И.', day: 'ср', service: 'Комфорт', fare: 1100 },
  { park: 'Северный', driver: 'Петров П. П.', day: 'пн', service: 'Комфорт', fare: 2400 },
  { park: 'Северный', driver: 'Петров П. П.', day: 'чт', service: 'Эконом', fare: 610 },
  { park: 'Южный', driver: 'Сидоров С. С.', day: 'вт', service: 'Эконом', fare: 390 },
  { park: 'Южный', driver: 'Сидоров С. С.', day: 'ср', service: 'Эконом', fare: 450 },
  { park: 'Южный', driver: 'Кузнецов К. К.', day: 'пт', service: 'Бизнес', fare: 3200 },
  { park: 'Южный', driver: 'Кузнецов К. К.', day: 'пт', service: 'Комфорт', fare: 1450 },
  { park: 'Западный', driver: 'Смирнов А. А.', day: 'чт', service: 'Эконом', fare: 505 },
]

const park: PivotDimension<Ride> = { id: 'park', label: 'Парк', value: (r) => r.park }
const driver: PivotDimension<Ride> = { id: 'driver', label: 'Водитель', value: (r) => r.driver }
// Порядок недели не выводится ни алфавитом, ни данными — отсюда `sort`.
const day: PivotDimension<Ride> = {
  id: 'day', label: 'День', value: (r) => r.day,
  sort: (a, b) => DAYS.indexOf(a) - DAYS.indexOf(b),
}
const service: PivotDimension<Ride> = { id: 'service', label: 'Тариф', value: (r) => r.service }

const money = (v: number) => v.toLocaleString('ru-RU', { minimumFractionDigits: 2 })
const avgFare: PivotMeasure<Ride> = { id: 'avg', label: 'Средний чек', agg: 'avg', value: (r) => r.fare, format: money }
const sumFare: PivotMeasure<Ride> = { id: 'sum', label: 'Сумма', agg: 'sum', value: (r) => r.fare, format: money }
const trips: PivotMeasure<Ride> = { id: 'trips', label: 'Поездок', agg: 'count' }

/** Парки по дням недели, с итоговой строкой и колонкой. */
export const Default = () => (
  <PivotTable
    aria-label="Средний чек по паркам и дням"
    rows={RIDES} rowDimensions={[park]} columnDimensions={[day]}
    measures={[avgFare]} grandTotalRow grandTotalColumn
  />
)

/** Две оси строк: парк сворачивается в строку со своими числами, а не исчезает. */
export const Grouped = () => (
  <PivotTable
    aria-label="Средний чек по паркам и водителям"
    rows={RIDES} rowDimensions={[park, driver]} columnDimensions={[day]}
    measures={[avgFare]} grandTotalRow grandTotalColumn
    defaultCollapsedRows={[pivotId(['Южный'])]}
  />
)

/** День режется на тарифы; две меры рядом. Пустое пересечение — прочерк, не ноль. */
export const NestedColumns = () => (
  <PivotTable
    aria-label="Выручка по дням и тарифам"
    rows={RIDES} rowDimensions={[park]} columnDimensions={[day, service]}
    measures={[sumFare, trips]} dense grandTotalRow
  />
)

/** Строк нет: тело заменяет подсказка, шапка остаётся и называет измерения. */
export const Empty = () => (
  <PivotTable
    aria-label="Средний чек по паркам и дням"
    rows={[]} rowDimensions={[park]} columnDimensions={[day]}
    measures={[avgFare]}
  />
)
