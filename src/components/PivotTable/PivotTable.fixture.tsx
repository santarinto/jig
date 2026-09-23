/**
 * Сводная таблица. `kind: 'block'`.
 *
 * Главный случай — «итог не равен сумме показанного». Он существует потому, что
 * дефект этого класса ВЫГЛЯДИТ правильным: числа стоят, разряды сходятся, и
 * только арифметика говорит, что итог посчитан не по тем строкам. На `sum` его
 * не видно вовсе — сумма сумм равна сумме, — поэтому случай стоит на среднем
 * чеке, и рядом с ним написано, какое число обязано получиться.
 *
 * Второй случай, который живёт только парой, — «пусто против нуля». Пустое
 * пересечение и ноль порознь выглядят одинаково правдоподобно; отличает их
 * только соседняя ячейка, где ноль настоящий.
 */
import { useState } from 'react'
import { defineFixture } from '../../internal/fixture.js'
import { PivotTable, pivotId, type PivotDimension, type PivotMeasure } from './PivotTable.js'

interface Ride {
  park: string
  driver: string
  day: string
  service: string
  fare: number
}

const DAYS = ['пн', 'вт', 'ср', 'чт', 'пт']

/**
 * Смена «Северного» в понедельник намеренно дороже прочих: без разброса внутри
 * группы среднее по группе совпадает со средним её ячеек, и случай про итог
 * перестаёт что-либо различать.
 */
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

/** Разрежённый набор: у большинства пересечений строк нет вовсе. */
const SPARSE: Ride[] = [
  { park: 'Северный', driver: 'Иванов И. И.', day: 'пн', service: 'Эконом', fare: 480 },
  { park: 'Южный', driver: 'Кузнецов К. К.', day: 'пт', service: 'Бизнес', fare: 3200 },
  { park: 'Западный', driver: 'Смирнов А. А.', day: 'ср', service: 'Комфорт', fare: 990 },
]

/** Стресс: пять дней × три тарифа = пятнадцать колонок значений. */
const WIDE: Ride[] = DAYS.flatMap((day, d) =>
  ['Эконом', 'Комфорт', 'Бизнес'].map((service, s) => ({
    park: d % 2 === 0 ? 'Северный' : 'Южный',
    driver: `Водитель ${d}-${s}`,
    day,
    service,
    fare: 400 + d * 130 + s * 700,
  })),
)

const park: PivotDimension<Ride> = { id: 'park', label: 'Парк', value: (r) => r.park }
const driver: PivotDimension<Ride> = { id: 'driver', label: 'Водитель', value: (r) => r.driver }
const day: PivotDimension<Ride> = {
  id: 'day',
  label: 'День',
  value: (r) => r.day,
  // Порядок недели из ключа не выводится ни алфавитом, ни данными — ровно тот
  // случай, ради которого `sort` принимает функцию.
  sort: (a, b) => DAYS.indexOf(a) - DAYS.indexOf(b),
}
const service: PivotDimension<Ride> = { id: 'service', label: 'Тариф', value: (r) => r.service }

const money = (v: number) => v.toLocaleString('ru-RU', { minimumFractionDigits: 2 })

const avgFare: PivotMeasure<Ride> = {
  id: 'avg', label: 'Средний чек', agg: 'avg', value: (r) => r.fare, format: money,
}
const sumFare: PivotMeasure<Ride> = {
  id: 'sum', label: 'Сумма', agg: 'sum', value: (r) => r.fare, format: money,
}
const trips: PivotMeasure<Ride> = { id: 'trips', label: 'Поездок', agg: 'count' }

interface Props {
  rows: Ride[]
  deep: boolean
  dense: boolean
  grandTotalRow: boolean
  grandTotalColumn: boolean
  maxHeight: number
}

/** Свёртка управляется снаружи — иначе не показать заранее свёрнутый случай. */
function Live({
  rows, deep, dense, grandTotalRow, grandTotalColumn, maxHeight,
  columns = [day], measures = [avgFare], collapsed = [],
}: Props & {
  columns?: PivotDimension<Ride>[]
  measures?: PivotMeasure<Ride>[]
  collapsed?: string[]
}) {
  const [folded, setFolded] = useState<string[]>(collapsed)
  return (
    <PivotTable
      aria-label="Средний чек по паркам и дням"
      rows={rows}
      rowDimensions={deep ? [park, driver] : [park]}
      columnDimensions={columns}
      measures={measures}
      collapsedRows={folded}
      onCollapsedRowsChange={setFolded}
      dense={dense}
      grandTotalRow={grandTotalRow}
      grandTotalColumn={grandTotalColumn}
      maxHeight={maxHeight > 0 ? maxHeight : undefined}
    />
  )
}

export default defineFixture<Props>({
  name: 'PivotTable',
  group: 'Данные',
  kind: 'block',

  props: {
    rows: RIDES, deep: false, dense: false, grandTotalRow: true, grandTotalColumn: true,
    // Ноль — «пропа нет». Крутилка числовая, а `undefined` в ней не выразить;
    // ноль как высота бессмыслен, поэтому годится в роли «не задано».
    maxHeight: 0,
  },

  controls: {
    deep: { kind: 'bool', prop: false },
    dense: { kind: 'bool', prop: true },
    grandTotalRow: { kind: 'bool', prop: true },
    grandTotalColumn: { kind: 'bool', prop: true },
    maxHeight: { kind: 'number', min: 0, max: 800, step: 20, prop: true },
  },

  data: {
    sparse: { rows: SPARSE },
    wide: { rows: WIDE },
    empty: { rows: [] },
  },

  cases: [
    {
      id: 'base',
      title: 'Парки по дням недели',
      note:
        'Дни идут порядком недели, а не алфавитом и не порядком данных: у ' +
        'измерения задана своя функция сравнения. Без неё колонки встали бы в ' +
        'том порядке, в каком значения впервые встретились в выгрузке.',
    },
    {
      id: 'total-arithmetic',
      title: 'Итог — не сумма показанного',
      note:
        'Средний чек «Северного» — 1022,00: это 5110 ₽ за пять поездок. ' +
        'Среднее его четырёх непустых ячеек — 917,50; среднее средних его двух ' +
        'водителей — 1102,50. Три разных числа, и правильное только первое. ' +
        'Поэтому подытог и итог считаются по ИСХОДНЫМ строкам, а не сложением ' +
        'того, что видно. На мере «Сумма» этой разницы нет вовсе — сумма сумм ' +
        'равна сумме, — и дефект такого рода доживает до первого среднего.',
      props: { deep: true },
      render: (p) => <Live {...p} deep measures={[avgFare]} />,
    },
    {
      id: 'blank-vs-zero',
      title: 'Пусто — не ноль',
      note:
        'Мера «Поездок» стоит рядом со «Суммой»: там, где поездок не было, ' +
        'обе ячейки пусты — прочерком, а не нулём. Ноль был бы утверждением ' +
        '(«поездки считали, вышло ноль»), а пересечения без строк в данных ' +
        'просто нет. Прочерк нарисован для глаза и помечен aria-hidden: ' +
        'диктору ячейка остаётся пустой, иначе «тире» прозвучало бы значением.',
      props: { rows: SPARSE },
      render: (p) => <Live {...p} rows={SPARSE} measures={[sumFare, trips]} />,
    },
    {
      id: 'collapsed',
      title: 'Свёрнутая группа',
      note:
        'Свёрнутый парк остаётся строкой со СВОИМИ числами — иначе свёртка ' +
        'выглядела бы удалением данных. Каретка объявлена через aria-expanded ' +
        'на настоящей кнопке: это тот аффорданс, которым сворачивают с ' +
        'клавиатуры.',
      props: { deep: true },
      shows: ['[aria-expanded="false"]'],
      render: (p) => <Live {...p} deep collapsed={[pivotId(['Северный'])]} />,
    },
    {
      id: 'nested-columns',
      title: 'Два измерения в колонках',
      note:
        'День режется на тарифы: заголовок дня объявлен scope="colgroup", ' +
        'тариф — scope="col". Нажатие на день схлопывает его тарифы в одну ' +
        'колонку с итогом группы — подробность уходит, данные остаются.',
      render: (p) => <Live {...p} columns={[day, service]} measures={[sumFare]} />,
    },
    {
      id: 'wide',
      title: 'Широкая: липкая колонка есть, липкой шапки нет',
      note:
        'Пятнадцать колонок значений. Прокрутите вбок: колонка, называющая ' +
        'строку, обязана остаться на месте, иначе числа теряют имя. Сузьте ' +
        'кадр, чтобы появилась прокрутка: при широком кадре случай не ' +
        'показывает ничего. ЦЕНА НАЗВАНА (DS-241): вниз шапка и строка ' +
        'итога НЕ липнут — высоты у обёртки нет, по вертикали листается ' +
        'документ, и `sticky` внутри едет вместе с ним (замер: прокрутка ' +
        'документа на 400 уводит шапку на top −399). Лечится на стороне ' +
        'потребителя одной строкой — `.my-report .ds-pivot { max-height: ' +
        '60vh }`; система высоту не задаёт, чтобы не решать за чужую ' +
        'страницу, сколько места занимает отчёт. С DS-266 та же высота ' +
        'задаётся пропом `maxHeight` — см. соседний случай «Высота задана».',
      props: { rows: WIDE },
      render: (p) => <Live {...p} rows={WIDE} columns={[day, service]} measures={[sumFare]} />,
    },
    {
      id: 'tall',
      title: 'Высота задана: шапка липнет, а не уезжает',
      note:
        'ТОТ ЖЕ НАБОР, ЧТО В «Много колонок», НО ГЛУБОКИЙ: 18 строк, 642px. ' +
        'Здесь виден смысл `maxHeight` — и цена его отсутствия.\n\n' +
        'Поставьте крутилку `maxHeight` в 0 и прокрутите СТРАНИЦУ (не таблицу): ' +
        'шапка уедет вместе с документом, а колонка имени останется примёрзшей. ' +
        'Замерено: на окне 1440×600 шапка уходит целиком, и в этот момент на ' +
        'экране остаются ВСЕ 18 строк — то есть строки кончаются гораздо позже ' +
        'шапки, и остаётся сетка чисел без единого заголовка колонки. Порог по ' +
        'высоте окна около 607px; на 360×640 наступает впритык.\n\n' +
        'Взять и то и другое НЕЛЬЗЯ, и это свойство CSS, а не недоделка: ' +
        '`overflow-x: auto` нужен, чтобы примерзала колонка имени, а он по ' +
        'спецификации превращает `overflow-y: visible` в `auto`. Значит ' +
        '«липкая шапка к странице» и «примёрзшая колонка внутри» взаимно ' +
        'исключены, и выбор между ними делает высота обёртки.\n\n' +
        'Умолчания у пропа нет намеренно: сколько места занимает отчёт на ' +
        'чужой странице, система не знает. Проп заведён не вместо строчки в ' +
        'листе стилей, а потому что про неё не узнают — отказ молчалив.',
      props: { rows: WIDE, deep: true, maxHeight: 360 },
      render: (p) => <Live {...p} rows={WIDE} deep columns={[day, service]} measures={[sumFare]} />,
    },
    {
      id: 'no-columns',
      title: 'Без измерений колонок',
      note:
        'Вырожденный случай: остаётся группировка с подытогами. Колонки ' +
        'общего итога здесь НЕТ и быть не может — единственная колонка ' +
        'значений и есть итог, вторая повторила бы её слово в слово.',
      render: (p) => <Live {...p} deep columns={[]} measures={[sumFare, trips]} />,
    },
    {
      id: 'empty',
      title: 'Сводить нечего',
      note:
        'Строк нет — тело заменяется подсказкой, а шапка остаётся: она ' +
        'называет измерения, по которым отчёт построен, и без неё пустой ' +
        'экран не объясняет, что именно оказалось пустым.',
      props: { rows: [] },
      render: (p) => <Live {...p} rows={[]} />,
    },
  ],

  render: (p) => <Live {...p} />,
})
