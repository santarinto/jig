/**
 * Дев-плагин Vite: карта видов виртуальным модулем (DS-67).
 *
 * Отдаёт `virtual:ds-wb/kinds` — по записи `{ name, kind }` на каждую фикстуру
 * репозитория, собранную РАЗБОРОМ ТЕКСТА (`kinds-source.ts`), без единого
 * импорта модуля компонента. Раньше ту же карту строил кадр, загружая все
 * фикстуры разом; цена была не в самой загрузке, а в том, когда она случается —
 * человек открывает выбор начинки и ждёт, пока исполнятся тринадцать модулей
 * со своими стресс-данными.
 *
 * ПЛАГИН, А НЕ СГЕНЕРИРОВАННЫЙ ФАЙЛ В РЕПОЗИТОРИИ: файл пришлось бы
 * перегенерировать руками, и он протух бы на первой же новой фикстуре —
 * молча, потому что протухшая карта выглядит как рабочая.
 *
 * Стоит и в `vite.workbench.config.ts`, и в `vitest.config.ts`: `registry.ts`
 * импортирует виртуальный модуль, а его тянут почти все тесты верстака.
 * Один плагин на оба места — иначе тесты проверяли бы вторую реализацию.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import type { Plugin } from 'vite'
import { readFixtureGroup, readFixtureKind } from './kinds-source.js'
import type { KindRow } from './protocol.js'

export const KINDS_ID = 'virtual:ds-wb/kinds'
const RESOLVED = '\0' + KINDS_ID

const SUFFIX = '.fixture.tsx'

/**
 * НАБОР ФИКСТУР — единственная его декларация (DS-260). `import.meta.glob`
 * берёт только литерал, поэтому в местах импорта (`registry.ts`, `shows-plan.ts`,
 * гейты фикстур) набор записан копиями; каждая копия обязана разрешаться ровно
 * сюда, а обход ниже — находить ровно то же, что эти шаблоны. Держит это гейт
 * `fixture-coverage` («список фикстур один»).
 *
 * Второй шаблон — публичные компоненты вне каталога: `<Icon>` живёт в
 * `src/icons/`, потому что папка в `src/components/` подняла бы релиз до minor,
 * а перенос сломал бы путь импорта потребителю.
 */
export const FIXTURE_GLOBS = ['src/components/*/*.fixture.tsx', 'src/icons/*.fixture.tsx'] as const

/** Каталоги, за которыми следит дев-сервер: ровно каталоги `FIXTURE_GLOBS`. */
const WATCHED = [join('src', 'components'), join('src', 'icons')]

// Обход `FIXTURE_GLOBS` руками: каталог на компонент с файлом `<Имя>.fixture.tsx`
// плюс плоский `src/icons/`. Не `fs.globSync`, потому что обход обязан
// переживать каталог, исчезнувший посреди чтения (довод ниже), а согласие с
// шаблонами держит гейт. Звёздочками набор здесь не записать — внутри блочного
// комментария они закрывают его раньше времени.
export function fixtureFiles(root: string): { name: string; path: string }[] {
  const dir = join(root, 'src', 'components')
  const out: { name: string; path: string }[] = []
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    // Каталог мог исчезнуть МЕЖДУ двумя обходами: внешний уже перечислил
    // `Foo`, внутренний приходит на syscall позже и получает ENOENT. Это не
    // выдумка про гонки, а обычные `rm -rf src/components/Foo` и переключение
    // ветки при поднятом `npm run wb` — а обход зовётся из слушателя chokidar,
    // где брошенное исключение не 500, а СМЕРТЬ ПРОЦЕССА дев-сервера.
    let files: string[]
    try {
      files = readdirSync(join(dir, d.name))
    } catch {
      continue
    }
    for (const f of files) {
      if (f.endsWith(SUFFIX)) out.push({ name: f.slice(0, -SUFFIX.length), path: join(dir, d.name, f) })
    }
  }
  // Плоский каталог вне каталога компонентов. Его ОТСУТСТВИЕ не ошибка, в
  // отличие от `src/components`: временные деревья тестов плагина его не
  // заводят, и корень от этого не становится чужим.
  let flat: string[] = []
  try {
    flat = readdirSync(join(root, 'src', 'icons'))
  } catch {
    flat = []
  }
  for (const f of flat) {
    if (f.endsWith(SUFFIX)) out.push({ name: f.slice(0, -SUFFIX.length), path: join(root, 'src', 'icons', f) })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Тронул ли этот файл состав карты. */
export function isFixtureFile(file: string): boolean {
  return file.endsWith(SUFFIX) && WATCHED.some((d) => file.includes(`${sep}${d}${sep}`))
}

/**
 * Карта видов репозитория. Нечитаемый файл — это `unread`, а не пропуск:
 * исчезнувшая из карты фикстура читается как «такой нет», а она есть.
 */
export function buildKindRows(root: string): KindRow[] {
  return fixtureFiles(root).map(({ name, path }) => {
    let read
    let group: string | null = null
    try {
      const src = readFileSync(path, 'utf8')
      read = readFixtureKind(src)
      group = readFixtureGroup(src)
    } catch {
      read = { unread: true } as const
    }
    return { name, ...(group === null ? {} : { group }), ...read }
  })
}

export function kindsPlugin(root: string): Plugin {
  /** Карта строкой для сравнения, либо `null` — «прочитать не вышло». */
  const read = (): string | null => {
    try {
      return JSON.stringify(buildKindRows(root))
    } catch {
      return null
    }
  }

  return {
    name: 'ds-wb-kinds',
    resolveId(id) {
      return id === KINDS_ID ? RESOLVED : null
    },
    load(id) {
      if (id !== RESOLVED) return null
      // Читается с диска на КАЖДУЮ загрузку модуля, кэша в плагине нет: свой
      // кэш пришлось бы гасить теми же событиями, что и модуль Vite, то есть
      // держать два срока годности вместо одного.
      //
      // Отсутствие `src/components` НЕ ловится: это не гонка, а неверно
      // собранный конфиг (плагину дали чужой корень), и молчаливая пустая
      // карта увела бы диагноз в «фикстур почему-то нет». Ошибка называет
      // корень — без него сообщение ENOENT ни на что не указывает.
      let rows: KindRow[]
      try {
        rows = buildKindRows(root)
      } catch (err) {
        throw new Error(
          `ds-wb-kinds: не прочитать фикстуры в ${join(root, 'src', 'components')} — ` +
            `${err instanceof Error ? err.message : String(err)}`,
        )
      }
      return `// сгенерировано ds-wb-kinds (workbench/kinds-plugin.ts)\nexport const KINDS = ${JSON.stringify(rows)}\n`
    },
    /**
     * Свежесть карты — целиком на этом обработчике, и он НЕ ДЕКОРАТИВЕН.
     * Измерено на живом сервере: без него правка `kind: 'inline'` на `'block'`
     * не доезжала вовсе — виртуальный модуль отдавался из кэша Vite и после
     * перезагрузки страницы. Симптом: компонент не появляется в списке
     * совместимых, перезагружай сколько хочешь.
     *
     * `watcher.add` обязателен и был вторым дефектом того же замера. Корень
     * дев-сервера здесь `workbench`, а фикстуры лежат в `src/components` —
     * ВЫШЕ корня. Vite сам следит только за тем, что попало в граф модулей, а
     * фикстура попадает туда, лишь когда её открыли: карта, которая обязана
     * знать про ВСЕ фикстуры, обновлялась бы только по уже открытым.
     *
     * `change` здесь, а не в `handleHotUpdate`, по той же причине: тот
     * вызывается для файлов графа, и на неоткрытой фикстуре не срабатывал.
     *
     * СРАВНЕНИЕ КАРТ, а не перезагрузка на каждую правку. Полная перезагрузка
     * уводит ОБА документа — карту импортирует и кадр, и оболочка (список
     * слева), — а правка фикстуры это основной рабочий цикл инструмента:
     * поправил случай, посмотрел. Состав карты при этом почти никогда не
     * меняется, `kind` правят раз в жизни. Поэтому перезагрузка уходит только
     * когда карта СТАЛА ДРУГОЙ; в остальных случаях правку фикстуры разбирает
     * обычный HMR Vite, как и до этой задачи.
     */
    configureServer(server) {
      for (const d of WATCHED) server.watcher.add(join(root, d))
      // `?? null` вместо броска: сервер поднимается и тогда, когда каталога
      // сейчас нет (свежий клон в момент чекаута). Первое же событие пересчитает.
      let last = read()
      const touch = (file: string): void => {
        if (!isFixtureFile(file)) return
        const now = read()
        if (now === null || now === last) return
        last = now
        const mod = server.moduleGraph.getModuleById(RESOLVED)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('add', touch)
      server.watcher.on('unlink', touch)
      server.watcher.on('change', touch)
    },
  }
}
