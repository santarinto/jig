import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tokens } from './tokens.js'

const css = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8')

/** Color-like CSS values: detect by value, not by name. */
const COLOR_VALUE_RE = /#|rgb\(|hsl\(|color-mix\(/i

function parseCustomProperties(block: string): Map<string, string> {
  const props = new Map<string, string>()
  // Strip comments so a commented-out override cannot satisfy parity.
  const bare = block.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of bare.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    props.set(m[1], m[2].trim())
  }
  return props
}

function extractBlock(source: string, selector: string): string {
  const re = new RegExp(
    `${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\n\\}`,
  )
  const m = source.match(re)
  expect(m, `block for ${selector} missing`).not.toBeNull()
  return m![1]
}

describe('design tokens', () => {
  it('defines light theme accent and a dark override', () => {
    expect(css).toMatch(/:root\s*\{[^}]*--ds-accent:\s*#0E7C7C/i)
    expect(css).toMatch(/\[data-theme="dark"\]\s*\{[^}]*--ds-accent:\s*#2BB8B3/i)
  })

  it('every TS color value matches the :root value in the CSS', () => {
    // Комментарии вырезаются ДО поиска блока, а не после: `}` внутри
    // комментария (`rowState({muted})`) обрывает нежадный `[\s\S]*?` на себе,
    // и остаток :root пропадает из тела. Разваливается это не там, где
    // написано, — тест назвал безвинный `--ds-skel-base` «отсутствующим в
    // :root», хотя тот стоял на месте, а комментарий появился строкой выше.
    const root = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/:root\s*\{([\s\S]*?)\}/)
    expect(root).not.toBeNull()
    const rootBody = root![1]
    for (const [key, value] of Object.entries(tokens.color)) {
      const m = rootBody.match(new RegExp(`--ds-${key}\\s*:\\s*([^;]+);`, 'i'))
      expect(m, `--ds-${key} missing in :root`).not.toBeNull()
      expect(m![1].trim().toLowerCase()).toBe(value.toLowerCase())
    }
  })

  it('exposes accent and surface in the typed map', () => {
    expect(tokens.color['accent']).toBe('#0E7C7C')
    expect(tokens.color['surface']).toBe('#FFFFFF')
  })

  it('every color token in :root has a dark-theme override (parity)', () => {
    // Intentional invariants: same value in both themes, with a reason.
    // White text/handles on saturated fills stay white in any theme.
    const THEME_INVARIANT = new Set([
      'ds-text-on-solid',
      // Тёмная кромка кольца фокуса (DS-193). Она отделяет кольцо от
      // заливки, КОТОРОЙ СИСТЕМА НЕ ЗНАЕТ — от ступени рампа, от цвета метки
      // из данных потребителя, — а рамп в обеих темах держится в средней
      // светлоте, потому что и в тёмной обязан читаться как шкала. Тёмная
      // кромка контрастна ему в обеих темах, и переворачивать её по теме
      // значило бы менять число ради симметрии.
      'ds-focus-ring-edge',
    ])

    const rootProps = parseCustomProperties(extractBlock(css, ':root'))
    const darkProps = parseCustomProperties(extractBlock(css, '[data-theme="dark"]'))

    const colorTokens = [...rootProps.entries()].filter(([, value]) =>
      COLOR_VALUE_RE.test(value),
    )
    expect(colorTokens.length, 'expected color tokens in :root').toBeGreaterThan(0)

    const missing: string[] = []
    for (const [name] of colorTokens) {
      if (THEME_INVARIANT.has(name)) continue
      if (!darkProps.has(name)) missing.push(`--${name}`)
    }

    expect(
      missing,
      `color tokens without [data-theme="dark"] override:\n${missing.join('\n')}`,
    ).toEqual([])

    for (const name of THEME_INVARIANT) {
      expect(rootProps.has(name), `invariant --${name} missing in :root`).toBe(true)
      expect(darkProps.has(name), `invariant --${name} should still be declared in dark`).toBe(
        true,
      )
      expect(COLOR_VALUE_RE.test(rootProps.get(name)!)).toBe(true)
    }
  })
})

/* Портал объявляет своё `body { color; background }` (тёмная тема на Tailwind),
   и оно перебивает наше: селектор тот же, а таблица подключается позже. Всё, что
   наследует color — крупные цифры, часы, значения — оставалось в чужой палитре и
   на светлой поверхности DS становилось почти невидимым. Ни тесты, ни сборка об
   этом не говорят: находится только глазами.

   `.ds-root` объявляет то же самое весом класса, который `body` не перебивает. */
describe('.ds-root — опора для потребителя со своим body', () => {
  const css = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8')
  const block = (sel: string) =>
    css.match(new RegExp(`(?:^|\\n)${sel}\\s*\\{([^}]+)\\}`))?.[1] ?? ''
  const props = (body: string) =>
    [...body.matchAll(/(^|;|\s)([a-z-]+)\s*:/g)].map((m) => m[2]!).filter((p) => !p.startsWith('-'))

  it('exists', () => {
    expect(block('\\.ds-root'), 'нет правила .ds-root').not.toBe('')
  })

  it('restates every inherited property the body rule sets', () => {
    const inherited = props(block('body')).filter((p) => p !== 'margin')
    const root = props(block('\\.ds-root'))
    const missing = inherited.filter((p) => !root.includes(p))
    expect(missing, `.ds-root не покрывает: ${missing.join(', ')}`).toEqual([])
  })

  it('outweighs a bare body selector', () => {
    // Класс (0,1,0) против типа (0,0,1) — порядок подключения уже не решает.
    expect(css).toMatch(/(^|\n)\.ds-root\s*\{/)
  })
})
