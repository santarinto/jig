/**
 * Развёртка: чистая половина (DS-219).
 *
 * Приёмка глазами тратила около сорока процентов кругов на механику —
 * навигацию, чтение геометрии, выписывание одного и того же в каждый промт.
 * Страница `sweep.html` делает ОДИН цикл по случаям × темам × шкалам × ширинам
 * × целям и возвращает матрицу одним ответом. Здесь — то, что от браузера не
 * зависит: разбор задания, оценка инвариантов, сводка. Вынесено ради проверки:
 * в jsdom геометрии нет, а ошибка в оценке инварианта (не та ось, не тот
 * сосед) дала бы правдоподобный зелёный отчёт.
 *
 * ИНВАРИАНТЫ ВМЕСТО ПИКСЕЛЕЙ. Точное число привязано к машине: 0.26 px,
 * на объяснение которых ушла часть прогона, оказались округлением рамок при
 * `devicePixelRatio` 1.15. Поэтому отчёт отвечает на «держится ли
 * отношение» — `h >= 24`, `h@1.5 > h@1`, «после > до», «превью == живой ±
 * допуск», — а числа кладёт рядом, для адреса, а не для вердикта.
 *
 * Не гейт и в `check` не входит: гейт ходит своим headless по статическим
 * превью (`make measure`), развёртка — по живым кадрам в браузере владельца.
 */

export type Theme = 'light' | 'dark'
export type Axis = 'scale' | 'width' | 'theme'

/** Числовые показания одной цели в одной ячейке. */
export type Metric = 'w' | 'h' | 'hBefore' | 'wBefore' | 'hPreview' | 'wPreview'

export interface Target {
  /** Имя в отчёте. */
  name: string
  /** Селектор внутри документа кадра; берётся первый видимый. */
  selector: string
  /**
   * CSS, снимающий пол ИНЛАЙНОМ для замера «до» (например, `min-height: 0`).
   * Ставится на найденный узел `style`-атрибутом, замер, снимается.
   */
  before?: string
  /** Адрес превью (`/previews/x.html`) — тот же селектор меряется и там. */
  preview?: string
}

export type Invariant =
  | { metric: Metric; min: number }
  | { metric: Metric; max: number }
  /** Больше на большем значении оси при прочих равных. */
  | { metric: Metric; grows: 'scale' | 'width' }
  /** Равно между соседями по оси при прочих равных, с допуском. */
  | { metric: Metric; same: Axis; tol: number }
  /** `metric` строго больше `than` в той же ячейке. */
  | { metric: Metric; gt: Metric }
  /** `metric` равно `as` в той же ячейке, с допуском. */
  | { metric: Metric; eq: Metric; tol: number }
  /** Документ кадра не прокручивается вбок. */
  | { fits: true }
  /** Все четыре угла цели попадают в неё саму (ничего не перекрывает). */
  | { hit: true }

export interface SweepSpec {
  c: string
  cases: string[]
  themes?: Theme[]
  scales?: number[]
  widths: number[]
  targets: Target[]
  invariants?: Invariant[]
  /**
   * Ожидание после смены ширины, мс. По умолчанию 0: CSS-раскладке ожидание
   * не нужно, `offsetWidth` форсирует её синхронно (DS-282). Ненулевое
   * нужно только компонентам, чью раскладку считает JS по `ResizeObserver`.
   */
  settleMs?: number
}

export interface Cell {
  c: string
  caseId: string
  theme: Theme
  scale: number
  width: number
  target: string
  found: boolean
  w?: number
  h?: number
  wBefore?: number
  hBefore?: number
  wPreview?: number
  hPreview?: number
  /** Все четыре угла попадают в цель. */
  hit?: boolean
  /** `scrollWidth > clientWidth` у документа кадра. */
  overflow: boolean
  fg?: string
  bg?: string
}

export interface Violation {
  rule: string
  at: string
  got: string
  /** Насколько далеко от нормы — для «худшего»; больше = хуже. */
  miss: number
}

export const DEFAULT_THEMES: Theme[] = ['light', 'dark']
export const DEFAULT_SCALES = [1]

/**
 * Проверить задание ДО прогона. Пустой перечень ширин или целей дал бы
 * пустую матрицу и ноль нарушений — зелёный отчёт о том, что ничего не
 * мерилось. Отказ называет поле.
 */
export function validateSpec(spec: SweepSpec): string[] {
  const errs: string[] = []
  if (!spec.c) errs.push('c: не задан компонент')
  if (!spec.cases?.length) errs.push('cases: пусто')
  if (!spec.widths?.length) errs.push('widths: пусто')
  if (!spec.targets?.length) errs.push('targets: пусто')
  for (const w of spec.widths ?? []) if (!(w > 0)) errs.push(`widths: ${w} не ширина`)
  for (const s of spec.scales ?? []) if (!(s > 0)) errs.push(`scales: ${s} не шкала`)
  const names = new Set<string>()
  for (const t of spec.targets ?? []) {
    if (names.has(t.name)) errs.push(`targets: имя ${t.name} дважды`)
    names.add(t.name)
  }
  for (const inv of spec.invariants ?? []) {
    const needs = 'metric' in inv ? [inv.metric, 'gt' in inv ? inv.gt : 'eq' in inv ? inv.eq : null] : []
    for (const m of needs) {
      if ((m === 'hBefore' || m === 'wBefore') && !spec.targets.some((t) => t.before)) {
        errs.push(`invariants: ${m} без единой цели с before`)
      }
      if ((m === 'hPreview' || m === 'wPreview') && !spec.targets.some((t) => t.preview)) {
        errs.push(`invariants: ${m} без единой цели с preview`)
      }
    }
  }
  return errs
}

const round = (n: number) => Math.round(n * 100) / 100
const where = (x: Cell, skip?: Axis) =>
  `${x.c}/${x.caseId} ${skip === 'theme' ? '{theme}' : x.theme} ${skip === 'scale' ? '×{scale}' : `×${x.scale}`} ${skip === 'width' ? '@{width}' : `@${x.width}`} ${x.target}`

/** Ключ ячейки без одной оси — соседи по этой оси делят его. */
function keyWithout(x: Cell, axis: Axis): string {
  return [x.caseId, x.target, axis === 'theme' ? '' : x.theme, axis === 'scale' ? '' : x.scale, axis === 'width' ? '' : x.width].join('|')
}

function ruleName(inv: Invariant): string {
  if ('fits' in inv) return 'fits'
  if ('hit' in inv) return 'hit'
  if ('min' in inv) return `${inv.metric} >= ${inv.min}`
  if ('max' in inv) return `${inv.metric} <= ${inv.max}`
  if ('grows' in inv) return `${inv.metric} растёт по ${inv.grows}`
  if ('same' in inv) return `${inv.metric} одинаково по ${inv.same} ±${inv.tol}`
  if ('gt' in inv) return `${inv.metric} > ${inv.gt}`
  return `${inv.metric} == ${inv.eq} ±${inv.tol}`
}

/**
 * Оценить инварианты на матрице. Ненайденная цель — отдельное нарушение, а
 * не пропуск: «узла нет» и «узел держит норму» в отчёте неотличимы, если
 * первое молча не считается.
 */
export function evaluate(cells: Cell[], invariants: Invariant[]): Violation[] {
  const out: Violation[] = []
  for (const x of cells) {
    if (!x.found) out.push({ rule: 'цель найдена', at: where(x), got: 'узла нет', miss: 1e9 })
  }
  const live = cells.filter((x) => x.found)
  for (const inv of invariants) {
    const rule = ruleName(inv)
    if ('fits' in inv) {
      // Переполнение — свойство ДОКУМЕНТА, а не цели: при трёх целях одна
      // прокрутка иначе считалась бы тремя нарушениями и раздувала сводку.
      const seen = new Set<string>()
      for (const x of cells) {
        const at = where({ ...x, target: '' }).trimEnd()
        if (x.overflow && !seen.has(at)) {
          seen.add(at)
          out.push({ rule, at, got: 'прокрутка вбок', miss: 1 })
        }
      }
      continue
    }
    if ('hit' in inv) {
      for (const x of live) if (x.hit === false) out.push({ rule, at: where(x), got: 'угол перекрыт', miss: 1 })
      continue
    }
    const val = (x: Cell, m: Metric) => x[m]
    if ('min' in inv || 'max' in inv) {
      for (const x of live) {
        const v = val(x, inv.metric)
        if (v === undefined) continue
        if ('min' in inv && v < inv.min) out.push({ rule, at: where(x), got: `${round(v)}`, miss: inv.min - v })
        if ('max' in inv && v > inv.max) out.push({ rule, at: where(x), got: `${round(v)}`, miss: v - inv.max })
      }
      continue
    }
    if ('gt' in inv || 'eq' in inv) {
      const other = 'gt' in inv ? inv.gt : inv.eq
      for (const x of live) {
        const a = val(x, inv.metric)
        const b = val(x, other)
        if (a === undefined || b === undefined) continue
        if ('gt' in inv && !(a > b)) out.push({ rule, at: where(x), got: `${round(a)} при ${other} ${round(b)}`, miss: b - a + 1 })
        if ('eq' in inv && Math.abs(a - b) > inv.tol) {
          out.push({ rule, at: where(x), got: `${round(a)} против ${round(b)}`, miss: Math.abs(a - b) })
        }
      }
      continue
    }
    const axis: Axis = 'grows' in inv ? inv.grows : inv.same
    const groups = new Map<string, Cell[]>()
    for (const x of live) {
      const k = keyWithout(x, axis)
      groups.set(k, [...(groups.get(k) ?? []), x])
    }
    for (const g of groups.values()) {
      if ('grows' in inv) {
        const s = [...g].sort((p, q) => (axis === 'scale' ? p.scale - q.scale : p.width - q.width))
        for (let i = 1; i < s.length; i++) {
          const a = val(s[i - 1]!, inv.metric)
          const b = val(s[i]!, inv.metric)
          if (a === undefined || b === undefined) continue
          if (!(b > a)) {
            const at = axis === 'scale' ? `×${s[i - 1]!.scale}→×${s[i]!.scale}` : `@${s[i - 1]!.width}→@${s[i]!.width}`
            out.push({ rule, at: `${where(s[i]!)} (${at})`, got: `${round(a)} → ${round(b)}`, miss: a - b + 1 })
          }
        }
      } else {
        const vs = g.map((x) => val(x, inv.metric)).filter((v): v is number => v !== undefined)
        if (vs.length < 2) continue
        const spread = Math.max(...vs) - Math.min(...vs)
        if (spread > inv.tol) {
          out.push({ rule, at: where(g[0]!, axis), got: `разброс ${round(spread)}`, miss: spread })
        }
      }
    }
  }
  return out
}

/**
 * Сводка одной строкой: «12 нарушений в 5 компонентах, худшее — …». Такая
 * лечится за вечер; «матрица красная» не лечится вовсе.
 */
export function summarize(cells: Cell[], violations: Violation[], live: boolean): string {
  const head = live ? '' : 'ВКЛАДКА СПИТ — наблюдатель не сработал, числа не о живом коде. '
  if (!cells.length) return `${head}пустая матрица: ничего не мерилось`
  if (!violations.length) return `${head}0 нарушений на ${cells.length} ячейках`
  const worst = [...violations].sort((a, b) => b.miss - a.miss)[0]!
  const cases = new Set(violations.map((v) => v.at.split(' ')[0]))
  return `${head}${violations.length} нарушений на ${cells.length} ячейках в ${cases.size} случаях, худшее — ${worst.rule}: ${worst.at} = ${worst.got}`
}
