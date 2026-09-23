import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * Тип, объявленный публичным в модуле компонента, обязан быть виден из пакета.
 *
 * Дыра неочевидна и потому живуча: компонент работает, `.d.ts` собирается,
 * тесты зелёные — просто потребитель не может **назвать** тип, чтобы объявить
 * переменную. Он выкручивается выводом (`NonNullable<HeatmapProps['kinds']>`),
 * это работает, и о проблеме никто не узнаёт.
 *
 * Нашёл потребитель при вёрстке: у `HeatmapDay` экспорт есть, у его брата
 * `HeatmapKindStyle` нет. Проверка вскрыла второй такой же случай — `SortDir`
 * у `DataTable`, проживший так несколько релизов.
 *
 * Тот же принцип, что вытащил `formatWeekday`: **симметрия — проверяемое
 * свойство**, и проверять её надо списком, а не по тому, жалуется ли кто-то.
 */
const SRC = resolve(__dirname, '..')

/**
 * Типы, намеренно оставленные внутренними. Пустой список — не упущение:
 * пока такого случая не встретилось, и запись здесь должна появляться вместе
 * с причиной, а не «на всякий случай».
 */
const INTERNAL: Record<string, string[]> = {}

/**
 * Типы barrel-ов, намеренно НЕ доехавшие до корня пакета, с причиной. Причина
 * обязательна и проверяется: запись без неё роняет гейт. Пустой список — не
 * упущение, а факт: сегодня из корня достижимо всё.
 */
const NOT_IN_ROOT: Record<string, string> = {}

const ROOT_INDEX = join(SRC, 'index.ts')

/** `'./X.js'` → путь к настоящему `.ts`/`.tsx`. `null` — не наш модуль. */
function resolveSpec(spec: string, fromDir: string): string | null {
  if (!spec.startsWith('.')) return null
  const base = resolve(fromDir, spec.replace(/\.js$/, ''))
  for (const cand of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(cand)) return cand
  }
  return null
}

/**
 * Имя → файл, где оно ОБЪЯВЛЕНО. Через файл, а не через флаг «экспортируется»,
 * потому что предмет проверки ниже — одинаковые имена из разных мест: два
 * `export *` с одним именем от РАЗНЫХ объявлений ES-модули роняют МОЛЧА, без
 * ошибки сборки. Ровно этот случай (`TreeNode` у `Tree` и у модели строк,
 * DS-115) и стоило поймать машинно.
 */
const EXPORTS_CACHE = new Map<string, Map<string, string>>()

function exportsOf(file: string): Map<string, string> {
  const hit = EXPORTS_CACHE.get(file)
  if (hit) return hit
  const out = new Map<string, string>()
  // Кладём ДО обхода: цикл импортов вернёт неполную карту вместо переполнения
  // стека, а результат всё равно дособерётся у вызывающего.
  EXPORTS_CACHE.set(file, out)
  const src = readFileSync(file, 'utf8')
  const dir = resolve(file, '..')

  for (const m of src.matchAll(/^export (?:interface|type|function|const|class) (\w+)/gm)) {
    out.set(m[1]!, file)
  }
  for (const m of src.matchAll(/^export (?:type )?\{([^}]*)\} from ['"]([^'"]+)['"]/gms)) {
    const target = resolveSpec(m[2]!, dir)
    if (!target) continue
    const inner = exportsOf(target)
    for (const raw of m[1]!.split(',')) {
      const part = raw.trim().replace(/^type\s+/, '')
      if (!part) continue
      const [from, as] = part.split(/\s+as\s+/)
      const name = (as ?? from)!.trim()
      out.set(name, inner.get(from!.trim()) ?? target)
    }
  }
  for (const m of src.matchAll(/^export \* from ['"]([^'"]+)['"]/gm)) {
    const target = resolveSpec(m[1]!, dir)
    if (!target) continue
    for (const [k, v] of exportsOf(target)) out.set(k, v)
  }

  // Реэкспорт БЕЗ `from`: `import { type Column } from '../../internal/columns.js'`
  // и ниже `export type { Column }`. Форма нередкая — так `DataTable.tsx`
  // отдаёт наружу типы колонок, — и без её разбора имя числилось бы
  // объявленным здесь. Тогда `Column` из `DataTable` и `Column` из
  // `LedgerList` (тот берёт напрямую из `columns.ts`) выглядели бы двумя
  // разными объявлениями, то есть гейт нашёл бы ambiguous export на ровном
  // месте. Проверено: без этого блока он их и находит, шесть штук на два
  // barrel-а.
  const imported = new Map<string, string>()
  for (const m of src.matchAll(/^import (?:type )?\{([^}]*)\} from ['"]([^'"]+)['"]/gms)) {
    const target = resolveSpec(m[2]!, dir)
    if (!target) continue
    for (const raw of m[1]!.split(',')) {
      const part = raw.trim().replace(/^type\s+/, '')
      if (part) imported.set((part.split(/\s+as\s+/)[1] ?? part).trim(), target)
    }
  }
  for (const m of src.matchAll(/^export (?:type )?\{([^}]*)\}\s*$/gm)) {
    for (const raw of m[1]!.split(',')) {
      const part = raw.trim().replace(/^type\s+/, '')
      if (!part) continue
      const name = (part.split(/\s+as\s+/)[1] ?? part).trim()
      const from = imported.get(name)
      out.set(name, from ? (exportsOf(from).get(name) ?? from) : file)
    }
  }
  return out
}

describe('type exports', () => {
  it('каждый публичный тип компонента прокинут в его barrel', () => {
    const components = join(SRC, 'components')
    const gaps: string[] = []

    for (const name of readdirSync(components)) {
      const dir = join(components, name)
      const barrelPath = join(dir, 'index.ts')
      if (!existsSync(barrelPath)) continue
      const barrel = readFileSync(barrelPath, 'utf8')

      const declared = new Set<string>()
      for (const file of readdirSync(dir)) {
        if (!file.endsWith('.tsx') || file.endsWith('.test.tsx')) continue
        const src = readFileSync(join(dir, file), 'utf8')
        for (const m of src.matchAll(/^export (?:interface|type) (\w+)/gm)) {
          declared.add(m[1]!)
        }
      }

      const allowed = new Set(INTERNAL[name] ?? [])
      for (const type of declared) {
        if (allowed.has(type)) continue
        // Слово целиком: `HeatmapDay` не должен считаться прокинутым только
        // потому, что в barrel упомянут `HeatmapDayKind`.
        if (!new RegExp(`\\b${type}\\b`).test(barrel)) {
          gaps.push(`${name}: ${type}`)
        }
      }
    }

    expect(gaps, `не прокинуты в barrel: ${gaps.join(', ')}`).toEqual([])
  })

  /**
   * Вторая половина пути. Первая проверяет «компонент → его barrel», и на этом
   * останавливалась; «barrel → корень пакета» не проверял никто, а закрыт для
   * потребителя именно корень: `exports` в `package.json` — allowlist, подпутей
   * к компонентам в нём нет, и `@santarinto/jig/dist/src/components/DataTable` даёт
   * `ERR_PACKAGE_PATH_NOT_EXPORTED`. Тип, застрявший в barrel, назвать нельзя
   * ниоткуда (DS-115).
   */
  it('каждый тип barrel-а достижим из корня пакета', () => {
    const rootSrc = readFileSync(ROOT_INDEX, 'utf8')
    const rootDir = resolve(ROOT_INDEX, '..')

    // Явно перечисленные имена перебивают любые `export *`. Но достижимым имя
    // делает не запись, а то, КУДА она указывает: пока табличный узел строк
    // тоже звался `TreeNode`, корень отдавал под этим именем узел `Tree`, и
    // табличный оставался неназываемым. Поэтому карта имя → объявление, а не
    // список имён.
    const explicit = new Map<string, string>()
    for (const m of rootSrc.matchAll(/^export (?:type )?\{([^}]*)\} from ['"]([^'"]+)['"]/gms)) {
      const target = resolveSpec(m[2]!, rootDir)
      for (const raw of m[1]!.split(',')) {
        const part = raw.trim().replace(/^type\s+/, '')
        if (!part) continue
        const [from, as] = part.split(/\s+as\s+/)
        const name = (as ?? from)!.trim()
        if (target) explicit.set(name, exportsOf(target).get(from!.trim()) ?? target)
      }
    }

    // Что отдаёт каждый `export *` корня и ОТКУДА. Одно имя из двух разных
    // объявлений — ambiguous star export: ES-модули роняют его молча.
    const starred: Map<string, string>[] = []
    for (const m of rootSrc.matchAll(/^export \* from ['"]([^'"]+)['"]/gm)) {
      const target = resolveSpec(m[1]!, rootDir)
      if (target) starred.push(exportsOf(target))
    }

    const components = join(SRC, 'components')
    const gaps: string[] = []
    for (const name of readdirSync(components)) {
      const barrelPath = join(components, name, 'index.ts')
      if (!existsSync(barrelPath)) continue
      for (const [type, declaredIn] of exportsOf(barrelPath)) {
        if (type in NOT_IN_ROOT) continue
        const named = explicit.get(type)
        if (named) {
          if (named === declaredIn) continue
          gaps.push(`${name}: ${type} — корень отдаёт под этим именем другое объявление`)
          continue
        }
        const sources = new Set(starred.map((e) => e.get(type)).filter(Boolean))
        if (sources.size === 1 && sources.has(declaredIn)) continue
        gaps.push(sources.size === 0
          ? `${name}: ${type} — до корня не доехал`
          : `${name}: ${type} — неоднозначен, ${sources.size} разных объявления под одним именем`)
      }
    }

    expect(gaps, `не достижимы из корня пакета:\n${gaps.join('\n')}`).toEqual([])
  })

  it('запись в NOT_IN_ROOT несёт причину', () => {
    // Без этого список стал бы местом, куда молча складывают неудобные имена.
    const blank = Object.entries(NOT_IN_ROOT).filter(([, why]) => !why.trim())
    expect(blank.map(([n]) => n), 'запись без причины').toEqual([])
  })

  it('и обе проверки умеют находить нарушение', () => {
    // Утверждения выше верны и для разбора, который ничего не разбирает.
    const dt = exportsOf(join(SRC, 'components/DataTable/index.ts'))
    expect(dt.has('RowTreeNode'), 'разбор barrel-а не увидел его типов').toBe(true)
    expect(dt.get('RowTreeNode')).toBe(join(SRC, 'internal/rowModel.ts'))
    // Один и тот же тип из двух barrel-ов — ОДНО объявление, а не два разных:
    // именно поэтому `Column` из `DataTable` и `LedgerList` не ambiguous.
    // Стояла здесь пара по `DisplayRow`, и её пришлось сменить: с DS-154
    // `LedgerList` его не реэкспортирует вовсе — журнал не дерево, и общая
    // модель строк ушла из его поверхности вместе с `flattenTree`.
    const ll = exportsOf(join(SRC, 'components/LedgerList/index.ts'))
    expect(ll.get('Column')).toBe(dt.get('Column'))
    expect(ll.has('flattenTree'), '`flattenTree` вернулся в barrel журнала (DS-154)').toBe(false)
    // А `TreeNode` у `Tree` объявлен у себя — не там, где узел модели строк.
    const tree = exportsOf(join(SRC, 'components/Tree/index.ts'))
    expect(tree.get('TreeNode')).not.toBe(dt.get('RowTreeNode'))
  })
})
