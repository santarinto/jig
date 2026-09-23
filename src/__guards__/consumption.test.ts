import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

const SRC = resolve(__dirname, '..')

function componentDirs(): string[] {
  return readdirSync(join(SRC, 'components'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
}

function cssFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...cssFiles(p))
    else if (entry.name.endsWith('.css')) out.push(p)
  }
  return out
}

// These guards protect the CONSUMER, not this repo: a component that exists but is
// not re-exported, or a stylesheet that is not part of the single entry, both look
// perfectly fine here and only break once someone installs the package.
describe('consumption guards', () => {
  it('re-exports every component directory from src/index.ts', () => {
    const barrel = readFileSync(join(SRC, 'index.ts'), 'utf8')
    // Specifiers carry an explicit /index.js so the emitted ESM resolves under node.
    const missing = componentDirs().filter((d) => !barrel.includes(`'./components/${d}/index.js'`))
    expect(missing).toEqual([])
  })

  it('imports every component/example stylesheet from src/styles.css', () => {
    const entry = readFileSync(join(SRC, 'styles.css'), 'utf8')
    const files = [join(SRC, 'components'), join(SRC, 'examples')].flatMap((d) => {
      try { return cssFiles(d) } catch { return [] }
    })
    const missing = files
      .map((f) => `./${relative(SRC, f).split('\\').join('/')}`)
      .filter((rel) => !entry.includes(`@import "${rel}"`))
    expect(missing).toEqual([])
  })

  it('gives every component directory an index.ts entry point', () => {
    const missing = componentDirs().filter((d) => {
      try { return !readdirSync(join(SRC, 'components', d)).includes('index.ts') } catch { return true }
    })
    expect(missing).toEqual([])
  })
})
