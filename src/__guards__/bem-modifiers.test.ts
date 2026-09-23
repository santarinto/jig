import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

/**
 * A modifier class that never matches anything is invisible to every other check
 * we have: the prop exists, the class lands on the element, the CSS file contains
 * the name, tests pass, the build is clean — and the component silently ignores
 * the prop.
 *
 * That is exactly how `MetricStrip.dense` shipped broken in 1.6.0. A scripted
 * edit inserted a block of rules at an anchor that occurred twice, and the second
 * occurrence was the tail of `.ds-metrics--dense .ds-metrics__cell {`. The
 * modifier was left heading a selector for a DOM that does not exist, and the
 * displaced `padding` rule became unqualified, so *every* strip rendered dense.
 * Measured in the browser: both variants came out at `6px 8px`.
 *
 * The check itself had a blind spot for a while: its regexes matched
 * `ds-block--modifier` but not `ds-block__element--modifier`, because
 * `[a-z]+` for the block name stops at the first underscore, and BEM's own
 * double underscore breaks the match. `ds-table__row--odd` landed in
 * DataTable unstyled and this gate stayed green — it simply never looked at
 * classes shaped that way. The row modifier was later removed for unrelated
 * reasons, but the gap in the regex remained until both patterns were
 * widened to accept an optional `__element` segment between the block name
 * and the modifier.
 */
const SRC = resolve(__dirname, '..')

function componentFiles(): { name: string; tsx: string; css: string }[] {
  const out: { name: string; tsx: string; css: string }[] = []
  for (const dir of readdirSync(join(SRC, 'components'), { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    for (const f of readdirSync(join(SRC, 'components', dir.name))) {
      if (!f.endsWith('.tsx') || f.includes('.test.')) continue
      const css = join(SRC, 'components', dir.name, f.replace('.tsx', '.css'))
      if (existsSync(css)) out.push({ name: dir.name, tsx: join(SRC, 'components', dir.name, f), css })
    }
  }
  return out
}

const SHARED_DIR = join(SRC, 'styles')

/** Общие листы `src/styles/*.css` — часть бандла наравне с компонентными. */
const sharedCssFiles = () =>
  readdirSync(SHARED_DIR).filter((f) => f.endsWith('.css')).map((f) => join(SHARED_DIR, f))

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, ' ')

/** `@keyframes` steps (`from`/`to`/`50%`) are not rules and legitimately repeat. */
const stripKeyframes = (css: string) => css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, ' ')

/** Rules as [selector, normalised body] pairs. */
function rules(css: string): [string, string][] {
  return [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
    (m) => [m[1]!.trim().replace(/\s+/g, ' '), m[2]!.replace(/\s+/g, ' ').trim()] as [string, string],
  )
}

describe('BEM modifiers resolve to real selectors', () => {
  it('every modifier a component puts on an element is styled somewhere in the bundle', () => {
    const offenders: string[] = []
    // Смотреть надо по всему бандлу, а не по своему файлу: бандл — одна таблица.
    // Включая общие листы `src/styles/*.css`: с выносом `.ds-field--block` и
    // `.ds-input--sm` в `field-frame.css` (DS-46) их селекторы живут
    // именно там — компонентный пул их уже не видит.
    const all = [
      ...componentFiles().map(({ css }) => readFileSync(css, 'utf8')),
      ...sharedCssFiles().map((f) => readFileSync(f, 'utf8')),
    ].join('\n')
    const allSelectors = rules(all).map(([s]) => s).join('\n')
    const allSheet = stripComments(all)

    for (const { tsx } of componentFiles()) {
      const source = readFileSync(tsx, 'utf8')
      const sheet = allSheet
      const selectors = allSelectors
      const css = tsx.replace('.tsx', '.css')

      // Статические модификаторы в строках и шаблонных литералах.
      // `(?:__[a-z]+)?` — необязательный элемент блока, чтобы ловить и
      // `ds-блок--модификатор`, и `ds-блок__элемент--модификатор`.
      const mods = new Set(
        [...source.matchAll(/['"`](ds-[a-z]+(?:__[a-z]+)?--[a-z0-9-]+)['"`]/g)].map((m) => m[1]!),
      )
      // Динамические — `ds-metrics--cols-${n}` или `ds-cal__day--mark-${type}`:
      // проверяем, что префикс вообще стилизован.
      const dynamic = new Set(
        [...source.matchAll(/`(ds-[a-z]+(?:__[a-z]+)?--[a-z0-9-]*)\$\{/g)].map((m) => m[1]!),
      )

      for (const mod of mods) {
        if (!selectors.includes(`.${mod}`)) {
          offenders.push(`${relative(SRC, css)}: класс ${mod} ставится в разметке, но не встречается ни в одном селекторе`)
        }
      }
      for (const prefix of dynamic) {
        if (!new RegExp(`\\.${prefix}[a-z0-9-]+`).test(sheet)) {
          offenders.push(`${relative(SRC, css)}: динамический ${prefix}* нигде не стилизован`)
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('no modifier is written as an ancestor of another modifier of the same block', () => {
    const offenders: string[] = []
    for (const { css } of componentFiles()) {
      for (const [selector] of rules(readFileSync(css, 'utf8'))) {
        for (const part of selector.split(',')) {
          // `.ds-x--a .ds-x--b` описывает потомка, а оба модификатора живут на
          // одном элементе — такого DOM не бывает, правило мертво.
          const m = part.trim().match(/\.(ds-[a-z]+)--[a-z0-9-]+\s+\.\1--/)
          if (m) offenders.push(`${relative(SRC, css)}: "${part.trim()}" — два модификатора одного блока как предок и потомок`)
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('no stylesheet repeats the same rule twice', () => {
    const offenders: string[] = []
    for (const { css } of componentFiles()) {
      const seen = new Map<string, number>()
      for (const [selector, body] of rules(stripKeyframes(readFileSync(css, 'utf8')))) {
        if (!body) continue
        const key = `${selector}{${body}}`
        seen.set(key, (seen.get(key) ?? 0) + 1)
      }
      for (const [key, n] of seen) {
        if (n > 1) offenders.push(`${relative(SRC, css)}: правило встречается ${n} раза — ${key.split('{')[0]}`)
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
