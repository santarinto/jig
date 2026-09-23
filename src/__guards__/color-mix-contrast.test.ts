import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

/**
 * Подложка, собранная `color-mix` в рантайме, не проверялась НИЧЕМ (DS-130).
 *
 * Гейты контраста и `docs/contrast-report.md` меряют ПАРЫ ТОКЕНОВ:
 * `text-muted × surface-subtle` = 4.97, и так далее. А фон счётчика активной
 * вкладки токеном не является — его делает `color-mix(accent 14%, surface)`, и
 * акцентный текст на нём давал 4.15. Дыра, таким образом, была не в строке CSS,
 * а в способе проверять: любой смешанный цвет выпадал из замера целиком.
 * Найдено случайно, первым прогоном проверки канваса, — а замер, который ловит
 * дефект случайно, не ловит его.
 *
 * Нашлось при обходе ПЯТЬ мест, а не одно. Три — один и тот же акцент на своей
 * плашке (`Tabs`, `Tabs--plain`, `RouteBar`), два в `SideNav`, и вот эти два
 * интересны отдельно: там тинт клался поверх `--ds-table-selected`, который сам
 * уже тинт. Две подложки складываются, и ни одна пара токенов такого не
 * показывает — сложение видно только там, где считают по КОНЕЧНОМУ пикселю.
 *
 * ПОЧЕМУ КАТАЛОГ, А НЕ ВЫВОД ИЗ CSS. Из объявления не видно ни того, что лежит
 * под полупрозрачным `…, transparent)`, ни того, каким цветом на этой плашке
 * пишут: цвет часто приезжает наследованием из другого правила — именно так
 * дефект и приехал в `RouteBar`, где про счётчик не написано ни строки. Поэтому
 * каждое вхождение обязано быть НАЗВАНО здесь, и обход сверяет, что названы
 * все. Четвёртый `color-mix` не появится молча — он появится красным.
 *
 * ПОЧЕМУ АРИФМЕТИКА, А НЕ ПИКСЕЛИ. Владелец мерил дефект по отрисованным
 * пикселям в chromium — `getComputedStyle` на `color-mix` отдаёт
 * `color(srgb …)`, и обычный разбор `rgb()` на нём молча врёт. Здесь считается
 * из токенов, и это ПРОВЕРЕНО совпадением: 4.15 светлая и 4.91 тёмная у
 * `Tabs`, ровно те числа, что сняты с пикселей. `srgb` — линейная смесь по
 * каналам, воспроизводится точно; расхождение означало бы ошибку в одном из
 * двух способов, а не «пиксели правдивее».
 */

const SRC = resolve(__dirname, '..')
const TOKENS = resolve(__dirname, '../../tokens/tokens.css')

/** Обычный текст. Послаблений для крупного нет: счётчики — `--ds-fs-sm`, 12px. */
const AA = 4.5
/**
 * Для роли `*-fg` порог выше, и это не перестраховка. Токен и заведён затем,
 * чтобы держать запас: на ровно 4.50 любая последующая подкрутка тона или
 * процента роняет пару под AA молча. Порог унаследован от `-fg` смысловых
 * тонов (`tokens/badgeTintContrast.test.ts`).
 */
const AA_FG = 5.0

interface Measured {
  /**
   * Токен текста, который ляжет на эту плашку. НЕ принимается на слово:
   * сверяется с тем, что написано в CSS. Первая редакция гейта его только
   * объявляла — и пережила мутацию, где цвет в `Tabs.css` вернули на дефектный
   * `--ds-accent`: каталог по-прежнему утверждал `-fg`, замер считал по
   * каталогу и оставался зелёным. Утверждение о намерении, а не о факте.
   */
  text: string
  /**
   * Правило, где этот `color` объявлен, если это НЕ то же правило. Цвет часто
   * приходит наследованием: у `Alert` его даёт `.ds-alert__content`, у
   * `Tabs--plain` — базовое правило счётчика, которое plain переопределяет
   * только фоном. Ровно поэтому дефект и приезжал в компонент, где про
   * счётчик не написано ни строки.
   */
  colorFrom?: string
  /** Что лежит ПОД плашкой, когда смесь идёт с `transparent`. */
  over?: string
  /** Зачем эта пара такая. Читается в отчёте о падении. */
  why: string
}
interface Skipped {
  /** Почему на этой плашке текста нет вовсе. */
  noText?: string
  /** Где эта плашка меряется, если не здесь. */
  elsewhere?: string
}
type Entry = Measured | Skipped

/**
 * Каждое вхождение `color-mix` в `src/**\/*.css`, по ключу «файл: селектор».
 * Правило с двумя смесями сразу запрещено отдельным утверждением ниже — иначе
 * ключ перестал бы быть адресом.
 */
const CATALOGUE: Record<string, Entry> = {
  'components/BarChart/BarChart.css: .ds-bar__track--neutral': { noText: 'дорожка столбика, `fill` у SVG — текста на ней нет' },
  'components/BarChart/BarChart.css: .ds-bar__track--accent': { noText: 'дорожка столбика' },
  'components/BarChart/BarChart.css: .ds-bar__track--success': { noText: 'дорожка столбика' },
  'components/BarChart/BarChart.css: .ds-bar__track--warning': { noText: 'дорожка столбика' },
  'components/BarChart/BarChart.css: .ds-bar__track--error': { noText: 'дорожка столбика' },
  'components/BarChart/BarChart.css: .ds-bar__track--info': { noText: 'дорожка столбика' },

  'components/SideNav/SideNav.css: .ds-sidenav__item.is-active .ds-sidenav__count': {
    text: '--ds-accent-fg', over: '--ds-table-selected',
    why: 'счётчик на активном пункте. Подложка тут ДВОЙНАЯ: плашка счётчика поверх плашки выделенной строки, и до DS-130 в тёмной это давало 3.39',
  },

  'components/Tabs/Tabs.css: .ds-tabs__tab.is-active .ds-tabs__count': {
    text: '--ds-accent-fg', over: '--ds-surface',
    why: 'счётчик активной вкладки — тот самый дефект, 4.15 до починки',
  },
  'components/Tabs/Tabs.css: .ds-tabs--plain .ds-tabs__tab.is-active .ds-tabs__count': {
    text: '--ds-accent-fg', over: '--ds-surface',
    colorFrom: '.ds-tabs__tab.is-active .ds-tabs__count',
    why: 'вариант plain берёт ту же плашку и тот же цвет — правило переопределяет только фон',
  },
  'components/RouteBar/RouteBar.css: .ds-routebar__link.is-active .ds-routebar__count': {
    text: '--ds-accent-fg', over: '--ds-surface',
    why: 'счётчик текущего раздела. Цвет тут приезжал НАСЛЕДОВАНИЕМ от `.is-active`, поэтому дефект оказался здесь без единой строки про счётчик',
  },

  'components/Badge/Badge.css: .ds-badge--success': { elsewhere: 'tokens/badgeTintContrast.test.ts' },
  'components/Badge/Badge.css: .ds-badge--warning': { elsewhere: 'tokens/badgeTintContrast.test.ts' },
  'components/Badge/Badge.css: .ds-badge--error': { elsewhere: 'tokens/badgeTintContrast.test.ts' },
  'components/Badge/Badge.css: .ds-badge--info': { elsewhere: 'tokens/badgeTintContrast.test.ts' },
  'components/Badge/Badge.css: .ds-badge--brand': { elsewhere: 'tokens/badgeTintContrast.test.ts' },
  'components/Badge/Badge.css: @supports (color: oklch(from red 0.5 min(c, 0.16) h)) .ds-badge--brand': {
    elsewhere: 'tokens/badgeTintContrast.test.ts',
  },

  'components/Alert/Alert.css: .ds-alert--info': {
    text: '--ds-text-secondary', over: '--ds-surface', colorFrom: '.ds-alert__content',
    why: 'содержимое `Alert` на тоновой подложке; заголовок там же `--ds-text-primary` и заведомо контрастнее',
  },
  'components/Alert/Alert.css: .ds-alert--success': {
    text: '--ds-text-secondary', over: '--ds-surface', colorFrom: '.ds-alert__content', why: 'то же',
  },
  'components/Alert/Alert.css: .ds-alert--warning': {
    text: '--ds-text-secondary', over: '--ds-surface', colorFrom: '.ds-alert__content', why: 'то же',
  },
  'components/Alert/Alert.css: .ds-alert--error': {
    text: '--ds-text-secondary', over: '--ds-surface', colorFrom: '.ds-alert__content', why: 'то же',
  },
  'components/EventCalendar/EventCalendar.css: .ds-eventcal__event': {
    // Подложка собрана из --ds-eventcal-tone: он приходит инлайном и принимает
    // восемь значений палитры, поэтому пара «токен × токен» тут не одна, их 16.
    elsewhere: 'src/components/EventCalendar/tint-contrast.test.ts',
  },
  'components/EventCalendar/EventCalendar.css: .ds-eventcal__bar': {
    elsewhere: 'src/components/EventCalendar/tint-contrast.test.ts', // то же для полосы пояса
  },
  'components/EventCalendar/EventCalendar.css: .ds-eventcal__chip-event:hover': {
    // Тот же тон и тот же текст, процент НИЖЕ (12 против 16) — подложка светлее
    // замеренной, то есть замер там строже.
    elsewhere: 'src/components/EventCalendar/tint-contrast.test.ts',
  },

  'components/EventCalendar/EventCalendar.css: .ds-eventcal__draft': {
    // Заготовка живёт от pointerdown до pointerup и текста не несёт вовсе:
    // название появляется у СОБЫТИЯ, которое создаст потребитель, а оно
    // меряется в tint-contrast.test.ts. Плашка здесь `aria-hidden` и пустая.
    noText: 'заготовка создаваемого события — пустая плашка на время жеста',
  },

  'components/Alert/Alert.css: .ds-alert__close:hover': {
    text: '--ds-text-primary', over: '--ds-surface',
    why: 'крестик под курсором. Подложка формально тоновая (`Alert` красит фон), но крестик рисуется `--ds-text-primary`, и худший случай — самая светлая из тоновых',
  },
}

// ── арифметика ──────────────────────────────────────────────────────────────

const hex2rgb = (h: string): [number, number, number] => {
  let s = h.replace('#', '')
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  const n = parseInt(s, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const rgb2hex = (a: number[]) =>
  '#' + a.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase()

/** `color-mix(in srgb, fg P%, bg)` — линейная смесь по каналам, как в браузере. */
const mix = (fg: string, bg: string, pct: number) => {
  const t = pct / 100
  const [a, b] = [hex2rgb(fg), hex2rgb(bg)]
  return rgb2hex([0, 1, 2].map((i) => a[i]! * t + b[i]! * (1 - t)))
}
const contrast = (a: string, b: string) => {
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  const L = (h: string) => { const [r, g, bl] = hex2rgb(h).map(lin) as [number, number, number]; return 0.2126 * r + 0.7152 * g + 0.0722 * bl }
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}

// ── разбор ──────────────────────────────────────────────────────────────────

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, ' ')

function themeVars(selector: string): Record<string, string> {
  const css = stripComments(readFileSync(TOKENS, 'utf8'))
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = css.match(new RegExp(`${esc}\\s*\\{([\\s\\S]*?)\\n\\}`))
  expect(m, `блок ${selector} в tokens.css не найден`).not.toBeNull()
  return Object.fromEntries(
    [...m![1]!.matchAll(/(--ds-[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)].map((x) => [x[1]!, x[2]!]),
  )
}

const LIGHT = themeVars(':root')
const DARK = { ...LIGHT, ...themeVars('[data-theme="dark"]') }

interface Occurrence { key: string; tint: string; pct: number; base: string }

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.css') ? [join(dir, e.name)] : [])
}

/**
 * Правила файла со ЗНАНИЕМ про `@`-обёртки. Плоский разбор `([^{}]+)\{…\}`
 * (как в `shared-sheets`) теряет `@supports` и отдаёт ВНУТРЕННИЙ селектор
 * голым — у `Badge` из-за этого два разных правила `.ds-badge--brand`
 * получали один ключ, то есть каталог не мог их различить. Та же беда
 * поджидала бы первый же `@media`.
 */
function rules(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = []
  const stack: string[] = []
  let i = 0, prelude = ''
  while (i < css.length) {
    const ch = css[i]!
    if (ch === '{') {
      const head = prelude.trim().replace(/\s+/g, ' ')
      prelude = ''
      if (head.startsWith('@')) { stack.push(head); i++; continue }
      const end = css.indexOf('}', i)
      out.push({ selector: [...stack, head].join(' '), body: css.slice(i + 1, end) })
      i = end + 1
      continue
    }
    if (ch === '}') { stack.pop(); prelude = ''; i++; continue }
    prelude += ch
    i++
  }
  return out
}

/**
 * Разбор одной смеси. Скобки считаются, а не ищутся регексом: тинт бывает
 * `oklch(from var(--x) 0.6 min(c, 0.16) h / 1)` — с ЗАПЯТОЙ внутри, — и
 * «аргумент до запятой» на нём читает половину. Первая версия так и делала:
 * вхождение не разбиралось, а значит просто не попадало в список, то есть
 * ускользало от замера молча. Ровно тот дефект, ради которого гейт написан.
 */
function parseMix(src: string, at: number): { tint: string; pct: number; base: string; end: number } | null {
  let depth = 0, i = src.indexOf('(', at)
  const open = i
  for (; i < src.length; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')') { depth--; if (depth === 0) break }
  }
  if (depth !== 0) return null
  const inner = src.slice(open + 1, i)
  const parts: string[] = []
  let d = 0, cur = ''
  for (const ch of inner) {
    if (ch === '(') d++
    if (ch === ')') d--
    if (ch === ',' && d === 0) { parts.push(cur); cur = ''; continue }
    cur += ch
  }
  parts.push(cur)
  if (parts.length !== 3) return null
  const m = /^(.*)\s+(\d+)%$/.exec(parts[1]!.trim())
  if (!m) return null
  return { tint: m[1]!.trim(), pct: Number(m[2]), base: parts[2]!.trim(), end: i }
}

/** Все `color-mix(…)` из CSS `src/`, по правилам со знанием про `@`-обёртки. */
function occurrences(): Occurrence[] {
  const out: Occurrence[] = []
  for (const file of walk(SRC)) {
    const css = stripComments(readFileSync(file, 'utf8'))
    for (const rule of rules(css)) {
      let from = 0
      for (;;) {
        const at = rule.body.indexOf('color-mix(', from)
        if (at < 0) break
        const m = parseMix(rule.body, at)
        // Нечитаемая форма — это ПАДЕНИЕ, а не пропуск: молча пропущенное
        // вхождение выглядит как отсутствующее, и каталог его не хватится.
        expect(m, `${relative(SRC, file)}: ${rule.selector}: color-mix не разобран`).not.toBeNull()
        out.push({ key: `${relative(SRC, file)}: ${rule.selector}`, tint: m!.tint, pct: m!.pct, base: m!.base })
        from = m!.end
      }
    }
  }
  return out
}

/** Сколько раз слово встречается в исходниках — сверка охвата разбора. */
function rawCount(): number {
  return walk(SRC).reduce(
    (n, f) => n + (stripComments(readFileSync(f, 'utf8')).match(/color-mix\(/g)?.length ?? 0),
    0,
  )
}

/** `var(--ds-x)` → значение в теме; `transparent` разрешается подложкой. */
function resolve1(expr: string, theme: Record<string, string>, over?: string): string | null {
  const v = /var\((--ds-[\w-]+)\)/.exec(expr)
  if (v) return theme[v[1]!] ?? null
  if (expr === 'transparent') return over ? theme[over] ?? null : null
  return null
}

/**
 * Токен, которым правило красит текст. Читается из ЛИСТА — это факт, тогда как
 * `text` в каталоге лишь адрес, по которому его искать.
 */
function colorTokenOf(file: string, selector: string): string | null {
  const css = stripComments(readFileSync(resolve(SRC, file), 'utf8'))
  const rule = rules(css).find((r) => r.selector === selector)
  if (!rule) return null
  const m = /(?:^|[;{\s])color:\s*var\((--ds-[\w-]+)\)/.exec(rule.body)
  return m?.[1] ?? null
}

const ALL = occurrences()

describe('контраст текста на подложке color-mix', () => {
  it('каталог называет КАЖДОЕ вхождение, и лишнего в нём нет', () => {
    // Обе стороны, а не одна: список, из которого выпало вхождение, и список,
    // где остался мёртвый ключ, ломаются по-разному, и второе тише.
    const found = [...new Set(ALL.map((o) => o.key))].sort()
    const named = Object.keys(CATALOGUE).sort()
    expect(found.filter((k) => !named.includes(k)), 'color-mix не назван в каталоге').toEqual([])
    expect(named.filter((k) => !found.includes(k)), 'ключ каталога больше ни на что не указывает').toEqual([])
  })

  it('разобрано СТОЛЬКО ЖЕ, сколько написано в исходниках', () => {
    // «Все вхождения прошли» зелено и на пустом списке, и на списке, из
    // которого разбор что-то не понял и тихо выбросил. Сверка со счётчиком по
    // сырому тексту — единственное, что отличает эти два случая.
    expect(ALL.length, 'разбор не нашёл ни одного color-mix').toBeGreaterThanOrEqual(20)
    expect(ALL.length, 'разбор потерял вхождения по дороге').toBe(rawCount())
  })

  it('одно правило — одна смесь, иначе ключ перестаёт быть адресом', () => {
    const dup = Object.entries(
      ALL.reduce<Record<string, number>>((a, o) => ({ ...a, [o.key]: (a[o.key] ?? 0) + 1 }), {}),
    ).filter(([, n]) => n > 1)
    expect(dup, 'в одном правиле две смеси — каталог не сможет их различить').toEqual([])
  })

  it('где сказано «меряется в другом месте» — тот файл существует и знает про этот селектор', () => {
    for (const [key, entry] of Object.entries(CATALOGUE)) {
      const where = (entry as Skipped).elsewhere
      if (!where) continue
      const body = readFileSync(resolve(__dirname, '../..', where), 'utf8')
      // Отсылка проверяется, а не принимается на слово: ссылка на файл, который
      // про этот тон ничего не знает, — способ спрятать вхождение от замера.
      // Тон — из ПОСЛЕДНЕГО класса селектора: у ключа может стоять
      // `@supports (…)` впереди, и разбор «с начала» на нём разваливается.
      // Селектор — всё после ПЕРВОГО «: ». `split(': ')[1]` резал ключ на
      // двоеточии внутри `@supports (color: …)` и отдавал «@supports (color».
      const selector = key.slice(key.indexOf(': ') + 2)
      const classes = [...selector.matchAll(/\.ds-[\w-]*?--([\w]+)/g)]
      const tone = classes[classes.length - 1]?.[1]
      // Тона в ключе может не быть вовсе, и это не дыра в каталоге: у
      // `EventCalendar` подложка собрана из переменной, которая приходит
      // инлайном (восемь значений палитры), поэтому модификатору неоткуда
      // взяться. Тогда искомое — сам селектор: файл обязан назвать ровно то
      // правило, за которое взялся отвечать. Утверждение то же — «отсылка не
      // принимается на слово», — просто адресуется классом, а не тоном.
      const needle = tone ?? selector
      expect(needle, `${key}: из ключа не вынуть ни тон, ни селектор`).toBeTruthy()
      expect(body, `${where} ничего не знает про ${needle}`).toContain(needle)
    }
  })

  for (const [key, entry] of Object.entries(CATALOGUE)) {
    if (!('text' in entry)) continue
    const occ = ALL.find((o) => o.key === key)
    it(`${key} — текст на плашке проходит AA в обеих темах`, () => {
      expect(occ, `вхождение ${key} исчезло`).toBeDefined()
      // Сначала факт, потом арифметика. Без этой сверки каталог утверждал бы
      // намерение: цвет в листе можно вернуть на дефектный, и замер по
      // каталогу остался бы зелёным — проверено мутацией, она проходила.
      const [file, selector] = [key.slice(0, key.indexOf(': ')), key.slice(key.indexOf(': ') + 2)]
      const declared = colorTokenOf(file, entry.colorFrom ?? selector)
      expect(
        declared,
        `${key}: каталог обещает ${entry.text}, а лист красит ${declared ?? 'ничем'}`
          + (entry.colorFrom ? ` (смотрели в «${entry.colorFrom}»)` : ''),
      ).toBe(entry.text)
      const floor = entry.text.endsWith('-fg') ? AA_FG : AA
      for (const [theme, vars] of [['светлая', LIGHT], ['тёмная', DARK]] as const) {
        const tint = resolve1(occ!.tint, vars)
        const base = resolve1(occ!.base, vars, entry.over)
        const text = vars[entry.text]
        expect(tint, `${key}: не разобран тон ${occ!.tint}`).toBeTruthy()
        expect(base, `${key}: не разобрана подложка ${occ!.base}`).toBeTruthy()
        expect(text, `${key}: нет токена ${entry.text}`).toBeTruthy()
        const bg = mix(tint!, base!, occ!.pct)
        const ratio = contrast(text!, bg)
        expect(
          ratio,
          `${key} (${theme}): ${entry.text} ${text} на ${bg} даёт ${ratio.toFixed(2)}, надо ${floor}. ${entry.why}`,
        ).toBeGreaterThanOrEqual(floor)
      }
    })
  }

  it('и проверка умеет находить нарушение', () => {
    // Числа дефекта, ради которого гейт написан: акцент на собственной плашке.
    // Если однажды выйдет не 4.15 — сломана арифметика, а не система.
    const bg = mix(LIGHT['--ds-accent']!, LIGHT['--ds-surface']!, 14)
    expect(bg).toBe('#DDEDED')
    expect(contrast(LIGHT['--ds-accent']!, bg)).toBeCloseTo(4.15, 2)
    // И то же в тёмной, где он AA проходил, — иначе «починили» читалось бы как
    // «стало лучше везде», а тёмная не менялась вовсе.
    expect(contrast(DARK['--ds-accent']!, mix(DARK['--ds-accent']!, DARK['--ds-surface']!, 14)))
      .toBeCloseTo(4.91, 2)
  })
})
