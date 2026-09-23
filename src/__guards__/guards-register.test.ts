import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * `docs/guards.md` — ПОЛНЫЙ реестр проверок, и полнота держится здесь, а не
 * аккуратностью (DS-299).
 *
 * CLAUDE.md велит открыть этот файл перед тем, как менять, ослаблять или
 * удалять что-либо под `src/__guards__/` и `scripts/`. Значит, пустой ответ
 * файла читается как «контракта нет, решай сам», а не как «файл отстал» — и
 * снимают ровно ту проверку, чью цену не нашли записанной. На момент заведения
 * гейта собственной записи не было у семнадцати гейтов и четырёх скриптов.
 *
 * ЗАПИСЬ — это ЗАГОЛОВОК, начинающийся с пути в обратных кавычках:
 * «## `src/__guards__/x.test.ts`». До DS-351 это был пункт списка, и
 * файл не имел заголовков вовсе — то есть читался только целиком, ~90k
 * токенов ради контракта одного гейта, тогда как CLAUDE.md велит открывать
 * его перед КАЖДЫМ касанием. Предмет гейта от смены маркера не двигается:
 * он про полноту реестра, а не про то, каким знаком начата строка. Выигрыш
 * не только в цене чтения — заголовок не может случайно совпасть с вложенным
 * пунктом («- `goto` отказал» внутри чужой записи), а пункт мог.
 *
 * Не упоминание имени где угодно, и это
 * решение, а не строгость ради строгости: по имени `consumption` находится
 * через `consumption.md`, а `doc-version`, `tone-carrier`, `class-import`
 * стояли мимоходом внутри ЧУЖИХ записей — поиск по имени был бы зелёным ровно
 * на тех, у кого контракта в реестре нет.
 *
 * Обход — `src/__guards__/*.test.ts(x)` и весь `scripts/`. Гейты в `tokens/` и
 * `workbench/` записи уже имеют, но в обход не входят: их каталоги смешаны с
 * рабочими модулями, и граница «что там гейт» потребовала бы второго списка.
 * Помощники без `.test.` в имени (`tmp-sandbox.ts`, `release-flow.helpers.ts`)
 * не гейты и в обход не входят по шаблону.
 *
 * В `scripts/` лежат и не проверки: драйвер релиза, установщик службы, модули,
 * которые собирает страница замера. Им запись не нужна, и они перечислены
 * ЛИТЕРАЛОМ, каждый с доводом. Довод двух видов: `host` — путь проверки, чьей
 * частью файл является (её запись обязана существовать: помощник без
 * описанного хозяина — та же дыра, спрятанная в список), или `host: null` —
 * файл ничего не утверждает. Без довода список зарос бы всем подряд.
 */
const ROOT = resolve(__dirname, '../..')
const REGISTER = 'docs/guards.md'

type Exempt = { host: string | null; why: string }

const NOT_CHECKS: Record<string, Exempt> = {
  'scripts/search-bench.py': {
    host: null,
    why: 'замер качества поиска CocoSearch на вопросах с известным ответом (DS-354);'
      + ' НИЧЕГО не утверждает и красным ничего не делает — печатает precision@10 и'
      + ' recall@50, чтобы смену индекса, модели, чанка или параметров ANN судили по'
      + ' числу, а не по впечатлению. Хозяина нет намеренно: гейт на него означал бы,'
      + ' что качество поиска обязано держаться на уровне, а оно предмет решения, не правила',
  },
  'scripts/release.mjs': {
    host: 'src/__guards__/release-flow.test.ts',
    why: 'драйвер `make release`; его ветви и отказы утверждает `release-flow`',
  },
  'scripts/print-changelog-section.mjs': {
    host: 'src/__guards__/release-flow.test.ts',
    why: 'тонкая CLI-обёртка над `changelogBody` из `release.mjs` для'
      + ' .github/workflows/release.yml (JIG-28); саму `changelogBody` утверждает `release-flow`',
  },
  'scripts/strip-manifest.mjs': {
    host: 'src/__guards__/dist-shipped.test.ts',
    why: 'prepack/postpack (JIG-28), режет devDependencies/scripts из УПАКОВАННОГО'
      + ' манифеста; сам strip/restore-цикл, включая round-trip на реальном `npm pack`,'
      + ' утверждает `dist-shipped`',
  },
  'scripts/stat.mjs': {
    host: 'src/__guards__/stat-shallow.test.ts',
    why: 'метрика размера для CI; её поведение в поверхностном клоне держит `stat-shallow`',
  },
  'scripts/check-public-root.mjs': {
    host: 'src/__guards__/check-public-root.test.ts',
    why: 'предохранитель JIG-3 против старой истории на публичном `santarinto/jig`,'
      + ' зовёт его `Makefile` (`push`/`published`); саму `assertPublicRootSafe`'
      + ' держит `check-public-root`',
  },
  'scripts/build-bundles.mjs': {
    host: 'src/__guards__/dist-bundles.test.ts',
    why: 'шаг `build`; что он собрал, сверяет с источником `dist-bundles`',
  },
  'scripts/render-preview.mjs': {
    host: 'src/__guards__/preview-render.test.ts',
    why: 'генератор превью; расхождение с закоммиченным ловит `preview-render`, зовущий его подпроцессом',
  },
  'scripts/find-unlabeled-fields.pl': {
    host: 'src/__guards__/changelog-search-command.test.ts',
    why: 'команда поиска из CHANGELOG 4.0.1; на фикстуре её прогоняет `changelog-search-command`',
  },
  'scripts/colour.mjs': {
    host: 'src/__guards__/colour-parse.test.ts',
    why: 'разбор цвета для гейтов контраста; сам разборщик проверяет `colour-parse`',
  },
  'scripts/seen-colour.mjs': {
    host: 'scripts/measure-invariants.mjs',
    why: 'снимок «цвет, каким его видно» для случаев контраста `make measure`',
  },
  'scripts/measure-charts.tsx': {
    host: 'scripts/measure-invariants.mjs',
    why: 'графики живым React для страницы `make measure`, собирается `bundleOf`',
  },
  'scripts/measure-tabs.tsx': {
    host: 'scripts/measure-invariants.mjs',
    why: 'бар вкладок живым React для страницы `make measure`, собирается `bundleOf`',
  },
  'scripts/measure-sections.tsx': {
    host: 'scripts/measure-invariants.mjs',
    why: 'лента разделов живым React из фикстуры для страницы `make measure`, собирается `bundleOf`',
  },
  'scripts/measure-ledger.tsx': {
    host: 'scripts/measure-invariants.mjs',
    why: 'лента журнала живым React из фикстуры для страницы `make measure`, собирается `bundleOf`',
  },
  'scripts/measure-appbar.tsx': {
    host: 'scripts/measure-invariants.mjs',
    why: 'шапка живым React из фикстуры для страницы `make measure`, собирается `bundleOf`',
  },
  'scripts/measure-more.tsx': {
    host: 'scripts/measure-invariants.mjs',
    why: 'полоса с «Ещё», её меню и шапка карточки живым React из фикстур для страницы'
      + ' `make measure`, собирается `bundleOf`',
  },
  'scripts/measure-split.tsx': {
    host: 'scripts/measure-invariants.mjs',
    why: 'Split живым React для страницы `make measure` — предмет замера обработчик перетаскивания, собирается `bundleOf`',
  },
  'scripts/wb-service.mjs': {
    host: null,
    why: 'установка, статус и снятие службы верстака на 5274; ничего не утверждает',
  },
  'scripts/fixture-catalog.sh': {
    host: null,
    why: 'печатает каталог фикстур для промта браузерному агенту; ничего не утверждает',
  },
}

const text = readFileSync(join(ROOT, REGISTER), 'utf8')
/** Пути, у которых есть СОБСТВЕННАЯ запись — заголовок, а не упоминание. */
const HEADS = new Set([...text.matchAll(/^##+ `([^`\s]+)`/gm)].map((m) => m[1]!))

const GUARDS = readdirSync(join(ROOT, 'src/__guards__'))
  .filter((f) => /\.test\.tsx?$/.test(f))
  .map((f) => `src/__guards__/${f}`)
  .sort()
const SCRIPTS = readdirSync(join(ROOT, 'scripts'), { withFileTypes: true })
  .filter((d) => d.isFile())
  .map((d) => `scripts/${d.name}`)
  .sort()

describe(`${REGISTER}: у каждой проверки есть запись`, () => {
  it('обход не выродился', () => {
    // Ноль нарушений из нуля файлов — это «мы туда не смотрели». Сломанный
    // разбор записей дал бы пустое HEADS, и тогда краснело бы всё — но
    // сломанный обход каталогов дал бы зелёный на пустоте.
    expect(GUARDS.length, 'гейтов в src/__guards__').toBeGreaterThan(40)
    expect(SCRIPTS.length, 'файлов в scripts/').toBeGreaterThan(15)
    expect(HEADS.size, `записей в ${REGISTER}`).toBeGreaterThan(40)
  })

  it('каждый гейт src/__guards__ назван собственной записью', () => {
    expect(
      GUARDS.filter((g) => !HEADS.has(g)),
      `нет записи «## \`путь\`» в ${REGISTER}: пришедший ослабить гейт не найдёт его контракта`
      + ' и прочтёт пустоту как «контракта нет». Упоминание имени внутри чужой записи — не запись',
    ).toEqual([])
  })

  it('каждый файл scripts/ — либо запись, либо исключение с доводом', () => {
    expect(
      SCRIPTS.filter((s) => !HEADS.has(s) && !(s in NOT_CHECKS)),
      `нет записи в ${REGISTER} и нет в NOT_CHECKS этого гейта`,
    ).toEqual([])
    expect(
      SCRIPTS.filter((s) => HEADS.has(s) && s in NOT_CHECKS),
      'и запись, и исключение: одно из двух врёт',
    ).toEqual([])
  })

  it('исключения живые: файл есть, хозяин описан, довод не пуст', () => {
    const bad = Object.entries(NOT_CHECKS).flatMap(([path, { host, why }]) => [
      ...(existsSync(join(ROOT, path)) ? [] : [`${path}: файла нет — исключение протухло`]),
      ...(host === null || HEADS.has(host) ? [] : [`${path}: хозяин ${host} без записи`]),
      ...(why.trim().length >= 20 ? [] : [`${path}: довод пуст`]),
    ])
    expect(bad).toEqual([])
  })

  it('каждая запись называет существующий файл', () => {
    // Обратная сторона: гейт удалён или переименован, а запись осталась —
    // реестр описывает контракт, которого уже никто не держит.
    expect([...HEADS].filter((h) => !existsSync(join(ROOT, h))).sort()).toEqual([])
  })
})
