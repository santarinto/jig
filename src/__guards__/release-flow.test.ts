import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { computeNext, levelFromCatalogue, bumpFiles, scaffoldChangelog, changelogBody, latestTag, tagExists, detectBumpLevel, prepare, parseSections } from '../../scripts/release.mjs' // (используется через runPrepare, но импорт держит типобезопасность)
import { seedFiles, setupTempRepo, writeArtifacts, writeFakeEditor } from './release-flow.helpers'
import { tempRoot } from './tmp-sandbox'

void prepare

describe('computeNext', () => {
  it('patch поднимает младший', () => expect(computeNext('1.47.0', 'patch')).toBe('1.47.1'))
  it('minor обнуляет patch', () => expect(computeNext('1.47.3', 'minor')).toBe('1.48.0'))
  it('major обнуляет minor и patch', () => expect(computeNext('1.47.3', 'major')).toBe('2.0.0'))
})

describe('levelFromCatalogue', () => {
  const set = (...xs: string[]) => new Set(xs)
  it('добавлен → minor', () =>
    expect(levelFromCatalogue(set('A'), set('A', 'B')).level).toBe('minor'))
  it('удалён → major', () =>
    expect(levelFromCatalogue(set('A', 'B'), set('A')).level).toBe('major'))
  it('удаление перевешивает добавление', () =>
    expect(levelFromCatalogue(set('A'), set('B')).level).toBe('major'))
  it('без изменений → patch', () =>
    expect(levelFromCatalogue(set('A'), set('A')).level).toBe('patch'))
  it('называет обе стороны, а не только вывод', () => {
    const r = levelFromCatalogue(set('A', 'B'), set('A', 'C'))
    expect(r.removed).toEqual(['B'])
    expect(r.added).toEqual(['C'])
  })
})


describe('bumpFiles', () => {
  it('пишет одну версию во все 5 мест, включая tarball и токен --ds-version', () => {
    const root = tempRoot('rel-bump-')
    seedFiles(root, '1.47.0')
    bumpFiles(root, '1.48.0')
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
    const cons = readFileSync(resolve(root, 'docs/portal-migration/consumption.md'), 'utf8')
    const conv = readFileSync(resolve(root, '.design-sync/conventions.md'), 'utf8')
    const tok = readFileSync(resolve(root, 'tokens/tokens.css'), 'utf8')
    expect(pkg.version).toBe('1.48.0')
    expect(cons).toContain('версия пакета — **1.48.0**')
    expect(cons).toContain('santarinto-jig-1.48.0.tgz')
    expect(conv).toContain('**Version 1.48.0**')
    // Токен — единственное версионное место, которое читают СО СТРАНИЦЫ
    // (DS-215). Разъехавшись, он не молчит, а врёт, и кавычки — часть
    // утверждения: без них `getPropertyValue` вернёт пустое.
    expect(tok).toContain('--ds-version: "1.48.0"')
    expect(cons).not.toContain('1.47.0')
    expect(conv).not.toContain('1.47.0')
    expect(tok).not.toContain('1.47.0')
  })
  // DS-318: lock отставал на четырнадцать выпусков, потому что бамп его не
  // знал. Корень — два места (`version` и `packages[""].version`); версия чужого
  // пакета в том же файле обязана остаться своей.
  it('пишет корневую версию package-lock.json в оба места и не трогает чужие пакеты', () => {
    const root = tempRoot('rel-bump-lock-')
    seedFiles(root, '1.47.0')
    bumpFiles(root, '1.48.0')
    const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'))
    expect(lock.version).toBe('1.48.0')
    expect(lock.packages[''].version).toBe('1.48.0')
    expect(lock.packages['node_modules/react'].version).toBe('19.2.8')
  })

  // Отказ lock обязан случиться ДО первой записи: иначе манифест уже на новой
  // версии, остальные на старой, и следующий прогон читает полубамп как resume.
  it('битый lock роняет бамп до записи package.json', () => {
    const root = tempRoot('rel-bump-badlock-')
    seedFiles(root, '1.47.0')
    writeFileSync(resolve(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 1, version: '1.47.0' }))
    expect(() => bumpFiles(root, '1.48.0')).toThrow(/packages\[""\]/)
    expect(JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version).toBe('1.47.0')
  })
})

describe('changelog', () => {
  it('scaffold вставляет пустую секцию сверху; body её видит пустой', () => {
    const root = tempRoot('rel-cl-')
    seedFiles(root, '1.47.0')
    scaffoldChangelog(root, '1.48.0', '2026-08-08')
    const cl = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8')
    expect(cl).toMatch(/## \[1\.48\.0\] — 2026-08-08[\s\S]*## \[1\.47\.0\]/) // новая выше старой
    expect(changelogBody(root, '1.48.0')).toBe('')
  })
  it('scaffold идемпотентен — повторный вызов не дублирует', () => {
    const root = tempRoot('rel-cl2-')
    seedFiles(root, '1.47.0')
    scaffoldChangelog(root, '1.48.0', '2026-08-08')
    scaffoldChangelog(root, '1.48.0', '2026-08-08')
    const count = (readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8')
      .match(/## \[1\.48\.0\]/g) || []).length
    expect(count).toBe(1)
  })
  it('body читает наполненную секцию по точному заголовку', () => {
    const root = tempRoot('rel-cl3-')
    seedFiles(root, '1.47.0')
    scaffoldChangelog(root, '1.48.0', '2026-08-08')
    const p = resolve(root, 'CHANGELOG.md')
    const filled = readFileSync(p, 'utf8')
      .replace('## [1.48.0] — 2026-08-08\n', '## [1.48.0] — 2026-08-08\n\n### Added\n- фича\n')
    writeFileSync(p, filled)
    expect(changelogBody(root, '1.48.0')).toContain('### Added')
    expect(changelogBody(root, '1.48.0')).toContain('- фича')
  })
  it('scaffold в CHANGELOG без секций дописывает раздел', () => {
    const root = tempRoot('rel-cl4-')
    seedFiles(root, '1.47.0')
    writeFileSync(resolve(root, 'CHANGELOG.md'), '# Changelog\n\nintro\n')
    scaffoldChangelog(root, '1.48.0', '2026-08-08')
    const cl = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8')
    expect(cl).toContain('## [1.48.0] — 2026-08-08')
    expect(changelogBody(root, '1.48.0')).toBe('')
  })
})

describe('git helpers', () => {
  it('latestTag + tagExists видят сид-тег', () => {
    const r = setupTempRepo()
    expect(latestTag(r.root)).toBe('v0.0.1')
    expect(tagExists('v0.0.1', r.root)).toBe(true)
    expect(tagExists('v9.9.9', r.root)).toBe(false)
  })
  /**
   * Уровень считает КАТАЛОГ, а не сообщения коммитов (правило владельца,
   * записано в CLAUDE.md): мажор — компонент удалён, минор — добавлен, всё
   * остальное патч.
   *
   * Прежний детект читал conventional commits и отвечал на ДРУГОЙ вопрос — про
   * совместимость. Он был не «неточен», а не о том: `feat!` на существующем
   * компоненте давал мажор там, где по правилу патч, и за два выпуска подряд
   * увёл версию на 4.0.0, которую пришлось разбирать вручную.
   */
  it('компонент добавлен → minor', () => {
    const r = setupTempRepo()
    r.addComponent('Sparkline')
    expect(detectBumpLevel('v0.0.1', r.root)).toBe('minor')
  })

  it('компонент удалён → major, даже если рядом добавлен другой', () => {
    const r = setupTempRepo()
    r.addComponent('Gauge')
    r.git('tag', '-a', 'v0.1.0', '-m', 'x')
    r.addComponent('Sparkline')
    r.removeComponent('Gauge')
    // Удаление перевешивает добавление: у потребителя пропала поверхность,
    // и это единственное, что он не может пережить молча.
    expect(detectBumpLevel('v0.1.0', r.root)).toBe('major')
  })

  it('каталог не менялся → patch, даже когда в сообщениях feat! и BREAKING CHANGE', () => {
    const r = setupTempRepo()
    r.addComponent('Gauge')
    r.git('tag', '-a', 'v0.1.0', '-m', 'x')
    r.addCommit('feat(Gauge)!: сломали API\n\nBREAKING CHANGE: всё')
    // Это и есть суть правки: прежний детект вернул бы major.
    expect(detectBumpLevel('v0.1.0', r.root)).toBe('patch')
  })

  it('мерж-коммиты уровень не двигают: считается каталог, а не история', () => {
    const r = setupTempRepo()
    r.git('branch', 'side'); r.git('checkout', '-q', 'side')
    r.addCommit('feat: on side')
    r.git('checkout', '-q', 'main')
    r.git('merge', '--no-ff', '-q', 'side', '-m', 'Merge branch side')
    expect(detectBumpLevel('v0.0.1', r.root)).toBe('patch')
  })

  it('коммитов после тега нет — отказ, а не тихий патч', () => {
    const r = setupTempRepo()
    expect(() => detectBumpLevel('v0.0.1', r.root)).toThrow('No changes to release')
  })

  /**
   * JIG-3: до squash здесь стоял `return 'minor'` — «первого тега нет,
   * каталог появился целиком» был верным ответом ровно на первом выпуске
   * системы. После squash это перестаёт быть так: репозиторий БЕЗ тегов
   * больше не значит «каталог только что появился», сравнивать всё равно не
   * с чем, и «minor» решал бы версию первого выпуска за владельца молча
   * (докблок `detectBumpLevel`) — случай (г) задачи: «теги есть [у сида
   * `v0.0.1`], а предыдущего для этого вызова не нашлось [передан null
   * явно]» отказывает, а не отвечает «всё новое».
   *
   * Мутация, доказывающая эту строку: верни `detectBumpLevel` `return
   * 'minor'` вместо throw на `!prev` — этот `expect` перестаёт бросать и
   * краснеет.
   */
  it('нет предыдущего тега — отказ, а не тихий minor', () => {
    const r = setupTempRepo()
    r.addComponent('Sparkline')
    expect(() => detectBumpLevel(null, r.root)).toThrow('уровень первого выпуска не вычисляется')
  })
})

/**
 * `bump` отдельным прогоном, потому что уровень он считает НЕ САМ, а через
 * `detectBumpLevel`, и вся его работа — правильно её позвать. Ровно там и был
 * дефект: в `bumpFromArgs` уходил готовый диапазон `v3.0.2..HEAD` вместо тега,
 * склеивался в `v3.0.2..HEAD..HEAD`, и `git log` падал — `make bump` не
 * работал ВООБЩЕ. Шесть проверок на `detectBumpLevel` были зелены всё это
 * время: они зовут её напрямую, то есть мимо единственного места, где ошибка.
 * Случай №1 из docs/writing-checks.md — вне досягаемости гейта.
 */
describe('bump (E2E, через CLI)', () => {
  it('уровень считается сам: каталог не менялся → patch', () => {
    const r = setupTempRepo()
    r.addCommit('fix(Heatmap): потолок кегля')
    const out = r.runBump()
    expect(out).toContain('bump → 0.0.2')
    expect(JSON.parse(r.read('package.json')).version).toBe('0.0.2')
    expect(r.read('CHANGELOG.md')).toContain('## [0.0.2]')
  })

  it('уровень считается сам: компонент добавлен → minor', () => {
    const r = setupTempRepo()
    r.addComponent('Sparkline')
    expect(r.runBump()).toContain('bump → 0.1.0')
  })

  it('уровень владельца перебивает счёт по каталогу', () => {
    const r = setupTempRepo()
    r.addCommit('fix: мелочь')
    expect(r.runBump('major')).toContain('bump → 1.0.0')
  })

  /**
   * JIG-3, случай (в): `version=` больше не общий «прыжок версии в обход
   * каталога» — на живых тегах она отказывает, и уровень считает только
   * `level=`/auto. До этой задачи `r.runBump('2.5.0')` здесь ПРОХОДИЛ —
   * этот тест и был доказательством старого поведения; см. докблок
   * `bumpFromArgs` про то, почему режим снят.
   */
  it('version= с живыми тегами — отказ, а не прыжок версии в обход каталога', () => {
    const r = setupTempRepo()
    r.addCommit('fix: мелочь')
    let status = 0
    let stderr = ''
    try { r.runBump('2.5.0') } catch (e) {
      const x = e as { status?: number; stderr?: string }
      status = x.status ?? 0
      stderr = String(x.stderr ?? '')
    }
    expect(status, stderr).not.toBe(0)
    expect(stderr).toContain('version=2.5.0')
    expect(stderr).toContain('v0.0.1')
  })
})

/**
 * JIG-3: первый выпуск нового репозитория, у которого ещё нет ни одного
 * тега `v*` (состояние, в котором окажется репозиторий сразу после squash).
 * Считать уровень не с чем — сравнивать каталог не с чем, — поэтому версия
 * первого выпуска задаётся владельцем явно, а не вычисляется.
 */
describe('bump: первый выпуск без тегов (JIG-3)', () => {
  /** Тот же сид, что и `setupTempRepo`, но БЕЗ тега — состояние после squash. */
  function repoWithoutTags() {
    const r = setupTempRepo()
    r.git('tag', '-d', 'v0.0.1')
    return r
  }

  it('(а) без тегов, version=1.0.0 → бамп проходит', () => {
    const r = repoWithoutTags()
    const out = r.runBump('1.0.0')
    expect(out).toContain('bump → 1.0.0')
    expect(JSON.parse(r.read('package.json')).version).toBe('1.0.0')
    expect(r.read('CHANGELOG.md')).toContain('## [1.0.0]')
  })

  /**
   * Диапазон сверки поставки — от корня (`HEAD`), не от тега, которого нет:
   * `checkNamed` зовёт `latestTag(root)`, получает `null`, и это ровно тот
   * же вырожденный случай, что уже доказан ниже в «прошлого выпуска нет → не
   * стектрейс…» — здесь он проверен именно на пути ПЕРВОГО выпуска, через
   * `bump version=`, а не через ручное удаление тега без бампа.
   */
  it('(а) сверка поставки на первом выпуске не падает и не требует всю историю', () => {
    const r = repoWithoutTags()
    r.addShippedCommit('fix(Accordion): знак раскрытия (JIG-262)')
    r.runBump('1.0.0')
    const editor = writeFakeEditor(r.root, '### Исправлено\n\n- знак раскрытия `Accordion` (JIG-262)')
    const out = r.runPrepare({ EDITOR: `node ${editor}` })
    expect(out).toContain('прошлого выпуска нет')
    expect(out, 'вместо своего отказа — падение').not.toContain('нет такого тега')
  })

  it('(б) без тегов, без version= → отказ с понятным текстом', () => {
    const r = repoWithoutTags()
    let status = 0
    let stderr = ''
    try { r.runBump() } catch (e) {
      const x = e as { status?: number; stderr?: string }
      status = x.status ?? 0
      stderr = String(x.stderr ?? '')
    }
    expect(status, stderr).not.toBe(0)
    expect(stderr).toContain('тегов')
    expect(stderr).toContain('version=')
  })

  it('(б) без тегов, level=minor → тот же отказ: считать уровень не с чем', () => {
    const r = repoWithoutTags()
    let status = 0
    let stderr = ''
    try { r.runBump('minor') } catch (e) {
      const x = e as { status?: number; stderr?: string }
      status = x.status ?? 0
      stderr = String(x.stderr ?? '')
    }
    expect(status, stderr).not.toBe(0)
    expect(stderr).toContain('version=')
  })

  /**
   * JIG-3: squash-корень публичного дерева. Старые теги (`v0.0.1` здесь,
   * `v4.2.6` и младше в настоящем репозитории) в этом сценарии не удаляются —
   * `repoWithoutTags` выше имитирует состояние, которого на `public` НЕ
   * будет: там теги остаются в общей базе объектов (тот же `.git`, что и у
   * `main`), просто новый корень не их потомок. `git commit-tree` строит
   * ровно такой независимый корень поверх того же дерева, а `reset --hard`
   * переносит HEAD на него, не трогая тег.
   *
   * До правки `latestTag` (`git tag --list` без `--merged`) отвечал по всей
   * базе объектов, а не по ветке, — `v0.0.1` находился, и `runBump('1.0.0')`
   * отказывал «тег v0.0.1 уже существует», хотя с точки зрения этого HEAD
   * выпусков не было ни одного.
   */
  it('(в) теги есть в репозитории, но ни один не достижим из HEAD → первый выпуск', () => {
    const r = setupTempRepo()
    const tree = r.git('rev-parse', 'HEAD^{tree}').trim()
    const squashRoot = r.git('commit-tree', tree, '-m', 'chore: squash root').trim()
    r.git('reset', '--hard', squashRoot)
    expect(r.git('tag', '--list', 'v*').trim()).toBe('v0.0.1') // тег остался, не удалён
    expect(latestTag(r.root)).toBeNull() // но не достижим из нового HEAD
    const out = r.runBump('1.0.0')
    expect(out).toContain('bump → 1.0.0')
    expect(JSON.parse(r.read('package.json')).version).toBe('1.0.0')
  })
})

describe('prepare (E2E)', () => {
  it('fresh: добавленный компонент → minor, бамп версионных файлов, тело из $EDITOR', () => {
    const r = setupTempRepo()
    // Здесь стояло `r.addCommit('feat: cool')`, и тест кодировал ПРЕЖНЕЕ
    // правило — уровень из типа коммита. Минор теперь означает ровно одно:
    // в каталоге появился компонент.
    // Компонент — вход сборки (JIG-28): с кодом в скобках, иначе checkNamed
    // отказал бы «нет кода в скобках» вместо того, что проверяет этот сценарий.
    r.addComponent('Sparkline', 'JIG-1')
    const editor = writeFakeEditor(r.root, '### Added\n- cool (JIG-1)')
    const out = r.runPrepare({ EDITOR: `node ${editor}`, RELEASE_DATE: '2026-08-08' })
    expect(out).toContain('level=minor → 0.1.0')
    expect(JSON.parse(r.read('package.json')).version).toBe('0.1.0')
    expect(r.read('docs/portal-migration/consumption.md')).toContain('**0.1.0**')
    expect(JSON.parse(r.read('package-lock.json')).packages[''].version).toBe('0.1.0')
    expect(r.read('CHANGELOG.md')).toContain('## [0.1.0] — 2026-08-08')
    expect(r.read('CHANGELOG.md')).toContain('- cool')
  })
  it('нет коммитов после тега → No changes to release, дерево чисто', () => {
    const r = setupTempRepo()
    expect(() => r.runPrepare({ EDITOR: 'true' })).toThrow(/No changes to release/)
    expect(r.git('status', '--porcelain').trim()).toBe('')
  })
  it('пустое тело / отказ редактора → откат бампа, дерево чисто', () => {
    const r = setupTempRepo()
    r.addCommit('fix: x')
    const editor = writeFakeEditor(r.root, null) // exit 1
    expect(() => r.runPrepare({ EDITOR: `node ${editor}` })).toThrow()
    // package.json откатан к 0.0.1
    expect(JSON.parse(r.read('package.json')).version).toBe('0.0.1')
    expect(JSON.parse(r.read('package-lock.json')).version, 'lock не откатан вместе с бампом').toBe('0.0.1')
    // дерево чисто: fake-editor.mjs игнорится через .gitignore харнесса,
    // версионные файлы откатаны
    expect(r.git('status', '--porcelain').trim()).toBe('')
  })
  /**
   * Три случая на одно решение DS-146: «редактора нет» — это НЕ «редактор
   * упал», откат тут вреден, а сообщение обязано называть выход.
   *
   * Соседний случай выше («пустое тело / отказ редактора → откат бампа») никуда
   * не делся и стоит рядом НАМЕРЕННО: два исхода прежде сливались в один код
   * возврата, и держать их порознь можно только требуя от каждого СВОЕГО
   * поведения. Уберите любой из двух — и слияние вернётся незамеченным.
   */
  it('нет $EDITOR: бамп ОСТАЁТСЯ, отката нет', () => {
    const r = setupTempRepo()
    r.addCommit('fix: x')
    expect(() => r.runPrepare({ EDITOR: '' })).toThrow()
    // Версия НЕ откатана к 0.0.1 — в этом всё решение. Прежнее поведение
    // выбрасывало посчитанный уровень и заставляло считать его заново.
    expect(JSON.parse(r.read('package.json')).version).toBe('0.0.2')
    // Оставленное состояние ДОЛЖНО БЫТЬ пригодным для шага 2: раздел уже вписан,
    // и человеку есть куда писать тело. Без этой строки «отката нет» держалось
    // бы и на дереве, где scaffold не дошёл.
    expect(r.read('CHANGELOG.md')).toContain('## [0.0.2]')
  })
  it('нет $EDITOR: отказ называет выход, а не врёт про код редактора', () => {
    const r = setupTempRepo()
    r.addCommit('fix: x')
    let err = ''
    try { r.runPrepare({ EDITOR: '' }) } catch (e) { err = String((e as { stderr?: string }).stderr ?? '') }
    // Прежний текст. Он был неверен дважды: редактор не выходил, он не
    // запускался; и починка не в редакторе.
    expect(err).not.toContain('редактор вышел с кодом')
    expect(err).toContain('$EDITOR не задан')
    // Выход назван, и назван КОМАНДОЙ. Сообщение без команды — это сообщение,
    // после которого лезут в исходник: ровно так этот путь и был спрятан.
    expect(err).toContain('make bump')
    expect(err).toContain('make release')
    expect(err).toContain('CHANGELOG.md')
  })
  it('нет $EDITOR: оставленное дерево ДОПУСКАЕТ resume — три шага работают целиком', () => {
    const r = setupTempRepo()
    r.addCommit('fix: x')
    expect(() => r.runPrepare({ EDITOR: '' })).toThrow()
    // Шаг 2 руками: вписываем тело в оставленный раздел.
    const cl = r.read('CHANGELOG.md').split('\n')
    const i = cl.findIndex((l) => /^## \[/.test(l))
    cl.splice(i + 1, 0, '', '### Исправлено', '- x')
    writeFileSync(resolve(r.root, 'CHANGELOG.md'), cl.join('\n'))
    // Шаг 3: тот же prepare, по-прежнему БЕЗ редактора. Он обязан пройти —
    // иначе инструкция, которую печатает отказ, ведёт в тупик, и весь случай
    // выше проверял бы текст, а не выход.
    const out = r.runPrepare({ EDITOR: '' })
    expect(out).toContain('готово к проверкам: 0.0.2')
    expect(JSON.parse(r.read('package.json')).version).toBe('0.0.2')
  })
  /**
   * Непустой `## [Unreleased]` на свежем старте — отказ ДО бампа (DS-257).
   * Иначе scaffold ставит раздел над ним, редактор открывается на пустом, и
   * пункты уезжают мимо релизного коммита. Код возврата СВОЙ: отказ без
   * `$EDITOR` лечится другим, и слитые коды снова врали бы о починке.
   */
  it('непустой ## [Unreleased]: отказ на свежем старте (до бампа) и на resume (без отката), свой код, называет changelog-draft', () => {
    const r = setupTempRepo()
    const cl = r.read('CHANGELOG.md').replace('## [0.0.1]', '## [Unreleased]\n\n### Исправлено\n\n- пункт\n\n## [0.0.1]')
    writeFileSync(join(r.root, 'CHANGELOG.md'), cl)
    r.git('add', 'CHANGELOG.md'); r.git('commit', '-q', '-m', 'docs(changelog): пункт')
    r.addCommit('fix: x')
    const editor = writeFakeEditor(r.root, '### Added\n- из редактора')
    const fail = (env: Record<string, string>) => {
      try { r.runPrepare(env) } catch (e) {
        const x = e as { status?: number; stderr?: string }
        return { status: x.status, stderr: String(x.stderr ?? '') }
      }
      return { status: 0, stderr: '' }
    }
    // Рабочий редактор: без отказа prepare прошёл бы до конца.
    const withEditor = fail({ EDITOR: `node ${editor}` })
    expect(withEditor.status).toBe(3)
    expect(withEditor.stderr).toContain('make changelog-draft')
    expect(JSON.parse(r.read('package.json')).version).toBe('0.0.1')
    expect(r.git('status', '--porcelain').trim()).toBe('')
    // Различение с отказом без $EDITOR — на пустом Unreleased.
    const noUnrel = setupTempRepo()
    noUnrel.addCommit('fix: x')
    let s = 0
    try { noUnrel.runPrepare({ EDITOR: '' }) } catch (e) { s = (e as { status: number }).status }
    expect(s).toBe(1)
    // Resume мимо черновика: bump → release с редактором — тот же отказ, и бамп
    // стоит (откат на resume выбросил бы посчитанный уровень).
    r.runBump()
    const resume = fail({ EDITOR: `node ${editor}` })
    expect(resume.status).toBe(3)
    expect(resume.stderr).toContain('make changelog-draft')
    expect(JSON.parse(r.read('package.json')).version).toBe('0.0.2')
    expect(r.read('CHANGELOG.md')).toContain('## [Unreleased]')
    expect(r.read('CHANGELOG.md')).not.toContain('из редактора')
    // Штатный путь не заперт: bump → draft → prepare (resume) проходит.
    const docs = tempRoot('rel-docs-')
    writeArtifacts(docs, {})
    r.runDraft({ DS_DOCS_PATH: docs })
    expect(r.runPrepare({ EDITOR: '' })).toContain('готово к проверкам: 0.0.2')
  })
  it('страж: посторонний untracked-файл → prepare падает', () => {
    const r = setupTempRepo()
    r.addCommit('feat: y')
    writeFileSync(resolve(r.root, 'unrelated-feature.ts'), 'export const x = 1\n')
    // $EDITOR рабочий (заполняет тело CHANGELOG) — если бы страж пропустил
    // untracked-файл, prepare прошёл бы весь путь до конца без единой ошибки
    // и не бросил бы; toThrow() тут отличает «страж поймал» от «поймало что-то
    // другое» (пустое тело и т.п.), а не просто «упало хоть на чём-нибудь»
    const editor = writeFakeEditor(r.root, '### Added\n- y')
    expect(() => r.runPrepare({ EDITOR: `node ${editor}` })).toThrow()
    // версия не забамплена
    expect(JSON.parse(r.read('package.json')).version).toBe('0.0.1')
  })
  it('страж: изменённый tracked не-версионный файл → prepare падает', () => {
    const r = setupTempRepo()
    r.addCommit('feat: y')            // addCommit коммитит file-0.txt (tracked)
    writeFileSync(resolve(r.root, 'file-0.txt'), 'changed\n')  // модифицируем уже закоммиченный
    const editor = writeFakeEditor(r.root, '### Added\n- y')
    expect(() => r.runPrepare({ EDITOR: `node ${editor}` })).toThrow()
    expect(JSON.parse(r.read('package.json')).version).toBe('0.0.1')
  })
  it('resume: тег next отсутствует, повторный prepare не бампает второй раз', () => {
    const r = setupTempRepo()
    // Минор нужен этим тестам только чтобы версия уехала предсказуемо;
    // их предмет — resume/commit/тег. Источник минора теперь один:
    // компонент в каталоге. Код в скобках и в теле обязателен: компонент —
    // вход сборки (JIG-28), checkNamed его теперь тоже сверяет.
    r.addComponent('Gauge', 'JIG-1')
    const editor = writeFakeEditor(r.root, '### Added\n- y (JIG-1)')
    r.runPrepare({ EDITOR: `node ${editor}`, RELEASE_DATE: '2026-08-08' }) // → 0.1.0, тело есть
    // второй прогон: тело уже непусто, версия не должна уехать в 0.2.0
    r.runPrepare({ EDITOR: 'false', RELEASE_DATE: '2026-08-08' })
    expect(JSON.parse(r.read('package.json')).version).toBe('0.1.0')
  })
})

/**
 * Правка дошла до потребителя, а адреса ей не дали (DS-350).
 *
 * DS-262 переставила знак раскрытия `Accordion` из конца заголовка в
 * начало и вышла в v4.2.5 — в поставке `children` поменялись местами, у
 * потребителя знак переехал. Пункта в разделе не было ни одного: задача
 * закрылась в день выпуска, пункт жил в трекере, а `changelog-draft` печатает
 * «нет пункта: CODE» одной строкой на задачу, и таких строк на сборке 4.2.6
 * было больше сотни — задача верстака давала ровно тот же вывод, что задача с
 * ломающей правкой API. Сигнал был, различения не было. Сверка того же
 * выпуска потом нашла ещё 12 задач без единой строки, включая два Breaking
 * (`TileProps` и `FunctionPanelProps` стали union) и новый ключ словаря.
 *
 * Отсюда предмет этих сценариев: отказ обязан РАЗЛИЧАТЬ поставленное и
 * непоставленное. Оба коммита ниже одинаковы по теме — `fix(X): … (CODE)`, —
 * и отличаются только тем, тронут ли вход сборки (JIG-28: `dist/` больше не в
 * git, критерий переехал на `src`/`tokens`/`types` — см. `buildInputConfig`).
 * Проверка, которая путей не
 * смотрит, зеленеет на первом сценарии и краснеет на втором; проверка, которая
 * смотрит список ИСХОДНЫХ путей, разошлась бы со сборкой молча (см. докблок
 * `shippedCodes`).
 */
describe('prepare: поставленная задача обязана быть названа в разделе (DS-350)', () => {
  const SHIPPED = 'fix(Accordion): знак раскрытия в начале заголовка (JIG-262)'
  const LOCAL = 'fix(wb): кадр верстака помнит ширину (JIG-345)'

  /** Тело раздела пишется прямо в CHANGELOG: это resume, редактор не зовётся. */
  function setBody(r: ReturnType<typeof setupTempRepo>, version: string, body: string) {
    const lines = r.read('CHANGELOG.md').split('\n')
    const i = lines.findIndex((l) => l.startsWith(`## [${version}]`))
    lines.splice(i + 1, 0, '', body)
    writeFileSync(join(r.root, 'CHANGELOG.md'), lines.join('\n'))
  }

  function run(r: ReturnType<typeof setupTempRepo>) {
    try { return { status: 0, out: r.runPrepare({ EDITOR: '' }), stderr: '' } } catch (e) {
      const x = e as { status?: number; stderr?: string; stdout?: string }
      return { status: x.status ?? 0, out: String(x.stdout ?? ''), stderr: String(x.stderr ?? '') }
    }
  }

  /** Репозиторий с двумя одинаковыми по теме коммитами и уже готовым телом. */
  function repoWithBody(body: string) {
    const r = setupTempRepo()
    r.addShippedCommit(SHIPPED)
    r.addCommit(LOCAL)
    r.runBump()
    setBody(r, '0.0.2', body)
    return r
  }

  it('поставленная не названа → отказ своим кодом, называет её и НЕ требует непоставленную', () => {
    const r = repoWithBody('### Исправлено\n\n- знак раскрытия переехал, команды поиска ниже')
    const f = run(r)
    expect(f.status, 'слит с общей единицей — починка была бы не та').toBe(4)
    expect(f.stderr).toContain('JIG-262')
    expect(f.stderr, 'верстак в dist не уходит — требовать с него пункт значит вернуть шум')
      .not.toContain('JIG-345')
    // Тело и бамп не тронуты: отказ лечится правкой CHANGELOG и resume, а не
    // перезапуском выпуска с нуля.
    expect(JSON.parse(r.read('package.json')).version).toBe('0.0.2')
    expect(r.read('CHANGELOG.md')).toContain('знак раскрытия переехал')
  })

  it('названа в пункте → проходит и печатает, сколько поставляемых задач сверено', () => {
    const r = repoWithBody('### Исправлено\n\n- знак раскрытия `Accordion` (JIG-262)')
    const f = run(r)
    expect(f.status).toBe(0)
    expect(f.out).toContain('поставляемых задач 1')
  })

  it('освобождение с доводом проходит и называет себя в выводе', () => {
    const r = repoWithBody('<!-- без пункта: JIG-262 — в dist ушёл только комментарий в CSS -->')
    const f = run(r)
    expect(f.status).toBe(0)
    expect(f.out).toContain('без пункта с доводом: JIG-262')
  })

  /**
   * Новая доска трекера выдаёт коды `JIG-N` (JIG-1). `TASK_CODE` и `EXEMPT_RE`
   * обязаны их узнавать, иначе любой коммит новой доски, тронувший `dist/`,
   * отказывал бы `prepare` кодом 5 как безадресный.
   *
   * Код архивной доски (прежний префикс) они больше НЕ узнают вовсе
   * (JIG-3): после squash в новой истории такого кода в скобках темы не
   * будет, а принимать его значило бы разрешить адресовать поставку
   * архивной задачей. Мутация, доказывающая ЭТУ строку: вернуть в
   * `TASK_CODE` альтернативу с префиксом архивной доски вместо `JIG` —
   * данный случай перестаёт видеть код в скобках `(JIG-12)` и краснеет на
   * `f.status !== 0`.
   */
  it('код новой доски JIG-N в скобках распознан', () => {
    const r = setupTempRepo()
    r.addShippedCommit('fix(Accordion): знак раскрытия (JIG-12)')
    r.addCommit(LOCAL)
    r.runBump()
    setBody(r, '0.0.2', '### Исправлено\n\n- знак раскрытия `Accordion` (JIG-12)')
    const f = run(r)
    expect(f.status, f.stderr).toBe(0)
    expect(f.out).toContain('поставляемых задач 1')
  })

  it('освобождение «без пункта» кодом JIG-N распознано', () => {
    const r = setupTempRepo()
    r.addShippedCommit('fix(Accordion): знак раскрытия (JIG-12)')
    r.runBump()
    setBody(r, '0.0.2', '<!-- без пункта: JIG-12 — довод длиннее двадцати знаков -->')
    const f = run(r)
    expect(f.status, f.stderr).toBe(0)
    expect(f.out).toContain('без пункта с доводом: JIG-12')
  })

  /**
   * Формы освобождения, каждая из которых проходила МОЛЧА и печатала «названы
   * все» (ревью DS-350). Причина у всех одна: из прозы вырезалось только
   * то, что регулярка СМОГЛА разобрать, а непонятое оставалось в ней вместе с
   * кодом и шло за упоминание. Первая — самая вероятная у человека: дефис
   * вместо тире визуально неотличим.
   */
  it.each([
    ['дефис вместо тире', '<!-- без пункта: JIG-262 - да -->'],
    ['голый код без слов', '<!-- JIG-262 -->'],
    ['перенос посреди довода', '<!-- без пункта: JIG-262 — да\nещё -->'],
    ['код в чужом комментарии', '<!-- TODO: свести с JIG-262 после выпуска -->'],
  ])('комментарий за упоминание не сходит: %s', (_name, body) => {
    // Проба — КОРОТКИЙ довод и посторонний комментарий: форма, которую разбор
    // понимает, обязана быть судима по длине довода, а форма, которую он не
    // понимает, не должна давать коду попасть в прозу. До починки все четыре
    // печатали «названы все».
    const r = repoWithBody(body)
    const f = run(r)
    expect(f.status, `прошло молча: ${f.out}`).toBe(4)
  })

  it('дефис и перенос — законная форма освобождения, если довод есть', () => {
    // Оборотная сторона предыдущего: раз тире принимается любое, а довод
    // многострочный, эти две формы обязаны РАБОТАТЬ, иначе починка свелась бы
    // к «пиши ровно так, как я разобрал».
    const r = repoWithBody('<!-- без пункта: JIG-262 - в dist ушёл только\nкомментарий в CSS -->')
    const f = run(r)
    expect(f.status).toBe(0)
    expect(f.out).toContain('без пункта с доводом: JIG-262')
  })

  it('«без пункта» без разбора называется вслух, а не молчит', () => {
    const r = repoWithBody('<!-- без пункта JIG-262, только комментарий в CSS -->')
    const f = run(r)
    expect(f.status).toBe(4)
    expect(f.stderr).toContain('освобождение не разобрано')
  })

  it('прошлого выпуска нет → не стектрейс и не требование назвать всю историю', () => {
    // Репозиторий без тегов: диапазон выродился бы в HEAD, то есть отказ
    // требовал бы пункт на каждую задачу за всю историю, а `sourceOf(null)`
    // бросал бы посреди печати отказа — шапка, стек и код 1 вместо 4.
    const r = setupTempRepo()
    r.git('tag', '-d', 'v0.0.1')
    r.addShippedCommit(SHIPPED)
    const editor = writeFakeEditor(r.root, '### Исправлено\n\n- пункт без кода')
    let out = ''
    try { out = r.runPrepare({ EDITOR: `node ${editor}` }) } catch (e) {
      const x = e as { stderr?: string; stdout?: string }
      out = String(x.stdout ?? '') + String(x.stderr ?? '')
    }
    expect(out).toContain('прошлого выпуска нет')
    expect(out, 'вместо своего отказа — падение').not.toContain('нет такого тега')
  })

  it('tsconfig.build.json пропал — явный отказ, а не тихий пустой список входов (JIG-28)', () => {
    // Вход сборки выводится ИЗ tsconfig.build.json (JIG-28); без него
    // buildInputConfig обязана назвать причину, а не молча вернуть пустой
    // pathspec — тот читался бы как «поставляемых задач 0, названы все».
    const r = setupTempRepo()
    r.git('rm', '-q', 'tsconfig.build.json')
    r.git('commit', '-q', '-m', 'chore: tsconfig.build.json снят (JIG-262)')
    r.runBump()
    setBody(r, '0.0.2', '### Исправлено\n\n- пункт')
    const f = run(r)
    expect(f.status, 'ноль поставляемых прошёл бы как «всё названо»').not.toBe(0)
    expect(f.stderr + f.out).toContain('нет tsconfig.build.json')
  })

  it('commit сверяет сам: правка CHANGELOG между шагами не проезжает', () => {
    // `commit` набирается руками при восстановлении упавшего прогона — между
    // ним и `prepare` раздел правится, и эта правка шла бы мимо проверки.
    const r = repoWithBody('### Исправлено\n\n- знак раскрытия (JIG-262)')
    expect(run(r).status).toBe(0)
    setBody(r, '0.0.2', '### Исправлено\n\n- знак раскрытия, кода нет')
    const lines = r.read('CHANGELOG.md').split('\n').filter((l) => !l.includes('JIG-262'))
    writeFileSync(join(r.root, 'CHANGELOG.md'), lines.join('\n'))
    let status = 0
    try { r.runCommit() } catch (e) { status = (e as { status: number }).status }
    expect(status).toBe(4)
  })

  it('освобождение без довода не покупает тишину — и само за упоминание не сходит', () => {
    // Мутация: будь текст освобождения обычной прозой, код в нём засчитался бы
    // как «названа», и длина довода не держала бы ничего — этот сценарий стал
    // бы зелёным при любом огрызке после тире.
    const r = repoWithBody('<!-- без пункта: JIG-262 — да -->')
    const f = run(r)
    expect(f.status).toBe(4)
    expect(f.stderr).toContain('довод короче')
  })

  /**
   * ПОСЫЛКА самой сверки (DS-352). Предыдущие сценарии проверяют, что
   * поставленная задача названа в разделе; все они молчат, если задача в
   * множество поставляемых не попала ВОВСЕ. Ровно так проходили обе дыры,
   * найденные ревью DS-350, и обе печатали «поставляемых задач 0,
   * названы все»:
   *
   * 1. Код в теме без скобок — `codesIn` берёт только из скобок.
   * 2. `src` и `dist` по двум коммитам — докблок ссылался на `dist-committed`,
   *    но тот сравнивает дерево с ИНДЕКСОМ и про историю не знает ничего.
   *
   * Сценарии РАЗЛИЧАЮЩИЕ: у каждого отказа есть пара, обязанная пройти, и
   * отличаются они не текстом темы, а тем, тронут ли `dist/`. Проверка,
   * потерявшая pathspec, зеленеет на отказах; проверка, требующая скобки у
   * всех коммитов подряд, краснеет на парах.
   */
  describe('посылка: у коммита dist/ обязан быть адрес (DS-352)', () => {
    const LOOSE = 'fix: знак раскрытия JIG-262 переехал в начало'

    it('дыра 1: код в теме БЕЗ скобок на коммите dist → свой отказ, называет sha и тему', () => {
      // До починки: «поставляемых задач 0, названы все», код 0.
      const r = setupTempRepo()
      r.addShippedCommit(LOOSE)
      r.runBump()
      setBody(r, '0.0.2', '### Исправлено\n\n- знак раскрытия переехал')
      const f = run(r)
      expect(f.status, `прошло молча: ${f.out}`).toBe(5)
      expect(f.stderr).toContain('нет кода в скобках')
      expect(f.stderr).toContain(LOOSE)
    })

    it('та же тема, но БЕЗ dist/ → проходит: правило про поставку, не про формат тем', () => {
      // Пара к предыдущему. Гейт на формат темы у всех коммитов подряд —
      // отброшенный вариант из DS-352 — покраснел бы здесь.
      const r = setupTempRepo()
      r.addShippedCommit('fix(Accordion): знак раскрытия (JIG-262)')
      r.addCommit(LOOSE)
      r.runBump()
      setBody(r, '0.0.2', '### Исправлено\n\n- знак раскрытия (JIG-262)')
      const f = run(r)
      expect(f.status, f.stderr).toBe(0)
    })

    it('дыра 2: src и dist по двум коммитам → отказ на безадресной пересборке', () => {
      // `addCommit` не трогает dist, `addShippedCommit` трогает ТОЛЬКО его —
      // ровно то, что оставляет за собой rebase или squash, разложивший пару.
      // До починки сверка давала ноль поставляемых и код 0.
      const r = setupTempRepo()
      r.addCommit('fix(Accordion): знак раскрытия в начале заголовка (JIG-262)')
      r.addShippedCommit('chore(dist): пересборка')
      r.runBump()
      setBody(r, '0.0.2', '### Исправлено\n\n- знак раскрытия (JIG-262)')
      const f = run(r)
      expect(f.status, `прошло молча: ${f.out}`).toBe(5)
      expect(f.stderr).toContain('chore(dist): пересборка')
    })

    it('чужой код вне скобок рядом со своим в скобках → отказ называет именно чужой', () => {
      // Обратная сторона узкого `codesIn`: расширь его до всей темы — и
      // JIG-148 попал бы в выпуск, в котором не выходил, МОЛЧА. Поэтому
      // разбор остался узким, а тема названа вслух.
      const r = setupTempRepo()
      r.addShippedCommit('fix(Accordion): восстановлено потерянное в JIG-148 (JIG-262)')
      r.runBump()
      setBody(r, '0.0.2', '### Исправлено\n\n- знак раскрытия (JIG-262)')
      const f = run(r)
      expect(f.status).toBe(5)
      expect(f.stderr).toContain('JIG-148')
    })

    it('освобождение КОММИТА по sha с доводом проходит и называет себя в выводе', () => {
      const r = setupTempRepo()
      r.addShippedCommit('chore(dist): пересборка под новые токены')
      const sha = r.git('rev-parse', 'HEAD').trim()
      r.runBump()
      setBody(r, '0.0.2', `<!-- без адреса: ${sha.slice(0, 7)} — пересборка после ручной правки токенов, задачи за ней нет -->`)
      const f = run(r)
      expect(f.status, f.stderr).toBe(0)
      expect(f.out).toContain('освобождены')
      expect(f.out).toContain(sha.slice(0, 7))
    })

    it.each([
      ['довод короче порога', (s: string) => `<!-- без адреса: ${s} — да -->`, 'довод короче'],
      ['«без адреса» без разбора', (s: string) => `<!-- без адреса ${s}, пересборка токенов -->`, 'не разобрано'],
      ['чужой sha', () => '<!-- без адреса: 0000000 — пересборка после ручной правки токенов -->', 'нет кода в скобках'],
    ])('освобождение не покупает тишину: %s', (_n, make, expected) => {
      // Тот же вывод, что и у «без пункта» (ревью DS-350): форма, которую
      // разбор не понял, обязана называться вслух, иначе человек считает
      // коммит освобождённым, а отказ говорит ему совсем о другом.
      const r = setupTempRepo()
      r.addShippedCommit('chore(dist): пересборка под новые токены')
      const sha = r.git('rev-parse', 'HEAD').trim()
      r.runBump()
      setBody(r, '0.0.2', make(sha.slice(0, 7)))
      const f = run(r)
      expect(f.status, `прошло молча: ${f.out}`).toBe(5)
      expect(f.stderr).toContain(expected)
    })

    it('прошлого выпуска нет → посылка тоже МОЛЧИТ, а не судит всю историю', () => {
      // Вырожденный диапазон здесь опаснее, чем у сверки пунктов: он потребовал
      // бы скобок от каждого коммита репозитория за всю его жизнь.
      const r = setupTempRepo()
      r.git('tag', '-d', 'v0.0.1')
      r.addShippedCommit(LOOSE)
      const editor = writeFakeEditor(r.root, '### Исправлено\n\n- пункт без кода')
      let out = ''
      let status = 0
      try { out = r.runPrepare({ EDITOR: `node ${editor}` }) } catch (e) {
        const x = e as { status?: number; stderr?: string; stdout?: string }
        status = x.status ?? 0
        out = String(x.stdout ?? '') + String(x.stderr ?? '')
      }
      expect(status, out).toBe(0)
      expect(out).toContain('прошлого выпуска нет')
    })
  })
})

/**
 * Черновик тела раздела из артефактов задач (DS-257).
 *
 * Готовый пункт каждой задачи лежит в `<docs>/tasks/<CODE>/<CODE>.md`, и на
 * релизе его переносили руками. Сборка не пишет текст — она переносит уже
 * проверенный (команды поиска в пункте прогнаны на фикстуре до того, как он
 * лёг в артефакт), поэтому здесь утверждается ПЕРЕНОС: что взято, откуда
 * взяты коды, что сделано с одноимёнными разделами и о чём сказано вслух.
 */
describe('draft: черновик CHANGELOG из артефактов задач (E2E, через CLI)', () => {
  const heads = (body: string, title: string) =>
    body.split('\n').filter((l) => l === `### ${title}`).length

  it('одноимённые разделы СЛИВАЮТСЯ: «### Исправлено» один, оба пункта в нём, порядок сохранён', () => {
    const r = setupTempRepo()
    r.addCommit('fix(A): первое (JIG-11)')
    r.addCommit('fix(B): второе (JIG-12)')
    const docs = tempRoot('rel-docs-')
    writeArtifacts(docs, {
      'JIG-11': '# JIG-11 — заметка для себя\n\nне пункт\n\n### Исправлено\n\n- пункт одиннадцать\n\n### Breaking\n\n- ломка одиннадцать\n',
      'JIG-12': '### Исправлено\n\n- пункт двенадцать\n',
    })
    r.runBump()
    const out = r.runDraft({ DS_DOCS_PATH: docs })
    const body = changelogBody(r.root, '0.0.2')
    // Счёт заголовков, а не наличие пунктов: склейка тоже содержит оба пункта,
    // отличает её только второй «### Исправлено».
    expect(heads(body, 'Исправлено'), body).toBe(1)
    expect(heads(body, 'Breaking'), body).toBe(1)
    expect(body.indexOf('пункт одиннадцать')).toBeGreaterThan(body.indexOf('### Исправлено'))
    expect(body.indexOf('пункт двенадцать')).toBeGreaterThan(body.indexOf('пункт одиннадцать'))
    // Оба пункта ДО следующего раздела — то есть в одном, а не каждый в своём.
    expect(body.indexOf('пункт двенадцать')).toBeLessThan(body.indexOf('### Breaking'))
    // Порядок разделов — порядок первого появления.
    expect(body.indexOf('### Исправлено')).toBeLessThan(body.indexOf('### Breaking'))
    // Шапка артефакта — заметка задачи, а не пункт: не переносится, но и не молча.
    expect(body).not.toContain('не пункт')
    expect(out).toContain('JIG-11')
    expect(out).toMatch(/вне разделов/)
  })

  it('заголовок внутри ограды кода — не заголовок: пункт не рвётся на комментарии bash', () => {
    // Пункты несут блоки ```bash, и строка `# ваша шкала` в них выглядит как
    // заголовок первого уровня. Без учёта ограды раздел оборвался бы на ней, а
    // хвост пункта ушёл бы в «текст вне разделов».
    const md = '### Исправлено\n\n- пункт\n\n  ```bash\n# ваша шкала\n### не раздел\n  ```\n\n  хвост пункта\n'
    const { sections, outside } = parseSections(md)
    expect(sections.map((s: { title: string }) => s.title)).toEqual(['Исправлено'])
    expect(sections[0].lines.join('\n')).toContain('хвост пункта')
    expect(outside).toEqual([])
  })

  it('задача без артефакта НАЗВАНА, а не пропущена молча', () => {
    const r = setupTempRepo()
    r.addCommit('fix(A): есть пункт (JIG-11)')
    r.addCommit('docs(CLAUDE): пункта нет (JIG-13)')
    const docs = tempRoot('rel-docs-')
    writeArtifacts(docs, { 'JIG-11': '### Исправлено\n\n- пункт\n', 'JIG-13': null })
    r.runBump()
    const out = r.runDraft({ DS_DOCS_PATH: docs })
    const line = out.split('\n').find((l) => l.includes('JIG-13'))
    expect(line, out).toBeDefined()
    expect(line).toMatch(/нет пункта/)
  })

  it('DS_DOCS_PATH не задан — громкий отказ, путь не угадывается, тело не тронуто', () => {
    const r = setupTempRepo()
    r.addCommit('fix(A): x (JIG-11)')
    r.runBump()
    let err = ''
    expect(() => {
      try { r.runDraft() } catch (e) { err = String((e as { stderr?: string }).stderr ?? ''); throw e }
    }).toThrow()
    expect(err).toContain('DS_DOCS_PATH не задан')
    expect(changelogBody(r.root, '0.0.2')).toBe('')
    // Задан, но мимо — тоже отказ, а не «у всех задач нет пункта»: второе
    // выглядело бы правдоподобным отчётом о пустом релизе.
    let err2 = ''
    try { r.runDraft({ DS_DOCS_PATH: join(r.root, 'нет-такого') }) } catch (e) { err2 = String((e as { stderr?: string }).stderr ?? '') }
    expect(err2).toMatch(/tasks/)
    expect(changelogBody(r.root, '0.0.2')).toBe('')
  })

  it('диапазон — от тега прошлого выпуска, тег прямой предок HEAD (JIG-28)', () => {
    // До JIG-28 тег стоял на отдельном поставочном коммите ветки `delivery` и
    // НЕ был предком HEAD, поэтому диапазон брался от `sourceOf(prevTag)`, а
    // не от самого тега. С JIG-28 `sourceOf` снят: тег и есть исходный
    // коммит, он прямой предок HEAD, и диапазон строится напрямую.
    const r = setupTempRepo()
    r.addCommit('fix(A): ушло в прошлый выпуск (JIG-1)')
    const editor = writeFakeEditor(r.root, '### Исправлено\n- прошлое')
    r.runPrepare({ EDITOR: `node ${editor}`, RELEASE_DATE: '2026-09-09' })
    r.git('clean', '-fq')
    r.runCommit()
    expect(() => r.git('merge-base', '--is-ancestor', 'v0.0.2', 'HEAD')).not.toThrow()
    r.addCommit('fix(B): новое (JIG-2)')
    const docs = tempRoot('rel-docs-')
    writeArtifacts(docs, {
      'JIG-1': '### Исправлено\n\n- пункт первый\n',
      'JIG-2': '### Исправлено\n\n- пункт второй\n',
    })
    r.runBump()
    const out = r.runDraft({ DS_DOCS_PATH: docs })
    const body = changelogBody(r.root, '0.0.3')
    expect(body).toContain('пункт второй')
    expect(body).not.toContain('пункт первый')
    // Диапазон обязан ИСКЛЮЧАТЬ прошлый выпуск, а не включать всю историю:
    // до JIG-28 ошибка здесь (диапазон от тега вместо sourceOf(тега), пока тег
    // указывал на поставку без общих предков с main) давала не пустой список,
    // а ЛИШНИЙ код — тег снова предок HEAD, но сам вопрос остаётся тем же.
    expect(out).toContain('JIG-2')
    expect(out).not.toMatch(/JIG-1(?!\d)/)
  })

  it('стык с отказом без $EDITOR: после черновика prepare без редактора ПРОХОДИТ', () => {
    const r = setupTempRepo()
    r.addCommit('fix(A): x (JIG-11)')
    const docs = tempRoot('rel-docs-')
    writeArtifacts(docs, { 'JIG-11': '### Исправлено\n\n- пункт\n' })
    r.runBump()
    r.runDraft({ DS_DOCS_PATH: docs })
    const out = r.runPrepare({ EDITOR: '' })
    expect(out).toContain('готово к проверкам: 0.0.2')
  })

  /**
   * `## [Unreleased]` — живая практика: агенты кладут туда пункты по ходу
   * работы. Черновик ВБИРАЕТ этот раздел в выпуск и удаляет его заголовок; пункт
   * задачи, чей код в нём уже упомянут, из артефакта не переносится второй раз.
   */
  it('## [Unreleased] вбирается в раздел выпуска: не потерян и не задвоен', () => {
    const r = setupTempRepo()
    const cl = r.read('CHANGELOG.md').replace('## [0.0.1]',
      '## [Unreleased]\n\n**Шапка выпуска от агента.**\n\n### Исправлено\n\n- из Unreleased (JIG-21)\n\n## [0.0.1]')
    writeFileSync(join(r.root, 'CHANGELOG.md'), cl)
    r.git('add', 'CHANGELOG.md'); r.git('commit', '-q', '-m', 'docs(changelog): пункт (JIG-21)')
    r.addCommit('fix(B): второе (JIG-22)')
    const docs = tempRoot('rel-docs-')
    writeArtifacts(docs, {
      'JIG-21': '### Исправлено\n\n- из артефакта двадцать один\n',
      'JIG-22': '### Исправлено\n\n- из артефакта двадцать два\n',
    })
    r.runBump()
    const out = r.runDraft({ DS_DOCS_PATH: docs })
    const body = changelogBody(r.root, '0.0.2')
    expect(r.read('CHANGELOG.md')).not.toContain('## [Unreleased]')
    expect(body).toContain('**Шапка выпуска от агента.**')
    expect(body.split('из Unreleased').length - 1).toBe(1)
    expect(body).not.toContain('из артефакта двадцать один')
    expect(body).toContain('из артефакта двадцать два')
    expect(heads(body, 'Исправлено')).toBe(1)
    expect(out.split('\n').find((l) => l.includes('JIG-21'))).toMatch(/уже в разделе/)
    // Повторный прогон — не второй экземпляр пунктов.
    r.runDraft({ DS_DOCS_PATH: docs })
    expect(changelogBody(r.root, '0.0.2')).toBe(body)
  })

  it('до бампа — отказ: раздела выпуска ещё нет, писать некуда', () => {
    const r = setupTempRepo()
    r.addCommit('fix(A): x (JIG-11)')
    const docs = tempRoot('rel-docs-')
    writeArtifacts(docs, { 'JIG-11': '### Исправлено\n\n- пункт\n' })
    expect(() => r.runDraft({ DS_DOCS_PATH: docs })).toThrow(/make bump/)
  })
})

/**
 * commit (E2E): тег указывает на КОММИТ ВЫПУСКА, в нём VERSION_FILES (JIG-28).
 *
 * До JIG-28 `commit` строил и проверял отдельное поставочное дерево (`dist/`,
 * `README.md`, урезанный манифест) на ветке `delivery` и вешал тег на него —
 * ровно этот механизм проверяли мутации `verifyDeliveryTree` в
 * `delivery-commit.test.ts` (файл снят вместе с веткой). Ветки `delivery`
 * больше нет: GitHub Actions собирает и пакует `dist/` ПОСЛЕ push тега, и
 * `commit()` больше ничего не строит — только версионные файлы и тег на HEAD.
 */
describe('commit (E2E)', () => {
  it('тег указывает на коммит выпуска — не на отдельную ветку', () => {
    const r = setupTempRepo()
    r.addComponent('Gauge', 'JIG-1')
    const editor = writeFakeEditor(r.root, '### Added\n- z feature (JIG-1)')
    r.runPrepare({ EDITOR: `node ${editor}`, RELEASE_DATE: '2026-08-08' })
    r.git('clean', '-fq')
    r.runCommit()
    const tagCommit = r.git('rev-parse', 'v0.1.0^{commit}').trim()
    expect(tagCommit).toBe(r.git('rev-parse', 'HEAD').trim())
    expect(r.git('branch', '--list', 'delivery').trim(), 'ветки delivery больше нет').toBe('')
  })

  it('релизный коммит несёт VERSION_FILES и ничего сверх — dist/ в нём нет', () => {
    const r = setupTempRepo()
    r.addComponent('Gauge', 'JIG-1')
    const editor = writeFakeEditor(r.root, '### Added\n- z feature (JIG-1)')
    r.runPrepare({ EDITOR: `node ${editor}`, RELEASE_DATE: '2026-08-08' })
    r.git('clean', '-fq')
    r.runCommit()
    const files = r.git('show', '--name-only', '--format=', 'HEAD').trim().split('\n')
    expect(files).toEqual(expect.arrayContaining([
      'package.json', 'package-lock.json', 'CHANGELOG.md',
      'docs/portal-migration/consumption.md', '.design-sync/conventions.md', 'tokens/tokens.css',
    ]))
    expect(files.some((f) => f.startsWith('dist/')), 'dist/ больше не едет в релизный коммит — его собирает CI после тега').toBe(false)
    expect(r.git('status', '--porcelain').trim(), 'после релиза дерево обязано быть чистым').toBe('')
  })

  it('создаёт релизный коммит с телом в сообщении и тег', () => {
    const r = setupTempRepo()
    r.addComponent('Gauge', 'JIG-1')
    const editor = writeFakeEditor(r.root, '### Added\n- z feature (JIG-1)')
    r.runPrepare({ EDITOR: `node ${editor}`, RELEASE_DATE: '2026-08-08' })
    // fake-editor.mjs — лишний файл в дереве; убрать, чтобы commit добавлял только версионные
    r.git('clean', '-fq')
    r.runCommit()
    expect(r.git('tag', '-l', 'v0.1.0').trim()).toBe('v0.1.0')
    const msg = r.git('log', '-1', '--format=%B').trim()
    expect(msg).toContain('chore(release): 0.1.0')
    expect(msg).toContain('- z feature')
    // DS-318: бамп пишет lock, значит lock едет в релизный коммит, а не
    // остаётся грязным в дереве до первого чужого `git add`.
    const files = r.git('show', '--name-only', '--format=', 'HEAD').trim().split('\n')
    expect(files, 'package-lock.json не уехал в релизный коммит').toContain('package-lock.json')
    expect(r.git('status', '--porcelain').trim(), 'после релиза дерево обязано быть чистым').toBe('')
  })
  it('падает, если тег уже существует', () => {
    const r = setupTempRepo()
    r.addComponent('Gauge', 'JIG-1')
    const editor = writeFakeEditor(r.root, '### Added\n- z (JIG-1)')
    r.runPrepare({ EDITOR: `node ${editor}`, RELEASE_DATE: '2026-08-08' })
    r.git('clean', '-fq')
    r.git('tag', '-a', 'v0.1.0', '-m', 'squat') // занять тег заранее
    expect(() => r.runCommit()).toThrow()
  })
})
