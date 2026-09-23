/**
 * Оконный рендер списка с переменной высотой строк.
 *
 * Функции здесь чистые: ни DOM, ни React, ни собственного состояния. Высоты
 * приходят измеренными снаружи — вывести их формулой нельзя, и не только
 * из-за переноса по словам. Метрические токены DS объявлены как
 * `calc(<rem> * var(--ds-ui-scale))`, и портал этот масштаб крутит (1.15 / 1.3):
 * зашитая константа «строка = 20px» промахнулась бы на треть, показала не тот
 * кусок списка и заставила бы полосу прокрутки прыгать под рукой.
 *
 * Первый потребитель — `LogViewer`. Публичного API у модуля нет намеренно:
 * пока потребитель один, форма контракта не проверена, а `DataTable` подхватит
 * эти же функции, когда дойдёт до своей виртуализации.
 */

export interface WindowInput {
  /** Ключи строк по порядку. Идентичность даёт потребитель, компонент её не выдумывает. */
  keys: readonly string[]
  /** Измеренные высоты по ключу. Неизмеренная строка берёт `estimate`. */
  heights: ReadonlyMap<string, number>
  /** Высота ещё не измеренной строки. */
  estimate: number
  scrollTop: number
  viewportHeight: number
  /** Сколько строк дорисовать сверху и снизу сверх видимых (по умолчанию 4). */
  overscan?: number
}

export interface WindowSlice {
  /** Первая отрисовываемая строка. */
  start: number
  /** Первая строка ЗА окном (полуинтервал, как у `Array.slice`). */
  end: number
  /** Распорка над окном. */
  padTop: number
  /** Распорка под окном. */
  padBottom: number
  /** Полная высота списка. */
  total: number
}

/**
 * Срез окна под текущую прокрутку.
 *
 * Инвариант, ради которого всё написано:
 * `padTop + сумма высот строк [start, end) + padBottom === total`.
 * Как только равенство ломается, полоса прокрутки начинает жить своей жизнью,
 * и выглядит это как «скролл дёргается» без единой ошибки в консоли.
 */
export function windowSlice({
  keys, heights, estimate, scrollTop, viewportHeight, overscan = 4,
}: WindowInput): WindowSlice {
  const n = keys.length
  if (n === 0) return { start: 0, end: 0, padTop: 0, padBottom: 0, total: 0 }

  const heightAt = (i: number) => heights.get(keys[i]!) ?? estimate

  // Отрицательный scrollTop приходит с резинового скролла в macOS — это не
  // ошибка ввода, а нормальное состояние, и трактуется как «в самом верху».
  const top = Math.max(0, scrollTop)
  const bottom = top + Math.max(0, viewportHeight)

  let offset = 0
  let first = -1
  let last = -1
  let total = 0

  for (let i = 0; i < n; i++) {
    const h = heightAt(i)
    // Строка попадает в окно, если пересекается с видимой полосой.
    // Сравнение по `>` слева и `<` справа, а не `>=`/`<=`: строка, ровно
    // закончившаяся на верхней кромке, уже невидима.
    if (first === -1 && offset + h > top) first = i
    if (offset < bottom) last = i
    offset += h
    total += h
  }

  // Прокрутили за конец списка: видимых строк нет, но окно обязано остаться
  // внутри массива — иначе рендер получит срез из пустоты.
  if (first === -1) first = n - 1
  if (last < first) last = first

  const start = Math.max(0, first - overscan)
  // Нулевая высота контейнера приходит первым кадром, до измерения. Пустое
  // окно на нём означало бы, что мерить нечего, и список никогда бы не
  // раскрылся — заблокировал бы сам себя.
  const end = Math.min(n, Math.max(last + 1 + overscan, start + 1))

  let padTop = 0
  for (let i = 0; i < start; i++) padTop += heightAt(i)
  let padBottom = 0
  for (let i = end; i < n; i++) padBottom += heightAt(i)

  return { start, end, padTop, padBottom, total }
}

/**
 * На сколько нужно увеличить прокрутку, чтобы строка, бывшая первой, осталась
 * на прежнем месте после подгрузки старых записей в начало массива.
 *
 * Без компенсации список становится длиннее сверху, а смещение остаётся
 * прежним — и пользователя мгновенно уносит от того места, куда он смотрел.
 * Сделать это на своей стороне потребитель не может: у него нет доступа к
 * внутренностям окна.
 *
 * Возвращает 0, когда удерживать нечего или незачем: прежней первой строки в
 * новом массиве нет (переключили воркера, сменили фильтр — это другой список,
 * и попытка удержать увела бы в произвольное место), либо она по-прежнему
 * первая (дописали снизу), либо один из массивов пуст.
 */
export function prependShift(
  prevKeys: readonly string[],
  nextKeys: readonly string[],
  heights: ReadonlyMap<string, number>,
  estimate: number,
): number {
  const anchor = prevKeys[0]
  if (anchor === undefined || nextKeys.length === 0) return 0

  const at = nextKeys.indexOf(anchor)
  if (at <= 0) return 0

  let shift = 0
  for (let i = 0; i < at; i++) shift += heights.get(nextKeys[i]!) ?? estimate
  return shift
}

/**
 * Сумма высот строк до `index` (не включая его) — это `scrollTop`, при котором
 * строка `index` оказывается на верхней кромке окна. Измеренные строки берутся
 * из кэша, неизмеренные — по `estimate`: к моменту прокрутки строка попадёт в
 * окно, измерится, и следующий переход будет точнее, но и оценка (среднее
 * измеренных) для лога достаточна — строки одной высоты.
 *
 * Первый потребитель — навигация по совпадениям `LogViewer`: чтобы прыгнуть к
 * строке за пределами отрисованного окна, компонент считает её смещение и
 * ставит `scrollTop`. Другой путь — расширять окно до цели — рвёт
 * виртуализацию на далёких прыжках.
 */
export function offsetOf(
  keys: readonly string[],
  heights: ReadonlyMap<string, number>,
  estimate: number,
  index: number,
): number {
  const stop = Math.min(Math.max(0, index), keys.length)
  let offset = 0
  for (let i = 0; i < stop; i++) offset += heights.get(keys[i]!) ?? estimate
  return offset
}
