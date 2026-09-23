import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

/**
 * `X:hover:not(:disabled)` weighs (0,3,0) and outspecifies `X.is-active` (0,2,0),
 * so pointing at the current item silently repaints it as an ordinary one. In
 * Calendar that produced white text on a near-white fill — an empty box where the
 * selected day should be. The hover rule must therefore exclude the state class.
 */
const SRC = resolve(__dirname, '..')
const STATE = ['is-active', 'is-selected']

function cssFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...cssFiles(p))
    else if (e.name.endsWith('.css')) out.push(p)
  }
  return out
}

/** Rules as [selector, body] pairs, comments stripped. */
function rules(css: string): [string, string][] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
    (m) => [m[1].trim().replace(/\s+/g, ' '), m[2]] as [string, string],
  )
}

describe('hover must not outrank the selected state', () => {
  it('every hover rule that paints a background spares the active/selected element', () => {
    const offenders: string[] = []

    for (const file of cssFiles(join(SRC, 'components'))) {
      const all = rules(readFileSync(file, 'utf8'))
      const paintsBg = (body: string) => /(^|;|\s)background\s*:/.test(body)

      for (const [selector, body] of all) {
        if (!selector.includes(':hover') || !paintsBg(body)) continue
        // Base element the hover applies to, e.g. `.ds-cal__day`.
        const base = selector.split(':hover')[0].trim().split(/\s+/).pop()
        if (!base) continue

        for (const state of STATE) {
          // Сгруппированный селектор вида `X.is-active, X:hover` описывает оба
          // случая одной декларацией — конфликтовать там нечему.
          if (selector.includes(`${base}.${state}`)) continue
          const hasStateRule = all.some(
            ([s, b]) => s.includes(`${base}.${state}`) && paintsBg(b),
          )
          if (hasStateRule && !selector.includes(`:not(.${state})`)) {
            offenders.push(
              `${relative(SRC, file)}: "${selector}" repaints ${base}.${state} — add :not(.${state})`,
            )
          }
        }
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
