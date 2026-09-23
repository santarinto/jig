/**
 * Фикстуры не уезжают в пакет.
 *
 * `*.fixture.tsx` живут рядом с компонентами — это осознанный выбор формата
 * (фикстура должна ломаться на `typecheck` вместе с компонентом, а не через
 * месяц в отдельной папке). Плата за него — риск отправить их потребителю:
 * фикстура тянет за собой стресс-данные на сотни строк и импорт соседних
 * компонентов, а нужна ровно одному инструменту, которого у потребителя нет.
 *
 * ДВА СЛОЯ, и второй не заменяет первый.
 *
 * Слой 1 — намерение: `tsconfig.build.json` действительно исключает фикстуры.
 * Работает всегда, в том числе на чистом дереве без `dist`, и краснеет в тот
 * момент, когда кто-то правит `exclude`, — то есть когда ошибку ещё дёшево
 * понять.
 *
 * Слой 2 — результат: в собранном `dist` фикстур нет. Работает только когда
 * `dist` есть на диске — с JIG-28 это уже не гарантия клона (`dist/` больше не
 * в git, см. `.gitignore`), а состояние «уже собирали хоть раз в этом рабочем
 * дереве» (тот же приём, каким живёт слой 2 в `build-input-mapping`). Ловит то,
 * чего первый слой не видит: сборку другим конфигом, копирование файлов мимо
 * `tsc`, изменение `rootDir`.
 *
 * СЧЁТЧИК ОБОЙДЁННОГО обязателен в обоих слоях: «ни одна фикстура не уехала»
 * верно и тогда, когда фикстур ноль или когда обход не нашёл ни одного файла
 * (та же логика, что у счётчика обойдённых в `no-nul-bytes`).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const SRC = join(ROOT, 'src')
const DIST = join(ROOT, 'dist')

/** Все файлы под каталогом, путями от корня репозитория. */
function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(relative(ROOT, full))
  }
  return out
}

const fixtures = walk(SRC).filter((p) => p.endsWith('.fixture.tsx'))

describe('фикстуры не уезжают в пакет', () => {
  it('в исходнике фикстуры ЕСТЬ — иначе проверять нечего', () => {
    // Без этого утверждения оба слоя ниже проходят на пустом множестве.
    expect(fixtures.length, 'фикстур не найдено — гейт проверяет пустоту').toBeGreaterThan(0)
  })

  it('сборочный конфиг исключает их по шаблону, а не поимённо', () => {
    // Поимённый список протух бы на второй фикстуре, и заметил бы это
    // потребитель, а не автор.
    const cfg = JSON.parse(readFileSync(join(ROOT, 'tsconfig.build.json'), 'utf8')) as {
      exclude?: string[]
    }
    expect(cfg.exclude ?? []).toContain('**/*.fixture.tsx')
  })

  it('формат фикстуры и его валидатор в сборку тоже не идут', () => {
    // `src/internal/fixture.ts` — типы формата, `fixture-validate.ts` — гейт
    // связок. Оба нужны только верстаку; уехав, они потянули бы за собой
    // публичный тип, которого система не обещала.
    const cfg = JSON.parse(readFileSync(join(ROOT, 'tsconfig.build.json'), 'utf8')) as {
      exclude?: string[]
    }
    expect(cfg.exclude ?? []).toEqual(
      expect.arrayContaining(['src/internal/fixture.ts', 'src/internal/fixture-validate.ts']),
    )
  })
})

describe.skipIf(!existsSync(DIST))('собранный dist', () => {
  const shipped = existsSync(DIST) ? walk(DIST) : []

  it('обойдён целиком — иначе «фикстур нет» ничего не значит', () => {
    expect(shipped.length, 'в dist ноль файлов — сборка не состоялась').toBeGreaterThan(50)
  })

  it('ни одной фикстуры и ни одного следа формата', () => {
    const leaked = shipped.filter(
      (p) => /\.fixture\./.test(p) || /internal[\\/]fixture(-validate)?\./.test(p),
    )
    expect(leaked, `уехало в пакет: ${leaked.join(', ')}`).toEqual([])
  })

  it('и самого верстака в пакете нет', () => {
    // `workbench/` не входит в `include` сборочного конфига, но это условие
    // держится на одном слове в другом файле: `rootDir: "."` делает соседний
    // каталог законной частью дерева вывода, стоит ему попасть в охват.
    const leaked = shipped.filter((p) => /(^|[\\/])workbench[\\/]/.test(p))
    expect(leaked, `верстак уехал в пакет: ${leaked.join(', ')}`).toEqual([])
  })

  it('конвертер design-sync читает те же .d.ts, что и раньше: фикстурных среди них нет', () => {
    // Ресинк дизайн-агента строится по `dist/src/**/*.d.ts`. Уехавшая
    // фикстура добавила бы туда публичный тип, которого система не обещала,
    // и он приехал бы в превью дизайн-агента как часть API.
    const dts = shipped.filter((p) => p.endsWith('.d.ts'))
    expect(dts.length, 'в dist нет ни одного .d.ts — конвертеру нечего читать').toBeGreaterThan(50)
    expect(dts.filter((p) => /\.fixture\./.test(p))).toEqual([])
  })
})
