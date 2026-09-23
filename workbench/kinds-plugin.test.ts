/**
 * Сборка карты видов с диска (DS-67). Заведено по находке ревью: путь
 * «файл изменился → карта другая» держал ВЕСЬ инструмент и не был покрыт ничем.
 *
 * Что здесь проверяется и почему именно это:
 *
 *  - карта МЕНЯЕТСЯ на правку `kind` и СТАБИЛЬНА между двумя чтениями без
 *    правок. Обе половины несущие: на них стоит `if (now === last) return` в
 *    обработчике watcher-а. Первая сломается — правка не доедет (тот самый
 *    дефект, что чинился вручную); вторая сломается — верстак начнёт
 *    перезагружаться на каждое касание файла;
 *  - каталог, исчезнувший ПОСРЕДИ обхода, не роняет процесс. Обход зовётся из
 *    слушателя chokidar, и брошенное там исключение — не 500, а смерть
 *    дев-сервера. Воспроизводится каталогом без прав на чтение: ENOENT и
 *    EACCES приходят из одного и того же `readdirSync`;
 *  - нечитаемый ФАЙЛ даёт `unread`, а не пропуск строки. Пропавшая из карты
 *    фикстура читается как «такой нет», а она есть.
 *
 * Дерево временное, а не репозиторий: `kinds-truth.test.ts` уже утверждает
 * правду про настоящие фикстуры, а здесь нужны случаи, которых в репозитории
 * нет и быть не должно.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { tempRootManual } from '../src/__guards__/tmp-sandbox.js'
import { buildKindRows, isFixtureFile } from './kinds-plugin.js'

const roots: string[] = []

const makeRoot = (): string => {
  // Снос остаётся здесь, в `afterEach`: перед ним надо вернуть права каталогу,
  // которому тест их снял, — авто-снос `tempRoot` этого не умеет (DS-165).
  const root = tempRootManual('ds-wb-kinds-').dir
  roots.push(root)
  mkdirSync(join(root, 'src', 'components'), { recursive: true })
  return root
}

const putFixture = (root: string, name: string, body: string): string => {
  const dir = join(root, 'src', 'components', name)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${name}.fixture.tsx`)
  writeFileSync(path, body)
  return path
}

const withKind = (name: string, kind: string): string =>
  `export default defineFixture({ name: '${name}', kind: '${kind}' })\n`

afterEach(() => {
  for (const r of roots.splice(0)) {
    try {
      chmodSync(join(r, 'src', 'components'), 0o755)
    } catch {
      // каталога могло не быть — уборке это не мешает
    }
    rmSync(r, { recursive: true, force: true })
  }
})

describe('buildKindRows', () => {
  it('читает вид каждой фикстуры и сортирует по имени', () => {
    const root = makeRoot()
    putFixture(root, 'Zeta', withKind('Zeta', 'block'))
    putFixture(root, 'Alpha', withKind('Alpha', 'inline'))

    expect(buildKindRows(root)).toEqual([
      { name: 'Alpha', kind: 'inline' },
      { name: 'Zeta', kind: 'block' },
    ])
  })

  it('фикстура из src/icons встаёт в ту же карту, а отсутствие каталога не ошибка (DS-260)', () => {
    const root = makeRoot()
    putFixture(root, 'Zeta', withKind('Zeta', 'block'))
    // Без `src/icons` — обычное дерево теста: карта обязана собраться.
    expect(buildKindRows(root).map((r) => r.name)).toEqual(['Zeta'])

    mkdirSync(join(root, 'src', 'icons'))
    writeFileSync(join(root, 'src', 'icons', 'Icon.fixture.tsx'), withKind('Icon', 'inline'))
    writeFileSync(join(root, 'src', 'icons', 'Icon.tsx'), 'export const Icon = 1\n')
    expect(buildKindRows(root)).toEqual([
      { name: 'Icon', kind: 'inline' },
      { name: 'Zeta', kind: 'block' },
    ])
  })

  it('правка kind меняет карту, а два чтения без правок дают одно и то же', () => {
    const root = makeRoot()
    putFixture(root, 'Alpha', withKind('Alpha', 'inline'))
    const before = JSON.stringify(buildKindRows(root))

    // Стабильность — не придирка: на равенстве двух чтений стоит решение «не
    // перезагружать верстак». Нестабильное чтение (порядок обхода каталога,
    // например) перезагружало бы его на каждое касание любого файла.
    expect(JSON.stringify(buildKindRows(root))).toBe(before)

    putFixture(root, 'Alpha', withKind('Alpha', 'block'))
    expect(JSON.stringify(buildKindRows(root))).not.toBe(before)
  })

  it('новый файл появляется в карте, удалённый исчезает', () => {
    const root = makeRoot()
    putFixture(root, 'Alpha', withKind('Alpha', 'inline'))
    const added = putFixture(root, 'Beta', withKind('Beta', 'any'))
    expect(buildKindRows(root).map((r) => r.name)).toEqual(['Alpha', 'Beta'])

    rmSync(added)
    expect(buildKindRows(root).map((r) => r.name)).toEqual(['Alpha'])
  })

  it('каталог, который не прочитать, не роняет обход', () => {
    const root = makeRoot()
    putFixture(root, 'Alpha', withKind('Alpha', 'inline'))
    const closed = join(root, 'src', 'components', 'Closed')
    mkdirSync(closed)
    chmodSync(closed, 0o000)
    try {
      // Не бросает — и остальные фикстуры на месте. Броска хватило бы, чтобы
      // убить дев-сервер: обход зовётся из слушателя chokidar.
      expect(buildKindRows(root).map((r) => r.name)).toEqual(['Alpha'])
    } finally {
      chmodSync(closed, 0o755)
    }
  })

  it('нечитаемый файл фикстуры едет как «вид не прочитан», а не пропадает', () => {
    const root = makeRoot()
    putFixture(root, 'Alpha', withKind('Alpha', 'inline'))
    // Каталог на месте файла: `readFileSync` даёт EISDIR — та же ветка, что и
    // у любого другого отказа чтения, и портативнее прав доступа.
    mkdirSync(join(root, 'src', 'components', 'Alpha', 'Beta.fixture.tsx'), { recursive: true })

    expect(buildKindRows(root)).toEqual([
      { name: 'Alpha', kind: 'inline' },
      { name: 'Beta', unread: true },
    ])
  })
})

describe('isFixtureFile', () => {
  // Пути приходят от chokidar абсолютными — их и проверяем, а не хвосты.
  const abs = (...parts: string[]): string => sep + join(...parts)

  it('фикстура компонента — да', () => {
    expect(isFixtureFile(abs('repo', 'src', 'components', 'Badge', 'Badge.fixture.tsx'))).toBe(true)
  })

  it('обычный файл компонента — нет: иначе карта пересчитывалась бы на каждую правку кода', () => {
    expect(isFixtureFile(abs('repo', 'src', 'components', 'Badge', 'Badge.tsx'))).toBe(false)
    expect(isFixtureFile(abs('repo', 'src', 'components', 'Badge', 'Badge.css'))).toBe(false)
  })

  it('фикстура публичного компонента вне каталога (src/icons) — да (DS-260)', () => {
    expect(isFixtureFile(abs('repo', 'src', 'icons', 'Icon.fixture.tsx'))).toBe(true)
  })

  it('фикстура вне наборов FIXTURE_GLOBS — нет: в карту попадают только они', () => {
    expect(isFixtureFile(abs('repo', 'workbench', 'Fake.fixture.tsx'))).toBe(false)
  })
})
