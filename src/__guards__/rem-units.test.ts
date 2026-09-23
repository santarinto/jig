import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

const METRIC_TOKEN = /--ds-(?:fs|h|space)-[a-z0-9-]+\s*:\s*[^;]+;/gi
const FONT_SIZE_PX = /font-size\s*:\s*[^;]*\d+px/i

// Голый px в width/height — размер, выпавший из --ds-ui-scale: строка растёт,
// цель клика нет. 1–2px — декоративные хэйрлайны (разделители, индикаторы,
// штрихи глифов), им масштабироваться не нужно; всё от 3px — размер интерфейса,
// обязан идти через calc(<rem> * var(--ds-ui-scale)). min-*/max-*/border-*-width
// отсекает lookbehind. calc(...) не матчится: значение начинается не с числа.
// Логические inline-size/block-size — те же размеры в logical properties, и их
// guard тоже обязан видеть (иначе размер утекает мимо через логический синоним).
const PX_SIZE = /(?<![-a-z])(?:width|height|inline-size|block-size)\s*:\s*(\d+(?:\.\d+)?)px/gi

// Комментарии заменяются пробелами (переносы сохранены): px в закомментированном
// коде — не размер интерфейса, а номера строк не съезжают. Построчная замена
// многострочный комментарий не брала вовсе.
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

/** Строки-нарушители: width/height/inline-size/block-size ≥ 3px мимо ui-scale. */
function pxSizeOffenders(css: string): { line: number; match: string }[] {
  const out: { line: number; match: string }[] = []
  stripCssComments(css).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(PX_SIZE)) {
      if (parseFloat(m[1]) >= 3) out.push({ line: i + 1, match: m[0] })
    }
  })
  return out
}

function collectCss(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectCss(p))
    else if (entry.name.endsWith('.css')) out.push(p)
  }
  return out
}

describe('rem units discipline', () => {
  it('metric tokens in tokens.css use rem, not px', () => {
    const css = readFileSync(resolve(__dirname, '../../tokens/tokens.css'), 'utf8')
    const offenders = [...css.matchAll(METRIC_TOKEN)]
      .map((m) => m[0].trim())
      .filter((decl) => /\dpx/i.test(decl))
    expect(
      offenders,
      `metric tokens (--ds-fs-*, --ds-h-*, --ds-space-*) must not use px:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('component CSS has no font-size in px', () => {
    const dir = resolve(__dirname, '../components')
    const offenders: string[] = []
    for (const f of collectCss(dir)) {
      const css = readFileSync(f, 'utf8')
      if (FONT_SIZE_PX.test(css)) offenders.push(f)
    }
    expect(
      offenders,
      `font-size must use tokens or rem, not px:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('component CSS has no fixed px width/height (3px and up)', () => {
    const dir = resolve(__dirname, '../components')
    const offenders: string[] = []
    for (const f of collectCss(dir)) {
      for (const o of pxSizeOffenders(readFileSync(f, 'utf8'))) {
        offenders.push(`${f}:${o.line} — ${o.match}`)
      }
    }
    expect(
      offenders,
      `width/height ≥ 3px в обход --ds-ui-scale (канон: calc(<rem> * var(--ds-ui-scale))):\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  // Мутация к предыдущему: детектор обязан видеть логические inline-size/
  // block-size и НЕ срабатывать на закомментированном px. На прежнем guard
  // (только width|height, без вычистки комментариев) обе половины краснели.
  it('detects logical inline-size/block-size and ignores commented-out px', () => {
    const m = (css: string) => pxSizeOffenders(css).map((o) => o.match)
    // Логические размеры — раньше проходили насквозь:
    expect(m('.x { inline-size: 40px }')).toEqual(['inline-size: 40px'])
    expect(m('.x { block-size: 40px }')).toEqual(['block-size: 40px'])
    // Закомментированный px — не размер интерфейса, срабатывать не должен:
    expect(m('/* width: 40px */ .x { color: red }')).toEqual([])
    expect(m('.x {\n  /* height: 40px было раньше */\n  height: calc(2rem * var(--ds-ui-scale))\n}')).toEqual([])
    // Исключения сохранены: логический min-, хэйрлайн < 3px, calc:
    expect(m('.x { min-inline-size: 40px }')).toEqual([])
    expect(m('.x { width: 2px }')).toEqual([])
    expect(m('.x { width: calc(2.5rem * var(--ds-ui-scale)) }')).toEqual([])
  })

  it('tokens.css does not override html font-size (WCAG 1.4.4)', () => {
    const css = readFileSync(resolve(__dirname, '../../tokens/tokens.css'), 'utf8')
    expect(css, 'html { font-size } blocks browser text scaling').not.toMatch(
      /html\s*\{[^}]*font-size/i,
    )
  })
})
