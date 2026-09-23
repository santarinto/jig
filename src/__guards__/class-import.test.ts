import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join, dirname, relative } from 'node:path'

/**
 * Компонент, ставящий `ds-*`-класс, обязан импортировать лист, где класс
 * объявлен, — напрямую или через модуль, который его тянет.
 *
 * `shared-sheets.test.ts` проверяет ровно это, но только для классов из общих
 * листов `src/styles/*.css`. Тот же класс дефекта живёт и с классами из
 * КОМПОНЕНТНЫХ листов. Так было с `.ds-field*` и геометрией `.ds-input` из
 * `TextField.css` и `.ds-field--block` из `Textarea.css`, пока их не вынесли в
 * общий `field-frame.css` (DS-46) — теперь они в `shared-sheets`, но гейт
 * остаётся суперсетом: любой объявленный класс, любой лист, включая то, что
 * однажды снова окажется в компонентном. Тому, кто грузит `styles.css` целиком,
 * это невидимо — там есть всё; тому, кто со сборщиком импортирует один
 * компонент, элемент приезжает голым. Этот гейт — суперсет: любой объявленный
 * класс, любой лист.
 *
 * ТРАНЗИТИВНОСТЬ учитывается: `LineChart` не импортирует `chart-legend.css`
 * напрямую — его тянет `internal/ChartLegend.tsx`. Обход идёт по цепочке
 * импортов до `.css`, поэтому такой импорт законен и лишних не требует.
 *
 * НАЗВАННАЯ ДЫРА: динамические имена. `ChartLegend` строит `${block}__chip` —
 * текстовым поиском класс в разметке не найти, и такой класс гейт не проверит.
 * Это осознанная граница, а не недосмотр: `ChartLegend` — internal, вне обхода
 * компонентов; его классы объявлены в общем `chart-legend.css`, который графики
 * тянут транзитивно. Дырe быть, но она названа.
 */
const SRC = resolve(__dirname, '..')

const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, ' ')
const stripJsComments = (js: string) =>
  js.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')

function walk(dir: string, pred: (name: string) => boolean): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p, pred))
    else if (pred(e.name)) out.push(p)
  }
  return out
}

/** Класс `.ds-*` → множество `.css`-листов, где он стоит в позиции селектора. */
function declaredIn(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const f of walk(SRC, (n) => n.endsWith('.css'))) {
    const css = stripCssComments(readFileSync(f, 'utf8'))
    for (const rule of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      for (const m of rule[1]!.matchAll(/\.(ds-[a-z0-9_-]+)/g)) {
        const bucket = map.get(m[1]!) ?? new Set<string>()
        bucket.add(f)
        map.set(m[1]!, bucket)
      }
    }
  }
  return map
}

/** `ds-*`-токены в разметке компонента (комментарии сняты; `--ds-*`-переменные — нет). */
function usedClasses(tsxSource: string): Set<string> {
  const clean = stripJsComments(tsxSource)
  const out = new Set<string>()
  // `(?<![\w-])` отсекает и середину слова, и CSS-переменные `--ds-*`.
  for (const m of clean.matchAll(/(?<![\w-])ds-[a-z0-9_-]+/g)) out.add(m[0])
  return out
}

/** Множество `.css`-листов, достижимых из файла по цепочке импортов. */
function cssReachable(entry: string): Set<string> {
  const seen = new Set<string>()
  const css = new Set<string>()
  const stack = [entry]
  while (stack.length) {
    const file = stack.pop()!
    if (seen.has(file) || !existsSync(file)) continue
    seen.add(file)
    const src = stripJsComments(readFileSync(file, 'utf8'))
    for (const m of src.matchAll(/(?:import|from)\s*['"]([^'"]+)['"]/g)) {
      const spec = m[1]!
      if (!spec.startsWith('.')) continue
      const base = resolve(dirname(file), spec)
      if (spec.endsWith('.css')) { if (existsSync(base)) css.add(base); continue }
      if (spec.endsWith('.js')) {
        for (const e of ['.ts', '.tsx']) {
          const cand = base.replace(/\.js$/, e)
          if (existsSync(cand)) stack.push(cand)
        }
      }
    }
  }
  return css
}

describe('импорт листа под класс', () => {
  it('компонент импортирует лист, объявляющий каждый его ds-класс (прямо или транзитивно)', () => {
    const declared = declaredIn()
    const components = walk(join(SRC, 'components'), (n) => n.endsWith('.tsx') && !n.includes('.test.'))
    const offenders: string[] = []
    let painters = 0
    for (const c of components) {
      const reachable = cssReachable(c)
      let paintsDeclared = false
      for (const cls of usedClasses(readFileSync(c, 'utf8'))) {
        const decls = declared.get(cls)
        if (!decls) continue
        paintsDeclared = true
        if (![...decls].some((d) => reachable.has(d))) {
          offenders.push(
            `${relative(SRC, c)}: ставит .${cls}, объявлен в `
            + `${[...decls].map((d) => relative(SRC, d)).join(', ')}, но ни один лист не импортирован`,
          )
        }
      }
      if (paintsDeclared) painters++
    }
    // Счётчики рядом с «нарушений нет» (обратная мутация): свёрнутый в ноль
    // обход, пустая карта классов или ноль «красящих» компонентов дают такой же
    // зелёный результат. Проверено сворачиванием каждого к нулю.
    expect(components.length, 'обход компонентов пуст').toBeGreaterThan(40)
    expect(declared.size, 'карта объявленных классов пуста').toBeGreaterThan(50)
    expect(painters, 'ни один компонент не ставит объявленный класс').toBeGreaterThan(30)
    expect(offenders, `класс из листа без импорта листа (голый элемент у одиночного импорта):\n${offenders.join('\n')}`).toEqual([])
  })
})
