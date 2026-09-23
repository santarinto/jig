import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import { builtinModules } from 'node:module'

/**
 * Внешний пакет, который импортит шиппящийся код, обязан быть объявлен в
 * `dependencies` или `peerDependencies` — иначе он не приедет потребителю.
 *
 * Поймано на 1.27.0: `Tabs`/`Tree`/`Card` импортили `@tabler/icons-react`
 * (devDependency). В своей сборке всё зелено — пакет стоит локально; у
 * потребителя же тарбол его не несёт, и сборка падала на
 * «rollup failed to resolve @tabler/icons-react». Раньше это ловил только
 * полный `make smoke` (собирает тарбол и ставит в приложение) — а `npm test`
 * молчал. Этот guard переносит ту же проверку в быстрый прогон: импорт,
 * которого нет среди объявленных зависимостей, валит тесты сразу.
 *
 * Проверяется то, что попадает в `dist/` (шиппится): `src/**` без тестов и
 * тестовых каталогов. `react-dom` — тоже peer, поэтому в наборе разрешённых.
 */
const SRC = resolve(__dirname, '..')
const ROOT = resolve(SRC, '..')

const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
const ALLOWED = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
])
const BUILTINS = new Set(builtinModules)

/** Корень пакета из спецификатора: `@scope/name/sub` → `@scope/name`, `name/sub` → `name`. */
function packageRoot(spec: string): string {
  const parts = spec.split('/')
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!
}

function shippedFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === '__guards__' || e.name === '__smoke__') continue
      out.push(...shippedFiles(p))
    } else if (/\.tsx?$/.test(e.name) && !e.name.includes('.test.')) {
      out.push(p)
    }
  }
  return out
}

/**
 * Спецификаторы из `import … from '…'`, `export … from '…'` и `import '…'`.
 *
 * Отрицательный просмотр назад на кавычку — не перестраховка, а починка живого
 * ложного срабатывания (DS-127). Данные `{ id: 'from', label: 'Подача' }`
 * дают текст `from', label: '`, и прежний `\bfrom\s*['"]` разбирал его как
 * импорт пакета «, label: ». Гейт валился на СЛОВЕ В ДАННЫХ — а `from` и
 * `import` слова обычные, и запретить их в строках нельзя.
 *
 * Разбором текста, а не AST, здесь остаёмся намеренно: предмет гейта — быстрый
 * прогон, а парсер TS ради семи регулярных выражений стоил бы дороже класса
 * ошибок, который он бы закрыл. Просмотр назад закрывает ровно тот класс,
 * который случился, и это записано тестом ниже.
 */
function importSpecifiers(source: string): string[] {
  const out: string[] = []
  const fromRe = /(?<!['"])\bfrom\s*['"]([^'"]+)['"]/g
  const bareRe = /(?<!['"])\bimport\s*['"]([^'"]+)['"]/g
  for (const re of [fromRe, bareRe]) {
    for (const m of source.matchAll(re)) out.push(m[1]!)
  }
  return out
}

describe('shipped code imports only declared dependencies', () => {
  /**
   * Сначала проверяется САМ РАЗБОРЩИК, и только потом им обходится репозиторий.
   * Обход по здоровому дереву зелен и при разборщике, который не находит ничего,
   * — то есть главное утверждение гейта на репозитории неопровержимо.
   */
  it('находит настоящие импорты во всех трёх формах', () => {
    const src = [
      "import { a } from 'react'",
      "export { b } from '@scope/pkg/sub'",
      "import 'side-effect-only'",
      'import x from "double-quoted"',
    ].join('\n')

    expect(importSpecifiers(src)).toEqual([
      'react',
      '@scope/pkg/sub',
      'double-quoted',
      'side-effect-only',
    ])
  })

  it('не принимает слово в ДАННЫХ за импорт', () => {
    // Ровно тот текст, на котором гейт свалился (DS-127): ключ `from`
    // в объекте с данными фикстуры. Второй случай — то же самое со словом
    // `import`. Оба обычны, и запретить их в строках нельзя.
    const src = [
      "const route = { id: 'from', label: 'Подача', to: 'Шереметьево' }",
      "const help = { id: 'import', label: 'Загрузка из файла' }",
    ].join('\n')

    expect(importSpecifiers(src)).toEqual([])
  })

  it('никакой src/**-файл не тянет пакет вне dependencies/peerDependencies', () => {
    const offenders: string[] = []
    for (const file of shippedFiles(join(SRC, 'components')).concat(
      shippedFiles(join(SRC, 'internal')),
      shippedFiles(join(SRC, 'examples')),
      shippedFiles(join(SRC, 'theme')),
    )) {
      const source = readFileSync(file, 'utf8')
      for (const spec of importSpecifiers(source)) {
        if (spec.startsWith('.') || spec.startsWith('/')) continue // относительное — своё
        if (spec.startsWith('node:')) continue
        const root = packageRoot(spec)
        if (BUILTINS.has(root) || ALLOWED.has(root)) continue
        offenders.push(`${relative(ROOT, file)}: import '${spec}'`)
      }
    }
    expect(
      offenders,
      `внешний импорт вне dependencies/peerDependencies (потребитель не соберётся):\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
