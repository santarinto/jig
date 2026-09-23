import { useMemo, useRef } from 'react'
import { emptyCaptionY } from '../../internal/emptyCaption.js'
import type { BadgeTone } from '../Badge/index.js'
import type { ChartPaletteSlot } from '../../../tokens/chartPalette.js'
import { assignPaletteSlots } from '../../internal/paletteSlots.js'

/** Тот же словарь тонов, что у Badge, Card, Timeline, LogViewer и Heatmap. */
export type BarTone = BadgeTone
import { useChartBox } from '../../internal/useChartBox.js'
import { chartLabel } from '../../internal/chartLabel.js'
import { ChartLegend, useSeriesToggle } from '../../internal/ChartLegend.js'
import { useDsText, useDsLocale } from '../../dictionary/DsText.js'
import { numberFormat } from '../../internal/intl.js'
import { textWidth, truncateEnd } from '../../internal/textWidth.js'
import { niceScale, scaleTicks } from '../../internal/niceScale.js'
import { useAxisFont } from '../../internal/useAxisFont.js'
import { ROT_DEG, ROT_GAP, ROT_LINE_EM, ROT_SIN, rotatedGutter } from '../../internal/rotatedAxis.js'
import './BarChart.css'

export interface BarSeries {
  id: string
  label: string
  /** One value per category, in the order of `categories`. */
  values: number[]
  /**
   * Закреплённый слот палитры `--ds-chart-1..8` (DS-185) — как у
   * `ChartSeries` в `LineChart`, по тем же причинам. Один слот у двух серий
   * графика — исключение.
   */
  paletteSlot?: ChartPaletteSlot
}

export interface BarChartProps {
  categories: string[]
  series: BarSeries[]
  /** Plot height in px before `--ds-ui-scale`. */
  height?: number
  orientation?: 'vertical' | 'horizontal'
  /** `grouped` puts a series beside its neighbours, `stacked` on top of them. */
  mode?: 'grouped' | 'stacked'
  /** Value above each bar; a stack is labelled with the category total. */
  valueLabels?: boolean
  grid?: boolean
  /** Tick and category labels along both axes. */
  axis?: boolean
  /** Corner radius of a bar, px. */
  radius?: number
  /** Gap between category groups, px. Bars widen as it shrinks. */
  groupGap?: number
  /**
   * `'spark'` снимает обвязку — оси, сетку, подписи значений и категорий,
   * легенду — для тренда, живущего внутри карточки. Математика столбцов та же,
   * поэтому полный график и спарклайн не могут разъехаться.
   *
   * Доступное имя остаётся: обвязку снимаем, доступность — нет.
   */
  variant?: 'full' | 'spark'
  /**
   * Тон столбца по индексу категории — **состояние**, а не величина: величина
   * уже в высоте. Красит и столбец, и дорожку под ним.
   *
   * Осмыслен только при одной серии: при нескольких цвет столбца принадлежит
   * серии, и переопределение сделало бы легенду ложной — чип показывал бы один
   * цвет, столбец другой. Поэтому при нескольких сериях игнорируется. Отказ
   * видимый: цвета просто не меняются.
   */
  barTone?: (index: number) => BarTone | undefined
  /**
   * Бледная колонка на всю высоту под каждой категорией.
   *
   * Нужна там, где значение бывает нулевым: нулевой столбец рисуется путём
   * нулевой высоты, то есть исчезает, и категорию не отличить от отсутствия
   * данных. Дорожка возвращает колонку на график и даёт опору `highlightIndex`.
   */
  track?: boolean
  /** Индекс выделенной категории — обводка вокруг колонки. */
  highlightIndex?: number
  format?: (value: number) => string
  ariaLabel?: string
  className?: string
}

/** Room for the value labels, always reserved: a toggle must not resize bars. */
const LABEL_GUTTER = 18
/**
 * Поле подписей категорий горизонтального графика (DS-185).
 *
 * Было константой 44 px на любую подпись, а подписи прижаты концом к полю
 * (`textAnchor="end"`) — всё, что длиннее ~7 символов, уезжало за левый край
 * SVG и срезалось С НАЧАЛА: «Центральный таксопарк» читалось как «ый
 * таксопарк». Теперь поле = самая длинная подпись + зазоры, в пределах:
 *  - ПОЛ — прежние 44: короткие подписи («Янв») не двигают раскладку
 *    относительно того, что потребитель видел до сих пор, а на крошечном
 *    графике поле не становится уже, чем было;
 *  - ПОТОЛОК — 40 % ширины: столбцам остаётся большая часть холста, а подпись
 *    длиннее обрезается с конца многоточием и несёт полное имя в `<title>`.
 * Когда потолок ниже пола (график уже 110 px), побеждает пол — то есть
 * прежнее поведение, а не новое сжатие.
 *
 * ПОТОЛОК УСТУПАЕТ ИМЕНИ (DS-291, правило переписано DS-295).
 * Горизонтальная ориентация существует РАДИ длинных имён, и на 40 % она своё
 * обещание не выполняла. Поворот здесь не ответ: в жёлобе имя и так идёт вдоль
 * своей полосы, поворачивать нечего. Отвечает то же, чем ответила вертикаль, —
 * РОСТ ПОЛЯ: жёлобу разрешено выйти за 40 %, ровно настолько, чтобы КАЖДАЯ
 * подпись показала то, что требует `keepChars`.
 *
 * ЖЁСТКИЙ ПРЕДЕЛ — ПОЛОВИНА ХОЛСТА. Дальше подпись перестаёт быть подписью К
 * столбцам: сравнивать становится нечего, и это уже список с полосками, а не
 * график. Имя, которому и половины холста мало, обрезается СИЛЬНЕЕ своего
 * `keepChars` — и это честнее, чем съесть график.
 *
 * ПОЛ ПЕРЕСЧИТАН 44 → 53 (DS-375). `.ds-bar__axis` перешёл с
 * `--ds-fs-2xs` (10px, ступень удалена) на `--ds-fs-sm` (12px, +20%) — тот
 * же скачок, что увидела вертикаль (ниже). Прежние 44 были откалиброваны под
 * 10px-глиф «Янв» и с новым кеглем стали ЖЕСТЧЕ старого обещания «поле не
 * становится уже, чем было»; 53 ≈ 44 × 1.2 держит его снова.
 *
 * ПОТОЛОК ПЕРЕСЧИТАН 0.5 → 0.55 (DS-375, решение дизайнера системы). Тот
 * же рост кегля, что пересчитал `CAT_GUTTER_MIN`, поднял и порог, за которым
 * `keepChars` не помещается в половину холста: на фикстуре `twins` (300×1.5)
 * «Центральный…»/«Центральный…» нужно 159.4px при холсте 300 (доле 0.531), а
 * прежний потолок 0.5 давал только 150px — эталонная пара переставала
 * различаться, «Автопарк-Юг» и «Автопарк-Север» читались как одно название.
 * Поставлено 0.55, а не 0.531: доля обязана держать запас, а не совпадать с
 * одним замеренным случаем.
 *
 * Прежний довод «честнее срезать сильнее, чем съесть график у столбцов»
 * верен, ПОКА срезается хвост. Здесь срезалось столько, что категория
 * переставала называть себя, то есть график начинал врать о том, ЧТО он
 * показывает. Тесные столбцы всё ещё сравнимы между собой; перепутанная
 * категория делает сравнение бессмысленным. Поэтому потолок уступает
 * символьному полу `keepChars`, а не наоборот — та же система доводов, что у
 * даты в `Form.css` и у многоточия в `Stat`: различимость важнее комфорта.
 *
 * `CAT_GUTTER_MIN` — чистая калибровка под пиксель шрифта, её пересчёт не
 * меняет ничьего обещания. `CAT_GUTTER_MAX_SHARE` — ДОЛЯ ХОЛСТА, компромисс
 * «сколько места отдать подписи, а не столбцам»: решение о том же
 * компромиссе, принятое дизайнером системы, а не инженером гейта.
 */
const CAT_GUTTER_MIN = 53
const CAT_GUTTER_SHARE = 0.4
/** Предел, за который жёлоб не выходит даже ради имени. */
const CAT_GUTTER_MAX_SHARE = 0.55
/** Зазор между концом подписи и началом столбцов — прежние 6 px. */
const CAT_GAP = 6
/** Запас у левого края SVG: субпиксель и сглаживание не должны касаться края. */
const CAT_INSET = 2
/** Просвет между соседними подписями категорий вертикального графика. */
const CAT_LABEL_GAP = 4
/**
 * Поворот подписей категорий вертикального графика (DS-280).
 *
 * Обрезка с конца — приём для ЛЁГКОГО случая: пока имя опознаётся, «Автопарк-Се…»
 * ещё называет парк. На узком холсте она выполняла своё обещание буквально и
 * давала «Ав…» и «Ав…» у разных парков: многоточие читается, категория — нет.
 * Тогда ряд поворачивается на −45° якорем `end` у своей риски, и предел обрезки
 * считается ПО ДИАГОНАЛИ. Что значит «опознаётся» — у `keepChars`.
 *
 * Поворот платится высотой: нижнее поле растёт под самую длинную повёрнутую
 * подпись. Это честная плата — на узком холсте высота есть, а ширины нет.
 * Прореживание («каждая вторая») не годится вовсе: у столбца нет соседа, к
 * которому имя можно приписать, и непомеченный столбец — столбец без имени.
 *
 * Угол, зазор, высота строки и поле — `src/internal/rotatedAxis.ts`, общие с
 * осью X `LineChart` (DS-296): один приём, одна геометрия. Своё у
 * категорий — только потолок.
 *
 * Потолок повёрнутого ряда — доля высоты холста, та же 0.4, что у поля
 * подписей горизонтального графика: высота у потребителя тоже не бесконечна,
 * и подпись, съевшая половину поля, оставляет столбцы без места сравнения.
 */
const CAT_ROT_SHARE = 0.4
/**
 * ПОЛ ИМЕНИ: столько символов подпись обязана показать, чтобы быть именем, а не
 * инициалом (DS-295). Имя короче пола показывается ЦЕЛИКОМ и полу
 * удовлетворяет — иначе «Юг» требовал бы четырёх символов и не мог бы их дать
 * никогда.
 *
 * Четыре, а не круглое число по вкусу: система УЖЕ приняла четыре символа за
 * имя и три за не-имя, когда правилом была половина. Восьмибуквенный
 * «Автопарк» проходил как «Авто…» и не проходил как «Авт…» — обе границы стоят
 * в `BarChart.test.tsx` с 280. А известный дефект 280 показывал «Ав…» и «Ю» —
 * один-два символа. Пол в 4 лежит над известным плохим и ровно на самом
 * коротком, что система когда-либо признавала именем.
 */
export const CAT_KEEP_MIN = 4

/** Символы ИМЕНИ в показанной подписи: многоточие именем не является. */
function shownChars(shown: string): number {
  const c = Array.from(shown)
  return c.length - (c[c.length - 1] === '…' ? 1 : 0)
}

/**
 * Сколько символов имени `names[i]` обязана показать его подпись (DS-295).
 *
 * ПРЕДМЕТ ПРАВИЛА — НЕОДНОЗНАЧНОСТЬ, а не доля. До 295 порогом была половина
 * символов, и это был ПРОКСИ: дефект 280 выглядел как «Ав…» и «Ав…» у РАЗНЫХ
 * парков, то есть подпись не называла категорию потому, что не отличала её от
 * соседней, а не потому, что показывала мало. Прокси был строже предмета и
 * промахивался в обе стороны. Строже: на 300 × 1.5 «Центральны…» — 10 символов
 * из 21, по половине дефект, а владелец прочитал имя (9 из 21) посимвольно
 * верно (DS-290). Слабее: «Автопарк-Север» и «Автопарк-Юг», обрезанные до
 * «Автопарк…», проходят половину у ОБОИХ и не различают ни одного.
 *
 * Поэтому требований два, и они про разное:
 *  - УНИКАЛЬНОСТЬ. Показанное обязано отличать свою категорию от каждой чужой,
 *    то есть быть длиннее общего с ней начала хотя бы на символ. У одинаковых
 *    ИМЁН требования нет: их не различит никакая длина, и требовать значило бы
 *    крутить ряд вечно ни за чем.
 *  - ПОЛ (`CAT_KEEP_MIN`). Уникальность вырождается, когда категория одна: «Ц…»
 *    уникально в ряду из одного и именем не является. Пол отвечает за «это
 *    слово», уникальность — за «это слово, а не соседнее».
 *
 * Требование не может превысить длину самого имени: целое имя удовлетворяет
 * правилу всегда, даже когда оно — начало более длинного соседнего (показанные
 * строки тогда различит многоточие соседа).
 */
export function keepChars(names: string[], i: number): number {
  const full = Array.from(names[i] ?? '')
  const n = full.length
  if (n === 0) return 0
  let need = Math.min(CAT_KEEP_MIN, n)
  for (let j = 0; j < names.length; j++) {
    if (j === i || names[j] === names[i]) continue
    const other = Array.from(names[j] ?? '')
    let k = 0
    while (k < n && k < other.length && full[k] === other[k]) k++
    need = Math.max(need, Math.min(k + 1, n))
  }
  return need
}

/**
 * Поворачивать ли ВЕСЬ ряд подписей категорий (DS-280, правило — 295).
 *
 * Хотя бы одна подпись не дотянула до своего `keepChars` — поворачивается ряд
 * ЦЕЛИКОМ: прямые вперемешку с повёрнутыми читаются как два разных ряда, а ряд
 * подписей у одной оси — один.
 *
 * Считается в СИМВОЛАХ, а не в ширинах, потому что именно символы читает глаз.
 * Ширина отвечает на тот же вопрос лишь приблизительно: многоточие занимает
 * место, но именем не является, а прописная первая буква шире средней — на
 * 360 × 1 «Центральный таксопарк» получал 57.2 px при полных 113.0 (то есть
 * ровно половину ШИРИНЫ) и оставлял 8 символов из 21.
 */
export function rotateCatLabels(names: string[], straight: string[]): boolean {
  return names.some((full, i) =>
    Array.from(full).length > 0 && shownChars(straight[i] ?? '') < keepChars(names, i))
}

// Локаль числа — из `DsText` (DS-184), а не прибита к `ru-RU`: подпись
// оси и подпись значения на одном экране обязаны разделять один разделитель
// разрядов.
const defaultFormat = (locale: string) => (n: number) => numberFormat(locale).format(n)

type BarSide = 'top' | 'bottom' | 'left' | 'right' | 'none'

/**
 * A bar rounded on one side only.
 *
 * A rect with `rx` rounds all four corners, which lifts a bar off its own axis
 * and — inside a stack — leaves a seam between segments that reads as a gap.
 * Only the end the bar grows towards is rounded; everything else stays flush —
 * which for a negative bar means the bottom, not the top.
 */
function barPath(
  x: number, y: number, w: number, h: number, radius: number, round: BarSide,
): string {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  const square = `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`
  if (round === 'none' || r === 0) return square
  switch (round) {
    case 'top':
      return `M ${x} ${y + h} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y}`
        + ` L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r}`
        + ` L ${x + w} ${y + h} Z`
    case 'bottom':
      return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h - r}`
        + ` Q ${x + w} ${y + h} ${x + w - r} ${y + h}`
        + ` L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} Z`
    case 'right':
      return `M ${x} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r}`
        + ` L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h}`
        + ` L ${x} ${y + h} Z`
    default:
      return `M ${x + w} ${y} L ${x + r} ${y} Q ${x} ${y} ${x} ${y + r}`
        + ` L ${x} ${y + h - r} Q ${x} ${y + h} ${x + r} ${y + h}`
        + ` L ${x + w} ${y + h} Z`
  }
}

export function BarChart({
  categories, series, height,
  orientation = 'vertical', mode = 'grouped',
  variant = 'full',
  barTone, track = false, highlightIndex,
  valueLabels: valueLabelsProp, grid: gridProp, axis: axisProp,
  radius = 5, groupGap = 10,
  format, ariaLabel, className,
}: BarChartProps) {
  const t = useDsText()
  const locale = useDsLocale()
  // Умолчание перенесено из деструктуризации в тело: оно зависит от локали, а
  // значение по умолчанию в сигнатуре вычисляется вне компонента и хука не видит.
  const fmt = format ?? defaultFormat(locale)
  const { hidden, toggle } = useSeriesToggle()
  // Спарклайн отключает обвязку целиком, но каждый её кусок остаётся
  // переопределяемым: явный проп сильнее варианта.
  const spark = variant === 'spark'
  // Цвет столбца принадлежит серии, когда серий больше одной, — иначе легенда
  // сказала бы одно, а график другое.
  const toneAt = series.length === 1 ? barTone : undefined
  const valueLabels = valueLabelsProp ?? !spark
  const grid = gridProp ?? !spark
  const axis = axisProp ?? !spark
  const [ref, W, H, k] = useChartBox(height ?? (spark ? 72 : 220))

  const horizontal = orientation === 'horizontal'
  const catAxis = axis && horizontal

  // Шрифт подписи оси — с настоящего узла, см. `useAxisFont`. Нужен обеим
  // ориентациям: горизонтальной для поля категорий, вертикальной — для поля
  // чисел шкалы (DS-275).
  const svgRef = useRef<SVGSVGElement>(null)
  const { font: axisFont, epoch: fontEpoch } = useAxisFont(svgRef, '.ds-bar__axis', axis)

  const catLayout = useMemo(() => {
    const floor = (axis ? CAT_GUTTER_MIN : 8) * k
    if (!catAxis) return { padL: floor, labels: categories.map((c) => ({ text: c, cut: false })) }
    const measure = (s: string) => textWidth(s, axisFont, 12 * k)
    const widths = categories.map(measure)
    const room = (CAT_GAP + CAT_INSET) * k
    const need = Math.max(0, ...widths) + room
    // Сколько нужно, чтобы КАЖДАЯ подпись показала свой `keepChars`
    // (DS-291, правило — 295). Спрашивается ровно та же функция, что
    // решает поворот у вертикали: разные ответы на один вопрос — это и есть
    // дефект, которым 295 заведена. Считается по УЖЕ ОБРЕЗАННОЙ подписи — с
    // многоточием, которое место занимает, а именем не является; у имени,
    // показанного целиком, многоточия нет и места под него не просят.
    const nameNeed = Math.max(0, ...categories.map((c, i) => {
      const ch = Array.from(c)
      const need = keepChars(categories, i)
      return measure(ch.slice(0, need).join('') + (need < ch.length ? '…' : ''))
    })) + room
    const cap = Math.max(CAT_GUTTER_SHARE * W, Math.min(nameNeed, CAT_GUTTER_MAX_SHARE * W))
    const padL = Math.max(floor, Math.min(need, cap))
    const avail = padL - room
    return {
      padL,
      labels: categories.map((c, i) => (widths[i]! <= avail
        ? { text: c, cut: false }
        : { text: truncateEnd(c, avail, measure), cut: true })),
    }
    // `fontEpoch` в зависимостях не читается телом намеренно: это перемер после загрузки шрифта.
  }, [catAxis, axis, categories, axisFont, fontEpoch, k, W])

  const stacked = mode === 'stacked'
  const colors = assignPaletteSlots(series, 'BarChart')
  const visible = series.filter((s) => !hidden.has(s.id))

  // Все ряды скрыты — шкала по ВСЕМ рядам, а не вырожденная 0…1 (DS-185):
  // см. тот же довод у `LineChart`. Столбцы при этом не рисуются, в поле —
  // подпись. Пока виден хоть один ряд, шкала по видимым, как прежде.
  const allHidden = series.length > 0 && visible.length === 0
  const scaled = allHidden ? series : visible

  const totals = categories.map((_, i) =>
    visible.reduce((sum, s) => sum + (s.values[i] ?? 0), 0),
  )
  // Стопка растёт от нуля в обе стороны, поэтому знаки копятся раздельно.
  const sums = categories.map((_, i) => {
    let up = 0, down = 0
    for (const s of scaled) {
      const v = s.values[i] ?? 0
      if (v >= 0) up += v; else down += v
    }
    return { up, down }
  })
  const all = scaled.flatMap((s) => s.values)
  const hiRaw = stacked ? Math.max(0, ...sums.map((s) => s.up)) : Math.max(0, ...all)
  const loRaw = stacked ? Math.min(0, ...sums.map((s) => s.down)) : Math.min(0, ...all)
  const { lo, hi, step } = niceScale(loRaw, hiRaw)
  const ticks = scaleTicks({ lo, hi, step })
  const crossesZero = lo < 0

  // The value gutter is reserved on the side the bars grow towards, whether or
  // not labels are on — otherwise switching them repaints every bar a different
  // length and the two states stop being comparable.
  // Поле чисел шкалы вертикального графика — по самой широкой подписи тика
  // (DS-275), как у `LineChart`: «1 240 500» при прежних 44 срезался с
  // начала. Пол тот же, что у поля категорий; потолка и многоточия у числа нет.
  const valueGutter = axis && !horizontal
    ? Math.max(0, ...ticks.map((v) => textWidth(fmt(v), axisFont, 12 * k))) + (CAT_GAP + CAT_INSET) * k
    : 0
  const padL = Math.max(catLayout.padL, valueGutter)
  const padR = (horizontal ? LABEL_GUTTER + 26 : 10) * k
  const padT = (horizontal ? 8 : LABEL_GUTTER) * k
  const plotW = Math.max(0, W - padL - padR)
  // Полоса категории вертикального графика считается ДО нижнего поля: она
  // делит ширину, а поле под повёрнутыми подписями — следствие полосы, не
  // наоборот. Круга здесь поэтому нет, и порядок этих трёх строк не случаен.
  const vBand = plotW / Math.max(1, categories.length)

  // Подписи категорий вертикального графика (DS-274, поворот —
  // DS-280). Обрезка с конца и полное имя в `<title>`, а не прореживание:
  // категории номинальные, столбец без имени не опознать. Когда обрезка не
  // оставляет имени его `keepChars`, ряд поворачивается на −45°, и
  // предел обрезки считается по диагонали: влево — до края холста, вниз — до
  // потолка поля. Полоса не влезает даже в «…» — текста нет, имя остаётся в
  // `<title>` столбца.
  const vCat = axis && !horizontal ? (() => {
    // 12, не 10 (DS-375, живая регрессия): `.ds-bar__axis` теперь на
    // `--ds-fs-sm`, а этот литерал стоял под удалённый `--ds-fs-2xs`. В
    // реальном браузере `measure` меряет НАСТОЯЩИМ шрифтом (`textWidth`
    // игнорирует `size`, пока есть канва и `font` от `getComputedStyle`) —
    // `size` тут значит только `lineH`, запас на высоту строки повёрнутой
    // подписи, и до починки он был занижен, то есть ЛЬСТИЛ раскладке, а не
    // ломал её. Дырку в `keepChars` открыл не этот литерал (см. `catLayout`
    // выше), но и не подтверждён — он остаётся честным вторым источником
    // рассинхрона, который стоило закрыть тем же ходом.
    const size = 12 * k
    const lineH = ROT_LINE_EM * size
    const measure = (s: string) => textWidth(s, axisFont, size)
    const fit = (c: string, room: number) => (measure(c) <= room
      ? { text: c, cut: false }
      : measure('…') > room ? { text: '', cut: true } : { text: truncateEnd(c, room, measure), cut: true })
    const straight = categories.map((c) => fit(c, Math.max(0, vBand - CAT_LABEL_GAP * k)))
    if (!rotateCatLabels(categories, straight.map((l) => l.text))) {
      return { rotated: false, gutter: 24 * k, labels: straight }
    }
    // Крайняя левая подпись уходит от своей риски вверх-влево на
    // `sin45 × (ширина + строка)`: дальше края холста — то же срезание с
    // начала, от которого поле горизонтального графика спасали на 185.
    const room = Math.max(0, Math.min(
      (padL + vBand / 2 - CAT_INSET * k) / ROT_SIN - lineH,
      (CAT_ROT_SHARE * H - ROT_GAP * k) / ROT_SIN - lineH,
    ))
    const labels = categories.map((c) => fit(c, room))
    // Поле — под САМУЮ ДЛИННУЮ УЖЕ ОБРЕЗАННУЮ подпись: считать по полному имени
    // значило бы растить поле под хвост, которого на экране нет.
    const longest = Math.max(0, ...labels.map((l) => measure(l.text)))
    return { rotated: true, gutter: rotatedGutter(longest, lineH, k), labels }
    // Без мемо: перемер после загрузки шрифта приходит сам, перерисовкой от
    // эпохи в `useAxisFont`.
  })() : null

  const pad = {
    l: padL,
    r: padR,
    t: padT,
    b: vCat?.gutter ?? (axis ? 24 : 8) * k,
  }
  const plotH = Math.max(0, H - pad.t - pad.b)

  const gap = groupGap * k
  const band = horizontal ? plotH / Math.max(1, categories.length) : vBand
  const inner = Math.max(1, band - gap)
  const barW = stacked ? inner : inner / Math.max(1, visible.length)
  const span = hi - lo || 1
  /** Value → position on the value axis. */
  const at = (v: number) => (horizontal
    ? pad.l + (plotW * (v - lo)) / span
    : pad.t + (plotH * (hi - v)) / span)
  const zero = at(0)

  /** Опорная точка повёрнутой подписи — под полем, у риски своей категории. */
  const catBaseline = vCat?.rotated ? pad.t + plotH + ROT_GAP * k : H - 8 * k

  return (
    <div className={['ds-bar', className].filter(Boolean).join(' ')}>
      <div
        className="ds-bar__plot"
        ref={ref}
        style={{ height: `calc(${height}px * var(--ds-ui-scale, 1))` }}
      >
        <svg
          ref={svgRef}
          className="ds-bar__svg"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={chartLabel(ariaLabel, t['chart.bar'], series.map((s) => s.label))}
        >
          {grid && ticks.map((t, i) => {
            const p = at(t)
            return horizontal
              ? <line key={i} className="ds-bar__grid" x1={p} y1={pad.t} x2={p} y2={pad.t + plotH} />
              : <line key={i} className="ds-bar__grid" x1={pad.l} y1={p} x2={pad.l + plotW} y2={p} />
          })}

          {axis && ticks.map((t, i) => {
            const p = at(t)
            return horizontal
              ? <text key={i} className="ds-bar__axis" x={p} y={H - 8 * k} textAnchor="middle">{fmt(t)}</text>
              : <text key={i} className="ds-bar__axis" x={pad.l - 6 * k} y={p + 3 * k} textAnchor="end">{fmt(t)}</text>
          })}

          {crossesZero && (horizontal
            ? <line className="ds-bar__zero" x1={zero} y1={pad.t} x2={zero} y2={pad.t + plotH} />
            : <line className="ds-bar__zero" x1={pad.l} y1={zero} x2={pad.l + plotW} y2={zero} />)}

          {categories.map((cat, ci) => {
            const catLabel = catLayout.labels[ci]!
            const start = (horizontal ? pad.t : pad.l) + ci * band + gap / 2
            // Раздельные накопители: положительные растут от нуля вверх,
            // отрицательные — вниз, и стопки не вычитаются друг из друга.
            let up = 0, down = 0
            const total = totals[ci] ?? 0
            return (
              <g key={cat}>
                {track && (() => {
                  const tone = toneAt?.(ci)
                  const cls = ['ds-bar__track', tone && `ds-bar__track--${tone}`]
                    .filter(Boolean).join(' ')
                  return horizontal
                    ? <rect className={cls} x={pad.l} y={start} width={plotW} height={inner} rx={radius * k} />
                    : <rect className={cls} x={start} y={pad.t} width={inner} height={plotH} rx={radius * k} />
                })()}
                {highlightIndex === ci && (horizontal
                  ? <rect className="ds-bar__mark" x={pad.l} y={start} width={plotW} height={inner} rx={radius * k} />
                  : <rect className="ds-bar__mark" x={start} y={pad.t} width={inner} height={plotH} rx={radius * k} />)}
                {axis && (horizontal
                  ? (
                    <text className="ds-bar__axis" x={pad.l - CAT_GAP * k} y={start + inner / 2 + 3 * k} textAnchor="end">
                      {catLabel.text}
                      {catLabel.cut && <title>{cat}</title>}
                    </text>
                  )
                  : (() => {
                    const lab = vCat!.labels[ci]!
                    const cx = start + inner / 2
                    return (
                      <text
                        className="ds-bar__axis"
                        x={cx}
                        y={catBaseline}
                        textAnchor={vCat!.rotated ? 'end' : 'middle'}
                        // Поворот вокруг САМОЙ риски: конец подписи остаётся у
                        // своей категории, а хвост уходит вниз-влево, в поле.
                        transform={vCat!.rotated ? `rotate(-${ROT_DEG} ${cx} ${catBaseline})` : undefined}
                      >
                        {lab.text}
                        {lab.cut && <title>{cat}</title>}
                      </text>
                    )
                  })())}

                {visible.map((s, si) => {
                  const v = s.values[ci] ?? 0
                  const up0 = up, down0 = down
                  // Столбец занимает отрезок значений [from, to]: от нуля в
                  // группе, от края своей половины стопки — в стопке.
                  const from = stacked ? (v >= 0 ? up0 : down0) : 0
                  const to = from + v
                  if (stacked) { if (v >= 0) up = to; else down = to }
                  const a = at(from), b = at(to)
                  const l = Math.abs(b - a)
                  const along = Math.min(a, b)
                  const across = (stacked ? 0 : si * barW) + start
                  const x = horizontal ? along : across
                  const y = horizontal ? across : along
                  // Внутри стопки скругляется только внешний сегмент своей
                  // половины — остальные примыкают к соседям вплотную.
                  const outer = !stacked || !visible.slice(si + 1).some((o) => {
                    const w = o.values[ci] ?? 0
                    return v >= 0 ? w > 0 : w < 0
                  })
                  const side: BarSide = !outer ? 'none'
                    : horizontal ? (v >= 0 ? 'right' : 'left') : (v >= 0 ? 'top' : 'bottom')
                  return (
                    <g key={s.id}>
                      <path
                        className={['ds-bar__rect', toneAt?.(ci) && `ds-bar__bar--${toneAt(ci)}`]
                          .filter(Boolean).join(' ')}
                        d={barPath(
                          x, y,
                          horizontal ? l : barW,
                          horizontal ? barW : l,
                          radius, side,
                        )}
                        style={{ fill: toneAt?.(ci) ? 'var(--ds-bar-tone)' : colors.get(s.id) }}
                      >
                        <title>{`${s.label}, ${cat}: ${fmt(v)}`}</title>
                      </path>
                      {valueLabels && !stacked && (
                        <text
                          className="ds-bar__value"
                          x={horizontal
                            ? (v >= 0 ? x + l + 4 * k : x - 4 * k)
                            : x + barW / 2}
                          y={horizontal
                            ? y + barW / 2 + 3 * k
                            : (v >= 0 ? y - 4 * k : y + l + 10 * k)}
                          textAnchor={horizontal ? (v >= 0 ? 'start' : 'end') : 'middle'}
                        >{fmt(v)}</text>
                      )}
                    </g>
                  )
                })}

                {valueLabels && stacked && visible.length > 0 && (() => {
                  // Итог подписывается у внешнего края той половины, куда
                  // склоняется сумма — иначе он повис бы посреди стопки.
                  const edge = at(total >= 0 ? up : down)
                  return (
                    <text
                      className="ds-bar__value"
                      x={horizontal
                        ? (total >= 0 ? edge + 4 * k : edge - 4 * k)
                        : start + inner / 2}
                      y={horizontal
                        ? start + inner / 2 + 3 * k
                        : (total >= 0 ? edge - 4 * k : edge + 10 * k)}
                      textAnchor={horizontal ? (total >= 0 ? 'start' : 'end') : 'middle'}
                    >{fmt(total)}</text>
                  )
                })()}
              </g>
            )
          })}

          {/* Пустое поле называется словами: без подписи оно неотличимо от
              «данных нет», а причина — нажатые чипы легенды под графиком. */}
          {allHidden && !spark && (
            <text
              className="ds-bar__empty"
              x={pad.l + plotW / 2}
              // Горизонтальные линии сетки есть только у вертикальной ориентации.
              y={grid && !horizontal ? emptyCaptionY(ticks.map(at), pad.t, pad.t + plotH) : pad.t + plotH / 2}
              textAnchor="middle"
              dominantBaseline="middle"
            >{t['chart.allHidden']}</text>
          )}
        </svg>
      </div>

      {series.length > 1 && !spark && (
        <ChartLegend block="ds-bar" series={series} colors={colors} hidden={hidden} onToggle={toggle} />
      )}
    </div>
  )
}
