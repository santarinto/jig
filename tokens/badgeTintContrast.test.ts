import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8')
const badgeCss = readFileSync(
  resolve(__dirname, '../src/components/Badge/Badge.css'),
  'utf8',
)

const TONES = ['success', 'warning', 'error', 'info'] as const
const MIN_TEXT_ON_TINT = 4.5
const TINT_ALPHA = 12
// The foreground is a separate token from the tone precisely so it can hold a
// margin: at 4.5 exactly, any later nudge to a tone or an alpha silently drops
// the pair below AA. 5.0 is the floor the split is meant to buy.
const MIN_FG_ON_TINT = 5.0

function extractBlock(source: string, selector: string): string {
  const re = new RegExp(
    `${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\n\\}`,
  )
  const m = source.match(re)
  expect(m, `block for ${selector} missing`).not.toBeNull()
  return m![1]
}

function parseProp(block: string, name: string): string {
  const bare = block.replace(/\/\*[\s\S]*?\*\//g, '')
  const m = bare.match(new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})\\s*;`))
  expect(m, `--${name} missing`).not.toBeNull()
  return m![1]
}

/** Любое кастомное свойство, не только цвет: `--ds-brand-fg-l` — число. */
function parseCustom(block: string, name: string): string {
  const bare = block.replace(/\/\*[\s\S]*?\*\//g, '')
  const m = bare.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`))
  expect(m, `--${name} missing`).not.toBeNull()
  return m![1]!.trim()
}

function hex2rgb(h: string): [number, number, number] {
  let s = h.replace('#', '')
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  const n = parseInt(s, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(fg: string, bg: string, pct: number): string {
  const t = pct / 100
  const [fr, fg_, fb] = hex2rgb(fg)
  const [br, bg_, bb] = hex2rgb(bg)
  const r = Math.round(fr * t + br * (1 - t))
  const g = Math.round(fg_ * t + bg_ * (1 - t))
  const b = Math.round(fb * t + bb * (1 - t))
  return (
    '#' +
    [r, g, b]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  )
}

function contrastRatio(a: string, b: string): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const L = (hex: string) => {
    const [r, g, b] = hex2rgb(hex).map(lin)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [l1, l2] = [L(a), L(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

describe('Badge/Alert text on own tint', () => {
  it('Badge semantic tones use 12% alpha (including info)', () => {
    for (const tone of TONES) {
      const m = badgeCss.match(
        new RegExp(
          `\\.ds-badge--${tone}\\s*\\{[^}]*color-mix\\(in srgb,\\s*var\\(--ds-${tone}\\)\\s*(\\d+)%`,
        ),
      )
      expect(m, `.ds-badge--${tone} color-mix alpha`).not.toBeNull()
      expect(Number(m![1]), `${tone} alpha`).toBe(TINT_ALPHA)
    }
  })

  it('Badge paints its label with the -fg token, not the tone itself', () => {
    for (const tone of TONES) {
      // Badge rules are single-line, so match the rule body directly.
      const m = badgeCss.match(new RegExp(`\\.ds-badge--${tone}\\s*\\{([^}]*)\\}`))
      expect(m, `.ds-badge--${tone} rule missing`).not.toBeNull()
      expect(m![1], `.ds-badge--${tone} should paint its label with var(--ds-${tone}-fg)`)
        .toMatch(new RegExp(`color:\\s*var\\(--ds-${tone}-fg\\)`))
    }
  })

  it('every tone defines a -fg token in both themes', () => {
    for (const selector of [':root', '[data-theme="dark"]']) {
      const block = extractBlock(css, selector)
      for (const tone of TONES) parseProp(block, `ds-${tone}-fg`)
    }
  })

  it('-fg text on 12% surface tint keeps a margin over AA in both themes', () => {
    const fails: string[] = []
    for (const [theme, selector] of [
      ['light', ':root'],
      ['dark', '[data-theme="dark"]'],
    ] as const) {
      const block = extractBlock(css, selector)
      const surface = parseProp(block, 'ds-surface')
      for (const tone of TONES) {
        const tint = mix(parseProp(block, `ds-${tone}`), surface, TINT_ALPHA)
        const fg = parseProp(block, `ds-${tone}-fg`)
        const ratio = contrastRatio(fg, tint)
        if (ratio < MIN_FG_ON_TINT) {
          fails.push(
            `${theme} ${tone}-fg on tint: ${ratio.toFixed(2)}:1 < ${MIN_FG_ON_TINT} (${fg} on ${tint})`,
          )
        }
      }
    }
    expect(fails, fails.join('\n')).toEqual([])
  })

  // The tone stays a text colour in its own right — Stat deltas and field errors
  // paint it straight onto the surface, with no tint underneath.
  it('tone text directly on the surface still clears AA in both themes', () => {
    const fails: string[] = []
    for (const [theme, selector] of [
      ['light', ':root'],
      ['dark', '[data-theme="dark"]'],
    ] as const) {
      const block = extractBlock(css, selector)
      const surface = parseProp(block, 'ds-surface')
      for (const tone of TONES) {
        const ratio = contrastRatio(parseProp(block, `ds-${tone}`), surface)
        if (ratio < MIN_TEXT_ON_TINT) {
          fails.push(`${theme} ${tone} on surface: ${ratio.toFixed(2)}:1 < ${MIN_TEXT_ON_TINT}`)
        }
      }
    }
    expect(fails, fails.join('\n')).toEqual([])
  })
})

/**
 * Цвет ИЗ ДАННЫХ потребителя (DS-81). Числа здесь не проверяются: их
 * считает браузер (относительный цвет плюс отображение в гамму), и повторить
 * это на строках значило бы проверять свой пересказ. Контраст и заметность
 * подложки меряются в хроме — `make measure`, кейс «Badge: цвет из данных».
 *
 * Здесь держится то, от чего зависит сам способ: что тон брендового бейджа
 * выведен ИЗ ТЕХ ЖЕ величин, что и рукописные `-fg`, и что светлота метки
 * приезжает токеном, а не селектором темы.
 */
describe('Badge brand: цвет из данных потребителя', () => {
  const brandRule = () => {
    const m = badgeCss.match(/@supports[^{]*\{\s*\.ds-badge--brand\s*\{([\s\S]*?)\n\s*\}/)
    expect(m, 'правило .ds-badge--brand внутри @supports отсутствует').not.toBeNull()
    return m![1]
  }

  /** sRGB → OKLCh (CSS Color 4), чтобы числа брались из токенов, а не из памяти. */
  function oklch(hex: string): { L: number; C: number } {
    const [r8, g8, b8] = hex2rgb(hex)
    const f = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
    const [r, g, b] = [f(r8), f(g8), f(b8)]
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return { L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, C: Math.hypot(A, B) }
  }

  const fgStats = (selector: string) => {
    const block = extractBlock(css, selector)
    const v = TONES.map((t) => oklch(parseProp(block, `ds-${t}-fg`)))
    return { L: v.map((x) => x.L), C: v.map((x) => x.C) }
  }

  it('подложка того же веса, что у штатных тонов — 12%', () => {
    // Тег не громче статуса. Иначе цвет начинает кодировать важность, а он
    // кодирует категорию.
    const m = brandRule().match(/color-mix\(in srgb,[\s\S]*?\s(\d+)%,\s*transparent\)/)
    expect(m, 'подложка .ds-badge--brand не собрана через color-mix').not.toBeNull()
    expect(Number(m![1])).toBe(TINT_ALPHA)
  })

  it('срез хромы равен верху диапазона рукописных -fg', () => {
    // 0.16 — не вкус: выше этого не забирается ни один штатный `-fg`, и тег,
    // которому дали чистый `#00ff00`, иначе звучит вдвое громче статуса.
    const m = brandRule().match(/min\(c,\s*([\d.]+)\)/)
    expect(m, 'хрома в .ds-badge--brand не срезана').not.toBeNull()
    const cap = Number(m![1])
    const maxC = Math.max(...fgStats(':root').C, ...fgStats('[data-theme="dark"]').C)
    expect(cap, `срез ${cap} ниже самого насыщенного -fg (${maxC.toFixed(3)})`).toBeGreaterThanOrEqual(maxC)
    expect(cap, `срез ${cap} много выше диапазона -fg (${maxC.toFixed(3)})`).toBeLessThanOrEqual(maxC + 0.02)
  })

  it('светлота метки живёт в том же диапазоне, что рукописные -fg', () => {
    const TOL = 0.02
    for (const [selector, theme] of [[':root', 'light'], ['[data-theme="dark"]', 'dark']] as const) {
      const L = Number(parseCustom(extractBlock(css, selector), 'ds-brand-fg-l'))
      const { L: fg } = fgStats(selector)
      expect(L, `${theme}: --ds-brand-fg-l=${L} вне диапазона -fg`).toBeGreaterThanOrEqual(Math.min(...fg) - TOL)
      expect(L, `${theme}: --ds-brand-fg-l=${L} вне диапазона -fg`).toBeLessThanOrEqual(Math.max(...fg) + TOL)
    }
  })

  it('тёмная тема приезжает ТОКЕНОМ, а не селектором в листе компонента', () => {
    // `theme-auto.css` переобъявляет только токены (scripts/build-bundles.mjs),
    // поэтому `[data-theme="dark"] .ds-badge--brand` при системной тёмной теме
    // не сработал бы вовсе — и это не было бы видно ни в одном тесте на классы.
    const light = Number(parseCustom(extractBlock(css, ':root'), 'ds-brand-fg-l'))
    const dark = Number(parseCustom(extractBlock(css, '[data-theme="dark"]'), 'ds-brand-fg-l'))
    expect(dark).toBeGreaterThan(light)
    expect(brandRule()).toMatch(/color:\s*oklch\(from [^;]*var\(--ds-brand-fg-l\)/)
    expect(badgeCss.replace(/\/\*[\s\S]*?\*\//g, ' '))
      .not.toMatch(/\[data-theme[^{]*\.ds-badge--brand/)
  })

  it('без относительного цвета остаётся читаемая метка, а не наследуемая', () => {
    // Значение содержит `var()`, поэтому непонятое объявление отбрасывается на
    // ВЫЧИСЛЕНИИ, и `color` уходит в наследуемый, а не в предыдущее объявление.
    // Спасает только `@supports`: он решается на разборе.
    // Комментарии вырезаются до разреза: в них слово `@supports` тоже стоит.
    const outside = badgeCss.replace(/\/\*[\s\S]*?\*\//g, ' ').split('@supports')[0]!
    expect(outside).toMatch(/\.ds-badge--brand\s*\{[^}]*color:\s*var\(--ds-text-primary\)/)
    expect(outside).toMatch(/\.ds-badge--brand\s*\{[^}]*background:\s*color-mix/)
  })
})
