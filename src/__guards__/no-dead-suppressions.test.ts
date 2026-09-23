import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

/**
 * Директива подавления линтера в проекте, где линтера нет, — не «на будущее», а
 * ложное свидетельство: она читается как «здесь проверено и разрешено», хотя
 * проверять было некому.
 *
 * Случай, из-за которого гейт написан (DS-113). Три
 * `react-hooks/exhaustive-deps` — в `Tabs`, `DropdownMenu` и `LogViewer` — и
 * одна `@typescript-eslint/no-explicit-any` в тесте `DataTable`. Ни `eslint`,
 * ни `biome`, ни `oxlint` в зависимостях, ни одного конфига в корне: `make
 * check` — это guards, test, typecheck, build, measure. Четыре директивы не
 * подавляли ничего.
 *
 * Цена — не косметика. За одной из них жил настоящий дефект `LogViewer`:
 * прыжок к первому совпадению не случался, если строки приезжали позже запроса.
 * Директива объясняла неполный список зависимостей и тем закрывала вопрос,
 * который стоило задать. Неполнота зависимостей в этом коде трижды из трёх
 * оказалась КОНТРАКТОМ компонента, и держать контракт следует кейсом, который
 * краснеет, а не комментарием, который любой рефакторинг «поправит».
 *
 * Обратная сторона тоже проверяется. Заведут линтер — гейт обязан замолчать:
 * директивы станут настоящими, и запрещать их нечем. Поэтому предикат
 * `hasLinter` вынесен отдельно и проверяется на подложенных данных, а не на
 * настоящем `package.json`, — иначе кейс про «линтер появился» пришлось бы
 * писать подменой файла на диске.
 */
const ROOT = resolve(__dirname, '../..')
const SRC = resolve(__dirname, '..')

/**
 * Иглы собираются из кусков НАМЕРЕННО: литерал в этом файле уронил бы гейт о
 * него самого, и пришлось бы исключать его из обхода — то есть завести место,
 * где директива разрешена. Тот же приём, что в `no-nul-bytes`.
 */
const NEEDLES = ['eslint' + '-disable', 'biome' + '-ignore', 'oxlint' + '-disable']

const LINTERS = ['eslint', '@biomejs/biome', 'biome', 'oxlint', 'rome']

/** Конфиги в корне: линтер можно гонять и через `npx`, без записи в зависимостях. */
const LINTER_CONFIGS = [
  'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts',
  '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml',
  'biome.json', 'biome.jsonc', '.oxlintrc.json',
]

interface Pkg { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }

/** Есть ли в проекте линтер: запись в зависимостях ИЛИ конфиг в корне. */
export function hasLinter(pkg: Pkg, configsPresent: string[]): boolean {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  return LINTERS.some((l) => l in deps) || configsPresent.length > 0
}

/** Строки-нарушители: `путь:строка` для каждой найденной директивы. */
export function suppressionsIn(path: string, text: string): string[] {
  const out: string[] = []
  text.split('\n').forEach((line, i) => {
    if (NEEDLES.some((n) => line.includes(n))) out.push(`${path}:${i + 1}`)
  })
  return out
}

const SCAN_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css']

function sources(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...sources(join(dir, e.name)))
    else if (SCAN_EXT.some((x) => e.name.endsWith(x))) out.push(join(dir, e.name))
  }
  return out
}

describe('мёртвые директивы подавления', () => {
  const pkg: Pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const configs = LINTER_CONFIGS.filter((c) => existsSync(join(ROOT, c)))
  const files = sources(SRC)

  it('обход доходит до файлов', () => {
    // Без этого «нарушений нет» осталось бы зелёным и при сломанном обходе.
    expect(files.length, 'обход не нашёл исходников под src/').toBeGreaterThan(200)
  })

  it('их нет под src/, пока линтера в проекте нет', () => {
    if (hasLinter(pkg, configs)) {
      // Линтер завели — директивы стали настоящими, запрещать их нечем. Гейт
      // замолкает; о том, что запрет пора снимать, краснеет последний кейс.
      return
    }
    const offenders = files.flatMap((f) => suppressionsIn(relative(ROOT, f), readFileSync(f, 'utf8')))
    expect(
      offenders,
      'директива подавления линтера при отсутствии линтера ничего не подавляет,'
      + ' а читается как «здесь проверено и разрешено»:\n' + offenders.join('\n'),
    ).toEqual([])
  })

  it('и проверка умеет их находить', () => {
    // Утверждение выше верно и для проверки, которая не может сработать никогда.
    const line = '// ' + 'eslint' + '-disable-next-line react-hooks/exhaustive-deps'
    expect(suppressionsIn('a.ts', `const x = 1\n${line}\n`)).toEqual(['a.ts:2'])
    expect(suppressionsIn('a.ts', 'const x = 1\n')).toEqual([])
  })

  it('линтер в зависимостях или конфиг в корне снимает запрет', () => {
    // Обратная сторона: без неё гейт однажды запретил бы НАСТОЯЩИЕ директивы.
    expect(hasLinter({}, [])).toBe(false)
    expect(hasLinter({ devDependencies: { vitest: '^2' } }, [])).toBe(false)
    expect(hasLinter({ devDependencies: { eslint: '^9' } }, [])).toBe(true)
    expect(hasLinter({ devDependencies: { '@biomejs/biome': '^1' } }, [])).toBe(true)
    expect(hasLinter({ dependencies: { oxlint: '^0.9' } }, [])).toBe(true)
    expect(hasLinter({}, ['eslint.config.js'])).toBe(true)
  })

  it('на этом проекте линтера нет — иначе запрет выше не имеет смысла', () => {
    // Санитар на соседе с заранее известным значением: если однажды линтер
    // заведут и забудут снять запрет, красным станет ЭТОТ кейс, и по его имени
    // видно, что делать. Молчаливый пропуск в кейсе выше — не то же самое.
    expect(hasLinter(pkg, configs), `линтер обнаружен: ${configs.join(', ') || 'в зависимостях'}`).toBe(false)
  })
})
