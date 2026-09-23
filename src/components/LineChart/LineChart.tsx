import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { emptyCaptionY } from '../../internal/emptyCaption.js'
import type { ChartPaletteSlot } from '../../../tokens/chartPalette.js'
import { assignPaletteSlots } from '../../internal/paletteSlots.js'
import { chartLabel } from '../../internal/chartLabel.js'
import { ChartLegend, useSeriesToggle } from '../../internal/ChartLegend.js'
import { useChartBox } from '../../internal/useChartBox.js'
import { useDsText, useDsLocale } from '../../dictionary/DsText.js'
import { numberFormat } from '../../internal/intl.js'
import { niceScale, scaleTicks } from '../../internal/niceScale.js'
import { textWidth } from '../../internal/textWidth.js'
import { useAxisFont } from '../../internal/useAxisFont.js'
import { ROT_DEG, ROT_GAP, ROT_LINE_EM, ROT_SIN, rotatedGutter, rotatedReach } from '../../internal/rotatedAxis.js'
import './LineChart.css'

export interface ChartPoint { x: string | number; y: number }
export interface ChartSeries {
  id: string
  label: string
  points: ChartPoint[]
  /**
   * Закреплённый слот палитры `--ds-chart-1..8` (DS-185). Без него цвет
   * выдаётся по месту в массиве, и поднабор рядов перекрашивается. Слот живёт
   * НА РЯДУ, а не картой на графике: ряд уезжает через фильтр вместе со своим
   * цветом. Один слот у двух рядов графика — исключение. См. AGENTS.md,
   * «chart palette».
   */
  paletteSlot?: ChartPaletteSlot
}

export interface LineChartProps {
  series: ChartSeries[]
  height?: number
  yUnit?: string
  /**
   * Fill under the line. 'auto' = area for a single series, lines for several.
   * Defaults to 'line' for the full chart and 'area' for a sparkline.
   */
  fill?: 'area' | 'line' | 'auto'
  /** Line shape between points. */
  curve?: 'smooth' | 'straight'
  /**
   * 'spark' strips the chrome — no axes, grid, labels or legend — for a trend
   * that lives inside a card. Same path maths, so the two cannot drift apart.
   */
  variant?: 'full' | 'spark'
  /** Dot on the newest point. Sparkline only; the full chart has the tooltip. */
  lastPoint?: boolean
  /** Accessible name. Defaults to the series labels — see `chartLabel`. */
  ariaLabel?: string
  className?: string
}

// Стартовая ширина холста до первого замера контейнера (и навсегда — для
// sparkline и сред без ResizeObserver, например jsdom в тестах).
const BASE_W = 520
const PAD = { l: 40, r: 14, t: 12, b: 26 }
/**
 * Поле подписей оси Y — по самой широкой подписи (DS-275), а не
 * константа 40. Подписи прижаты концом к полю (`textAnchor="end"`), и число
 * длиннее ~6 знаков уезжало за левый край SVG, срезаясь С НАЧАЛА: «1240500»
 * читалось как «40500». У числа, в отличие от имени категории у `BarChart`,
 * многоточия нет и потолка нет: обрезанное число — это другое число. Прежние 40
 * остаются полом, чтобы короткие шкалы не сдвинули раскладку потребителя.
 */
const Y_GAP = 6
/** Запас у левого края SVG: субпиксель и сглаживание не должны касаться края. */
const Y_INSET = 2
/** Наименьший просвет между соседними подписями оси X. */
const X_GAP = 8
/**
 * Высота риски под подписанной точкой оси X (DS-281). Точки не рисуются
 * до наведения, засечек у оси не было — якорь подписи было не к чему привязать
 * глазом, и любое якорение оставалось невидимым в статике.
 */
const X_TICK = 4
/** Радиус подсвеченной точки. Тот же в разметке круга и в отступе подсказки. */
const DOT_R = 3.5
/**
 * Отступ подсказки от направляющей (DS-279). Больше радиуса точки с её
 * обводкой (3.5 + 0.75): подсказка рассказывает ПРО точку, и накрывать её
 * собой она не может. Все точки наведения лежат на направляющей, поэтому
 * одного горизонтального отступа хватает на любую высоту плашки.
 */
const TIP_GAP = DOT_R + 4.5
/** Запас у края холста, тот же, что у подписей оси. */
const TIP_INSET = Y_INSET
/**
 * Пол ширины плашки, px при шкале 1 (прежние `6rem` из CSS).
 *
 * СЧИТАЕТСЯ ТАМ ЖЕ, ГДЕ ПОТОЛОК (DS-297). Пол стоял в CSS
 * (`min-width: min(6rem * scale, 100%)`), а потолок — здесь, по измеренному
 * месту, и `100%` в CSS меряет НЕ ТУ КОРОБКУ: процент берётся от содержащего
 * блока, то есть от всего холста, а место у плашки — только его часть от
 * подписей оси Y до края. В CSS `min-width` сильнее `max-width`, поэтому пол
 * молча перебивал потолок ровно там, где узко: на контейнере 300 при шкале 1.5
 * пол 144 против места 140 давал вылет за холст на 3.6 px, а на перевёрнутой
 * плашке — 27.5 px поверх подписи оси Y «1 200». Оговорка в CSS была написана
 * ПРОТИВ этого же дефекта и не сработала: она ограничивала пол не тем числом.
 */
const TIP_MIN = 96
// No axis gutters when there are no axes; a little room stays so the stroke and
// the last-point dot are not clipped at the edges.
const SPARK_PAD = { l: 3, r: 4, t: 4, b: 4 }

type Pt = [number, number]

function straightPath(p: Pt[]): string {
  return p.map((q, i) => `${i ? 'L' : 'M'} ${q[0]} ${q[1]}`).join(' ')
}
function smoothPath(p: Pt[]): string {
  if (p.length < 2) return straightPath(p)
  let d = `M ${p[0][0]} ${p[0][1]}`
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] ?? p[i + 1]
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`
  }
  return d
}

/**
 * Какие точки оси X подписаны и каким якорем держится каждая подпись
 * (DS-281). Чистая функция: раскладка оси — это арифметика, и проверять
 * её живым браузером на каждый случай незачем.
 *
 * **Шаг ровный и отсчитывается от ПОСЛЕДНЕЙ точки назад.** Последняя дата —
 * это «сейчас», она важнее первой. Прежний жадный проход слева с
 * принудительной последней давал рваный край: на 900 промежутки центров шли
 * 123.9, 142.9, 142.9, 142.9, 171.2 при шаге индексов 2,2,2,2,3. Первая точка
 * получает подпись, только если попадает в шаг; принудительно её не добавляют —
 * это вернуло бы тот же рваный край с другой стороны.
 *
 * **Крайние подписи не СДВИГАЮТСЯ внутрь холста, а ЯКОРЯТСЯ к своей точке.**
 * Прижатие сдвигом центра уводило подпись с её точки (замерено на 900: первая
 * +19, последняя −43.2 — до чужой точки 28.3 против 43.2 до своей), а привязать
 * её глазом не к чему. Якорь ставит ГРАНИЦУ подписи ровно на точку: последняя —
 * концом (`end`), первая — началом (`start`). Внутренние — серединой.
 * Первая ПОДПИСАННАЯ точка не обязана быть первой точкой ряда: если в шаг она
 * не попала, подпись остаётся серединной и берёт `start` только тогда, когда
 * серединой вышла бы за левый край холста.
 *
 * **Шаг — наименьший, при котором подписи с этими якорями не пересекаются** и
 * не выходят за левый край. Проверка идёт по ИТОГОВЫМ местам: якорь крайней
 * съедает у соседки просвет, которого шаг «по самой широкой подписи» не видит.
 * **Когда прямой ряд даёт меньше ДВУХ подписей, ряд поворачивается ЦЕЛИКОМ на
 * −45°** (DS-296), якорем `end` у своей точки — тот же приём и та же
 * геометрия, что у категорий вертикального `BarChart` (`rotatedAxis.ts`). Ось
 * порядка с одной меткой не говорит ни шага, ни направления: на 300 × 1.5 из
 * двенадцати недель оставалась одна «23.09.2026–29.09.2026». Две подписи-
 * диапазона по ~160 px на холсте 300 по прямой не расходятся никак, а
 * обрезать дату нельзя — обрезанная дата ВРЁТ, и формат её — данные
 * потребителя, которых компонент не знает. Поворот платится высотой: нижнее
 * поле растёт под самую длинную ПОКАЗАННУЮ подпись.
 *
 * Прореживание в повёрнутом ряду законно так же, как в прямом: шаг ровный от
 * последней точки назад. Непересечение — для ПАРАЛЛЕЛЬНЫХ диагоналей:
 * расстояние между соседними подписанными точками по X × sin45 не меньше
 * строки и просвета. Диагональ уходит от точки влево на sin45 × (ширина +
 * строка); ведущие подписи, которые так выходят за левый край, не подписываются
 * — шаг от последней назад сохраняется, первая точка не обязательна, как и в
 * прямом ряду. Пол плотности `minStep` («подпись на 80 px») сюда НЕ
 * переходит: он мерит горизонтальный след прямой подписи, а у диагонали следа
 * по X почти нет — её шаг решает только геометрия параллельных строк. Не
 * сходится и повёрнутый — остаётся прямой ряд из одной
 * последней: высоту платить не за что.
 *
 * Прямой ряд там, где он давал две подписи и больше, не меняется ничем.
 *
 * @param n      сколько точек на оси
 * @param widths ширина подписи каждой точки, px холста
 * @param xAt    координата точки по X, px холста
 * @param minStep пол шага — плотность по ширине холста, ~1 подпись на 80 px
 * @param gap    наименьший просвет между соседними подписями
 * @param leftEdge левая граница, за которую подпись не заходит
 * @param lineH  высота строки подписи — поперечник повёрнутой коробки
 */
export function pickXLabels({ n, widths, xAt, minStep, gap, leftEdge, lineH }: {
  n: number
  widths: number[]
  xAt: (i: number) => number
  minStep: number
  gap: number
  leftEdge: number
  lineH: number
}): { step: number; shown: number[]; anchors: ('start' | 'middle' | 'end')[]; rotated: boolean } {
  if (n <= 1) {
    const anchors: ('start' | 'middle' | 'end')[] = n === 1 ? ['middle'] : []
    return { step: 1, shown: n === 1 ? [0] : [], anchors, rotated: false }
  }
  const anchorOf = (i: number, first: boolean): 'start' | 'middle' | 'end' => {
    if (i === n - 1) return 'end'
    if (!first) return 'middle'
    if (i === 0) return 'start'
    return xAt(i) - (widths[i] ?? 0) / 2 < leftEdge ? 'start' : 'middle'
  }
  const span = (i: number, a: 'start' | 'middle' | 'end'): [number, number] => {
    const w = widths[i] ?? 0
    const x = xAt(i)
    if (a === 'start') return [x, x + w]
    if (a === 'end') return [x - w, x]
    return [x - w / 2, x + w / 2]
  }
  const planOf = (step: number) => {
    const shown: number[] = []
    for (let i = n - 1; i >= 0; i -= step) shown.push(i)
    shown.reverse()
    const anchors: ('start' | 'middle' | 'end')[] = shown.map((i, j) => anchorOf(i, j === 0))
    return { step, shown, anchors, rotated: false }
  }
  // Полпикселя допуска: ширина подписи приходит из измерения текста, и точное
  // равенство «просвет ровно gap» решалось бы ошибкой округления.
  const clear = (p: { shown: number[]; anchors: ('start' | 'middle' | 'end')[] }) => {
    let prevR = -Infinity
    for (let j = 0; j < p.shown.length; j++) {
      const [l, r] = span(p.shown[j]!, p.anchors[j]!)
      if (l < leftEdge - 0.01) return false
      if (l - prevR < gap - 0.01) return false
      prevR = r
    }
    return true
  }
  const first = Math.max(1, Math.min(minStep, n))
  let plan = planOf(first)
  while (plan.step < n && !clear(plan)) plan = planOf(plan.step + 1)
  if (plan.shown.length >= 2) return plan

  const outLeft = (i: number) => xAt(i) - rotatedReach(widths[i] ?? 0, lineH) < leftEdge - 0.01
  const turnedOf = (step: number) => {
    const all: number[] = []
    for (let i = n - 1; i >= 0; i -= step) all.push(i)
    all.reverse()
    // Отпадают только ВЕДУЩИЕ: чем левее точка, тем дальше за край её хвост.
    let from = 0
    while (from < all.length && outLeft(all[from]!)) from++
    const shown = all.slice(from)
    const anchors: ('start' | 'middle' | 'end')[] = shown.map(() => 'end')
    return { step, shown, anchors, rotated: true }
  }
  const turnedClear = (p: { shown: number[] }) => {
    if (p.shown.length < 2) return false
    for (let j = 0; j < p.shown.length; j++) {
      const i = p.shown[j]!
      // Внутренняя подпись шире ведущей тоже может не влезть — такой шаг не годится.
      if (outLeft(i)) return false
      if (j && (xAt(i) - xAt(p.shown[j - 1]!)) * ROT_SIN < lineH + gap - 0.01) return false
    }
    return true
  }
  // От шага 1, а не от пола плотности: см. докблок.
  for (let step = 1; step < n; step++) {
    const turned = turnedOf(step)
    if (turnedClear(turned)) return turned
  }
  return plan
}


export function LineChart({
  series, height, yUnit, fill, curve = 'smooth',
  variant = 'full', lastPoint = false, ariaLabel, className,
}: LineChartProps) {
  const t = useDsText()
  const locale = useDsLocale()
  // Числа — локалью из `DsText`, как у `BarChart` (DS-184, 275): до этого
  // ось печатала «1600000», а соседний столбчатый график на том же дашборде —
  // «1 600 000». Тик уже круглый (`scaleTicks`), и дробной части у него столько,
  // сколько у шага; значение в подсказке — не больше одного знака, как было.
  const fmtTick = (n: number) => numberFormat(locale).format(n)
  const fmt = (n: number) => numberFormat(locale, { maximumFractionDigits: 1 }).format(n)
  const spark = variant === 'spark'
  const H = height ?? (spark ? 96 : 200)
  const svgRef = useRef<SVGSVGElement>(null)
  const { hidden, toggle } = useSeriesToggle()
  const [hover, setHover] = useState<number | null>(null)

  // Полный чарт рисует viewBox 1:1 к CSS-пикселям контейнера — тем же
  // useChartBox, что и BarChart: раньше он держал пропорции фиксированного
  // холста 520×H и на широкой карточке раздувался по высоте вместе с подписями
  // (портал прижимал его max-width'ом). До первого замера (и в jsdom/SSR, где
  // ResizeObserver'а нет) остаётся холст BASE_W×H. Sparkline — фиксированная
  // полоска: ref на него не вешается, замер не происходит.
  const [plotRef, boxW, boxH, boxK] = useChartBox(H, BASE_W)
  const W = spark ? BASE_W : boxW
  const HH = spark ? H : boxH
  // Замеренная высота — это H × --ds-ui-scale, так что k и есть масштаб UI:
  // им растягиваются поля и офсеты, которые в svg-юнитах (= px) не растут сами.
  const k = spark ? 1 : boxK

  const colors = assignPaletteSlots(series, 'LineChart')
  const visible = series.filter((s) => !hidden.has(s.id))
  const n = Math.max(0, ...series.map((s) => s.points.length))

  // Все ряды скрыты — шкала считается по ВСЕМ рядам, а не выдумывается 0…1
  // (DS-185). Синтетическая ось печатала «0.3» и «0.8» над данными в
  // сотни: пустое поле с правдоподобной осью читается как «значения около
  // нуля». По всем рядам ось остаётся той, что была до скрытия, и возврат ряда
  // не дёргает её лишний раз. Пока виден хоть один — шкала по видимым, как
  // прежде: скрыл ряд, чтобы рассмотреть остальные крупнее.
  const allHidden = series.length > 0 && visible.length === 0
  const scaled = allHidden ? series : visible
  const { minY, maxY, step } = useMemo(() => {
    const ys = scaled.flatMap((s) => s.points.map((p) => p.y))
    // Данных нет вовсе (пустые ряды) — рисовать не по чему, 0…1 честен.
    if (!ys.length) return { minY: 0, maxY: 1, step: 0.25 }
    let lo = Math.min(...ys), hi = Math.max(...ys)
    if (lo === hi) { lo -= 1; hi += 1 }
    // Круглый шаг (DS-275): домен — это крайние тики, и линия сетки по
    // краю поля совпадает с его границей. Запас 2 % до округления — чтобы
    // экстремум, попавший ровно на круглое число, не лёг на край поля; прежние
    // 8 % вместе с округлением наружу съедали до трети высоты. Пять делений, а
    // не четыре, как у `BarChart`: у линии форма ряда и есть предмет, и крупный
    // шаг прижимал её к середине.
    const pad = (hi - lo) * 0.02
    const nice = niceScale(lo - pad, hi + pad, 5)
    return { minY: nice.lo, maxY: nice.hi, step: nice.step }
  }, [scaled])
  const ticks = useMemo(() => scaleTicks({ lo: minY, hi: maxY, step }), [minY, maxY, step])

  const { font: axisFont, epoch: fontEpoch } = useAxisFont(svgRef, '.ds-chart__ylabel', !spark)
  const padL = useMemo(() => {
    if (spark) return SPARK_PAD.l
    const widest = Math.max(0, ...ticks.map((v) => textWidth(fmtTick(v), axisFont, 10 * k)))
    return Math.max(PAD.l * k, widest + (Y_GAP + Y_INSET) * k)
    // `fontEpoch` телом не читается намеренно: это перемер после загрузки шрифта.
  }, [spark, ticks, axisFont, fontEpoch, k, locale])
  const base = spark ? SPARK_PAD : PAD
  // Горизонталь — до раскладки подписей оси X, вертикаль — после: какие точки
  // подписаны и повёрнут ли ряд, решают координаты X, а нижнее поле под
  // повёрнутым рядом — следствие этого решения (DS-296). Порядок не
  // случаен, круга здесь нет.
  const padR = base.r * k
  const padT = base.t * k
  const plotW = W - padL - padR
  const xAt = (i: number) => padL + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1))

  // Keep the full chart's documented default ('line'); only the sparkline, which
  // is one trend by definition, fills by default.
  const effFill = fill ?? (spark ? 'area' : 'line')
  const fillMode = effFill === 'auto' ? (visible.length <= 1 ? 'area' : 'line') : effFill
  // Позиции по X масштабируются по самой длинной серии, поэтому и подписи берутся
  // оттуда же: у первой серии их может не хватить на всю ось.
  const longest = series.reduce<ChartPoint[]>(
    (best, s) => (s.points.length > best.length ? s.points : best), [],
  )
  const labels = longest.map((p) => p.x)
  // Плотность подписей оси X следует за реальной шириной: ~1 подпись на 80px,
  // но не меньше 4 и не больше 12 — на узком экране прежние 6 налезали друг
  // на друга, на широком осиротевшая шестёрка выглядела пусто.
  const densityStep = Math.max(1, Math.ceil(n / Math.max(4, Math.min(12, Math.floor(W / (80 * k))))))
  // …а дальше шаг растёт до тех, что НЕ ПЕРЕКРЫВАЮТСЯ (DS-274, 281):
  // одна плотность по ширине холста не знает длины подписи — на 360 × 1.5
  // «Сентябрь» и «Октябрь» наезжали друг на друга. Ровный шаг от последней
  // точки назад и якоря крайних — в `pickXLabels`, там же и почему.
  // Прореживать здесь законно, в отличие от категорий `BarChart`: ось X —
  // порядок, и пропущенную подпись восстанавливают соседние.
  const xWidths = spark ? [] : labels.map((lab) => textWidth(String(lab), axisFont, 10 * k))
  const xLineH = ROT_LINE_EM * 10 * k
  const xPlan = pickXLabels({
    n, widths: xWidths, xAt, minStep: densityStep, gap: X_GAP * k, leftEdge: Y_INSET * k, lineH: xLineH,
  })
  const xTurned = !spark && xPlan.rotated
  // Поле — под самую длинную ПОКАЗАННУЮ подпись: неподписанные точки места не
  // занимают, и растить поле под них значило бы отдать высоту данных пустоте.
  const padB = xTurned
    ? rotatedGutter(Math.max(0, ...xPlan.shown.map((i) => xWidths[i] ?? 0)), xLineH, k)
    : base.b * k
  const PADDING = { l: padL, r: padR, t: padT, b: padB }
  const plotH = HH - PADDING.t - PADDING.b
  const yAt = (v: number) => PADDING.t + plotH * (1 - (v - minY) / (maxY - minY))
  const baseline = PADDING.t + plotH
  /** Опорная точка повёрнутой подписи — под полем, у риски своей точки. */
  const xLabelY = xTurned ? baseline + ROT_GAP * k : HH - 8 * k

  // Индекс наведения переживает смену данных: если серия сжалась под курсором,
  // а мышь не двигалась, onMouseLeave не сработает — и подсказка уехала бы за
  // пределы холста вместе с курсором.
  const hoverAt = hover === null || n === 0 ? null : Math.min(hover, n - 1)

  // Ряды, попавшие в подсказку: серия без точки в этом месте в неё не идёт, и
  // положение считается по тем же рядам, что печатаются.
  const tipRows = hoverAt === null ? [] : visible.filter((s) => s.points[hoverAt] !== undefined)

  /**
   * Высота подсказки — ЗАМЕРОМ, а не расчётом по числу строк (DS-279).
   * Строка переносится, когда плашку прижимает потолок ширины, и высота,
   * выведенная из количества рядов, разошлась бы с настоящей молча — как раз
   * на узком холсте, где переворот и нужен.
   *
   * `useLayoutEffect` без списка зависимостей: предмет замера — отрисованная
   * плашка, а меняет её и наведение, и данные, и шрифт. Порог в полпикселя
   * закрывает цикл «замер → состояние → замер», а до отрисовки кадра эффект
   * успевает поправить положение — вспышки в верхнем углу не будет.
   */
  const tipRef = useRef<HTMLDivElement>(null)
  const [tipH, setTipH] = useState(0)
  useLayoutEffect(() => {
    const h = tipRef.current?.getBoundingClientRect().height ?? 0
    if (Math.abs(h - tipH) > 0.5) setTipH(h)
  })

  /**
   * Положение подсказки — в координатах холста, и границей служит ХОЛСТ, а не
   * окно (DS-279). График живёт в карточке: прижав плашку к краю экрана,
   * её увели бы от собственного графика. Поэтому `useAnchoredPosition` здесь не
   * годится — он поджимает к вьюпорту и уносит узел в `position: fixed`.
   *
   * Сторона выбирается по тому, где БОЛЬШЕ места, то есть переворачивается на
   * правой половине холста. Не «перевернуть, если не влезло»: то правило
   * требует знать ширину плашки до её размещения, а ширина зависит от потолка,
   * который ставит само размещение, — получился бы расчёт, зависящий от своего
   * результата. Выбор по половине холста даёт каждой плашке не меньше половины
   * ширины за вычетом отступов и не зависит ни от чего, кроме координаты точки.
   */
  const tipStyle = ((): React.CSSProperties | undefined => {
    if (hoverAt === null || tipRows.length === 0) return undefined
    const gap = TIP_GAP * k
    const inset = TIP_INSET * k
    const gx = xAt(hoverAt)
    // Область, в которой живёт плашка, — не весь `svg`, а область ДАННЫХ: от
    // правого края подписей оси Y (`PADDING.l`, его считает 275 по самому
    // широкому числу) до правого края холста (DS-286). Подписи оси —
    // часть графика, накрывать их нельзя так же, как подсвеченную точку: на
    // 360 × 1.5 потолок, отсчитанный от левого края svg, клал плашку на «1 400»
    // и в кадре читалось «1 40», то есть другое число.
    const roomL = gx - gap - PADDING.l
    const roomR = W - gx - gap - inset
    // Сторона — по-прежнему та, где БОЛЬШЕ места (DS-279); изменилась не
    // сторона выбора, а область, в которой место меряется. Отсюда и «плашка
    // ставится справа несмотря на половину холста», когда слева не хватает
    // даже на ужатое многоточием имя ряда: слева место кончается у подписей
    // оси, а не у края svg. От ширины самой плашки выбор по-прежнему не
    // зависит — иначе расчёт зависел бы от своего результата.
    const flip = roomL > roomR
    // Потолок ширины — ровно свободное место на выбранной стороне: длинная
    // подпись переносится внутри плашки, а не уезжает за холст.
    const maxWidth = Math.max(0, flip ? roomL : roomR)
    // ПОЛ УСТУПАЕТ МЕСТУ (DS-297). Место меряется тем же числом, что и
    // потолок, поэтому пол не может его перебить: где места меньше пола,
    // побеждает место, а содержимое переносится внутри. Обратный порядок
    // выводил бы плашку из поля данных — то есть отменял бы 279 (граница —
    // холст) и 286 (подписи оси накрывать нельзя) молча, раскладкой.
    const minWidth = Math.min(TIP_MIN * k, maxWidth)
    // Над САМОЙ ВЕРХНЕЙ точкой наведения, а не над всеми: так плашка не
    // накрывает ни одну из них даже без горизонтального отступа. Не влезает над
    // ней — уходит под неё, и в обоих случаях остаётся в ПОЛЕ ДАННЫХ: снизу
    // область кончается базовой линией, под которой стоят подписи оси X
    // (DS-286). Прежняя граница — низ `svg` — клала плашку прямо на
    // «Август» и «Октябрь» (замерено на `big` 360: до 58.3 × 17 px).
    const yTop = Math.min(...tipRows.map((s) => yAt(s.points[hoverAt]!.y)))
    const above = yTop - gap - tipH
    const top = above >= PADDING.t
      ? above
      : Math.min(yTop + gap, Math.max(PADDING.t, baseline - tipH))
    return flip
      ? { right: W - gx + gap, top, maxWidth, minWidth }
      : { left: gx + gap, top, maxWidth, minWidth }
  })()

  const onMove = (e: React.MouseEvent) => {
    const svg = svgRef.current
    if (!svg || n === 0) return
    const rect = svg.getBoundingClientRect()
    const xv = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round(((xv - PADDING.l) / plotW) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }

  return (
    <div className={['ds-chart', spark && 'ds-chart--spark', className].filter(Boolean).join(' ')}>
      <div className="ds-chart__plot" ref={spark ? undefined : plotRef}>
        <svg
          ref={svgRef}
          className="ds-chart__svg"
          viewBox={`0 0 ${W} ${HH}`}
          // Высота фиксирована у обоих вариантов: полный чарт занимает всю ширину
          // контейнера (viewBox следует за замером — см. useChartBox), sparkline —
          // фиксированная полоска. Без inline-высоты svg держал бы пропорции
          // viewBox и рос по высоте вместе с шириной карточки.
          style={{ height: `calc(${H}px * var(--ds-ui-scale, 1))` }}
          role="img"
          aria-label={chartLabel(ariaLabel, t['chart.line'], series.map((s) => s.label))}
          preserveAspectRatio="none"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {/* grid + y labels */}
          {!spark && ticks.map((t, i) => (
            <g key={i}>
              <line className="ds-chart__grid" x1={PADDING.l} y1={yAt(t)} x2={W - PADDING.r} y2={yAt(t)} />
              <text className="ds-chart__ylabel" x={PADDING.l - 6 * k} y={yAt(t) + 3 * k} textAnchor="end">{fmtTick(t)}</text>
            </g>
          ))}
          {/* x labels */}
          {/* Риска под подписанной точкой — минимальный носитель привязки в
              статике (DS-281): точки до наведения не рисуются (`r=0`),
              засечек у оси не было, и якорь подписи не к чему было отнести
              глазом. Цвет — линии сетки: это разметка оси, а не сообщение. */}
          {!spark && xPlan.shown.map((i, j) => (
            <g key={i}>
              <line className="ds-chart__xtick" x1={xAt(i)} y1={baseline} x2={xAt(i)} y2={baseline + X_TICK * k} />
              <text
                className="ds-chart__xlabel"
                x={xAt(i)}
                y={xLabelY}
                textAnchor={xPlan.anchors[j]}
                // Поворот вокруг САМОЙ точки: конец подписи остаётся у своей
                // риски, хвост уходит вниз-влево (DS-296).
                transform={xTurned ? `rotate(-${ROT_DEG} ${xAt(i)} ${xLabelY})` : undefined}
              >{labels[i]}</text>
            </g>
          ))}
          {/* series */}
          {visible.map((s) => {
            const color = colors.get(s.id)
            const pts: Pt[] = s.points.map((p, i) => [xAt(i), yAt(p.y)])
            const line = curve === 'smooth' ? smoothPath(pts) : straightPath(pts)
            return (
              <g key={s.id}>
                {fillMode === 'area' && (
                  <path
                    className="ds-chart__area"
                    d={`${line} L ${pts[pts.length - 1]?.[0] ?? 0} ${baseline} L ${pts[0]?.[0] ?? 0} ${baseline} Z`}
                    style={{ fill: color }}
                  />
                )}
                <path className="ds-chart__line" d={line} style={{ stroke: color }} />
                {!spark && pts.map((q, i) => (
                  <circle key={i} className="ds-chart__dot" cx={q[0]} cy={q[1]} r={hoverAt === i ? DOT_R * k : 0} style={{ fill: color }} />
                ))}
                {spark && lastPoint && pts.length > 0 && (
                  <circle
                    className="ds-chart__last"
                    cx={pts[pts.length - 1]![0]} cy={pts[pts.length - 1]![1]} r={2.5}
                    style={{ fill: color }}
                  />
                )}
              </g>
            )
          })}
          {/* Пустое поле называется словами: без подписи оно неотличимо от
              «данных нет», а причина — нажатые чипы легенды под графиком. */}
          {!spark && allHidden && (
            <text
              className="ds-chart__empty"
              x={PADDING.l + plotW / 2}
              y={emptyCaptionY(ticks.map(yAt), PADDING.t, baseline)}
              textAnchor="middle"
              dominantBaseline="middle"
            >{t['chart.allHidden']}</text>
          )}
          {/* hover guide */}
          {/* Курсор — указатель НА ТОЧКИ, а при нуле видимых рядов указывать не на
              что: пунктир в пустом поле рядом с «Все ряды скрыты» читался бы как
              метка значения, которого нет. Подсказка ниже гасится тем же
              условием уже давно (DS-185, находка ревью). */}
          {!spark && hoverAt !== null && visible.length > 0 && (
            <line className="ds-chart__cursor" x1={xAt(hoverAt)} y1={PADDING.t} x2={xAt(hoverAt)} y2={baseline} />
          )}
        </svg>

        {!spark && hoverAt !== null && tipStyle && (
          <div
            ref={tipRef}
            className="ds-chart__tip"
            style={tipStyle}
          >
            <div className="ds-chart__tip-x">{labels[hoverAt]}</div>
            {/* Серия без точки в этом месте пропускается: ноль вместо «данных нет»
                читается как настоящее значение — «счёт обнулили». */}
            {tipRows.map((s) => {
              return (
                <div key={s.id} className="ds-chart__tip-row">
                  <span className="ds-chart__tip-dot" style={{ background: colors.get(s.id) }} />
                  <span className="ds-chart__tip-label">{s.label}</span>
                  <span className="ds-chart__tip-val">{fmt(s.points[hoverAt]!.y)}{yUnit ? ` ${yUnit}` : ''}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {!spark && series.length > 1 && (
        <ChartLegend block="ds-chart" series={series} colors={colors} hidden={hidden} onToggle={toggle} />
      )}
    </div>
  )
}
