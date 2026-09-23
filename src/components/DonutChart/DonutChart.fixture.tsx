/**
 * Кольцевая диаграмма. `kind: 'block'`.
 *
 * **ЛЕГЕНДА ЗДЕСЬ ДРУГАЯ, И ЭТО РЕШЕНИЕ, А НЕ РАСХОЖДЕНИЕ.** У `LineChart` и
 * `BarChart` легенда — ряд кнопок `aria-pressed`, то есть ФИЛЬТР: скрыл серию,
 * раскладка пересчиталась. Здесь легенда — статический `<ul>`, таблица «цвет,
 * подпись, значение», и переключать в ней нечего.
 *
 * Причина в предмете, а не в реализации. Донат показывает РАЗБОР ЦЕЛОГО:
 * убрать сектор — значит переписать все проценты, и оставшиеся начнут врать
 * («38 %» от чего?). У линии и столбиков скрытая серия ничего не искажает —
 * там оси общие, а не доли. Правило: легенда переключает там, где серии
 * независимы, и не переключает там, где они делят одно целое.
 *
 * Что здесь нельзя увидеть поодиночке:
 *  - **имя у `role="img"` есть ВСЕГДА**, даже без `ariaLabel`: оно собирается
 *    из данных (`src/internal/chartLabel.ts`). Безымянная картинка объявляется
 *    скринридеру как «изображение» и молчит, а прятать её нельзя — легенда
 *    лежит СНАРУЖИ кольца, и фокусируемые узлы в скрытом поддереве были бы
 *    нарушением сами по себе.
 *  - **кольцо остаётся кольцом при любом вводе.** `thickness` зажат
 *    0.05..0.95, зазор — половиной сектора, отрицательные значения зануляются.
 *    Без этого 175 % и оборот кольца выглядели бы правдоподобной картинкой.
 */
import { defineFixture } from '../../internal/fixture.js'
import { DonutChart, type DonutSlice } from './DonutChart.js'

/** Структура парка: из чего сложился автопарк на конец месяца. */
const FLEET: DonutSlice[] = [
  { id: 'sedan', label: 'Седаны', value: 148 },
  { id: 'universal', label: 'Универсалы', value: 62 },
  { id: 'minivan', label: 'Минивэны', value: 31 },
  { id: 'electro', label: 'Электро', value: 17 },
]

/** Два сектора: вырожденный случай, который легко перепутать с индикатором. */
const BINARY: DonutSlice[] = [
  { id: 'work', label: 'На линии', value: 213 },
  { id: 'repair', label: 'В ремонте', value: 45 },
]

/** Хвост из мелочи: восемь секторов, последние — доли процента. */
const LONG_TAIL: DonutSlice[] = [
  ...FLEET,
  { id: 'bus', label: 'Микроавтобусы', value: 9 },
  { id: 'truck', label: 'Грузовые', value: 4 },
  { id: 'test', label: 'Тестовые', value: 2 },
  { id: 'other', label: 'Прочее', value: 1 },
]

interface Props {
  data: DonutSlice[]
  size: number
  thickness: number
  center: 'none' | 'sum' | 'sumLabel'
  centerLabel: string
  legend: 'right' | 'bottom' | 'none'
  legendValue: 'none' | 'value' | 'percent'
  sliceGap: number
}

export default defineFixture<Props>({
  name: 'DonutChart',
  group: 'Данные',
  kind: 'block',

  props: {
    data: FLEET, size: 200, thickness: 0.3,
    center: 'sumLabel', centerLabel: 'машин',
    legend: 'right', legendValue: 'value', sliceGap: 1.5,
  },

  controls: {
    size: { kind: 'number', min: 80, max: 320, step: 20, prop: true },
    thickness: { kind: 'number', min: 0.05, max: 0.95, step: 0.05, prop: true },
    center: { kind: 'enum', values: ['none', 'sum', 'sumLabel'], prop: true },
    centerLabel: { kind: 'text', prop: true },
    legend: { kind: 'enum', values: ['right', 'bottom', 'none'], prop: true },
    legendValue: { kind: 'enum', values: ['none', 'value', 'percent'], prop: true },
    sliceGap: { kind: 'number', min: 0, max: 10, step: 0.5, prop: true },
  },

  data: {
    binary: { data: BINARY },
    tail: { data: LONG_TAIL, legendValue: 'percent' },
    // Один сектор: кольцо целиком одного цвета, и легенда из одной строки.
    single: { data: [FLEET[0]!] },
  },

  cases: [
    {
      id: 'base',
      title: 'Структура парка',
      note:
        'Четыре сектора, итог в середине, легенда справа со значениями. Легенда '
        + 'здесь СТАТИЧЕСКАЯ — в ней нечего нажимать, и это не недоделка: '
        + 'скрытый сектор переписал бы проценты у всех остальных. Сравните с '
        + '`LineChart`, где та же по виду полоса под графиком — фильтр.',
    },
    {
      id: 'percent',
      title: 'Проценты вместо значений',
      props: { data: LONG_TAIL, legendValue: 'percent' },
      note:
        'Восемь секторов, хвост из четырёх: 3 %, 1 %, 1 % и «0 %» — меньше '
        + 'процента из них ДВА последних (0.73 и 0.36). Смотреть надо на два '
        + 'места. В КОЛЬЦЕ хвост сливается в полоску, и различить в нём '
        + '«Тестовые» и «Прочее» нельзя никаким цветом — это граница жанра, а не '
        + 'палитры. В ЛЕГЕНДЕ округление даёт «0 %» у непустых значений: строка '
        + 'честно говорит, что доля меньше половины процента, но читается как '
        + '«ничего нет». Если хвост важен, ему нужен не донат, а таблица.',
    },
    {
      id: 'thickness',
      title: 'Толщина: от кольца до круга',
      note:
        'Слева 0.05 — почти окружность, справа 0.95 — почти диск. Оба предела '
        + 'ЗАЖАТЫ намеренно: за ними кольцо перестаёт быть кольцом, а середина, '
        + 'где стоит итог, исчезает. Толщина — это не украшение: тонкое кольцо '
        + 'читается как индикатор доли, толстое — как разбор целого.',
      render: (p) => (
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <DonutChart data={p.data} size={p.size} thickness={0.05} legend="none" center="none" />
          <DonutChart data={p.data} size={p.size} thickness={0.3} legend="none" center="sum" />
          <DonutChart data={p.data} size={p.size} thickness={0.95} legend="none" center="none" />
        </div>
      ),
    },
    {
      id: 'binary',
      title: 'Два сектора — не индикатор',
      props: { data: BINARY, legendValue: 'percent' },
      note:
        'Вырожденный случай, который легко перепутать с `ProgressBar`. Разница в '
        + 'вопросе: индикатор отвечает «сколько сделано из целого», донат — «из '
        + 'чего состоит целое». «На линии» и «В ремонте» — две категории, а не '
        + 'заполненная и пустая часть одной, и потому у обеих своя подпись и '
        + 'своё значение в легенде.',
    },
    {
      id: 'center',
      title: 'Что стоит в середине',
      note:
        'Три варианта подряд: пусто, только сумма, сумма с подписью. Середина '
        + 'доната — самое дорогое место картинки, и класть туда стоит ответ, а '
        + 'не украшение. Пустая середина законна, когда сумма бессмысленна '
        + '(смешанные единицы) — тогда лучше пусто, чем число, которое никто не '
        + 'спрашивал.',
      render: (p) => (
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <DonutChart data={p.data} size={p.size} legend="none" center="none" />
          <DonutChart data={p.data} size={p.size} legend="none" center="sum" />
          <DonutChart data={p.data} size={p.size} legend="none" center="sumLabel" centerLabel="машин" />
        </div>
      ),
    },
    {
      id: 'legend-bottom',
      title: 'Легенда снизу и без легенды',
      props: { legend: 'bottom' },
      note:
        'Позиция легенды — про раскладку соседей, а не про вкус: справа кольцо '
        + 'встаёт в узкую колонку, снизу — в широкую. Без легенды донат остаётся '
        + 'читаемым ТОЛЬКО если подписи есть где-то рядом; сам по себе он тогда '
        + 'картинка с именем в дереве доступности и без имён на экране.',
    },
  ],

  render: (p) => (
    <DonutChart
      data={p.data}
      size={p.size}
      thickness={p.thickness}
      center={p.center}
      centerLabel={p.centerLabel}
      legend={p.legend}
      legendValue={p.legendValue}
      sliceGap={p.sliceGap}
    />
  ),
})
