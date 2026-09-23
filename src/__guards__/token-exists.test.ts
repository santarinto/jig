import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join, dirname, relative } from 'node:path'

/**
 * Несуществующий `--ds-*` отказывает МОЛЧА (DS-102).
 *
 * `var(--ds-нет-такого)` не ошибка разбора: свойство становится невалидным на
 * этапе вычисления значения, объявление отбрасывается целиком, элемент рисуется
 * дальше. В консоли пусто, замер зелёный, картинка правдоподобная — и ровно
 * поэтому промах живёт годами. С фолбэком (`var(--ds-нет, var(--ds-border))`)
 * не видно вообще ничего: рисуется запасное, а заявленное именем свойство
 * отсутствует. Три таких сидели в дереве на момент написания гейта:
 * `--ds-border-subtle` в `Tree.css` (с фолбэком, потому и прожил), `--ds-space-0`
 * у `gap={0}` (тип обещал ступень, шкала её не объявляла) и `var(--ds-radius, 6px)`
 * в демо (имя верное, а фолбэк утверждал вдвое большее скругление).
 *
 * Промах не случайный: у нас ДВЕ схемы имён — числовая у отступов
 * (`--ds-space-1..8`) и именованная у радиуса и кегля (`--ds-radius-sm/md/pill`,
 * `--ds-fs-xs..2xl`). Кто только что написал `--ds-space-2`, пишет
 * `--ds-radius-2`. Схемы оставлены разными сознательно (довод — в `AGENTS.md`,
 * раздел design tokens), а держит их не внимательность, а этот гейт.
 */

const ROOT = resolve(__dirname, '../..')

/**
 * Область. Названа СПИСКОМ, а не «весь репозиторий», и посчитана ниже литералом:
 * утверждение «ни одной битой ссылки» стоит ровно столько, сколько площадь, по
 * которой оно проверено (`docs/writing-checks.md`, способ 7).
 *
 * `dist/` и `ds-bundle/` снаружи намеренно — производные от этих же исходников,
 * и битая ссылка попадёт туда только вместе с оригиналом. `node_modules` тоже.
 */
const REACH: [dir: string, exts: string[]][] = [
  ['src', ['.css', '.ts', '.tsx']],
  ['tokens', ['.ts']],
  ['previews', ['.html']],
  ['demo', ['.css', '.ts', '.tsx', '.html']],
  ['workbench', ['.css', '.ts', '.tsx']],
]

function collect(dir: string, exts: string[]): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...collect(p, exts))
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p)
  }
  return out
}

const rel = (f: string) => relative(ROOT, f).split('\\').join('/')

/**
 * Гейт исключает САМ СЕБЯ, и это не удобство. Ниже он проверяет детектор на
 * выдуманных строках — `var(--ds-accent, red)`, `var(--ds-space-${gap})`,
 * `--ds-surface-muted` в комментарии. Это ПРЕДМЕТ проверки, а не решение о стиле:
 * без них утверждения выше нельзя отличить от «регулярка ничего не находит».
 * Исключение выдано одному файлу поимённо и держится утверждением о площади: если
 * этот файл переедет, `rel(__filename)` переедет с ним, а вот исчезнувшие примеры
 * уронят тест детектора.
 */
const SELF = 'src/__guards__/token-exists.test.ts'

const FILES = REACH.flatMap(([d, exts]) => collect(resolve(ROOT, d), exts)).filter(
  (f) => rel(f) !== SELF,
)

/**
 * Комментарии вырезаются и у использований, и у объявлений — по разным причинам,
 * но обе обязательны.
 *
 * У использований: `var(--ds-foo)` в комментарии ничего не красит, запрещать его
 * значило бы запрещать разбор промаха в комментарии (этот файл именно этим и
 * занят абзацем выше). У ОБЪЯВЛЕНИЙ важнее: `tokens.css` обсуждает в комментариях
 * имена, которых нет («стояло `--ds-surface-muted:`»), и без вычистки такое имя
 * стало бы объявленным — гейт бы сам себе разрешил ровно тот промах, ради
 * которого написан.
 */
/**
 * Блочный комментарий заменяется НЕ одним пробелом, а собой же, где всё кроме
 * переводов строк стало пробелом. `lineOf` считает номер по УЖЕ вычищенному
 * тексту, и схлопнутая шапка уводит адрес ровно на своё число строк.
 *
 * Поймано на DS-189 (волна 6): гейт нашёл настоящий `var(--ds-font-xs)`
 * и напечатал `LogViewer.fixture.tsx:94`, а нарушение стояло на 134 — разница
 * 40, длина шапочного комментария файла. В этом дереве шапка есть почти у
 * каждого файла, то есть адрес врал ПОЧТИ ВСЕГДА и врал правдоподобно: номер
 * существует, файл верный, строка не та. Такой адрес хуже отсутствующего —
 * его читают вместо того, чтобы искать.
 *
 * Однострочная ветка (`//`) переводы строк не трогает и без этого: `.` не
 * матчит `\n`, а `$1` возвращает символ перед `//`.
 */
const blankKeepingLines = (m: string) => m.replace(/[^\n]/g, ' ')

const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, blankKeepingLines).replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * Использование. Группа 2 разделяет случаи одним проходом:
 *   `)`      — простая ссылка,
 *   `,`      — ссылка с фолбэком,
 *   `${`     — имя собирается из шаблона (проверяется отдельно, см. DYNAMIC),
 *   `'"`+обр — ссылка ОБОРВАНА концом строкового литерала.
 * Имя после `--ds-` может быть пустым (`var(--ds-${name})`), поэтому `*`, не `+`.
 *
 * Четвёртый случай добавлен ревью и был слепой зоной у первой редакции: пять мест
 * пишут `expect(style).toContain('calc(200px * var(--ds-ui-scale')` — имя полное,
 * а закрывающей скобки в литерале нет, потому что это ФРАГМЕНТ для сравнения.
 * Регулярка, требовавшая разделителя, их не видела и молчала об этом — способ 1
 * из `docs/writing-checks.md`, площадь меньше заявленной. Имя там настоящее и
 * обязано существовать наравне с остальными.
 */
const VAR_USE = /var\(\s*(--ds-[a-zA-Z0-9-]*)\s*(\$\{|,|\)|['"`])/g

/**
 * Объявление. Хвост `['"\]]*` — потому что в `.tsx` кастомное свойство объявляют
 * ключом объекта: `{ '--ds-badge-brand': brand }`, `{ ['--ds-tree-cols']: t }`.
 * Без него шов между `.tsx` и `.css` одного компонента читался бы как битая
 * ссылка, а `getPropertyValue('--ds-row-depth')` — где после имени идёт `)`, а не
 * `:` — объявлением НЕ считается и правильно.
 */
const VAR_DECL = /(--ds-[a-zA-Z0-9-]+)['"\]]*\s*:/g

const TOKENS_CSS = resolve(ROOT, 'tokens/tokens.css')

/** Токены системы: только `tokens/tokens.css`, только вне комментариев. */
const SYSTEM = new Set(
  [...strip(readFileSync(TOKENS_CSS, 'utf8')).matchAll(VAR_DECL)].map((m) => m[1]!),
)

/**
 * Локальные переменные-швы (`--ds-slider-fill`, `--ds-row-depth`, `--ds-tone`) —
 * не токены, объявляются самим компонентом. Область их видимости для гейта —
 * ПАПКА, а не всё дерево: глобальный союз пропустил бы опечатку, случайно
 * совпавшую с чужим именем (`--ds-heat-cell` из `Heatmap` в `Timeline.css`), и
 * тем самым перестал бы стеречь шов между `.tsx` и `.css` одного компонента —
 * а это как раз тот шов, где имена расходятся молча.
 */
const localByDir = new Map<string, Set<string>>()
for (const f of FILES) {
  const d = dirname(f)
  if (!localByDir.has(d)) localByDir.set(d, new Set())
  const bag = localByDir.get(d)!
  for (const m of strip(readFileSync(f, 'utf8')).matchAll(VAR_DECL)) bag.add(m[1]!)
}

interface Use {
  file: string
  line: number
  name: string
  kind: 'plain' | 'fallback' | 'dynamic'
}

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split('\n').length
}

const USES: Use[] = []
for (const f of FILES) {
  const src = strip(readFileSync(f, 'utf8'))
  for (const m of src.matchAll(VAR_USE)) {
    USES.push({
      file: f,
      line: lineOf(src, m.index!),
      name: m[1]!,
      // Обрыв литерала — такая же простая ссылка: фолбэка в ней нет по построению.
      kind: m[2] === '${' ? 'dynamic' : m[2] === ',' ? 'fallback' : 'plain',
    })
  }
}

/**
 * Сколько вхождений `var(--ds-` осталось в файле после вычистки комментариев —
 * грубо, без разбора имени. Сверяется с числом РАСПОЗНАННЫХ: расхождение и есть
 * слепая зона детектора, то есть площадь меньше заявленной (`docs/writing-checks.md`,
 * способ 1). Первая редакция гейта имела пять таких мест и молчала о них.
 */
function rawCount(src: string): number {
  return [...src.matchAll(/var\(\s*--ds-/g)].length
}

/**
 * Места, где `var(--ds-` намеренно НЕ ссылка, а форма записи внутри текста или
 * регулярки.
 *
 * `no-raw-hex` — `--ds-*` со звёздочкой в ТЕКСТЕ описания теста. Звёздочки нет в
 * алфавите имён, и добавлять её нельзя: `--ds-*` стало бы «несуществующим
 * токеном» в любом тексте.
 *
 * `colourPairs` (DS-181) — `var(--ds-([a-z0-9-]+))` внутри РЕГУЛЯРКИ,
 * которой гейт сочетаемости обходит листы компонентов и собирает, какой токен
 * стоит текстом, а какой фоном. Это не обращение к токену, а образец для поиска
 * обращений, и подставить туда настоящее имя нельзя по определению.
 *
 * Разрешение выдано файлам поимённо: список правится руками и виден в диффе, а
 * утверждение ниже держит его живым — сравнивая расхождение со списком, а не
 * пропуская всё, что на него похоже.
 */
const TEXT_NOT_REFERENCE = [
  'src/__guards__/no-raw-hex.test.ts',
  'tokens/colourPairs.test.ts',
]

const STATIC = USES.filter((u) => u.kind !== 'dynamic')

/**
 * Третья категория, кроме токена системы и локального шва: переменная, которую
 * система намеренно НЕ объявляет и ждёт снаружи. `--ds-orgbadge-brand` потребитель
 * ставит своим классом (`.bank-ozon { --ds-orgbadge-brand: var(--brand-ozon) }`) —
 * объявления в `tokens.css` нет и быть не должно, «бренд не задан» здесь
 * осмысленное состояние, а не пропущенная строка.
 *
 * Список поимённый и держится утверждением ниже: имя, появившееся в `tokens.css`,
 * делает разрешение мёртвым, а мёртвое разрешение выглядит как действующее и
 * тихо накрывает то, ради чего его не выдавали.
 */
const CONSUMER_VARS = ['--ds-orgbadge-brand']

/**
 * Четвёртая категория, и она про ОБЛАСТЬ ВИДИМОСТИ, а не про разрешение
 * (DS-156).
 *
 * Папочная область выше написана ради шва между `.tsx` и `.css` ОДНОГО
 * компонента: там опечатка, случайно совпавшая с чужим именем, — настоящая
 * опечатка. У превью этого шва нет: страница подключает `src/styles.css`
 * целиком, то есть в браузере ей действительно виден каждый `--ds-*`,
 * объявленный где угодно в замыкании `@import`. Требовать от неё объявления в
 * `previews/` значило бы требовать объявить заново то, что уже объявил
 * компонент, — и ровно это встало поперёк, когда превью EventCalendar
 * перестали писать руками: снимок компонента несёт инлайновый
 * `calc(3 * var(--ds-eventcal-lane))`, а `lane` объявлен в
 * `EventCalendar.css`, в другой папке.
 *
 * Тот же довод, по которому `preview-classes` берёт истину о классах ИЗ
 * ЗАМЫКАНИЯ `@import`, а не из папки: лист, который подключает превью, и есть
 * его область видимости. Послабление узкое (только `previews/`) и держится
 * утверждениями ниже: замыкание непусто, и разрешение живое — им кто-то
 * действительно пользуется, иначе оно мёртвое и его надо снимать.
 */
const STYLES_ENTRY = resolve(ROOT, 'src/styles.css')

function importClosure(entry: string, seen = new Set<string>()): string[] {
  if (seen.has(entry) || !existsSync(entry)) return []
  seen.add(entry)
  const src = strip(readFileSync(entry, 'utf8'))
  const out = [entry]
  for (const m of src.matchAll(/@import\s+(?:url\()?["']([^"']+)["']\)?/g)) {
    out.push(...importClosure(resolve(dirname(entry), m[1]!), seen))
  }
  return out
}

const SHEETS = importClosure(STYLES_ENTRY)
const SHEET_VARS = new Set<string>()
for (const f of SHEETS) {
  for (const m of strip(readFileSync(f, 'utf8')).matchAll(VAR_DECL)) SHEET_VARS.add(m[1]!)
}

const inPreview = (file: string) => rel(file).startsWith('previews/')

function known(u: Use): boolean {
  return (
    SYSTEM.has(u.name) ||
    CONSUMER_VARS.includes(u.name) ||
    (localByDir.get(dirname(u.file))?.has(u.name) ?? false) ||
    (inPreview(u.file) && SHEET_VARS.has(u.name))
  )
}

// ── Места, где имя собирается из шаблона ─────────────────────────────────────

/**
 * Динамическое имя — та же дыра, только её не видно грепом. `chartSeriesVar`
 * строит `--ds-chart-${i+1}`: подними `CHART_SERIES_COUNT` до 10, не тронув
 * `tokens.css`, и две серии станут бесцветными без единой ошибки. Поэтому реестр
 * перечисляет ВСЕ такие места поимённо, а отдельное утверждение сверяет реестр с
 * деревом: новое место, не внесённое сюда, обязано краснеть, иначе гейт молча
 * теряет площадь (`docs/writing-checks.md`, способ 1).
 *
 * Диапазон читается ИЗ ИСХОДНИКА, а не переписывается сюда руками: предмет
 * проверки — согласие типа со шкалой, а список, скопированный в тест, согласен
 * сам с собой и остаётся зелёным ровно тогда, когда тип разъехался.
 */
interface DynamicSite {
  file: string
  /** Что стоит до `${` и после неё; имя = prefix + значение + suffix. */
  prefix: string
  suffix: string
  /** Значения, которые может принять интерполяция. `null` — статически неизвестны. */
  values: ((src: string) => string[]) | null
  why: string
}

const DYNAMIC: DynamicSite[] = [
  {
    file: 'src/components/Stack/Stack.tsx',
    prefix: '--ds-space-',
    suffix: '',
    values: (src) => [...src.match(/export type StackGap =([^\n]+)/)![1]!.matchAll(/\d+/g)].map((m) => m[0]),
    why: 'gap={n} подставляет шаг шкалы в имя; тип StackGap и есть перечень имён',
  },
  {
    file: 'src/components/Grid/Grid.tsx',
    prefix: '--ds-space-',
    suffix: '',
    values: () => {
      const stack = readFileSync(resolve(ROOT, 'src/components/Stack/Stack.tsx'), 'utf8')
      return [...stack.match(/export type StackGap =([^\n]+)/)![1]!.matchAll(/\d+/g)].map((m) => m[0])
    },
    why: 'Grid импортирует StackGap у Stack — источник диапазона тот же',
  },
  {
    file: 'tokens/chartPalette.ts',
    prefix: '--ds-chart-',
    suffix: '',
    values: (src) =>
      Array.from({ length: Number(src.match(/CHART_SERIES_COUNT = (\d+)/)![1]) }, (_, i) => String(i + 1)),
    why: 'chartSeriesVar(i) строит имя серии; счётчик и палитра в tokens.css обязаны совпадать',
  },
  {
    file: 'demo/palette-lab.tsx',
    prefix: '--ds-chart-',
    suffix: '',
    values: () => {
      const cp = readFileSync(resolve(ROOT, 'tokens/chartPalette.ts'), 'utf8')
      return Array.from({ length: Number(cp.match(/CHART_SERIES_COUNT = (\d+)/)![1]) }, (_, i) => String(i + 1))
    },
    why: 'стенд палитры (DS-122) подменяет --ds-chart-N по номеру серии; диапазон тот же, что у chartSeriesVar — CHART_SERIES_COUNT',
  },
  {
    file: 'src/components/Badge/Badge.fixture.tsx',
    prefix: '--ds-chart-',
    suffix: '',
    values: (src) => {
      const m = src.match(/(\[[\d,\s]+\])\.map\(\(n\) => \([\s\S]*?<Badge key=\{n\} brand=\{`var\(--ds-chart-\$\{n\}\)`\}/)
      return [...m![1]!.matchAll(/\d+/g)].map((mm) => mm[0])
    },
    why: 'кейс brand-token красит var(--ds-chart-N) по индексу из литерала-источника, не по восьми номерам, переписанным сюда руками',
  },
  {
    file: 'demo/sidenav-lab.tsx',
    prefix: '--ds-',
    suffix: '',
    values: (src) => [...src.match(/navBg:\s*('[^\n]+)/)![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!),
    why: 'лаборатория подставляет выбранный фон панели; варианты перечислены типом Cfg',
  },
  {
    file: 'tokens/badgeTintContrast.test.ts',
    prefix: '--ds-',
    suffix: '-fg',
    values: (src) => [...src.match(/const TONES =([^\n]+)/)![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!),
    why: 'имя тона в тексте ошибки; неверное имя тут врёт читателю, а не браузеру',
  },
  {
    file: 'tokens/tokens.ts',
    prefix: '--ds-',
    suffix: '',
    values: null,
    why:
      'cssVar(name) — публичный хелпер, имя приходит от потребителя и статически ' +
      'неизвестно. Держится не гейтом, а тем, что имя у потребителя обязано ' +
      'существовать в его же tokens.css: grep -c -- "--ds-<имя>:" ' +
      'node_modules/@santarinto/jig/dist/tokens/tokens.css',
  },
]

/**
 * Пятая категория, и она не про необъявленный токен, а про то, что посылка гейта
 * («статическая ссылка var(--ds-*) есть УПОТРЕБЛЕНИЕ, и необъявленную браузер
 * отбросит молча») сюда не дотягивается: `var(--ds-chart-9)` в
 * `Badge.test.tsx` — не ссылка, которую что-то красит, а строка, которую
 * компонент ОБЯЗАН ОТВЕРГНУТЬ (индекс вне палитры 1..8). Объявить
 * `--ds-chart-9` в `tokens.css`, чтобы гейт замолчал, значило бы испортить
 * сам тест — тест тогда перестал бы проверять отказ.
 *
 * Список поимённый, узкий и САМОДОКАЗУЕМЫЙ — без этого исключение переживает
 * свою причину и однажды тихо прикроет НАСТОЯЩИЙ токен. Утверждения ниже держат
 * обе стороны: `known(u)` про запись обязано оставаться false (иначе кто-то
 * объявил `--ds-chart-9` по-настоящему, и запись больше не нужна — она уже
 * прикрывает живой токен, а не отсутствующий), а сама строка обязана
 * встречаться в дереве (иначе запись мертва — тот же довод, что у
 * `CONSUMER_VARS` ниже).
 */
interface RejectedValueSite {
  /** Путь ОТ КОРНЯ репозитория — сверяется с `rel(u.file)`, как у DYNAMIC. */
  file: string
  /** Строка-значение — то, что компонент обязан отвергнуть, а не принять. */
  name: string
  why: string
}

const REJECTED_VALUES: RejectedValueSite[] = [
  {
    file: 'src/components/Badge/Badge.test.tsx',
    name: '--ds-chart-9',
    why: 'отрицательный случай: девятого индекса в восьмицветной var(--ds-chart-N) нет, brand обязан отказать и дать neutral',
  },
]

function isRejectedValue(u: Use): boolean {
  return REJECTED_VALUES.some((r) => r.file === rel(u.file) && r.name === u.name)
}

/**
 * Исключение для фолбэка, и оно ровно одно. `--ds-ui-scale` — единственный токен,
 * чьё ОТСУТСТВИЕ предусмотрено: `calc(<n>px * var(--ds-ui-scale, 1))` уезжает в
 * inline-style и вычисляется там, где лист токенов может быть не подключён
 * (SSR, изолированный кадр, jsdom). Второе значение здесь — не догадка об имени,
 * а то же самое число, что объявлено в `tokens.css`, и утверждение ниже это
 * проверяет: разойдясь, фолбэк станет вторым источником правды о плотности.
 */
const FALLBACK_ALLOWED = '--ds-ui-scale'

/**
 * Пары «литерал → токен, у которого ровно это значение». Список ЯВНЫЙ, а не
 * выведенный из `tokens.css`: общее правило «любой литерал, совпавший с любым
 * токеном» покраснело бы на `0`, `1px` и `100%` — значениях, которые совпадают
 * с токенами по случайности, а не по смыслу (DS-119).
 *
 * Случай, из-за которого правило написано: `--ds-radius-pill: 999px` жил в
 * `tokens.css` и использовался ОДНИМ компонентом, а `Slider` и `Toggle` писали
 * `999px` числом. Визуально одно и то же; цена — что смена скругления пилюли
 * стала бы поиском по числу вместо одной правки. Ни один гейт этого не ловил:
 * `no-raw-hex` про цвета, `rem-units` про единицы, а этот проверял, что
 * УПОМЯНУТЫЙ токен существует, а не что вместо токена написали литерал.
 */
const LITERAL_INSTEAD_OF_TOKEN: Array<[literal: string, token: string]> = [
  ['999px', '--ds-radius-pill'],
]

describe('существование токена (--ds-*)', () => {
  it('каждая статическая ссылка var(--ds-*) объявлена — в tokens.css или в своей папке', () => {
    // REJECTED_VALUES исключён здесь же, точечно, а не влит в known(): это не
    // ещё одно место, где имя «объявлено», а поимённое признание, что запись —
    // отрицательный случай, а не ссылка. known() про такую запись обязан
    // оставаться false — это доказывает отдельный случай ниже.
    const offenders = STATIC.filter((u) => !known(u) && !isRejectedValue(u)).map(
      (u) => `${rel(u.file)}:${u.line} — var(${u.name})`,
    )
    expect(
      offenders,
      'имя не объявлено ни в tokens/tokens.css, ни рядом; браузер отбросит объявление молча:\n' +
        offenders.join('\n'),
    ).toEqual([])
  })

  it('переменные потребителя не объявлены системой — иначе разрешение мертво', () => {
    for (const name of CONSUMER_VARS) {
      expect(SYSTEM.has(name), `${name} объявлен в tokens.css — он не «приходит снаружи»`).toBe(false)
      expect(
        STATIC.some((u) => u.name === name),
        `${name} в списке разрешений, но в дереве не используется`,
      ).toBe(true)
    }
  })

  it('REJECTED_VALUES самодоказуем: имя не объявлено, а запись не мертва', () => {
    for (const r of REJECTED_VALUES) {
      const uses = STATIC.filter((u) => rel(u.file) === r.file && u.name === r.name)
      expect(
        uses.length > 0,
        `${r.file}: ${r.name} в реестре REJECTED_VALUES, но в дереве не встречается — запись мертва, снимай`,
      ).toBe(true)
      for (const u of uses) {
        expect(
          known(u),
          `${r.name} теперь объявлен (в tokens.css или рядом) — исключение REJECTED_VALUES ` +
            'больше не нужно и прикрывает живой токен, удали запись из реестра',
        ).toBe(false)
      }
    }
  })

  it('область превью — живое замыкание @import, а не пустое множество', () => {
    // Пустое замыкание разрешило бы ровно ничего и выглядело бы работающим:
    // ссылки превью и так проходят по папке, пока в самом превью объявлен тот
    // же `--ds-eventcal-tone`. Числа грубые — ловят обвал, а не рост.
    expect(SHEETS.length, 'замыкание @import от src/styles.css пусто').toBeGreaterThan(1)
    expect(SHEET_VARS.size, 'ни одной переменной в листах системы').toBeGreaterThan(0)
    // Разрешение ЖИВОЕ: им кто-то пользуется. Ноль означает, что послабление
    // ни на что не совпадает и его надо снимать, а не держать про запас, —
    // мёртвое разрешение выглядит как действующее.
    const leaning = STATIC.filter(
      (u) =>
        inPreview(u.file) &&
        !SYSTEM.has(u.name) &&
        !(localByDir.get(dirname(u.file))?.has(u.name) ?? false) &&
        SHEET_VARS.has(u.name),
    )
    expect(
      leaning.length,
      'ни одна ссылка превью не опирается на послабление — оно мёртвое, снимите его',
    ).toBeGreaterThan(0)
  })

  it('послабление не выходит за превью: та же ссылка в src остаётся битой', () => {
    // Утверждение о ГРАНИЦЕ, и оно СЧИТАЕТСЯ, а не ищется в дереве: искать
    // нечего — ссылка вне превью, разрешённая листом, была бы нарушением
    // первого теста, то есть проверка «таких нет» зелена по построению и не
    // проверяет ничего (`docs/writing-checks.md`, способ 2). Поэтому граница
    // спрашивается у самой функции на выдуманном месте: снятый `inPreview`
    // покраснеет здесь.
    const foreign = [...SHEET_VARS].find(
      (n) => !SYSTEM.has(n) && !(localByDir.get(resolve(ROOT, 'src/components/Button'))?.has(n) ?? false),
    )
    expect(foreign, 'в листах системы нет ни одной локальной переменной — граница непроверяема').toBeTruthy()
    const use = (file: string): Use => ({ file: resolve(ROOT, file), line: 1, name: foreign!, kind: 'plain' })
    expect(known(use('src/components/Button/Button.css')), `${foreign} разрешён в чужой папке src`).toBe(false)
    expect(known(use('previews/eventcalendar.html')), `${foreign} не разрешён в превью`).toBe(true)
  })

  it('реестр динамических мест совпадает с деревом', () => {
    const found = [...new Set(USES.filter((u) => u.kind === 'dynamic').map((u) => rel(u.file)))].sort()
    expect(
      found,
      'место, собирающее имя токена из шаблона, обязано быть в DYNAMIC — иначе гейт ' +
        'его не проверяет и не говорит об этом',
    ).toEqual(DYNAMIC.map((d) => d.file).sort())
  })

  it('каждое имя, собираемое из шаблона, объявлено', () => {
    const offenders: string[] = []
    for (const site of DYNAMIC) {
      const path = resolve(ROOT, site.file)
      expect(existsSync(path), `${site.file} из DYNAMIC не существует`).toBe(true)
      if (site.values === null) {
        expect(site.why.length, `${site.file}: непроверяемое место без объяснения`).toBeGreaterThan(80)
        continue
      }
      const values = site.values(readFileSync(path, 'utf8'))
      expect(values.length, `${site.file}: перечень значений пуст — читать исходник нечем`).toBeGreaterThan(0)
      for (const v of values) {
        const name = `${site.prefix}${v}${site.suffix}`
        if (!SYSTEM.has(name)) offenders.push(`${site.file} — ${name} (значение ${v})`)
      }
    }
    expect(
      offenders,
      'тип обещает ступень, которой в tokens.css нет:\n' + offenders.join('\n'),
    ).toEqual([])
  })

  /**
   * Фолбэк — это запасной ДИЗАЙН, а не догадка об имени. У токена системы запасного
   * дизайна быть не может: токен объявлен всегда, и второе значение либо
   * недостижимо, либо утверждает другое число, чем сам токен, — так `var(--ds-radius,
   * 6px)` в демо обещал вдвое большее скругление, чем 3px токена.
   */
  it('фолбэк не ставится на токен системы (кроме --ds-ui-scale)', () => {
    const offenders = USES.filter(
      (u) => u.kind === 'fallback' && SYSTEM.has(u.name) && u.name !== FALLBACK_ALLOWED,
    ).map((u) => `${rel(u.file)}:${u.line} — var(${u.name}, …)`)
    expect(
      offenders,
      'запасное значение к токену, который объявлен всегда — второй источник правды:\n' +
        offenders.join('\n'),
    ).toEqual([])
  })

  it('исключение --ds-ui-scale живо: фолбэк равен объявленному значению', () => {
    const declared = readFileSync(TOKENS_CSS, 'utf8').match(/--ds-ui-scale\s*:\s*([^;]+);/)![1]!.trim()
    expect(declared).toBe('1')
    const wrong: string[] = []
    for (const f of FILES) {
      const src = strip(readFileSync(f, 'utf8'))
      for (const m of src.matchAll(/var\(\s*--ds-ui-scale\s*,\s*([^)]*)\)/g)) {
        if (m[1]!.trim() !== declared) wrong.push(`${rel(f)}:${lineOf(src, m.index!)} — ${m[0]}`)
      }
    }
    expect(wrong, 'фолбэк разошёлся с токеном:\n' + wrong.join('\n')).toEqual([])
  })

  /**
   * Против способа 3: детектор, который ничего не находит, зелёный на любом дереве.
   * Числа — литералы, замеренные на момент написания, и это площадь, по которой
   * проверены утверждения выше. Упавшая площадь (файл выпал из обхода, расширение
   * не попало в REACH) обязана краснеть здесь, а не тихо сузить все остальные
   * утверждения до подмножества.
   */
  /**
   * Прямо против способа 1: детектор обязан видеть КАЖДОЕ вхождение, а не те
   * формы записи, о которых автор вспомнил. Сверка идёт с грубым счётом по тем же
   * файлам — не с собственным списком, который согласился бы сам с собой.
   */
  it('детектор видит каждое вхождение var(--ds-, кроме одного текста', () => {
    const missed: string[] = []
    for (const f of FILES) {
      const src = strip(readFileSync(f, 'utf8'))
      const seen = [...src.matchAll(VAR_USE)].length
      const raw = rawCount(src)
      if (raw !== seen) missed.push(`${rel(f)} — вхождений ${raw}, распознано ${seen}`)
    }
    expect(
      missed.map((m) => m.split(' — ')[0]),
      'форма записи, которую детектор не видит: площадь меньше заявленной\n' + missed.join('\n'),
    ).toEqual(TEXT_NOT_REFERENCE)
  })

  it('обход не выродился: площадь на месте', () => {
    expect(rel(__filename), 'SELF разошёлся с местом файла').toBe(SELF)
    expect(FILES.length, 'файлов в обходе').toBeGreaterThanOrEqual(500)
    expect(STATIC.length, 'статических ссылок var(--ds-*)').toBeGreaterThanOrEqual(2300)
    expect(new Set(STATIC.map((u) => u.name)).size, 'различных имён').toBeGreaterThanOrEqual(95)
    expect(SYSTEM.size, 'токенов в tokens.css').toBeGreaterThanOrEqual(80)
    for (const [dir] of REACH) {
      expect(FILES.some((f) => rel(f).startsWith(`${dir}/`)), `${dir}/ выпал из обхода`).toBe(true)
    }
  })

  /**
   * Против способа 5 и прямо против вопроса из QA: детектор обязан различать
   * ОБЪЯВЛЕНИЕ и ИСПОЛЬЗОВАНИЕ. Гейт, считающий любое вхождение `--ds-` за
   * использование, покраснел бы на самом `tokens.css`; гейт, считающий любое
   * вхождение за объявление, разрешил бы любое имя, упомянутое хоть где-то.
   */
  it('литерал вместо токена в компонентном листе — ошибка', () => {
    const offenders: string[] = []
    for (const f of FILES) {
      const path = rel(f)
      // `tokens.css` — место, ГДЕ литерал и объявляется; там он законен.
      if (path.startsWith('tokens/') || path === SELF) continue
      const src = strip(readFileSync(f, 'utf8'))
      for (const [literal, token] of LITERAL_INSTEAD_OF_TOKEN) {
        // Слово целиком: `1999px` не должен считаться за `999px`.
        const re = new RegExp(`(^|[^\\d.])${literal.replace('.', '\\.')}(?![\\d.])`, 'g')
        for (const _ of src.matchAll(re)) {
          offenders.push(`${path}: ${literal} — есть ${token}`)
          break
        }
      }
    }
    expect(
      offenders,
      `литерал вместо токена:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('и это правило умеет находить нарушение', () => {
    // Утверждение выше верно и для проверки, которая не может сработать.
    const hit = (src: string, literal: string) =>
      new RegExp(`(^|[^\\d.])${literal}(?![\\d.])`).test(src)
    expect(hit('.x { border-radius: 999px; }', '999px')).toBe(true)
    expect(hit('.x { border-radius: var(--ds-radius-pill); }', '999px')).toBe(false)
    // И не срабатывает на числе, внутри которого лежит литерал.
    expect(hit('.x { width: 1999px; }', '999px')).toBe(false)
    expect(hit('.x { width: 999.5px; }', '999px')).toBe(false)
  })

  it('детектор различает объявление, использование и фолбэк', () => {
    const uses = (s: string) => [...s.matchAll(VAR_USE)].map((m) => [m[1], m[2]])
    const decls = (s: string) => [...s.matchAll(VAR_DECL)].map((m) => m[1])

    expect(uses('.x { color: var(--ds-accent); }')).toEqual([['--ds-accent', ')']])
    expect(uses('.x { color: var(--ds-accent, red); }')).toEqual([['--ds-accent', ',']])
    expect(uses('`var(--ds-space-${gap})`')).toEqual([['--ds-space-', '${']])
    // Оборванный литерал — имя полное, разделителя нет; слепая зона первой редакции:
    expect(uses("toContain('calc(200px * var(--ds-ui-scale')")).toEqual([['--ds-ui-scale', "'"]])
    expect(uses('shadow.includes("var(--ds-focus-ring")')).toEqual([['--ds-focus-ring', '"']])
    // Объявление — не использование:
    expect(uses('.x { --ds-tone: red; }')).toEqual([])
    // Использование — не объявление; иначе любое упомянутое имя стало бы «объявленным»:
    expect(decls('.x { color: var(--ds-accent); }')).toEqual([])
    expect(decls('.x { --ds-tone: red; }')).toEqual(['--ds-tone'])
    // Шов из .tsx: ключ объекта — объявление, чтение свойства — нет:
    expect(decls("style={{ '--ds-badge-brand': brand }}")).toEqual(['--ds-badge-brand'])
    expect(decls("style={{ ['--ds-tree-cols']: template }}")).toEqual(['--ds-tree-cols'])
    expect(decls("el.style.getPropertyValue('--ds-row-depth')")).toEqual([])
    // Комментарий не объявляет и не использует:
    expect(decls(strip('/* стояло --ds-surface-muted: … */'))).toEqual([])
    expect(uses(strip('/* было var(--ds-border-subtle) */'))).toEqual([])
  })

  /**
   * DS-189. Адрес — половина пользы гейта: без него отчёт «12 нарушений»
   * читается как «12 нарушений, ищите сами». Проверяется РАЗЛИЧЕНИЕМ, а не
   * правдоподобием: два одинаковых по смыслу файла, в одном блочный комментарий
   * есть, в другом нет, — оба обязаны назвать верную строку. Один файл ничего бы
   * не доказал: у файла без комментария адрес верен и со сломанным `strip`.
   */
  it('номер строки не уезжает на длину блочного комментария', () => {
    const addr = (src: string) => {
      const s = strip(src)
      return [...s.matchAll(VAR_USE)].map((m) => lineOf(s, m.index!))
    }

    const head = ['/**', ' * шапка', ' * на', ' * четыре', ' * строки', ' */'].join('\n')
    const body = ['.a { color: red; }', '.b { color: var(--ds-accent); }'].join('\n')

    // С шапкой: 6 строк комментария + 2 строки тела → нарушение на 8-й.
    expect(addr(`${head}\n${body}`)).toEqual([8])
    // Без шапки — на 2-й. Тот же текст, другой ответ: значит меряется строка,
    // а не константа.
    expect(addr(body)).toEqual([2])

    // Комментарий В СЕРЕДИНЕ файла двигает всё, что после него, ровно так же.
    expect(addr(['.a {}', '/* два', '   на строки */', '.b { color: var(--ds-accent); }'].join('\n'))).toEqual([4])

    // Однострочный комментарий строк не ест и никогда не ел — контроль на то,
    // что починка не переехала в другую ветку `strip`.
    expect(addr(['// заметка', '.b { color: var(--ds-accent); }'].join('\n'))).toEqual([2])

    // Два нарушения по разные стороны комментария: сдвиг накапливается, и одно
    // верное значение рядом с одним неверным не должно выглядеть как успех.
    expect(
      addr(['.a { color: var(--ds-accent); }', '/* три', '   строки', '   комментария */', '.b { color: var(--ds-border); }'].join('\n')),
    ).toEqual([1, 5])
  })
})
