/**
 * Модель раскладки календаря: всё, что считается по событиям и не знает про
 * React. Вынесено тем же швом, что `Tree/model.ts`, и по той же причине —
 * НОВАЯ ПРОВЕРЯЕМОСТЬ: пересечения, сегменты суток и snap иначе проверялись бы
 * только через рендер и pointer-события (DS-29).
 *
 * Время здесь — локальная строка без зоны, `'2026-09-02T09:30'`. Это
 * КООРДИНАТА на сетке, а не момент времени: компонент ничего не конвертирует,
 * поэтому перехода на летнее время для него не существует, а сутки в 24 часа —
 * определение сетки, а не утверждение об астрономии.
 *
 * Отсюда запрет, который держится тестом под чужой TZ: никакой миллисекундной
 * арифметики. `+86400000` в зоне с переходом даёт 23 или 25 часов и уводит
 * день, оставаясь внутренне согласованным — то есть выглядит правильным.
 */

export interface EventCalendarEvent {
  id: string
  title: string
  /** `'2026-09-02T09:30'` — локальное время без зоны. */
  start: string
  /** Конец ИСКЛЮЧАЮЩИЙ: 09:00–10:00 и 10:00–11:00 не пересекаются. */
  end: string
  allDay?: boolean
  calendarId?: string
  readOnly?: boolean
}

/** Кусок события в пределах одних суток. `from`/`to` — минуты от полуночи. */
export interface DaySegment {
  eventId: string
  day: string
  from: number
  to: number
  continuesBefore: boolean
  continuesAfter: boolean
}

/** `'09:30'` → 570. Минуты от полуночи. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(':')
  return Number(h) * 60 + Number(m)
}

/** `'2026-09-02T09:30'` → `['2026-09-02', 570]`. */
export function splitLocal(iso: string): [day: string, minutes: number] {
  const [day, time = '00:00'] = iso.split('T')
  return [day!, minutesOf(time)]
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Сдвиг дня КАЛЕНДАРНЫЙ, через конструктор с полями. Не `+86400000`: в зоне с
 * переходом сутки длятся 23 или 25 часов, миллисекунды уводят день, и результат
 * остаётся правдоподобным. Тест под `TZ=America/New_York` держит именно это.
 */
export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(y!, m! - 1, d! + delta)
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

export function daySegments(event: EventCalendarEvent): DaySegment[] {
  const [startDay, from] = splitLocal(event.start)
  let [endDay, to] = splitLocal(event.end)
  // Конец ровно в полночь принадлежит ПРЕДЫДУЩИМ суткам: иначе событие
  // 22:00–00:00 порождало бы пустой сегмент на следующий день и рисовало бы
  // стрелку продолжения там, где ничего не продолжается.
  if (to === 0) { endDay = shiftDay(endDay, -1); to = 1440 }
  const out: DaySegment[] = []
  for (let day = startDay; day <= endDay; day = shiftDay(day, 1)) {
    const isFirst = day === startDay
    const isLast = day === endDay
    out.push({
      eventId: event.id,
      day,
      from: isFirst ? from : 0,
      to: isLast ? to : 1440,
      continuesBefore: !isFirst,
      continuesAfter: !isLast,
    })
  }
  return out
}

/** Сегмент, которому назначена колонка внутри своего кластера. */
export interface PlacedSegment extends DaySegment {
  column: number
  /** Колонок в КЛАСТЕРЕ, а не в моменте времени — см. спеку, решение 9. */
  columns: number
}

/**
 * Порядок сегментов: начало, затем длинное вперёд, затем `id`.
 *
 * Третий ключ не косметика. Без него два события с одинаковыми границами
 * различаются только позицией в массиве потребителя, а она ничем не закреплена:
 * ответ сервера в другом порядке молча меняет их колонками. Выглядит как
 * мигание при ререндере и ищется днями, потому что данные «те же».
 */
function bySegment(a: DaySegment, b: DaySegment): number {
  return a.from - b.from || b.to - a.to || (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0)
}

/**
 * Раскладка одних суток: сегменты, разбитые на кластеры связности, внутри
 * кластера — жадное назначение колонок.
 */
export function placeDay(events: EventCalendarEvent[], day: string): PlacedSegment[] {
  const segments = events
    .filter((e) => !inBand(e))
    .flatMap(daySegments)
    .filter((s) => s.day === day)
    .sort(bySegment)

  const out: PlacedSegment[] = []
  let cluster: PlacedSegment[] = []
  let clusterEnd = -1
  // Колонка помнит, до какой минуты она занята.
  let ends: number[] = []

  const flush = () => {
    for (const s of cluster) s.columns = ends.length
    out.push(...cluster)
    cluster = []
    ends = []
    clusterEnd = -1
  }

  for (const seg of segments) {
    if (seg.from >= clusterEnd && cluster.length) flush()
    let column = ends.findIndex((end) => end <= seg.from)
    if (column < 0) { column = ends.length; ends.push(seg.to) } else ends[column] = seg.to
    cluster.push({ ...seg, column, columns: 0 })
    clusterEnd = Math.max(clusterEnd, seg.to)
  }
  if (cluster.length) flush()
  return out
}

const MINUTES_IN_DAY = 1440

/**
 * Проценты, а не пиксели, и это не стилистика.
 *
 * Во-первых, раскладка перестаёт зависеть от `--ds-ui-scale`: 0.875, 1 и 1.15
 * дают одну и ту же геометрию. Во-вторых, она становится проверяемой в jsdom,
 * где layout не считается вовсе, но `style.top` читается как записан. На
 * пикселях модель проверялась бы только в браузере, то есть в `measure`.
 *
 * Четыре знака после запятой — 0,06 px на сутках высотой 1440 px.
 */
const pct = (value: number): string => `${Number((value * 100).toFixed(4))}%`

export interface SegmentBox {
  from: number
  to: number
  column: number
  columns: number
}

/**
 * Колонки кластера стоят РЯДОМ, долей `1/N`, без наезда (DS-328).
 *
 * До этого доля, ушедшая под `min-width`, превращалась в лесенку: события
 * наезжали, и угол каждого лежал под соседом — клик по нижнему краю одного
 * открывал другое. Пол ширины теперь держит не событие, а ТРЕК ДНЯ: он не уже
 * `N × min-w` (`dayColumns` ниже), поэтому доля не уходит под пол ни при какой
 * ширине контейнера — лишнее уезжает в горизонтальную прокрутку недели.
 */
export function segmentStyle(box: SegmentBox): { top: string; height: string; left: string; width: string } {
  return {
    top: pct(box.from / MINUTES_IN_DAY),
    height: pct((box.to - box.from) / MINUTES_IN_DAY),
    left: pct(box.column / box.columns),
    width: pct(1 / box.columns),
  }
}

/**
 * Сколько колонок нужно дню: наибольшее число колонок среди его кластеров, не
 * меньше одной. Из этого числа трек дня получает свой пол — плотный день шире
 * соседей, а соседи не платят за него шириной.
 */
export function dayColumns(placed: PlacedSegment[]): number {
  return placed.reduce((max, s) => Math.max(max, s.columns), 1)
}

/** К БЛИЖАЙШЕМУ шагу. Округление вниз уводит жест на пол-слота вверх. */
export function snapMinutes(minutes: number, slot: number): number {
  return Math.round(minutes / slot) * slot
}

/**
 * Что уходит в пояс: суточные и всё, что пересекает границу суток.
 *
 * Многодневное событие в сетке пришлось бы рисовать сегментами по колонкам, и
 * каждый сегмент конкурировал бы за ширину с обычными встречами того дня —
 * недельная поездка съедала бы половину рабочего дня, ничего о нём не говоря.
 */
function inBand(event: EventCalendarEvent): boolean {
  return !!event.allDay || daySegments(event).length > 1
}

export interface AllDayBar {
  eventId: string
  /** Индексы колонок диапазона, включительно с обеих сторон. */
  fromIndex: number
  toIndex: number
  lane: number
  continuesBefore: boolean
  continuesAfter: boolean
}

export interface AllDayBand {
  bars: AllDayBar[]
  /** По индексу дня: сколько полос не поместилось под потолок. */
  hidden: number[]
}

/**
 * Пояс суточных полос с ПОТОЛКОМ.
 *
 * Без потолка десять суточных событий выдавливают временную сетку за экран:
 * пояс растёт вверх, сетка уезжает вниз, и календарь перестаёт быть календарём.
 * Сверх потолка последняя строка отдаётся счётчику `+N ещё` — то есть видимых
 * полос на одну меньше, чем строк, и это цена честного «есть ещё».
 *
 * Своей прокрутки у пояса нет намеренно: полосы тянутся через колонки, и
 * прокрутка режет их там, где событие пересекает границу видимой части, —
 * читается как обрыв данных, а не как «прокрути».
 */
export function allDayBand(events: EventCalendarEvent[], days: string[], rows: number): AllDayBand {
  const first = days[0]!
  const last = days[days.length - 1]!
  const candidates = events.filter(inBand).map((event) => {
    const segments = daySegments(event)
    const startDay = segments[0]!.day
    const endDay = segments[segments.length - 1]!.day
    return {
      eventId: event.id,
      startDay,
      endDay,
      fromIndex: Math.max(0, days.indexOf(startDay < first ? first : startDay)),
      toIndex: days.indexOf(endDay > last ? last : endDay),
      continuesBefore: startDay < first,
      continuesAfter: endDay > last,
    }
  }).filter((c) => c.endDay >= first && c.startDay <= last)

  candidates.sort((a, b) =>
    a.fromIndex - b.fromIndex || b.toIndex - a.toIndex || (a.eventId < b.eventId ? -1 : 1))

  // Строка занята до колонки включительно; полоса встаёт в первую свободную.
  const laneEnds: number[] = []
  const placed = candidates.map((c) => {
    let lane = laneEnds.findIndex((end) => end < c.fromIndex)
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(c.toIndex) } else laneEnds[lane] = c.toIndex
    return { ...c, lane }
  })

  const overflow = laneEnds.length > rows
  const visibleLanes = overflow ? rows - 1 : rows
  const hidden = days.map(() => 0)
  for (const bar of placed) {
    if (bar.lane < visibleLanes) continue
    for (let i = bar.fromIndex; i <= bar.toIndex; i++) hidden[i]! += 1
  }

  return {
    bars: placed.filter((b) => b.lane < visibleLanes).map(({ startDay: _s, endDay: _e, ...bar }) => bar),
    hidden,
  }
}

/**
 * Недели месяца, каждая с понедельника. Неделя, а не «шесть строк всегда»:
 * фиксированные шесть строк дают месяцу пустую последнюю неделю, а высота
 * клетки при этом падает у всех месяцев ради одного.
 */
export function monthGrid(anchor: string): string[][] {
  const [y, m] = anchor.split('-').map(Number)
  const first = `${y}-${pad(m!)}-01`
  const [fy, fm, fd] = first.split('-').map(Number)
  const dow = (new Date(fy!, fm! - 1, fd!).getDay() + 6) % 7 // 0 = понедельник
  const lastOfMonth = new Date(y!, m!, 0).getDate()
  const last = `${y}-${pad(m!)}-${pad(lastOfMonth)}`

  const weeks: string[][] = []
  let day = shiftDay(first, -dow)
  do {
    const week: string[] = []
    for (let i = 0; i < 7; i++) { week.push(day); day = shiftDay(day, 1) }
    weeks.push(week)
  } while (weeks[weeks.length - 1]![6]! < last)
  return weeks
}

/**
 * Чипы клетки месяца. Потолок фиксированный, а не вычисленный из высоты:
 * замер потребовал бы `ResizeObserver`, который в фоновой вкладке не приходит
 * вовсе, оставаясь при этом внутренне согласованным на монтажных числах
 * (DS-126). Счётчик здесь — отдельная строка макета клетки, поэтому
 * чипов ровно `limit`, а не `limit - 1`, как в поясе.
 */
export function dayChips(
  events: EventCalendarEvent[],
  day: string,
  limit: number,
): { chips: string[]; hidden: number } {
  const ids = events
    .filter((e) => !inBand(e))
    .flatMap(daySegments)
    .filter((s) => s.day === day)
    .sort(bySegment)
    .map((s) => s.eventId)
  return { chips: ids.slice(0, limit), hidden: Math.max(0, ids.length - limit) }
}

/** Полоса у края, внутри которой начинается автопрокрутка, в пикселях. */
const EDGE = 24
/** Пикселей за кадр на самом краю. */
const MAX_STEP = 12

/**
 * Шаг автопрокрутки: положительный вниз, отрицательный вверх, ноль в середине.
 *
 * Вынесено из цикла намеренно. Сам цикл живёт на `requestAnimationFrame`,
 * который не доставляется ни в jsdom, ни в фоновой вкладке, — значит в нём не
 * должно быть ни одного РЕШЕНИЯ, только применение готового шага.
 */
export function autoScrollStep(pointerY: number, rect: { top: number; bottom: number }): number {
  const below = pointerY - (rect.bottom - EDGE)
  if (below > 0) return Math.round(Math.min(below, EDGE) / EDGE * MAX_STEP)
  const above = (rect.top + EDGE) - pointerY
  if (above > 0) return -Math.round(Math.min(above, EDGE) / EDGE * MAX_STEP)
  return 0
}
