/**
 * Адрес кадра — полное описание того, что кадр рисует.
 *
 * ШИРИНЫ В АДРЕСЕ КАДРА НЕТ НАМЕРЕННО, и DS-345 этого не отменила.
 * Ширина кадра — это ширина его вьюпорта, и задаёт её тот, кто кадр держит:
 * оболочка размером <iframe>, отдельная вкладка размером окна. Стоит написать
 * ширину в адрес КАДРА — и она разойдётся с тем, что видит вьюпорт (то, что
 * читают `vw`, `position: fixed` и медиа-запросы по ширине), а вместе с ней
 * уедет вся правда, ради которой заведён кадр.
 *
 * В адресе ОБОЛОЧКИ ширина есть — `w`, и там она не врёт: оболочка кадр ДЕРЖИТ
 * и вьюпорт ему задаёт, так что поле описывает ровно то, чем оболочка
 * распорядится. Разбор один (`parseFrameUrl` читает `w` всегда), сборщика два,
 * и вся разница между ними в одном поле — `buildFrameUrl` его не пишет,
 * `buildShellUrl` пишет. Довод — у `buildShellUrl`.
 */
import { clampWidth, DEFAULT_WIDTH } from './frame-width.js'
import type { FrameDocMode, TextMode, Theme } from './protocol.js'

/**
 * Вид. `frame` — одна копия; `states` — четыре состояния в ряд (Задача 30);
 * `canvas` — несколько РАЗНЫХ компонентов в одном хосте (DS-128);
 * `grid` — несколько кадров с разными ширинами и темами (Задача 34).
 *
 * Граница проходит по ДОКУМЕНТАМ, а не по числу компонентов на экране, и
 * поэтому `canvas` стоит рядом со `states`, а не рядом с `grid`: и тот и
 * другой — много вещей ВНУТРИ одного документа, где между ними есть настоящие
 * отношения (сквозной таб-порядок, всплывающее поверх соседа, общая ширина).
 * Ровно это `FrameDocMode` в protocol.ts и называет.
 *
 * `grid` живёт ТОЛЬКО В ОБОЛОЧКЕ и до документа кадра не доезжает: сетка —
 * это несколько ДОКУМЕНТОВ, и держит их оболочка, а каждая ячейка внутри себя
 * обычный кадр (`mode: 'frame'`). Поле общее потому, что общий и адрес: у
 * оболочки и кадра один разбор и одна сборка, и заводить второй формат ради
 * одного значения — верный способ развести их при первой правке.
 *
 * Кадр, открытый по адресу с `mode=grid` напрямую, рисует себя обычным
 * кадром: сетку внутри одного документа он собрать не может, а притворяться
 * не должен.
 */
export type FrameMode = FrameDocMode | 'grid'

/** Все виды — один список, из которого и разбирается адрес (см. `modeOf`). */
const MODES: readonly FrameMode[] = ['frame', 'states', 'canvas', 'grid']

/**
 * Вид из адреса. Неизвестное значение — обычный кадр, а не отказ: адрес
 * приходит из чужих рук (старая ссылка, опечатка), и белый экран на `mode=абв`
 * — худший из возможных ответов.
 *
 * ТАБЛИЦЕЙ, А НЕ ЦЕПОЧКОЙ `?:`. Цепочка росла на каждый новый вид, и однажды
 * ветку в ней забудут — молча: забытый вид даст `frame`, то есть правдоподобную
 * картинку не про то, что просили. Список видов при этом уже есть, и второй
 * его копии в разборе быть не должно.
 */
const modeOf = (raw: string | null): FrameMode =>
  (MODES as readonly string[]).includes(raw ?? '') ? (raw as FrameMode) : 'frame'

export interface FrameState {
  c: string
  caseId: string
  sid: number
  theme: Theme
  scale: number
  data: string | null
  force: string | null
  mode: FrameMode
  /**
   * Набор текста предмета (DS-139, приёмка). В АДРЕСЕ, а не только в
   * состоянии оболочки: снимок с псевдолокалью должен воспроизводиться по
   * ссылке — иначе «вот тут ключ не подставился» останется словами, а скрипты
   * вроде `case-states.mjs` не смогут обойти дюжину случаев с включённой
   * псевдолокалью.
   */
  text: TextMode
  /**
   * Прицел включён. САМ ВЫБРАННЫЙ УЗЕЛ в адрес не едет и не поедет: он живая
   * ссылка на конкретную отрисовку, а не адрес. Записать его селектором
   * значило бы обещать восстановление, которого не будет — та же отрисовка
   * при следующем открытии может выглядеть иначе.
   */
  aim: boolean
  layers: string[]
  /** Переопределения крутилок. Значения строками — типизует их фикстура. */
  props: Record<string, string>
  /** Начинки позиций: id позиции → 'Component:case'. */
  slots: Record<string, string>
  /**
   * Ширина кадра, которую задаёт ОБОЛОЧКА (DS-345). `null` — умолчание.
   *
   * Поле живёт в общем состоянии по тому же доводу, что `mode: 'grid'`: у
   * оболочки и кадра один разбор и одна сборка, и второй формат ради одного
   * значения развело бы их при первой же правке. Кадр, получивший `w` в своём
   * адресе, его ИГНОРИРУЕТ — ширину ему задаёт тот, кто его держит.
   */
  w: number | null
}

export function parseFrameUrl(search: string): FrameState {
  const q = new URLSearchParams(search)
  const props: Record<string, string> = {}
  const slots: Record<string, string> = {}
  for (const [k, v] of q.entries()) {
    if (k.startsWith('p.')) props[k.slice(2)] = v
    else if (k.startsWith('s.')) slots[k.slice(2)] = v
  }
  return {
    c: q.get('c') ?? '',
    caseId: q.get('case') ?? '',
    sid: Number(q.get('sid') ?? '0'),
    theme: q.get('theme') === 'dark' ? 'dark' : 'light',
    scale: Number(q.get('scale') ?? '1') || 1,
    data: q.get('data'),
    force: q.get('force'),
    mode: modeOf(q.get('mode')),
    // Неизвестное значение — `ru`, тем же доводом, что у `mode`: адрес приходит
    // из чужих рук, и белый экран на `text=абв` был бы худшим ответом. Умолчание
    // здесь ещё и безопаснее прочих: `ru` — это то, что видит потребитель.
    text: q.get('text') === 'pseudo' ? 'pseudo' : 'ru',
    aim: q.get('aim') === '1',
    layers: (q.get('layers') ?? '').split(',').filter(Boolean),
    props,
    slots,
    // Нечисло — УМОЛЧАНИЕ, а не `clampWidth(NaN)`: тот отдаёт MIN_WIDTH, то
    // есть `w=абв` открыл бы кадр в 440 px — правдоподобную картинку не про то,
    // что просили. Тот же довод, что у `mode` и `text`: адрес приходит из чужих
    // рук. Число вне пределов, наоборот, ПРИЖИМАЕТСЯ: `w=99999` — это внятное
    // «как можно шире», а не опечатка.
    w: widthOf(q.get('w')),
  }
}

const widthOf = (raw: string | null): number | null => {
  if (raw === null || raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? clampWidth(n) : null
}

export function buildFrameUrl(s: FrameState): string {
  const q = new URLSearchParams()
  q.set('c', s.c)
  if (s.caseId) q.set('case', s.caseId)
  q.set('sid', String(s.sid))
  q.set('theme', s.theme)
  if (s.scale !== 1) q.set('scale', String(s.scale))
  if (s.data) q.set('data', s.data)
  if (s.force) q.set('force', s.force)
  // Умолчание в адрес не пишется — тем же правилом, что `scale`/`data`:
  // ссылка на обычный кадр не должна нести поле, которое ничего не меняет.
  if (s.mode !== 'frame') q.set('mode', s.mode)
  if (s.text !== 'ru') q.set('text', s.text)
  if (s.aim) q.set('aim', '1')
  if (s.layers.length) q.set('layers', s.layers.join(','))
  for (const [k, v] of Object.entries(s.props)) q.set(`p.${k}`, v)
  for (const [k, v] of Object.entries(s.slots)) q.set(`s.${k}`, v)
  return `?${q.toString()}`
}

/**
 * Адрес ОБОЛОЧКИ: тот же адрес плюс ширина кадра (DS-345).
 *
 * Зачем поле вообще. Оболочка сбрасывала ширину на умолчание при каждой
 * загрузке, и узкое состояние нельзя было открыть ссылкой. На приёмке 328/334
 * человек смотрел EventCalendar/week ПЕРЕХОДОМ 768 → 360 и получил порт на
 * понедельнике (sl 0), браузерный агент — ПРЯМОЙ ЗАГРУЗКОЙ 360 и получил порт
 * на среде (sl 160). Оба числа верны; расхождение нашлось только потому, что
 * человек ответил первым. Условия, в которых он смотрел, по ссылке не
 * воспроизводились вовсе.
 *
 * Почему отдельный сборщик, а не флаг у `buildFrameUrl` и не второй формат.
 * Разница между адресами ровно в одном поле, и она СОДЕРЖАТЕЛЬНА, а не
 * техническая: в адресе оболочки `w` описывает то, чем оболочка распорядится,
 * а в адресе кадра он был бы обещанием, которого кадр не держит, — скопировав
 * такую ссылку в отдельную вкладку, человек получил бы `w=360` и вьюпорт
 * шириной с окно. Второй ФОРМАТ (свой разбор, свои имена полей) развёл бы
 * оболочку и кадр при первой правке — ровно то, чего избегает `mode: 'grid'`;
 * булев флаг у одного сборщика прятал бы этот довод в аргумент вызова.
 *
 * Умолчание в адрес не пишется — тем же правилом, что `scale` и `mode`:
 * ссылка на кадр обычной ширины не несёт поля, которое ничего не меняет.
 */
export function buildShellUrl(s: FrameState): string {
  const base = buildFrameUrl(s)
  if (s.w === null || s.w === DEFAULT_WIDTH) return base
  return `${base}&w=${s.w}`
}

/**
 * АУДИТ АДРЕСА ЗАГРУЗКИ (JIG-40, решение спецификации п.2а/п.3) — рядом с
 * разбором, чтобы список ключей был ОДИН: второй список (в отдельном модуле)
 * разошёлся бы с `parseFrameUrl` при первом же новом поле `FrameState`.
 *
 * ОБЪЕКТОМ, А НЕ СТРОКОЙ. Ответ `jig.env()` уходит агенту через
 * `javascript_tool`, а тот режет ЦЕЛИКОМ любой ответ, содержащий адрес или
 * куки строкой вида `?a=b&c=d` (бриф, «BLOCKED: Cookie/query string data»).
 * Поэтому `asked`/`replaced`/`ignored` — только объекты и массивы объектов,
 * без единой сырой пары `ключ=значение`.
 *
 * Три способа опечатки, и это три разных списка, а не один флаг «не так»:
 * - `unknown` — ключа `parseFrameUrl` не читает вовсе (`wdth=768`);
 * - `replaced` — ключ известен, но значение не понято и упало в умолчание
 *   (`mode=gird` → `frame`) либо было прижато (`w=99999` → `MAX_WIDTH`);
 * - `ignored` — ключ известен и понят, но НЕ ДЕЙСТВУЕТ в этом документе:
 *   повтор («действует первое»), `w` в адресе кадра (ширину задаёт держатель),
 *   `mode=grid` в адресе кадра (сетка только в оболочке), `sid` в адресе
 *   оболочки (она всегда начинает новую сессию).
 */
export const FRAME_KEYS = ['c', 'case', 'sid', 'theme', 'scale', 'data', 'force', 'mode', 'text', 'aim', 'layers', 'w'] as const

export interface AddressAudit {
  of: 'shell' | 'frame'
  /** Пары адреса как пришли — ОБЪЕКТОМ: строка `a=b&c=d` режется расширением. */
  asked: Record<string, string>
  unknown: string[]
  replaced: { key: string; asked: string; used: string }[]
  ignored: { key: string; why: string }[]
}

const DEFAULT_SPELLING: Record<string, string> = { scale: '1', mode: 'frame', text: 'ru', aim: '0', w: String(DEFAULT_WIDTH) }
const NUMERIC = new Set(['scale', 'w', 'sid'])

export function auditAddress(search: string, of: 'shell' | 'frame'): AddressAudit {
  const q = new URLSearchParams(search)
  const state = parseFrameUrl(search)
  const canon = new URLSearchParams(buildShellUrl(state).slice(1))

  const asked: Record<string, string> = {}
  const unknown: string[] = []
  const replaced: { key: string; asked: string; used: string }[] = []
  const ignored: { key: string; why: string }[] = []
  const seen = new Set<string>()

  for (const [k, v] of q) {
    const already = seen.has(k)
    if (!already) asked[k] = v
    if (already) { ignored.push({ key: k, why: 'повтор — действует первое' }); continue }
    seen.add(k)
    if (k.startsWith('p.') || k.startsWith('s.')) continue
    if (!(FRAME_KEYS as readonly string[]).includes(k)) { unknown.push(k); continue }
    if (of === 'frame' && k === 'w') {
      ignored.push({ key: k, why: 'ширину кадру задаёт держатель (iframe или окно); в адресе кадра w не действует' })
      continue
    }
    if (of === 'frame' && k === 'mode' && v === 'grid') {
      ignored.push({ key: k, why: 'сетка живёт только в оболочке, кадр рисует себя обычным' })
      continue
    }
    if (of === 'shell' && k === 'sid') {
      ignored.push({ key: k, why: 'оболочка всегда начинает новую сессию кадра' })
      continue
    }
    const used = canon.get(k) ?? DEFAULT_SPELLING[k] ?? ''
    const same = NUMERIC.has(k) ? Number(v) === Number(used) : v === used
    if (!same) replaced.push({ key: k, asked: v, used })
  }

  return { of, asked, unknown, replaced, ignored }
}
