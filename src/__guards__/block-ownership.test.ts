import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * Два компонента не могут владеть одним блочным классом.
 *
 * `CodeBlock` вышел с `.ds-code` — классом, который уже принадлежал `CodeInput`
 * (`inline-flex; flex-direction: column`). Импорт `CodeInput.css` идёт позже,
 * специфичность равная, поэтому его правило побеждало: раскладка нового
 * компонента разваливалась ровно в собранной системе.
 *
 * Ни один изолированный тест этого не видел — они грузят один файл стилей.
 * Поймал браузерный инвариант, который грузит `styles.css` целиком, и то по
 * косвенному признаку («команда не прокручивается»). Этот гейт называет причину
 * прямо и до сборки.
 */
const SRC = resolve(__dirname, '..')

/** Блочные классы вида `.ds-foo` в начале селектора; модификаторы и элементы не в счёт. */
function blocksOf(css: string): Set<string> {
  const out = new Set<string>()
  // Комментарии вырезаются первыми, и это не мелочь: без этого правило,
  // перед которым стоит комментарий, склеивалось с ним в один «селектор», и
  // гейт молча не видел ни одного блока в файле. Первая версия так и вела себя
  // — проходила на том самом столкновении, ради которого написана.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  // Только объявления, а не любые упоминания: селектор до `{`.
  for (const m of clean.matchAll(/^([^@{}]+)\{/gm)) {
    for (const sel of m[1]!.split(',')) {
      const b = sel.trim().match(/^\.(ds-[a-z0-9]+)(?![\w-])/)
      if (b) out.add(b[1]!)
    }
  }
  return out
}

describe('владение блочным классом', () => {
  it('один блок — один компонент', () => {
    const dirs = readdirSync(join(SRC, 'components'), { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name)

    const owner = new Map<string, string>()
    const clashes: string[] = []
    for (const dir of dirs) {
      const files = readdirSync(join(SRC, 'components', dir)).filter((f) => f.endsWith('.css'))
      for (const f of files) {
        const css = readFileSync(join(SRC, 'components', dir, f), 'utf8')
        for (const block of blocksOf(css)) {
          const prev = owner.get(block)
          if (prev && prev !== dir) clashes.push(`${block}: ${prev} и ${dir}`)
          else owner.set(block, dir)
        }
      }
    }
    expect(clashes, `один класс у разных компонентов — победит тот, чей CSS импортирован позже:\n${clashes.join('\n')}`).toEqual([])
  })
})
