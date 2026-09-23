import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join, dirname, relative } from 'node:path'
import ts from 'typescript'

/**
 * Каждый `ds-*` класс, написанный в `previews/*.html`, существует в CSS системы
 * (DS-224).
 *
 * Превью — рукописная МОДЕЛЬ разметки компонента, а не её копия, и по этой
 * модели выносят суждения пять проверок: `measure` («Цель клика»),
 * `preview-coverage`, `example-widths`, `token-exists`, `no-nested-interactive`.
 * Модель совпадать с компонентом не обязана (решение задачи: генерировать из
 * фикстур не будем — три превью вообще не про один компонент, а `measure`
 * держится в бюджете `check` тем, что грузит плоский HTML). Но модель, которая
 * МОЛЧА перестала быть похожей, хуже отсутствующей: класс без правила рисует
 * голый `<div>`, замер честно меряет его геометрию, и ответ выходит
 * правдоподобным и не о компоненте. Так `NumberField` в превью полгода стоял в
 * состоянии ошибки (DS-207), и никто не проверял.
 *
 * На момент написания в дереве сидели десять таких имён: `ds-accordion__chevron`,
 * `ds-tree__chevron`, `ds-sidenav__chevron`, `ds-combobox__chevron`,
 * `ds-pivot__caret`, `ds-transcript__caret` — все пережили вынос знака
 * раскрытия в общий `Caret` (`src/internal/caret.tsx`, `.ds-caret`);
 * `ds-cal__blank` пережил переименование в `ds-cal__spacer`; `ds-metric`,
 * `ds-metric__label`, `ds-metric__value` — никогда не существовали, метрики
 * события транскрипта рисует `MetricStrip` (`ds-metrics__*`); `ds-tile--neutral`
 * никогда не был стилизован.
 *
 * Источник истины — ТОЛЬКО CSS, не `.tsx` компонента. Если бы класс считался
 * существующим по эмиссии в JSX, переименование правила в CSS при неизменном
 * превью оставалось бы зелёным ровно там, где превью отстало (QA задачи требует
 * покраснения с обеих сторон). CSS берётся по `@import` из `src/styles.css` —
 * того самого листа, который подключает каждое превью: файл, не попавший в
 * импорт, для превью не существует, и гейт об этом не должен думать иначе.
 */

const ROOT = resolve(__dirname, '../..')
const PREVIEWS_DIR = resolve(ROOT, 'previews')
const ENTRY = resolve(ROOT, 'src/styles.css')

const rel = (f: string) => relative(ROOT, f).split('\\').join('/')

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, ' ')

/**
 * Лист системы — замыкание `@import` от входа. Именно замыкание, а не
 * `src/**\/*.css`: лист, который забыли импортировать, превью не видит, и класс
 * из него для превью так же мёртв, как опечатка.
 */
function importClosure(entry: string, seen = new Set<string>()): string[] {
  if (seen.has(entry)) return []
  seen.add(entry)
  const src = stripComments(readFileSync(entry, 'utf8'))
  const out = [entry]
  for (const m of src.matchAll(/@import\s+(?:url\()?["']([^"']+)["']\)?/g)) {
    out.push(...importClosure(resolve(dirname(entry), m[1]!), seen))
  }
  return out
}

/**
 * Классы из СЕЛЕКТОРОВ, не из всего текста. Тела правил вырезаются одним
 * проходом (`{…}` без вложенных скобок — это всегда тело листового правила,
 * прелюдии `@media {…}` остаются, потому что содержат `{` внутри), после чего
 * остаются только прелюдии. Иначе `.ds-x` в значении `content` или в строке
 * стало бы объявлением.
 */
function classesOf(css: string): Set<string> {
  const preludes = stripComments(css).replace(/\{[^{}]*\}/g, '{}')
  return new Set([...preludes.matchAll(/\.(ds-[A-Za-z0-9_-]+)/g)].map((m) => m[1]!))
}

const SHEETS = importClosure(ENTRY)
const STYLED = new Set<string>()
for (const f of SHEETS) for (const c of classesOf(readFileSync(f, 'utf8'))) STYLED.add(c)

/**
 * Крючки без правила: класс, который компонент СТАВИТ, а ни один лист не
 * стилизует. Превью, повторяющее его, не рисует ничего лишнего — пикселей у
 * такого класса нет по построению, — но и опечаткой оно не является. Это ДОЛГ
 * с двумя контрутверждениями, как `NO_PREVIEW` в `preview-coverage`: имя из
 * списка обязано отсутствовать в CSS (иначе запись устарела и разрешает
 * лишнее) и обязано ставиться каким-то компонентом (иначе это опечатка превью,
 * спрятанная в список). Размерный модификатор `--md` ставится шаблоном
 * `ds-btn--${size}`, поэтому эмиссия проверяется и по шаблонному префиксу.
 */
const BARE_HOOKS = [
  'ds-btn--md',
  'ds-input--md',
  'ds-select--md',
  'ds-textarea--md',
  'ds-combobox--md',
  'ds-numfield__control--md',
  'ds-crumbs',
  'ds-tile--neutral',
  'ds-check__label',
  'ds-radio__label',
  'ds-switch__label',
  'ds-gsearch__label',
  'ds-sections__label',
  'ds-theme-toggle__label',
  'ds-routebar__label',
  'ds-timeline__author',
  'ds-sidenav__group',
  'ds-sidenav__title',
]

function collect(dir: string, pred: (name: string) => boolean): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...collect(p, pred))
    else if (pred(e.name)) out.push(p)
  }
  return out
}

const COMPONENT_FILES = collect(
  resolve(ROOT, 'src/components'),
  (n) => n.endsWith('.tsx') && !n.includes('.test.') && !n.includes('.fixture.'),
)
const COMPONENT_SOURCES = COMPONENT_FILES.map((f) => readFileSync(f, 'utf8'))

/**
 * ОБЪЯВЛЕНИЕ ЦЕЛИ ЕДЕТ В МОДЕЛЬ ВМЕСТЕ С КЛАССОМ (DS-346).
 *
 * `[data-ds-target]` объявляет узел целью указателя там, где ни тег, ни роль
 * этого не говорят (крестик `FormTabs`), и `scanTargets` читает ТОЛЬКО его.
 * Но случай «Цель клика» в `make measure` ходит по превью — по рукописному
 * плоскому HTML, — а не по React, и атрибут, поставленный в компоненте, туда
 * не попадает сам. Первая редакция этой задачи ровно так и вышла: в `.tsx`
 * объявление стояло, `measure` был зелен, и зелен он был потому, что цели в
 * его кадре не было вовсе. Мутация «крестик 20×20» осталась бы зелёной — то
 * есть починка не проверялась ничем, кроме двух юнитов.
 *
 * Отсюда правило: класс, который компонент несёт ВМЕСТЕ с объявлением, обязан
 * нести его и в каждом превью. Не «превью повторяет разметку» вообще — модель
 * совпадать не обязана, об этом шапка файла, — а именно то, по чему судит
 * замер.
 *
 * Разбор компонента — по AST, а не регуляркой: атрибут и `className` лежат в
 * одном теге через перенос строки и комментарий, и «то же в пределах `[^>]*`»
 * здесь врёт в обе стороны.
 */
const DECLARED_TARGET_CLASSES = (() => {
  const out = new Set<string>()
  const unparsed: string[] = []
  for (const f of COMPONENT_FILES) {
    const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const visit = (n: ts.Node): void => {
      if (ts.isJsxOpeningLikeElement(n)) {
        const attrs = new Map<string, ts.JsxAttributeValue | undefined>()
        for (const a of n.attributes.properties) if (ts.isJsxAttribute(a)) attrs.set(a.name.getText(), a.initializer)
        if (attrs.has('data-ds-target')) {
          const cls = attrs.get('className')
          // Имена класса берутся ИЗ ЛИТЕРАЛОВ, где бы внутри выражения они ни
          // лежали: `className="ds-x"` и
          // `className={['ds-x', cond && 'is-y'].filter(Boolean).join(' ')}` —
          // одна и та же разметка для превью, и вторая форма здесь обычная
          // (DS-353, флажок `Tree`). Берутся только имена с префиксом
          // `ds-`: остальные литералы выражения — состояния (`is-checked`) и
          // склейка (`' '`), в превью по ним никого не ищут.
          //
          // Ни одного такого литерала — узел роняет случай ПО ИМЕНИ, а не
          // пропускается молча: объявление, чьё имя вычислено целиком, уехало
          // бы в превью незамеченным.
          const names: string[] = []
          const literals = (x: ts.Node): void => {
            if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) {
              if (x.text.startsWith('ds-')) names.push(x.text)
            }
            x.forEachChild(literals)
          }
          if (cls) literals(cls)
          if (names.length) for (const nm of names) out.add(nm)
          else unparsed.push(`${rel(f)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`)
        }
      }
      n.forEachChild(visit)
    }
    visit(sf)
  }
  return { names: out, unparsed }
})()


/** Компонент ставит класс: литералом либо шаблоном `ds-x--${…}` того же префикса. */
function emitted(name: string): boolean {
  const literal = new RegExp(`['"\`]${name}['"\`]`)
  const prefix = name.includes('--') ? name.slice(0, name.lastIndexOf('--') + 2) : null
  const template = prefix ? new RegExp(`\`${prefix}\\$\\{`) : null
  return COMPONENT_SOURCES.some((s) => literal.test(s) || (template !== null && template.test(s)))
}

const PREVIEWS = readdirSync(PREVIEWS_DIR)
  .filter((n) => n.endsWith('.html'))
  .map((n) => join(PREVIEWS_DIR, n))

interface Use {
  file: string
  line: number
  name: string
}

const lineOf = (src: string, index: number) => src.slice(0, index).split('\n').length

const USES: Use[] = []
let attrsSeen = 0
let attrsParsed = 0
for (const f of PREVIEWS) {
  const src = readFileSync(f, 'utf8')
  attrsSeen += [...src.matchAll(/\bclass=/g)].length
  for (const m of src.matchAll(/\bclass=(["'])([^"']*)\1/g)) {
    attrsParsed += 1
    for (const name of m[2]!.split(/\s+/)) {
      if (name.startsWith('ds-')) USES.push({ file: f, line: lineOf(src, m.index!), name })
    }
  }
}

/** Открывающие теги превью: имена классов и наличие объявления в ОДНОМ теге. */
const PREVIEW_TAGS = PREVIEWS.flatMap((f) => {
  const src = readFileSync(f, 'utf8')
  return [...src.matchAll(/<[a-z][a-z0-9]*\s[^>]*>/g)].map((m) => ({
    file: f,
    line: lineOf(src, m.index!),
    classes: (/\bclass=(["'])([^"']*)\1/.exec(m[0]!)?.[2] ?? '').split(/\s+/),
    declared: /\bdata-ds-target\b/.test(m[0]!),
  }))
})

describe('preview classes exist in the system CSS (DS-224)', () => {
  it('reach: the previews, the sheets and the classes are counted, and none is zero', () => {
    const distinct = new Set(USES.map((u) => u.name))
    console.log(
      `preview-classes: ${PREVIEWS.length} превью, ${SHEETS.length} листов по @import, ` +
        `${STYLED.size} классов в селекторах, ${USES.length} упоминаний (${distinct.size} имён) в class=`,
    )
    // Нуль в любом из четырёх — сломан разбор, а не чистое дерево.
    expect(PREVIEWS.length).toBeGreaterThan(0)
    expect(SHEETS.length).toBeGreaterThan(1)
    expect(STYLED.size).toBeGreaterThan(0)
    expect(USES.length).toBeGreaterThan(0)
    // Каждый `class=` разобран: атрибут в других кавычках или без них — слепая зона.
    expect(attrsParsed, `class= всего ${attrsSeen}, разобрано ${attrsParsed}`).toBe(attrsSeen)
  })

  it('every ds-* class in a preview is styled by a sheet reachable from src/styles.css', () => {
    const known = new Set([...STYLED, ...BARE_HOOKS])
    const offenders = USES.filter((u) => !known.has(u.name)).map(
      (u) => `${rel(u.file)}:${u.line} — класс ${u.name} не встречается ни в одном селекторе`,
    )
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('объявление цели `[data-ds-target]` стоит и в превью, по которым судит measure (DS-346)', () => {
    const { names, unparsed } = DECLARED_TARGET_CLASSES
    expect(unparsed, `объявление на узле с вычисленным className — разобрать нечем: ${unparsed.join(', ')}`).toEqual([])
    // Ноль объявленных имён или ноль их упоминаний в превью — случай зелен на
    // пустом множестве, а не чист: разбор сломан либо превью разошлось.
    expect(names.size, 'ни один компонент не объявляет цель — сломан разбор AST').toBeGreaterThan(0)
    const seen = PREVIEW_TAGS.filter((t) => t.classes.some((c) => names.has(c)))
    expect(seen.length, `объявленные классы (${[...names].join(', ')}) не встречаются ни в одном превью`).toBeGreaterThan(0)
    const offenders = seen.filter((t) => !t.declared).map(
      (t) => `${rel(t.file)}:${t.line} — ${t.classes.filter((c) => names.has(c)).join(' ')} без data-ds-target,`
        + ' и значит «Цель клика» в measure этот узел не судит',
    )
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('BARE_HOOKS is a debt, not a permission: each entry is unstyled AND put on by a component', () => {
    const stale = BARE_HOOKS.filter((n) => STYLED.has(n))
    expect(stale, `стилизованы, из списка убрать: ${stale.join(', ')}`).toEqual([])
    const ghosts = BARE_HOOKS.filter((n) => !emitted(n))
    expect(ghosts, `ни один компонент не ставит: ${ghosts.join(', ')}`).toEqual([])
    const unused = BARE_HOOKS.filter((n) => !USES.some((u) => u.name === n))
    expect(unused, `в превью не встречаются, из списка убрать: ${unused.join(', ')}`).toEqual([])
  })
})
