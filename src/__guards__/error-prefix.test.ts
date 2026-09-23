import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * Сообщение `throw new Error(` в `src/components/**` и `src/internal/**`,
 * которое несёт префикс пакета, обязано начинаться с `jig: ` (JIG-2).
 *
 * До этого гейта префикс держался только договорённостью: пятнадцать `throw`,
 * переименованных из старого префикса пакета в `jig: ` вручную, не сверял НИ
 * ОДИН тест — `toThrow` на каждом из них смотрит только на регэксп ПОСЛЕ
 * префикса (`/tone.*brand/`, `/rowDimensions/` …), и чужой префикс прошёл бы
 * мимо всех них молча. Единственное реальное чтение префикса —
 * `src/internal/useAnchoredPosition.ts`, но и там `console.warn`, не `throw`,
 * и гейт до него не дотягивается по конструкции ниже (см. докблок про
 * `throw new Error(` буквально).
 *
 * Предмет — не «у throw обязан быть префикс» (у
 * `CodeBlock.tsx: throw new Error('clipboard unavailable')` его нет и не
 * должно быть — это проброс отказа браузерного API, а не адресованное
 * разработчику сообщение), а «если похоже на префикс пакета, он именно
 * `jig:`». JIG-3 (squash в `santarinto/jig`): проверка обобщена от сверки с
 * ОДНИМ конкретным старым литералом до формы «любой `<ident>: ` в начале
 * строки throw — либо `jig:`, либо его тут не должно быть вовсе». Так гейт не
 * хранит имя старого бренда сам (грепу по нему больше нечего находить), и
 * ловит любой чужой префикс, а не только тот один, что был переименован в
 * JIG-2.
 */
const ROOT = resolve(__dirname, '../..')
const DIRS = ['src/components', 'src/internal']

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((d) => d.isFile() && /\.tsx?$/.test(d.name) && !/\.(test|fixture)\.tsx?$/.test(d.name))
    .map((d) => join(d.parentPath ?? (d as unknown as { path: string }).path, d.name))
}

const FILES = DIRS.flatMap((rel) => listSourceFiles(resolve(ROOT, rel)))

/** `<ident>: ` сразу после открывающей кавычки — форма, которую нёс и старый префикс, и новый. */
const PREFIX_RE = /throw new Error\(\s*[`'"]([a-z][a-z0-9-]*): /g

function packagePrefixes(text: string): string[] {
  return [...text.matchAll(PREFIX_RE)].map((m) => m[1]!)
}

describe('src/components и src/internal: throw new Error( с префиксом пакета — jig:', () => {
  it('обход не выродился', () => {
    expect(FILES.length, 'файлов в src/components + src/internal').toBeGreaterThan(20)
  })

  it('ни один throw не несёт чужой префикс пакета — только jig: или никакого', () => {
    const foreign: string[] = []
    for (const f of FILES) {
      const prefixes = packagePrefixes(readFileSync(f, 'utf8')).filter((p) => p !== 'jig')
      for (const p of prefixes) foreign.push(`${f.slice(ROOT.length + 1)}: "${p}:"`)
    }
    expect(foreign).toEqual([])
  })

  it('префикс jig: реально встречается — проверка не зелена на пустоте', () => {
    const total = FILES.reduce((n, f) => n + packagePrefixes(readFileSync(f, 'utf8')).filter((p) => p === 'jig').length, 0)
    expect(total).toBeGreaterThan(0)
  })
})
