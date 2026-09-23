import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * Тема меняет КРАСКУ, а не раскладку (DS-177).
 *
 * ЗАЧЕМ. Строка переполнения матрицы (`scripts/case-overflow.mjs`, прогон
 * `make matrix`) обходит все случаи всех фикстур на кадре 360 и мерит
 * горизонтальное переполнение — в ОДНОЙ теме, light. Сегодня это
 * необъявленное допущение внутри скрипта: если тёмная тема способна сдвинуть
 * коробку, половина каталога не измерена, и молча. Второй проход по тёмной
 * стоил бы ещё один полный обход (~60 с) и при этом почти наверняка вернул бы
 * те же числа.
 *
 * Этот гейт — то, что даёт право мерить в одной теме: он утверждает, что
 * сдвинуть коробку теме НЕЧЕМ. Проверка исходная, стоит миллисекунды, и
 * краснеет ровно в тот день, когда допущение перестанет быть верным.
 *
 * ПОЧЕМУ НЕ СТРОКА МАТРИЦЫ. Напрашивалось свойство «геометрия светлой и тёмной
 * совпадает» обходом 68 компонентов × 2 темы в браузере. Оно не может упасть:
 * в системе нет правила, которым геометрия отличалась бы по теме, — то есть это
 * ловушка 3 из `docs/writing-checks.md`, «утверждение, которое не может упасть»,
 * умноженное на каталог и оттого похожее на огромное покрытие. Замер на
 * 17.09.2026: тематических веток пять файлов, тёмный блок `tokens.css` — 60
 * токенов и `color-scheme`, в JS тему читает один `ThemeToggle`.
 *
 * ДВА УТВЕРЖДЕНИЯ, потому что теме доступны два пути.
 *  1. Прямой: правило под `[data-theme]` / `prefers-color-scheme` объявляет
 *     геометрическое свойство (`[data-theme="dark"] .x { padding: 4px }`).
 *  2. Через токен: тема переобъявляет токен, который где-то в дереве стоит в
 *     свойстве, двигающем коробку. Путь непрямой и оттого опаснее — он не виден
 *     в самой тематической ветке.
 *
 * ЧЕГО ГЕЙТ НЕ ВИДИТ, и это граница, а не недосмотр: токен, попадающий в
 * раскладку через JS или инлайновый стиль (там его ищет `js-px-scale`), и
 * компонент, который ветвится по теме в разметке — таких сегодня нет ни одного,
 * и держит это третье утверждение ниже.
 */

/** Свойства, которые красят и не двигают коробку. */
const PAINT = new Set([
  'color', 'background', 'background-color', 'background-image', 'background-blend-mode',
  'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-block-color', 'border-inline-color', 'border-block-start-color', 'border-block-end-color',
  'border-inline-start-color', 'border-inline-end-color',
  // `stroke` у SVG — краска; геометрия там `stroke-width`, и она в список не входит.
  'outline-color', 'box-shadow', 'text-shadow', 'opacity', 'fill', 'fill-opacity', 'stroke', 'stroke-opacity',
  'mix-blend-mode', 'filter', 'backdrop-filter', 'color-scheme', 'caret-color', 'accent-color',
  'text-decoration-color', 'column-rule-color', 'scrollbar-color', '-webkit-text-fill-color',
])

/**
 * Сокращения, несущие И цвет, И длину: `border: 1px solid var(--ds-border)`.
 * Свойство целиком геометрическое, но токен в нём стоит в ЦВЕТОВОМ слоте.
 */
const SHORTHAND =
  /^(border(-(top|right|bottom|left|block|inline|block-start|block-end|inline-start|inline-end))?|outline|column-rule|text-decoration)$/

/** Ключевое слово стиля рамки: если оно есть, `var()` в этом слоте стоять не может. */
const BORDER_STYLE = /\b(solid|dashed|dotted|double|groove|ridge|inset|outset|none|hidden)\b/
const LENGTH = /(?:^|[\s(])\d+(?:\.\d+)?(px|rem|em|%)/

const THEME_SELECTOR = /\[data-theme|prefers-color-scheme/
/** Объявление: кастомное свойство или обычное, значение до `;` или конца блока. */
const DECL = /(?:^|[;{}])\s*(--[a-z0-9-]+|[a-z-][a-z-]*)\s*:\s*([^;{}]+)/gi

/** Комментарии — пробелами, переносы на месте: номера строк не съезжают. */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

function collectCss(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!/node_modules|dist|\.git/.test(p)) out.push(...collectCss(p))
    } else if (entry.name.endsWith('.css')) out.push(p)
  }
  return out
}

/**
 * Стоит ли `var()` в этом объявлении в цветовом слоте.
 * Консервативно: при двух и более `var()` без собственной длины рядом решить
 * нельзя (`border: var(--w) solid var(--c)`), и тогда ответ «нет».
 */
export function isColourSlot(prop: string, value: string): boolean {
  if (PAINT.has(prop)) return true
  if (!SHORTHAND.test(prop)) return false
  const rest = value.replace(/var\([^)]*\)/g, ' ')
  if (!BORDER_STYLE.test(rest)) return false
  return LENGTH.test(rest) || (value.match(/var\(/g) || []).length === 1
}

export interface Usage {
  /** Токен → свойства раскладки, в которых он стоит. */
  layout: Map<string, Set<string>>
  /** Токен → токены, которые его едят (цепочка `--a: calc(var(--b))`). */
  feeds: Map<string, Set<string>>
}

/** Где какой токен употребляется. Одна аркада по всем файлам, потом транзитив. */
export function scanUsage(sources: { file: string; css: string }[]): Usage {
  const layout = new Map<string, Set<string>>()
  const feeds = new Map<string, Set<string>>()
  for (const { css } of sources) {
    for (const m of stripCssComments(css).matchAll(DECL)) {
      const prop = m[1].toLowerCase()
      const value = m[2]
      for (const v of value.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
        const tok = v[1]
        if (prop.startsWith('--')) {
          if (!feeds.has(tok)) feeds.set(tok, new Set())
          feeds.get(tok)!.add(prop)
        } else if (!isColourSlot(prop, value)) {
          if (!layout.has(tok)) layout.set(tok, new Set())
          layout.get(tok)!.add(`${prop}: ${value.trim().slice(0, 60)}`)
        }
      }
    }
  }
  return { layout, feeds }
}

/** Первое найденное употребление токена в раскладке, с цепочкой; иначе null. */
export function layoutUse(usage: Usage, token: string, seen = new Set<string>()): string | null {
  if (seen.has(token)) return null
  seen.add(token)
  for (const p of usage.layout.get(token) ?? []) return p
  for (const c of usage.feeds.get(token) ?? []) {
    const deeper = layoutUse(usage, c, seen)
    if (deeper) return `${c} → ${deeper}`
  }
  return null
}

/** Объявления внутри тематических веток, со счётом строк и глубины блока. */
export function themeDeclarations(file: string, css: string): { at: string; prop: string; value: string }[] {
  const out: { at: string; prop: string; value: string }[] = []
  const lines = stripCssComments(css).split('\n')
  let depth = 0
  let inTheme = false
  lines.forEach((line, i) => {
    const opens = (line.match(/\{/g) ?? []).length
    const closes = (line.match(/\}/g) ?? []).length
    // Со строки САМОГО селектора читаем то, что после `{`: правило целиком в
    // одну строку (`[data-theme="dark"] .x { padding: 4px; }`) иначе не видно
    // вовсе, и гейт зелен, не проверив прямой путь. Поймано мутацией.
    let from = 0
    if (!inTheme && THEME_SELECTOR.test(line) && opens > 0) {
      inTheme = true
      depth = 0
      from = line.indexOf('{') + 1
    }
    if (!inTheme) return
    for (const m of line.slice(from).matchAll(DECL)) {
      out.push({ at: `${file}:${i + 1}`, prop: m[1].toLowerCase(), value: m[2].trim() })
    }
    depth += opens - closes
    if (depth <= 0) inTheme = false
  })
  return out
}

const ROOT = resolve(__dirname, '../..')
const SOURCES = [...collectCss(join(ROOT, 'src')), ...collectCss(join(ROOT, 'tokens')), ...collectCss(join(ROOT, 'workbench'))]
  .map((file) => ({ file: file.slice(ROOT.length + 1), css: readFileSync(file, 'utf8') }))

const THEMED = SOURCES.filter((s) => THEME_SELECTOR.test(stripCssComments(s.css)))

describe('тема меняет краску, а не раскладку', () => {
  it('площадь: тематические ветки найдены, и среди них — известные поимённо', () => {
    // Ловушка 7: утверждение ниже говорит «ни одна ветка», и без этого счёта
    // оно зелено на пустом списке. Имена — литералом, из замера 17.09.2026.
    const names = THEMED.map((s) => s.file)
    expect(names.length, `тематических веток не найдено вовсе — сломан обход:\n${SOURCES.length} файлов CSS`)
      .toBeGreaterThanOrEqual(5)
    for (const known of ['tokens/tokens.css', 'src/components/Badge/Badge.css', 'src/components/EdgeBundling/EdgeBundling.css']) {
      expect(names, `ожидался в списке тематических: ${known}`).toContain(known)
    }
  })

  it('прямой путь: тематическая ветка не объявляет геометрического свойства', () => {
    const offenders: string[] = []
    for (const { file, css } of THEMED) {
      for (const d of themeDeclarations(file, css)) {
        if (d.prop.startsWith('--')) continue
        if (!isColourSlot(d.prop, d.value)) offenders.push(`${d.at}  ${d.prop}: ${d.value}`)
      }
    }
    expect(
      offenders,
      'тема вправе менять только краску: правило ниже двигает коробку, и тогда ' +
        'обход переполнения (make matrix) мерит половину каталога:\n' + offenders.join('\n'),
    ).toEqual([])
  })

  it('путь через токен: переобъявляемый по теме токен не участвует в раскладке', () => {
    const usage = scanUsage(SOURCES)
    const offenders: string[] = []
    for (const { file, css } of THEMED) {
      for (const d of themeDeclarations(file, css)) {
        if (!d.prop.startsWith('--')) continue
        const use = layoutUse(usage, d.prop)
        if (use) offenders.push(`${d.at}  ${d.prop} → ${use}`)
      }
    }
    expect(
      offenders,
      'токен ниже переобъявлен по теме И стоит в свойстве, двигающем коробку — ' +
        'значит тёмная тема способна сдвинуть раскладку:\n' + offenders.join('\n'),
    ).toEqual([])
  })

  it('третий путь: тему читает в JS только сам переключатель', () => {
    const tsx: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.tsx?$/.test(e.name) && !/\.(test|fixture)\./.test(e.name)) tsx.push(p)
      }
    }
    walk(join(ROOT, 'src/components'))
    const readers = tsx
      .filter((f) => /useTheme|resolvedTheme|data-theme/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(ROOT.length + 1))
    expect(
      readers,
      'компонент ветвится по теме в JS: разметка может разойтись между темами, ' +
        'и тогда замер в одной теме не говорит о другой:\n' + readers.join('\n'),
    ).toEqual(['src/components/ThemeToggle/ThemeToggle.tsx'])
  })

  it('различение: классификатор ловит геометрию и пропускает цветовой слот', () => {
    // Ловушка 3: три утверждения выше зелены и у классификатора, который
    // ничего не различает. Фикстура из пар, отличающихся ровно предметом.
    const themed = (body: string) => themeDeclarations('t.css', `[data-theme="dark"] .x {\n${body}\n}\n`)
    const geometryOf = (body: string) =>
      themed(body).filter((d) => !d.prop.startsWith('--') && !isColourSlot(d.prop, d.value)).map((d) => d.prop)

    expect(geometryOf('  padding: 4px;'), 'padding под темой обязан ловиться').toEqual(['padding'])

    // Правило В ОДНУ СТРОКУ: селектор, объявления и закрывающая скобка вместе.
    // Первая редакция читала объявления со следующей строки и такое правило не
    // видела ВОВСЕ — то есть была зелена, не проверив прямой путь.
    const oneLine = themeDeclarations('t.css', '[data-theme="dark"] .x { padding: 4px; }')
      .filter((d) => !isColourSlot(d.prop, d.value))
      .map((d) => d.prop)
    expect(oneLine, 'однострочное тематическое правило обязано читаться').toEqual(['padding'])
    expect(geometryOf('  border-width: 2px;'), 'border-width под темой обязан ловиться').toEqual(['border-width'])
    expect(geometryOf('  font-family: Inter;'), 'подмена шрифта меняет метрику текста').toEqual(['font-family'])
    expect(geometryOf('  color: red;'), 'цвет — не геометрия').toEqual([])
    expect(geometryOf('  border: 1px solid var(--ds-border);'), 'токен в цветовом слоте — не геометрия').toEqual([])
    expect(geometryOf('  border: solid var(--ds-surface);'), 'ширина по умолчанию, токен — цвет').toEqual([])
    expect(
      // Имена вне `--ds-*`: выдуманный токен в этом пространстве ловит
      // `token-exists` — он не отличает фикстуру от живой ссылки, и правильно.
      geometryOf('  border: var(--w) solid var(--c);'),
      'два var() без собственной длины: решить нельзя, ответ консервативный',
    ).toEqual(['border'])

    // Путь через токен: цепочка `--a: calc(var(--b))` обязана прослеживаться.
    const usage = scanUsage([{ file: 't.css', css: ':root { --a: calc(var(--b) * 2); }\n.x { gap: var(--a); }' }])
    expect(layoutUse(usage, '--b'), 'токен через цепочку обязан находиться').toMatch(/--a → gap/)
    expect(layoutUse(usage, '--nope'), 'неизвестный токен не находится').toBeNull()
  })
})
