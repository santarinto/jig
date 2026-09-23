/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync, globSync } from 'node:fs'
import { resolve, join, relative, dirname } from 'node:path'
import * as root from '../index.js'
import { FIXTURE_GLOBS, fixtureFiles } from '../../workbench/kinds-plugin.js'

/**
 * У КАЖДОГО КОМПОНЕНТА КАТАЛОГА ЕСТЬ ФИКСТУРА. Главный результат
 * DS-127, а не его оформление.
 *
 * Разрыв дорос до 53 компонентов из 66 МОЛЧА, и это ровно то, чему гейт мешает
 * впредь. В верстак попадает только то, у чего есть фикстура: карту видов
 * строит `kinds-plugin` разбором именно этих файлов. Значит компонент без
 * фикстуры в инструменте НЕ СУЩЕСТВУЕТ — его нельзя посмотреть, покрутить,
 * прогнать через axe, снять таб-стопы или скопировать JSX. При этом список
 * слева выглядел полным, и ничто не сообщало, что показана пятая часть системы.
 *
 * Требовать фикстуру не мог НИКТО: `agents-catalog` требует секцию в
 * `AGENTS.md`, `preview-coverage` — превью, а фикстуру не требовал ни один
 * гейт. Именно поэтому разрыв и рос.
 *
 * СПИСКА ДОЛГА ЗДЕСЬ НЕТ, В ОТЛИЧИЕ ОТ `preview-coverage`, и это решение.
 * Там список оправдан: превью — выборка для замера целей клика, и часть
 * компонентов в отрыве показывать нечего. Фикстура же не выборка, а
 * присутствие компонента в инструменте; «этот компонент решено не показывать»
 * означает «решено, что его не смотрят», и такого решения в системе быть не
 * должно. Восемь оболочек волны 7 были самым сильным кандидатом в такой список
 * — они не показывают своего, а меняют поведение чужих детей, — и именно на
 * них выяснилось, что показывать есть что: `auto-fill` у `Dashboard`,
 * потерянный `icon` у `Card`, мёртвые стрелки шва у `SideNav`.
 *
 * ПОРЯДОК БЫЛ ОБРАТНЫЙ ПРИВЫЧНОМУ: гейт добавлен ПОСЛЕДНИМ, после всех семи
 * волн. Красный всю дорогу его бы выключили.
 *
 * ОБЕ МУТАЦИИ ПРОГНАНЫ 04.09.2026, каждая красит СВОЁ утверждение и НАЗЫВАЕТ
 * виновника:
 *  - убрать `Split/Split.fixture.tsx` — красное первое, «…: Split»;
 *  - положить `Split/Beta.fixture.tsx` — красное второе, «Split/Beta.fixture.tsx».
 * Второе проверялось отдельно не для симметрии: при живой `Split.fixture.tsx`
 * первое утверждение на призраке молчит, и без своей мутации нельзя было бы
 * сказать, что оно вообще способно покраснеть.
 *
 * ВНЕ КАТАЛОГА (DS-260). `<Icon>` — публичный контракт, лежит в
 * `src/icons/`, а не в `src/components/` (папка там подняла бы релиз до minor,
 * а перенос сломал бы путь импорта), и гейт, смотревший только в каталог, его
 * не видел: `?c=Icon` отвечал «Фикстуры нет» при зелёном прогоне. Отсюда
 * вторая половина — публичные React-компоненты корня пакета, живущие мимо
 * каталога. Список ЯВНЫЙ, с причиной у каждого исключения, а не эвристика
 * «что показывать»; но НОВЫЙ такой экспорт, не попавший ни в фикстуры, ни в
 * исключения, обязан краснеть — иначе явный список молча устареет ровно так
 * же, как устарел каталог до DS-127.
 *
 * МУТАЦИИ ПРОГНАНЫ 15.09.2026, каждая называет виновника:
 *  - снять `src/icons/Icon.fixture.tsx` — «виден верстаку», «Icon (ждали …)»;
 *  - `export { Caret } from './internal/caret.js'` в корень — «решён», «Caret»;
 *  - одна копия glob без `src/icons` — «копия разошлась», имя файла;
 *  - обход `kinds-plugin` без `src/icons` — «виден верстаку», «обход находит
 *    то же, что шаблоны» и `kinds-truth`;
 *  - детектор, не находящий ничего, — санитар детектора и «списки не устарели».
 */
const ROOT = resolve(__dirname, '../..')
const COMPONENTS = join(ROOT, 'src/components')

const SUFFIX = '.fixture.tsx'

/**
 * Публичные компоненты вне каталога, которым фикстура НУЖНА, — имя → путь
 * фикстуры. Путь, а не «где-нибудь»: верстак называет вид именем файла, и
 * фикстура `Icon`, положенная не туда, дала бы тот же «Фикстуры нет».
 */
const OUTSIDE_CATALOGUE: Record<string, string> = {
  Icon: 'src/icons/Icon.fixture.tsx',
}

/**
 * Публичные компоненты вне каталога БЕЗ фикстуры — и почему. Причина
 * обязательна и проверяется на непустоту; запись, пережившая свой экспорт,
 * краснеет отдельным утверждением.
 */
const GLYPH = 'системный глиф, а не компонент со своим поведением: вид знака'
  + ' держит контракт `<Icon>`, и смотрят его в фикстуре `Icon`, рядом с чужим'
const NO_FIXTURE: Record<string, string> = {
  ChevronDown: GLYPH,
  ChevronRight: GLYPH,
  ChevronLeft: GLYPH,
  ChevronUp: GLYPH,
  Close: GLYPH,
  Search: GLYPH,
  Dots: GLYPH,
  ToneIcon: 'знак тона: своего вида вне носителя не имеет, показан в фикстурах'
    + ' носителей тона (`Alert`, `Notifications`)',
  DsText: 'провайдер словаря, своей разметки не рисует: верстак ставит его на'
    + ' КАЖДЫЙ кадр (`text=pseudo`, `workbench/frame-app.tsx`), то есть он показан'
    + ' во всех фикстурах сразу',
  DocumentFormExample: 'пример композиции, а не компонент: его части — компоненты'
    + ' каталога со своими фикстурами, а сам он смотрится в `.design-sync/previews/`',
  WorkspaceExample: 'пример композиции, а не компонент: его части — компоненты'
    + ' каталога со своими фикстурами, а сам он смотрится в `.design-sync/previews/`',
}

/** Имена, которые корень пакета берёт из каталога компонентов. */
const catalogueBarrels = import.meta.glob<Record<string, unknown>>('../components/*/index.ts', {
  eager: true,
})
const fromCatalogue = new Set(Object.values(catalogueBarrels).flatMap((m) => Object.keys(m)))

/**
 * React-компонент — значение-функция (или `memo`/`forwardRef`-объект) с именем
 * в PascalCase. Это ДЕТЕКТОР, а не список: он только находит кандидатов, а
 * решение о каждом записано выше руками. `DS_TEXT_RU` (объект), `cssVar`,
 * `useTheme`, `STORAGE_KEY` под него не попадают по построению.
 */
const isComponent = (name: string, v: unknown): boolean =>
  /^[A-Z][a-z]/.test(name)
  && (typeof v === 'function' || (typeof v === 'object' && v !== null && '$$typeof' in v))

const outsideExports = Object.entries(root)
  .filter(([name, v]) => !fromCatalogue.has(name) && isComponent(name, v))
  .map(([name]) => name)
  .sort()

describe('покрытие фикстурами', () => {
  const components = readdirSync(COMPONENTS, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)

  it('у каждого компонента есть своя фикстура', () => {
    const missing = components.filter(
      (c) => !existsSync(join(COMPONENTS, c, `${c}${SUFFIX}`)),
    )
    expect(
      missing,
      'нет src/components/<Имя>/<Имя>.fixture.tsx — значит в верстаке этих'
      + ` компонентов НЕ СУЩЕСТВУЕТ, и список слева об этом не скажет: ${missing.join(', ')}`,
    ).toEqual([])
  })

  /**
   * Обратная сторона, и она не симметрична предыдущей.
   *
   * `kinds-plugin` собирает ЛЮБОЙ `*.fixture.tsx` внутри каталога компонента и
   * называет вид ИМЕНЕМ ФАЙЛА, а не каталога. Поэтому `Alpha/Beta.fixture.tsx`
   * даёт в верстаке вид `Beta`, за которым не стоит никакого компонента, —
   * призрак, выглядящий в списке ровно как настоящий. Утверждение выше его не
   * ловит: у `Alpha` своя фикстура на месте.
   */
  it('в каталогах компонентов нет фикстур с чужим именем', () => {
    const strays: string[] = []
    for (const c of components) {
      for (const f of readdirSync(join(COMPONENTS, c))) {
        if (f.endsWith(SUFFIX) && f !== `${c}${SUFFIX}`) strays.push(`${c}/${f}`)
      }
    }
    expect(
      strays,
      'kinds-plugin назовёт вид именем ФАЙЛА, и в списке появится компонент,'
      + ` которого нет: ${strays.join(', ')}`,
    ).toEqual([])
  })

  /**
   * Санитар: сам обход обязан быть непустым и правдоподобным. Переедет
   * каталог — два утверждения выше станут утверждениями о пустоте и
   * позеленеют. Тот же приём и та же причина, что в `preview-coverage`.
   */
  it('каталог компонентов прочитан — иначе всё выше ни о чём', () => {
    expect(components.length).toBeGreaterThan(50)
  })
})

describe('покрытие фикстурами вне каталога (DS-260)', () => {
  /**
   * Предмет — ВЕРСТАК, а не диск: фикстура, лежащая по верному пути, но не
   * попавшая в обход `kinds-plugin`, в инструменте не существует точно так же,
   * как отсутствующая. Поэтому истина здесь — `fixtureFiles` плагина, тот же
   * список, по которому строится левая колонка и `?c=<Имя>` в кадре.
   */
  it('каждый публичный компонент вне каталога из списка виден верстаку своей фикстурой', () => {
    const seen = new Map(fixtureFiles(ROOT).map((f) => [f.name, relative(ROOT, f.path)]))
    const missing = Object.entries(OUTSIDE_CATALOGUE)
      .filter(([name, path]) => seen.get(name) !== path)
      .map(([name, path]) => `${name} (ждали ${path}, верстак видит ${seen.get(name) ?? 'ничего'})`)
    expect(
      missing,
      `в верстаке этих публичных компонентов НЕТ — ?c=<Имя> ответит «Фикстуры нет»: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('верстак не видит фикстур сверх каталога и списка вне его — призраков нет', () => {
    const expected = new Set([...components(), ...Object.keys(OUTSIDE_CATALOGUE)])
    const ghosts = fixtureFiles(ROOT).filter((f) => !expected.has(f.name)).map((f) => relative(ROOT, f.path))
    expect(ghosts, `вид без компонента за ним: ${ghosts.join(', ')}`).toEqual([])
  })

  it('каждый публичный React-компонент вне каталога решён: фикстура либо причина', () => {
    const undecided = outsideExports.filter((n) => !(n in OUTSIDE_CATALOGUE) && !(n in NO_FIXTURE))
    expect(
      undecided,
      'новый публичный компонент мимо src/components: заведи фикстуру и впиши в'
      + ` OUTSIDE_CATALOGUE, либо впиши в NO_FIXTURE с причиной: ${undecided.join(', ')}`,
    ).toEqual([])
  })

  it('списки не устарели: каждое имя — живой публичный компонент вне каталога, и ровно в одном списке', () => {
    const live = new Set(outsideExports)
    const stale = [...Object.keys(OUTSIDE_CATALOGUE), ...Object.keys(NO_FIXTURE)].filter((n) => !live.has(n))
    const both = Object.keys(OUTSIDE_CATALOGUE).filter((n) => n in NO_FIXTURE)
    const noReason = Object.entries(NO_FIXTURE).filter(([, why]) => why.trim().length < 20).map(([n]) => n)
    expect({ stale, both, noReason }).toEqual({ stale: [], both: [], noReason: [] })
  })

  /**
   * Санитар детектора: известные в лицо обязаны найтись. Детектор, не
   * находящий ничего, делает оба утверждения выше зелёными навсегда — «новых
   * нет» стало бы законным ответом сломанной машинки. И наоборот: компонент
   * каталога детектор обязан отсеять, иначе «вне каталога» ни о чём.
   */
  it('детектор видит Icon и глифы и не видит компонентов каталога', () => {
    expect(outsideExports).toEqual(expect.arrayContaining(['Icon', 'ChevronDown', 'DsText']))
    expect(outsideExports).not.toContain('Button')
    expect(outsideExports).not.toContain('cssVar')
    expect(outsideExports).not.toContain('useTheme')
    expect(fromCatalogue.size).toBeGreaterThan(60)
  })
})

/**
 * ОДИН СПИСОК ФИКСТУР, а не девять (довод DS-177). `import.meta.glob`
 * принимает только литерал, поэтому набор записан в каждом месте, где его
 * импортируют, — и каждая копия это второй ответ на вопрос «какие фикстуры
 * есть». Расширение на `src/icons/` показало цену: забудь одну копию, и
 * `Icon` есть в левой колонке, но `fixtures` его не валидирует, `states` не
 * обходит, `no-nested-interactive` не смотрит — зелёным.
 *
 * Держится так: декларация одна (`FIXTURE_GLOBS` в `kinds-plugin`), каждая
 * литеральная копия обязана разрешаться ровно в неё, и сам обход плагина
 * обязан совпадать с тем, что эти шаблоны находят на диске.
 */
describe('список фикстур один', () => {
  const SCAN = ['src', 'workbench', 'scripts']
  const files = SCAN.flatMap((d) =>
    globSync('**/*.{ts,tsx,mjs}', { cwd: join(ROOT, d) }).map((f) => join(ROOT, d, f)),
  ).filter((f) => !f.includes('node_modules') && f !== __filename)

  const copies = files.flatMap((file) => {
    const src = readFileSync(file, 'utf8')
    return [...src.matchAll(/import\.meta\.glob(?:<[^>]*>)?\(\s*(\[[^\]]*\]|'[^']*')/g)]
      .filter((m) => m[1]!.includes(SUFFIX))
      .map((m) => ({
        at: relative(ROOT, file),
        patterns: [...m[1]!.matchAll(/'([^']+)'/g)]
          .map((p) => relative(ROOT, resolve(dirname(file), p[1]!)))
          .sort(),
      }))
  })

  it('каждая копия набора в import.meta.glob разрешается ровно в FIXTURE_GLOBS', () => {
    const want = [...FIXTURE_GLOBS].sort()
    const off = copies.filter((c) => JSON.stringify(c.patterns) !== JSON.stringify(want))
      .map((c) => `${c.at}: ${c.patterns.join(' + ')}`)
    expect(off, `копия набора разошлась с FIXTURE_GLOBS (${want.join(' + ')})`).toEqual([])
  })

  it('обход kinds-plugin находит ровно то, что находят FIXTURE_GLOBS', () => {
    const byGlob = globSync([...FIXTURE_GLOBS], { cwd: ROOT }).sort()
    const byPlugin = fixtureFiles(ROOT).map((f) => relative(ROOT, f.path)).sort()
    expect(byPlugin).toEqual(byGlob)
  })

  /**
   * Площадь литералом (`writing-checks`, №7): копий десять — кадр
   * (`registry`), план `states` (`shows-plan` и его тест), `kinds-truth`, `canvas-plan`,
   * `case-overrides-catalog` (DS-164, пришла параллельно и попалась гейтом),
   * `fixtures`, `fixtures-render`, `no-nested-interactive`,
   * `tabs-panel-resolvable`. Регулярка, переставшая находить вызовы, иначе
   * сделала бы утверждение выше утверждением о пустоте.
   */
  it('копии найдены все', () => {
    expect(copies.map((c) => c.at).sort()).toEqual([
      'src/__guards__/fixtures-render.test.tsx',
      'src/__guards__/fixtures.test.ts',
      'src/__guards__/no-nested-interactive.test.tsx',
      'src/__guards__/tabs-panel-resolvable.test.tsx',
      'workbench/canvas-plan.test.ts',
      'workbench/case-overrides-catalog.test.ts',
      'workbench/kinds-truth.test.ts',
      'workbench/registry.ts',
      'workbench/shows-plan.test.ts',
      'workbench/shows-plan.ts',
    ])
  })
})

function components(): string[] {
  return readdirSync(COMPONENTS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
}
