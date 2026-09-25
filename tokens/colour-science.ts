/**
 * Колориметрия системы: контраст по WCAG, расстояние в CAM16-UCS, симуляция
 * дихромазии. ОДНА реализация на все проверки цвета (DS-181).
 *
 * ПОЧЕМУ МОДУЛЬ, А НЕ КОПИЯ В КАЖДОМ ГЕЙТЕ. До этой задачи вся машинка жила
 * внутри `chartPalette.test.ts` — единственного места, которому она тогда была
 * нужна. Второму читателю (словарь тонов, матрица пар, справочная страница)
 * оставалось скопировать двести строк, и дальше копии расходились бы молча:
 * матрицы Machado, поправленные в одном файле, оставили бы второй считать
 * по-старому, а числа в обоих выглядели бы одинаково правдоподобно. Ровно тот
 * класс дефекта, ради которого заведён эпик DS-247.
 *
 * ЧТО ЗДЕСЬ ЕСТЬ И ЧЕГО НЕТ. Здесь чистые функции над hex-строками: ни файлов,
 * ни DOM. Значения токенов подаются снаружи — из `tokens.css` в гейте, из
 * `getComputedStyle` на странице, — и это намеренно: страница-справка и гейт
 * обязаны считать одним кодом, а брать значения из разных мест, иначе страница
 * доказывает не то, что видит браузер.
 *
 * Есть ВТОРАЯ реализация контраста — `scripts/colour.mjs`. Она не дубль: та
 * работает над строками, снятыми с браузера (`rgb()`, `color(srgb …)`, альфа,
 * `opacity` предка), и её предмет — «цвет, каким его ВИДНО на экране». Здесь
 * предмет другой — объявленные значения токенов, всегда hex. Сводить их в одну
 * значило бы тащить разбор четырёх форматов в модуль, который их не встречает,
 * и наоборот.
 */

export type RGB = [number, number, number]
export type Vision = 'normal' | 'protan' | 'deutan' | 'tritan'

export const VISIONS: readonly Vision[] = ['normal', 'protan', 'deutan', 'tritan']

// ------------------------------------------------------------------ разбор

export function hex2rgb(h: string): RGB {
  let s = h.replace('#', '')
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(s)) {
    throw new Error(`colour-science: «${h}» не hex-цвет из шести знаков`)
  }
  const n = parseInt(s, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const srgb2lin = (c: number): number => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}
const lin2srgb = (c: number): number => {
  const v = Math.min(1, Math.max(0, c))
  return (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255
}

export const hex2lin = (h: string): RGB => hex2rgb(h).map(srgb2lin) as RGB
export const lin2hex = (l: RGB): string =>
  '#' + l.map((c) => Math.round(lin2srgb(c)).toString(16).padStart(2, '0')).join('').toUpperCase()

const mat3 = (m: number[][], v: RGB): RGB =>
  [0, 1, 2].map((i) => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]) as RGB

/**
 * Смешение в ЛИНЕЙНОМ пространстве — так же, как это делает `color-mix(in srgb …)`
 * в chromium. Смешать гамма-кодированные значения — частая ошибка, и она даёт
 * правдоподобно выглядящий и НЕВЕРНЫЙ тинт: у 12% примеси разница доходит до
 * нескольких единиц L*, то есть ровно того порядка, который мы и меряем.
 */
export const mix = (a: string, b: string, part: number): string => {
  if (!(part >= 0 && part <= 1)) throw new Error(`colour-science: доля «${part}» вне 0–1`)
  const A = hex2lin(a)
  const B = hex2lin(b)
  return lin2hex([0, 1, 2].map((i) => A[i] * part + B[i] * (1 - part)) as RGB)
}

// ----------------------------------------------------------------- контраст

export function relLuminance(h: string): number {
  const [r, g, b] = hex2lin(h)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Контраст двух цветов по WCAG 2.x. */
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

// -------------------------------------------------------------- CAM16-UCS

const M_RGB2XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
]

const WP: RGB = [95.047, 100, 108.883]

const hex2xyz = (h: string): RGB => mat3(M_RGB2XYZ, hex2lin(h)).map((c) => c * 100) as RGB

const M16 = [
  [0.401288, 0.650173, -0.051461],
  [-0.250268, 1.204414, 0.045854],
  [-0.002079, 0.048952, 0.953127],
]

/**
 * Условия просмотра. La — адаптирующая яркость, Yb — яркость фона.
 * У тёмной темы они СВОИ: экран в среднем темнее, глаз адаптирован ниже,
 * окружение темнее стимула. Проверено на палитре серий, что вывод от этого
 * выбора не зависит — при одинаковых условиях для обеих тем те же пары
 * остаются худшими, числа гуляют на ±0.3. Условия здесь ради честности модели,
 * а не ради результата.
 */
export class Viewing {
  readonly c: number
  readonly Nc: number
  readonly D_RGB: RGB
  readonly F_L: number
  readonly n: number
  readonly z: number
  readonly N_bb: number
  readonly A_w: number

  constructor(La: number, Yb: number, surround: 'average' | 'dim') {
    const [F, c, Nc] = surround === 'average' ? [1.0, 0.69, 1.0] : [0.9, 0.59, 0.9]
    this.c = c
    this.Nc = Nc
    const RGB_w = mat3(M16, WP)
    const D = Math.min(1, Math.max(0, F * (1 - (1 / 3.6) * Math.exp((-La - 42) / 92))))
    this.D_RGB = RGB_w.map((w) => (D * WP[1]) / w + 1 - D) as RGB
    const k = 1 / (5 * La + 1)
    this.F_L = 0.2 * k ** 4 * (5 * La) + 0.1 * (1 - k ** 4) ** 2 * Math.cbrt(5 * La)
    this.n = Yb / WP[1]
    this.z = 1.48 + Math.sqrt(this.n)
    this.N_bb = 0.725 * Math.pow(1 / this.n, 0.2)
    const aw = RGB_w.map((w, i) => this.adapt(this.D_RGB[i] * w))
    this.A_w = (2 * aw[0] + aw[1] + aw[2] / 20 - 0.305) * this.N_bb
  }

  adapt(v: number): number {
    const t = Math.pow((this.F_L * Math.abs(v)) / 100, 0.42)
    return Math.sign(v) * ((400 * t) / (t + 27.13)) + 0.1
  }
}

/** Условия просмотра для светлой и тёмной темы — одни на все гейты цвета. */
export const VIEWING = {
  light: new Viewing(20, 20, 'average'),
  dark: new Viewing(6, 20, 'dim'),
} as const

export type ThemeName = keyof typeof VIEWING

/** (J', a', b') в CAM16-UCS. */
export function ucs(h: string, vc: Viewing): RGB {
  const RGB = mat3(M16, hex2xyz(h))
  const [Ra, Ga, Ba] = RGB.map((v, i) => vc.adapt(vc.D_RGB[i] * v))
  const a = Ra - (12 * Ga) / 11 + Ba / 11
  const b = (Ra + Ga - 2 * Ba) / 9
  const hr = Math.atan2(b, a)
  const e_t = 0.25 * (Math.cos(hr + 2) + 3.8)
  const A = (2 * Ra + Ga + Ba / 20 - 0.305) * vc.N_bb
  const J = 100 * Math.pow(Math.max(A, 0) / vc.A_w, vc.c * vc.z)
  const den = Ra + Ga + (21 * Ba) / 20 + 0.305
  const t = den === 0 ? 0 : ((50000 / 13) * vc.Nc * vc.N_bb * e_t * Math.hypot(a, b)) / den
  const C = Math.pow(t, 0.9) * Math.sqrt(J / 100) * Math.pow(1.64 - Math.pow(0.29, vc.n), 0.73)
  const M = C * Math.pow(vc.F_L, 0.25)
  const Jp = (1.7 * J) / (1 + 0.007 * J)
  const Mp = Math.log(1 + 0.0228 * M) / 0.0228
  return [Jp, Mp * Math.cos(hr), Mp * Math.sin(hr)]
}

/** ΔE' CAM16-UCS. Порог различения (JND) — около 1. */
export function deltaE(a: string, b: string, vc: Viewing): number {
  const A = ucs(a, vc)
  const B = ucs(b, vc)
  return 1.41 * Math.pow(Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]), 0.63)
}

/**
 * Угол тона CAM16 в градусах, [0, 360). `ucs` уже раскладывает M' на
 * (a' = M'·cos hr, b' = M'·sin hr) — M' неотрицателен (лог от неотрицательной
 * колориметрической переменной), так что atan2(b', a') восстанавливает тот же
 * hr без повторного вывода формулы. Своя функция, а не инлайн на месте
 * вызова, ровно потому, что «сдвиг тона между темами» и «ширина полосы
 * светлоты» (JIG-12) читают именно её, и копия расползлась бы, как машинка
 * до DS-181.
 */
export function hueDeg(h: string, vc: Viewing): number {
  const [, a, b] = ucs(h, vc)
  const deg = (Math.atan2(b, a) * 180) / Math.PI
  return (deg + 360) % 360
}

// ------------------------------------------------------------- дихромазия

/**
 * Machado, Oliveira & Fernandes 2009, severity 1.0. Матрицы действуют в
 * ЛИНЕЙНОМ RGB — как в оригинальной статье. Применить их к гамма-кодированным
 * значениям (частая ошибка в реализациях) значит получить правдоподобно
 * выглядящий и неверный результат.
 */
export const CVD: Record<Exclude<Vision, 'normal'>, number[][]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
}

export const simulate = (h: string, v: Vision): string =>
  v === 'normal'
    ? h.toUpperCase()
    : lin2hex(mat3(CVD[v], hex2lin(h)).map((c) => Math.min(1, Math.max(0, c))) as RGB)

/**
 * Худшее расстояние между двумя цветами по ВСЕМ четырём зрениям. Именно оно и
 * есть «различимы ли эти два» — слабое звено решает, а не среднее.
 */
export function worstDeltaE(a: string, b: string, vc: Viewing): { de: number; vision: Vision } {
  let worst = { de: Infinity, vision: 'normal' as Vision }
  for (const v of VISIONS) {
    const de = deltaE(simulate(a, v), simulate(b, v), vc)
    if (de < worst.de) worst = { de, vision: v }
  }
  return worst
}

// ------------------------------------------------------------------- OKLab

/**
 * OKLab (Ottosson, 2020) и OKLCH. Отдельное пространство от CAM16-UCS выше:
 * то моделирует условия просмотра (адаптация, окружение) и используется для
 * различимости, это — простая, не зависящая от условий шкала светлоты L,
 * нужная закону системы «цвет кодирует категорию, не величину» (JIG-12):
 * разброс L внутри `--ds-chart-*` читался бы как порядок, а измерить это
 * CAM16-UCS не берётся (J' там зависит от условий просмотра темы, то есть
 * два значения L для той же светлоты сравнивать поперёк тем нельзя).
 * Матрицы — из оригинальной статьи, действуют в ЛИНЕЙНОМ RGB, как и матрицы
 * Machado выше.
 */
const M_LIN2LMS = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
]

const M_LMS2OKLAB = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
]

/** [L, a, b]. L от 0 (чёрный) до 1 (белый), a/b — хроматические оси. */
export function oklab(h: string): RGB {
  const lin = hex2lin(h)
  const lms = mat3(M_LIN2LMS, lin)
  const lmsCbrt = lms.map((v) => Math.sign(v) * Math.pow(Math.abs(v), 1 / 3)) as RGB
  return mat3(M_LMS2OKLAB, lmsCbrt)
}

/** Светлота OKLCH — L из OKLab, та же величина, полярную форму не считаем зря. */
export const oklchL = (h: string): number => oklab(h)[0]

// ------------------------------------------------------------------ токены

/**
 * Значения цветовых токенов одной темы из текста `tokens.css`.
 *
 * Комментарии вырезаются ДО разбора: закомментированное объявление иначе
 * попадёт в карту и будет выглядеть действующим значением. Берутся только
 * hex-значения — `var(...)` и `color-mix(...)` пропускаются намеренно: их
 * настоящее значение известно лишь после каскада, и правдоподобная подстановка
 * здесь дала бы число не о том.
 */
export function parseThemeTokens(css: string, selector: string): Map<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`))
  if (!m) throw new Error(`colour-science: блок «${selector}» не найден в tokens.css`)
  const bare = m[1].replace(/\/\*[\s\S]*?\*\//g, '')
  const out = new Map<string, string>()
  for (const d of bare.matchAll(/--ds-([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    out.set(d[1], d[2].toUpperCase())
  }
  return out
}
