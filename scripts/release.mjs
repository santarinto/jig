#!/usr/bin/env node
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'

export function computeNext(version, level) {
  const m = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!m) throw new Error(`bad version: ${version}`)
  let [maj, min, pat] = m.slice(1, 4).map(Number)
  if (level === 'major') { maj += 1; min = 0; pat = 0 }
  else if (level === 'minor') { min += 1; pat = 0 }
  else if (level === 'patch') { pat += 1 }
  else throw new Error(`bad level: ${level}`)
  return `${maj}.${min}.${pat}`
}

/**
 * Уровень выпуска считает КАТАЛОГ, а не сообщения коммитов.
 *
 * Мажор — компонент удалён, минор — добавлен, всё остальное патч. Правило
 * владельца, записано в CLAUDE.md, и держится оно на том, что потребитель
 * ставит ПРИБИТЫЙ ТЕГ (`consumption.md`), а не диапазон: номер не может
 * доставить ничего молча, поэтому он метка на каталоге, а не обещание про
 * совместимость. Про совместимость говорит раздел `Breaking` в `CHANGELOG.md`
 * и падение у потребителя.
 *
 * Прежняя редакция читала conventional commits и отвечала на ДРУГОЙ вопрос.
 * Она была не «неточной», а не о том: `feat!` на существующем компоненте давал
 * мажор там, где по правилу патч, и за два выпуска подряд увёл версию на
 * 4.0.0, которую пришлось разбирать руками. Инструмент, отвечающий на соседний
 * вопрос, — это не погрешность, это неверный ответ, выглядящий правдоподобно.
 */
export function componentsAt(ref, root) {
  const r = spawnSync('git', ['ls-tree', '-d', '--name-only', `${ref}:src/components`],
    { cwd: root, encoding: 'utf8' })
  // Пути нет в этой ревизии (каталог ещё не заведён) — не ошибка, а пустой
  // каталог. Отличать «нет каталога» от «каталог пуст» здесь незачем: в обоих
  // случаях компонентов ноль.
  if (r.status !== 0) return new Set()
  return new Set(r.stdout.split('\n').map((l) => l.trim()).filter(Boolean))
}

/** Уровень из двух состояний каталога. Удаление перевешивает добавление. */
export function levelFromCatalogue(before, after) {
  const removed = [...before].filter((c) => !after.has(c))
  const added = [...after].filter((c) => !before.has(c))
  // Удаление сильнее добавления: у потребителя ПРОПАЛА поверхность, и это
  // единственное, чего он не переживёт молча — добавленного он просто не
  // заметит, пока не позовёт.
  if (removed.length) return { level: 'major', added, removed }
  if (added.length) return { level: 'minor', added, removed }
  return { level: 'patch', added, removed }
}

const DOC_SITES = [
  { file: 'docs/portal-migration/consumption.md', anchor: /(версия пакета — \*\*)\d+\.\d+\.\d+/g },
  { file: '.design-sync/conventions.md', anchor: /(\*\*Version )\d+\.\d+\.\d+/g },
  // Пятый версионный файл с DS-215. Токен `--ds-version` — единственный
  // способ узнать версию СО СТРАНИЦЫ потребителя, и он врал бы с первого же
  // выпуска, не бампись он вместе с остальными. Врущий маркер хуже
  // отсутствующего: ему верят.
  { file: 'tokens/tokens.css', anchor: /(--ds-version:\s*")\d+\.\d+\.\d+/g },
]
const TARBALL = /(santarinto-jig-)\d+\.\d+\.\d+(\.tgz)/g
// Тег в пути ассета GitHub Release (JIG-28): `/releases/download/vX.Y.Z/`. Без
// него бамп переписывал имя тарбола, а тег оставлял прежним — адрес, которого
// не будет никогда (пойман на первом выпуске 1.0.0, JIG-3).
const RELEASE_TAG = /(\/releases\/download\/v)\d+\.\d+\.\d+(\/)/g

/**
 * Корневая запись `package-lock.json` (DS-318). До этой задачи бамп её не
 * трогал, и lock отстал на четырнадцать выпусков (3.0.6 при 4.2.5), пока его
 * попутно не пересобрал чужой коммит 2202cc6 — то есть дрейф всплывал шумом в
 * посторонних диффах. `npm ci` на одну корневую версию НЕ падает (замер в
 * задаче: npm 11.13.0, exit 0), поэтому смысл правки — не «починить ci», а не
 * давать lock врать и не отдавать его первому встречному `npm install`.
 *
 * Правится разбором JSON, а не регуляркой: `"version"` в lock встречается сотни
 * раз, корневых из них два (`version` и `packages[""].version`), и регулярка
 * «первое вхождение» держалась бы на порядке ключей. Сериализация npm —
 * `JSON.stringify(_, null, 2) + '\n'`, круг разбор→запись на нашем lock
 * побайтово тождествен (проверено), так что дифф бампа — ровно две строки.
 * `npm install --package-lock-only` отвергнут: он ходит в реестр и может
 * перерезолвить дерево, то есть молча поменять зависимости в релизном коммите.
 */
export const LOCKFILE = 'package-lock.json'

/**
 * Разбор и проверка lock — ДО первой записи. Отказ после записи `package.json`
 * оставлял бы полубамп: манифест на новой версии, остальные на старой, а
 * следующий прогон счёл бы это resume и умер бы на «нет раздела ## [V]», не
 * назвав lock вовсе.
 */
function readLock(root) {
  const p = resolve(root, LOCKFILE)
  const lock = JSON.parse(readFileSync(p, 'utf8'))
  if (!lock.packages?.['']) throw new Error(`${LOCKFILE}: нет корневой записи packages[""] — lockfileVersion ${lock.lockfileVersion}?`)
  return { p, lock }
}

function bumpLock({ p, lock }, next) {
  lock.version = next
  lock.packages[''].version = next
  writeFileSync(p, JSON.stringify(lock, null, 2) + '\n')
}

export function bumpFiles(root, next) {
  const lock = readLock(root)
  const pkgPath = resolve(root, 'package.json')
  const pkgText = readFileSync(pkgPath, 'utf8')
  writeFileSync(pkgPath, pkgText.replace(/("version":\s*")\d+\.\d+\.\d+/, `$1${next}`))
  bumpLock(lock, next)
  for (const { file, anchor } of DOC_SITES) {
    const p = resolve(root, file)
    const text = readFileSync(p, 'utf8')
    writeFileSync(p, text.replace(anchor, `$1${next}`).replace(TARBALL, `$1${next}$2`).replace(RELEASE_TAG, `$1${next}$2`))
  }
}

/**
 * Вставляет пустой раздел `## [version] — date` над верхним разделом CHANGELOG.
 * Идемпотентно: `text.includes('## [version]')` — литеральная подстрока, повторный
 * вызов не дублирует раздел.
 */
export function scaffoldChangelog(root, version, date) {
  const p = resolve(root, 'CHANGELOG.md')
  const text = readFileSync(p, 'utf8')
  if (text.includes(`## [${version}]`)) return // идемпотентно
  const lines = text.split('\n')
  const idx = lines.findIndex((l) => /^## \[/.test(l))
  const block = [`## [${version}] — ${date}`, '', '']
  if (idx === -1) lines.push(...block)
  else lines.splice(idx, 0, ...block)
  writeFileSync(p, lines.join('\n'))
}

/** Синхронный git; бросает при ненулевом коде (там, где отказ исключителен). */
function git(args, root) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' })
}

/**
 * Последний выпуск — СТАРШИЙ ПО ВЕРСИИ тег `v*`, а не ближайший предок HEAD.
 *
 * Здесь стоял `git describe --tags --abbrev=0`, и он отвечал про ПРЕДКОВ. С
 * DS-246 тег выпуска стоял на поставочном коммите (ветка `delivery`),
 * который предком main не является, — то есть `describe` от main переставал
 * бы видеть последний выпуск вовсе и молча возвращал бы предпоследний. Молча:
 * уровень посчитался бы от чужой границы, а `git log prev..HEAD` показал бы
 * лишние коммиты — оба ответа правдоподобны и оба неверны.
 *
 * `--sort=-v:refname` — версионный порядок, а не лексический: `v4.2.10` старше
 * `v4.2.9`, чего сортировка строк не знает. Отбор `v*` намеренно узкий: он же
 * стоит в `check-published.mjs` (`localTags`), и два разных ответа на «что такое
 * релизный тег» разошлись бы молча.
 *
 * `--merged HEAD` (JIG-3): тег обязан быть ДОСТИЖИМ из HEAD, иначе он не
 * последний ВЫПУСК этой истории, а просто ref, лежащий рядом в общей базе
 * объектов. `git tag --list` без этого условия отвечает по всей базе
 * объектов репозитория, а не по ветке: на squash-корне `public` (JIG-3,
 * прежняя история под старым именем пакета не переносится) старые теги
 * `v4.2.6` и младше остаются в репозитории — тот же `.git`, тот же object
 * store — но предками нового корня не являются. Без `--merged` `latestTag`
 * возвращал бы `v4.2.6` и на squash-корне тоже, и `bumpFromArgs` отказывал бы
 * версии первого выпуска с «тег v4.2.6 уже существует», хотя с точки зрения
 * HEAD выпусков не было ни одного — предок один и тот же коммит, версии не
 * разъезжаются.
 */
export function latestTag(root, headRef = 'HEAD') {
  const r = spawnSync('git', ['tag', '--list', 'v*', '--merged', headRef, '--sort=-v:refname'],
    { cwd: root, encoding: 'utf8' })
  if (r.status !== 0) return null
  return r.stdout.split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? null
}

export function tagExists(tag, root) {
  const r = spawnSync('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`],
    { cwd: root, stdio: 'ignore' })
  return r.status === 0
}

/**
 * Поставка (JIG-28): тег `vX.Y.Z` указывает на ИСХОДНЫЙ коммит выпуска, как до
 * DS-246, а не на отдельный поставочный коммит на ветке `delivery`.
 *
 * Причина смены. DS-246 решал одну задачу — не дать npm качать
 * `devDependencies` git-зависимости (184 пакета независимо от `prepare`,
 * замер 09.09.2026). Способом был отдельный коммит без исходников и манифест
 * без `devDependencies`/`scripts`. Ценой была ветка `delivery`, `sourceOf` на
 * каждом месте, что читает историю (`detectBumpLevel`, `latestTag`,
 * `taskCodes`), и `git show vX.Y.Z` без исходников.
 *
 * С JIG-28 потребитель вообще перестаёт ставить git-зависимость: GitHub
 * Actions на push тега `v*` собирает `dist/`, пакует `npm pack` (тот же
 * `prepack`, что чистит манифест — см. `dist-shipped`) и прикладывает
 * `santarinto-jig-X.Y.Z.tgz` к GitHub Release. Тарбол по URL ставится готовым,
 * без единого lifecycle-скрипта у потребителя, — тот же довод DS-244,
 * другим транспортом. Раз git-коммит под тегом сам по себе больше не
 * устанавливается, держать ради него вторую ветку, трейлер и мутационный
 * гейт над деревом — цена без довода. Тег снова смотрит прямо на исходники,
 * `git show vX.Y.Z` снова показывает их, и `sourceOf`/ветка `delivery`/
 * `deliveryManifest`/`buildDeliveryTree`/`verifyDeliveryTree` сняты. `prevTag`,
 * взятый напрямую как git-ревизия, и есть исходный коммит прошлого выпуска.
 */

/**
 * `prevTag` — тег предыдущего выпуска или `null`, если выпусков не было.
 *
 * Проверка «есть ли что выпускать» осталась и осталась ОТДЕЛЬНОЙ от уровня:
 * пустой диапазон это отказ, а не патч. Каталог при нулевом числе коммитов не
 * менялся бы, то есть по одному только каталогу выпуск без изменений выглядел
 * бы законным патчем.
 *
 * `!prevTag` (JIG-3) — ОТКАЗ, а не тихий `minor`. До squash здесь стоял
 * `return 'minor'`: «первого тега нет — каталог появился целиком, это
 * добавление» — и это был верный ответ ровно один раз, на самом первом
 * выпуске системы, потому что тогда «нет тега» и «первый выпуск» были одним
 * и тем же событием. После squash это перестаёт быть так: у нового
 * репозитория тегов нет вовсе, но само по себе отсутствие `prevTag` больше не
 * доказывает, что каталог «появился целиком» — сравнивать всё равно не с чем,
 * и молчаливое «всё новое» решало бы за владельца версию первого выпуска
 * вместо него. Первый выпуск теперь ЯВНЫЙ: `make bump version=X.Y.Z`
 * (`bumpFromArgs`) задаёт версию сам, минуя эту функцию.
 */
export function detectBumpLevel(prevTag, root) {
  // Тег — исходный коммит выпуска (JIG-28, было иначе на DS-246: тег
  // указывал на поставочный коммит без `src/components` и без истории main,
  // и оба ответа ниже были бы молчаливо неверны на нём). Считать напрямую от
  // `prevTag` теперь безопасно.
  const prev = prevTag
  const range = prev ? `${prev}..HEAD` : 'HEAD'
  const out = git(['log', range, '--no-merges', '--format=%B%x1e'], root)
  const commits = out.split('\x1e').map((s) => s.trim()).filter(Boolean)
  if (commits.length === 0) throw new Error('No changes to release')
  if (!prev) {
    throw new Error(
      'нет предыдущего тега — уровень первого выпуска не вычисляется, версия задаётся явно: '
      + '`make bump version=X.Y.Z`',
    )
  }
  const { level, added, removed } = levelFromCatalogue(
    componentsAt(prev, root), componentsAt('HEAD', root),
  )
  // Печатается ПРИЧИНА, а не только вывод: «patch» без объяснения неотличим от
  // «детект ничего не понял», и человек не увидит, что компонент, который он
  // считал добавленным, каталогом не считается.
  if (removed.length) console.log(`удалены: ${removed.join(', ')}`)
  if (added.length) console.log(`добавлены: ${added.join(', ')}`)
  if (!removed.length && !added.length) console.log('каталог компонентов не менялся')
  return level
}

/**
 * Тело раздела `## [version]` (между его заголовком и следующим `## [`).
 * Заголовок ищется по ТОЧНОМУ префиксу `startsWith('## [version]')`, НЕ регэкспом по
 * версии: точки в версии — метасимволы regex (`1.47.0` матчил бы `1x47y0`), это класс
 * багов, которого здесь избегают намеренно. Не заменять на RegExp.
 */
export function changelogBody(root, version) {
  const text = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8')
  const lines = text.split('\n')
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`))
  if (start === -1) return ''
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## \[/.test(lines[i])) { end = i; break }
  }
  return lines.slice(start + 1, end).join('\n').trim()
}

/**
 * Черновик тела раздела из АРТЕФАКТОВ задач (DS-257).
 *
 * Готовый пункт CHANGELOG у задачи лежит в `<docs>/tasks/<CODE>/<CODE>.md`, и
 * на релизе его переносили руками — ровно та работа, в которой пункт теряется
 * или ложится вторым «### Исправлено» ниже первого. Сборка текст НЕ ПИШЕТ: в
 * пункте стоят команды поиска, прогнанные на фикстуре до того, как он лёг в
 * артефакт, и любое переписывание сделало бы их непроверенными. Она переносит.
 *
 * Результат — черновик: его читают и правят до `make release`. Непустое тело
 * заодно проводит `prepare` мимо ветки редактора, то есть это штатный путь
 * готовить выпуск без `$EDITOR`.
 */
const DOCS_ENV = 'DS_DOCS_PATH'

/**
 * Коды задач — ИЗ GIT, не из трекера: релиз не зависит от живого MCP.
 *
 * Берутся из скобок ТЕМЫ коммита — `fix(Tabs): … (DS-284, DS-285)`,
 * `(DS-146, часть 1)`. Не из тела: тела здесь пишутся с доводами и
 * называют чужие задачи как историю («до DS-148 этой проверки не было»),
 * и такой код в выпуск не входит.
 *
 * Диапазон — `prevTag..HEAD`, как у `detectBumpLevel`: тег с JIG-28 снова
 * указывает на исходный коммит выпуска, и это ПРЯМОЙ предок HEAD.
 *
 * ТОЛЬКО `JIG-\d+` (JIG-3): после squash в новой истории тем с кодом
 * архивной доски (прежним префиксом) не будет вовсе, а принимать его здесь
 * значило бы разрешить адресовать поставку АРХИВНОЙ задачей — кодом, у
 * которого больше нет живой доски и живого флоу статусов. Архивные номера
 * остаются читаемыми как `DS-N` в прозе (докблоки, KNOWN-карты
 * `case-*.mjs`), но не как адрес поставки.
 */
const TASK_CODE = /\bJIG-\d+\b/g

/**
 * Коды ИЗ СКОБОК темы, и только из них. Тема вида «восстановлено то, что
 * потерялось в DS-148 (DS-300)» называет чужую задачу как историю
 * ровно так же, как это делают тела коммитов, — расширить разбор до всей темы
 * значило бы привязать к выпуску задачу, которая в нём не выходила, и сделать
 * это МОЛЧА.
 *
 * Обратная сторона — код в теме без скобок сюда не попадает вовсе — тихой
 * границей быть перестала: на коммитах, тронувших `dist/`, её держит
 * `unaddressedShipped` (DS-352). Вне поставки она остаётся, и там её
 * цена — строка в выводе `draft`, а не непроверенная задача в выпуске.
 */
function codesIn(subject) {
  const codes = []
  for (const [, group] of subject.matchAll(/\(([^()]*)\)/g)) {
    for (const [code] of group.matchAll(TASK_CODE)) if (!codes.includes(code)) codes.push(code)
  }
  return codes
}

export function taskCodes(prevTag, root, pathspec = []) {
  const prev = prevTag  // тег и есть исходный коммит (JIG-28) — sourceOf снят
  const range = prev ? `${prev}..HEAD` : 'HEAD'
  const args = ['log', range, '--no-merges', '--reverse', '--format=%s']
  if (pathspec.length) args.push('--', ...pathspec)
  const subjects = git(args, root).split('\n')
  const codes = []
  for (const s of subjects) for (const code of codesIn(s)) if (!codes.includes(code)) codes.push(code)
  return codes
}

/**
 * Вход сборки, а не собранное (JIG-28) — по нему решается, дошла ли правка ДО
 * ПОТРЕБИТЕЛЯ (DS-350).
 *
 * До JIG-28 предметом было `dist/`: собранное лежало в git (DS-244), и
 * вопрос «тронул ли коммит поставку» задавался прямо по нему. `dist/` больше
 * не в git (см. `.gitignore`) — CI собирает и пакует его сам, а этот сценарий
 * (`prepare`/агентская работа) никогда `dist/` не коммитит. Задавать тот же
 * вопрос теперь можно только по ВХОДАМ сборки: то, что скомпилирует `tsc` и
 * скопирует `build`, если его сейчас собрать. Список НЕ пишется руками —
 * список путей (`src/components`, `styles`, `theme`, …) расходился бы со
 * сборкой молча, той же болезнью, что была у прежнего варианта до
 * DS-350 (см. историю ниже), — он выводится из `tsconfig.build.json`
 * (`include`/`exclude` решают, что компилирует `tsc`) плюс из того, что копирует
 * `npm run build` мимо `tsc` (`fonts/*`, CSS рядом с исходником) плюс
 * `scripts/build-bundles.mjs`, `package.json`, `README.md` — три файла, что
 * едут в пакет без компиляции вовсе. `buildInputConfig`/`shippedPathspec`
 * держат это одним местом; гейт `build-input-mapping` доказывает, что список
 * ничего не забыл — сверяет с тем, что реально паковает `npm pack`.
 *
 * Что собранное уезжает ТЕМ ЖЕ коммитом, что и исходник, — здесь больше не
 * вопрос: раз собранного в git нет, всякий коммит, тронувший вход, тронул и
 * будущую поставку по построению, без отдельного слоя проверки.
 *
 * Замерено на выпуске 4.2.6 ДО этой правки (диапазон по `dist/`, для памяти):
 * 85 кодов в коммитах, из них поставляемых 52, при двух ложных попаданиях у
 * ручной сверки по списку путей — ровно тот класс ошибки, которого выводимый
 * список избегает.
 */
export function buildInputConfig(root) {
  const path = resolve(root, 'tsconfig.build.json')
  if (!existsSync(path)) {
    throw new Error(`${path}: нет tsconfig.build.json — входы сборки не выводятся, сверять поставку не с чем`)
  }
  const ts = JSON.parse(readFileSync(path, 'utf8'))
  return {
    // Каталоги, которые компилирует tsc — то же `include`, что читает сборка.
    include: ts.include ?? [],
    // Тесты, фикстуры, гварды — то, что tsc из `include` НЕ берёт.
    exclude: ts.exclude ?? [],
    // Копируются `build`-скриптом как есть, мимо tsc: `npm run build` в
    // package.json — `cp fonts/* dist/fonts/`.
    extraDirs: ['fonts'],
    // Едут в пакет без компиляции: сценарий бандлов и сам манифест/README.
    extraFiles: ['scripts/build-bundles.mjs', 'package.json', 'README.md'],
  }
}

/**
 * git-pathspec для входов сборки: `include`/`extraDirs`/`extraFiles` целиком,
 * `exclude` — отрицаниями (`:(exclude,glob)…`), тем же способом, каким они
 * исключены у `tsc`. Значение читается заново на каждый вызов — `git log`
 * дороже разбора JSON, а вызовов на прогон немного.
 */
export function shippedPathspec(root) {
  const { include, exclude, extraDirs, extraFiles } = buildInputConfig(root)
  return [
    ...include, ...extraDirs, ...extraFiles,
    ...exclude.map((p) => `:(exclude,glob)${p}`),
  ]
}

/**
 * Код → тема первого его коммита, тронувшего вход сборки. Тема нужна отказу:
 * он называет, ЧТО уехало без адреса, и без неё человеку пришлось бы идти в
 * лог руками.
 *
 * Пустой ответ `git log` по несуществующему пути — код 0 и ноль строк, то есть
 * переезд `src/`/`tokens/`/`types/` превратил бы проверку в вечное
 * «поставляемых задач 0». Пол — тем же способом, каким его прежде ставил
 * `dist-committed` для `dist/`: под контролем git обязан быть хоть один файл
 * среди входов.
 */
export function shippedTasks(prevTag, root) {
  const pathspec = shippedPathspec(root)
  if (!git(['ls-files', '--', ...pathspec], root).trim()) {
    throw new Error('под контролем git нет ни одного файла среди входов сборки — сверять поставку не с чем')
  }
  const prev = prevTag  // тег и есть исходный коммит (JIG-28) — sourceOf снят
  const range = prev ? `${prev}..HEAD` : 'HEAD'
  const out = git(['log', range, '--no-merges', '--reverse', '--format=%s', '--', ...pathspec], root)
  const tasks = new Map()
  for (const s of out.split('\n')) for (const code of codesIn(s)) if (!tasks.has(code)) tasks.set(code, s)
  return tasks
}

export function shippedCodes(prevTag, root) {
  return [...shippedTasks(prevTag, root).keys()]
}

/**
 * Коммиты диапазона, тронувшие вход сборки, — с полным sha: по нему пишется
 * освобождение, и сокращение git'а (`%h`) зависит от размера репозитория, то
 * есть освобождение, написанное сегодня, завтра могло бы не совпасть.
 */
function shippedCommits(prevTag, root) {
  const pathspec = shippedPathspec(root)
  const prev = prevTag  // тег и есть исходный коммит (JIG-28) — sourceOf снят
  const range = prev ? `${prev}..HEAD` : 'HEAD'
  const out = git(['log', range, '--no-merges', '--reverse', '--format=%H\t%s', '--', ...pathspec], root)
  return out.split('\n').filter(Boolean).map((line) => {
    const i = line.indexOf('\t')
    return { sha: line.slice(0, i), subject: line.slice(i + 1) }
  })
}

/**
 * ПОСЫЛКА сверки поставки, проверяемая, а не подразумеваемая (DS-352).
 *
 * `shippedTasks` отвечает на «чей код стоит в скобках темы коммита, тронувшего
 * `dist/`». Читалось это как «чья правка дошла до потребителя», и под чтением
 * лежали две посылки, обе на одной конвенции и обе ТИХИЕ — сверка печатала
 * «поставляемых задач 0, названы все»:
 *
 * 1. Код в теме стоит В СКОБКАХ. «fix: знак раскрытия DS-262 переехал»,
 *    тронувший `dist/`, не попадал в множество вовсе. Гейта на формат темы в
 *    репозитории нет.
 * 2. Исходник и собранное едут ОДНИМ коммитом. Ссылались здесь на
 *    `dist-committed`, но он сравнивает дерево с ИНДЕКСОМ и про историю не
 *    знает: rebase или squash, разложивший пару на «fix(X): … (CODE)» по src и
 *    «chore(dist): пересборка» по dist, оставлял `check` зелёным.
 *
 * Проверяется ровно посылка: КАЖДЫЙ коммит диапазона, тронувший `dist/`,
 * обязан нести хотя бы один код в скобках и не нести кода вне скобок.
 *
 * Почему этого хватает на дыру 2, хотя про `src` здесь не сказано ни слова:
 * разнесённая пара — это коммит, тронувший `dist/`. Либо он называет код в
 * скобках, и тогда сверка его видит, либо не называет, и тогда отказ. Третьего
 * положения нет, поэтому «поставляемый исходник» определять не требуется — то
 * самое определение, которого `shippedTasks` избегала намеренно.
 *
 * Что остаётся снаружи, названо вслух: коммит, тронувший `dist/` и назвавший в
 * скобках ЧУЖОЙ код, проходит. Проверка доказывает, что у поставки ЕСТЬ адрес,
 * а не что адрес верный, — и это единственный известный способ пройти её молча.
 *
 * Отброшено два варианта, оба из DS-352. Расширить `codesIn` до всей
 * темы — закрывает дыру 1 ценой молчаливой ЛОЖНОЙ привязки (см. её докблок),
 * то есть меняет тихий промах на тихий промах в другую сторону. Гейт на формат
 * темы у ВСЕХ коммитов — судит историю и коммиты верстака и документации,
 * тогда как предмет здесь только один: сверка поставки опирается на форму
 * темы. Эта проверка бьёт по коммитам одного выпуска, тронувшим `dist/`.
 *
 * Замерено на вышедшем 4.2.6 (`sourceOf(v4.2.5)..sourceOf(v4.2.6)`): 207
 * коммитов, тронувших `dist/` 73, из них без кода в скобках ОДИН — сам
 * `chore(release): 4.2.6`, которого в диапазоне на шаге `prepare` ещё нет, он
 * делается позже шагом `commit`. Кода вне скобок нет ни одного. На живом
 * выпуске проверка стоит нулевого шума.
 */
export function unaddressedShipped(root, version, prevTag) {
  const { addr, malformedAddr } = parseExemptions(changelogBody(root, version))
  const exemptFor = (sha) => [...addr.keys()].find((k) => sha.startsWith(k))
  const base = { codeless: [], loose: [], short: [], malformed: malformedAddr, exempt: [] }
  if (!prevTag) return { ...base, noPrev: true }
  const codeless = []
  const loose = []
  const short = []
  const used = []
  for (const { sha, subject } of shippedCommits(prevTag, root)) {
    const inside = codesIn(subject)
    const all = [...new Set(subject.match(TASK_CODE) ?? [])]
    const outside = all.filter((c) => !inside.includes(c))
    if (inside.length && !outside.length) continue
    const key = exemptFor(sha)
    if (key) {
      used.push(`${sha.slice(0, 9)} — ${addr.get(key)}`)
      if (addr.get(key).length < EXEMPT_REASON_MIN) short.push({ sha, subject })
      continue
    }
    if (!inside.length) codeless.push({ sha, subject })
    else loose.push({ sha, subject, outside })
  }
  return { ...base, codeless, loose, short, exempt: used, checked: true }
}

/**
 * Код СВОЙ, не слит с `EXIT_UNNAMED`: там правка — вписать пункт в раздел, тут
 * — дать коммиту адрес или освободить его. Одинаковый код звал бы человека
 * писать пункт задаче, которой гейт как раз и не знает.
 */
export const EXIT_UNADDRESSED = 5

/**
 * Освобождение от пункта — СТРОКОЙ В САМОМ РАЗДЕЛЕ, с доводом:
 *
 *   <!-- без пункта: DS-303 — в dist ушёл только комментарий в CSS -->
 *
 * Не отдельным файлом-списком: такой список растёт, переживает выпуски, о
 * которых написан, и через год читается как правило, хотя он — история. Здесь
 * освобождение живёт в разделе своего выпуска, уезжает вниз вместе с ним и
 * объясняется там, где решение было принято. Комментарий HTML: потребителю
 * этого знать не нужно, а в файле оно есть.
 *
 * Довод обязан быть длиннее `EXEMPT_REASON_MIN` — отказ, заглушаемый одним
 * символом после тире, не отказ вовсе, а доводом в одно слово гейт покупается
 * дешевле, чем пунктом.
 */
export const COMMENT_RE = /<!--[\s\S]*?-->/g
// ТОЛЬКО `JIG-\d+`, тем же доводом, что у TASK_CODE (JIG-3): освобождение —
// это тоже адрес поставки, и архивным кодом его давать нельзя.
export const EXEMPT_RE = /^без пункта:\s*(JIG-\d+)\s*[—–-]\s*([\s\S]+)$/
export const EXEMPT_REASON_MIN = 20

/**
 * Освобождение коммита, тронувшего `dist/` без адреса (`unaddressedShipped`).
 * Форма та же, что у «без пункта», и живёт там же — в разделе своего выпуска,
 * а не в отдельном списке. Ключ — sha, потому что освобождается КОММИТ: кода,
 * которым его можно было бы назвать, у него как раз и нет.
 *
 * `{7,40}` — любая длина, которой git сокращает: отказ печатает 9 знаков, но
 * человек копирует и из `git log --oneline`, где их 7, и сверка идёт по
 * префиксу полного sha.
 */
export const EXEMPT_ADDR_RE = /^без адреса:\s*([0-9a-f]{7,40})\s*[—–-]\s*([\s\S]+)$/i

/**
 * Освобождения разбираются из ВСЕХ комментариев, а не одной регуляркой по
 * телу, и порядок здесь — предмет, а не стиль (ревью DS-350).
 *
 * Регулярка, вырезающая из прозы только РАЗОБРАННОЕ, глушит сама себя: всё,
 * что она не поняла, остаётся в прозе вместе с кодом внутри и тут же идёт за
 * упоминание. Проверено тремя формами, каждая проходила молча и печатала
 * «названы все»: дефис вместо тире (`- ` вместо `— `, визуально
 * неотличимо и именно это наберёт человек), голый `<!-- DS-262 -->` без
 * слов «без пункта», перенос строки посреди довода. То есть длина довода
 * держала ровно те освобождения, которые и так написаны верно.
 *
 * Поэтому: комментарии снимаются ЦЕЛИКОМ, разбор идёт по снятым кускам, тире
 * принимается любое из трёх, довод многострочный. Комментарий, начатый словами
 * «без пункта» и не разобранный, называется вслух — иначе человек считал бы
 * задачу освобождённой, а отказ говорил бы ему про отсутствующий пункт.
 */
export function parseExemptions(body) {
  const exempt = new Map()
  const addr = new Map()
  const malformed = []
  const malformedAddr = []
  for (const [comment] of body.matchAll(COMMENT_RE)) {
    const inner = comment.slice(4, -3).trim()
    const m = EXEMPT_RE.exec(inner)
    const a = EXEMPT_ADDR_RE.exec(inner)
    if (m) exempt.set(m[1], m[2].trim())
    else if (a) addr.set(a[1].toLowerCase(), a[2].trim())
    else if (/без\s+пункта/i.test(inner)) malformed.push(inner.replace(/\s+/g, ' ').slice(0, 90))
    // Та же причина, по которой называется вслух неразобранное «без пункта»:
    // молча отброшенное освобождение человек считает за действующее.
    else if (/без\s+адреса/i.test(inner)) malformedAddr.push(inner.replace(/\s+/g, ' ').slice(0, 90))
  }
  return { exempt, addr, malformed, malformedAddr }
}

/**
 * Поставляемые коды, не названные в разделе `## [version]`.
 *
 * Сверяется УПОМИНАНИЕ кода, а не наличие пункта: пункт бывает про две задачи
 * сразу и бывает без своего заголовка, а код — признак, который можно
 * проверить точно. Обратная сторона названа вслух: код, упомянутый в чужом
 * пункте как история («до DS-148 этой проверки не было»), гейт
 * успокаивает. Это единственный известный способ пройти его молча, и он
 * требует, чтобы код ИМЕННО ЭТОГО выпуска попал в чужой пункт, — в 4.2.6 таких
 * не было ни одного.
 *
 * Комментарии из прозы вырезаются ВСЕ (см. `parseExemptions`): иначе
 * освобождение засчитывалось бы как упоминание само себе и длина довода не
 * держала бы ничего.
 *
 * Прошлого выпуска нет — сверять НЕ С ЧЕМ, и это не «ничего не найдено».
 * Диапазон выродился бы в `HEAD`, то есть проверка потребовала бы назвать в
 * разделе каждую задачу за всю историю репозитория. У `detectBumpLevel` тот же
 * вырожденный случай (JIG-3) теперь ОТКАЗЫВАЕТ явно — версия первого выпуска
 * не вычисляется, а задаётся владельцем; здесь верного ответа тоже нет, но
 * отказывать нечем (это не вычисление уровня, а сверка уже написанного
 * раздела), поэтому она молчит и говорит, что молчит.
 */
export function unnamedShipped(root, version, prevTag) {
  const body = changelogBody(root, version)
  const { exempt, malformed } = parseExemptions(body)
  const prose = body.replace(COMMENT_RE, '')
  const base = { missing: [], short: [], malformed, exempt: [...exempt.keys()] }
  if (!prevTag) return { ...base, checked: [], noPrev: true, subjects: new Map() }
  const subjects = shippedTasks(prevTag, root)
  const missing = []
  const short = []
  for (const code of subjects.keys()) {
    if (new RegExp(`\\b${code}(?!\\d)`).test(prose)) continue
    if (!exempt.has(code)) missing.push(code)
    else if (exempt.get(code).length < EXEMPT_REASON_MIN) short.push(code)
  }
  return { ...base, checked: [...subjects.keys()], missing, short, subjects }
}

/**
 * Код возврата СВОЙ, как и у `EXIT_UNRELEASED`: «тело не туда» и «в теле нет
 * адреса поставленной правке» лечатся разным, и слитые в общую единицу они
 * снова стали бы одним отказом с неверной починкой.
 */
export const EXIT_UNNAMED = 4

/**
 * Темы берутся ИЗ ОТЧЁТА, а не считаются заново. Здесь стоял свой `git log` с
 * `--grep`, и он расходился с отчётом двумя способами сразу: свой диапазон
 * (`latestTag` вместо переданного `prevTag`) и подстрочный `--grep`, по
 * которому `DS-30` печатал тему `DS-303`. Плюс на репозитории без
 * тегов `sourceOf(null)` бросал — шапка отказа печаталась, дальше стектрейс и
 * код 1 вместо 4.
 */
/**
 * Зовут ОБА шага, и `prepare`, и `commit`. Дорого это не стоит (один `git
 * log`), а между ними CHANGELOG правится руками: `commit` по CLAUDE.md
 * набирается человеком при восстановлении упавшего прогона, и правка,
 * сделанная в этом промежутке, проезжала бы мимо единственной проверки.
 */
function checkNamed(root, version) {
  const prevTag = latestTag(root)
  const r = unnamedShipped(root, version, prevTag)
  // ПОСЫЛКА сверяется здесь же: пока не доказано, что у каждого коммита
  // поставки есть адрес, «названы все» — утверждение о множестве, которое само
  // неполно (DS-352). Вырожденный диапазон стережёт САМА
  // `unaddressedShipped`, а не второй `if` здесь: два стража на один вопрос
  // переживают друг друга — мутация любого из них проходила молча, и это
  // делало сценарий «прошлого выпуска нет» недоказуемым.
  const a = unaddressedShipped(root, version, prevTag)
  if (a.codeless.length || a.loose.length || a.short.length || a.malformed.length) {
    refuseUnaddressed(version, a)
  }
  if (a.exempt.length) console.log(`коммиты входа сборки без адреса, освобождены: ${a.exempt.join('; ')}`)
  if (r.missing.length || r.short.length || r.malformed.length) refuseUnnamed(version, r)
  if (r.noPrev) {
    console.log('прошлого выпуска нет — сверять поставку не с чем, раздел не проверен')
    return
  }
  console.log(`поставляемых задач ${r.checked.length}, названы все`
    + (r.exempt.length ? `; без пункта с доводом: ${r.exempt.join(', ')}` : ''))
}

function refuseUnaddressed(version, a) {
  console.error('посылка сверки поставки не держится — коммиты, тронувшие вход сборки, без адреса:')
  for (const c of a.codeless) console.error(`  ${c.sha.slice(0, 9)} нет кода в скобках — ${c.subject}`)
  for (const c of a.loose) console.error(`  ${c.sha.slice(0, 9)} код вне скобок (${c.outside.join(', ')}) — ${c.subject}`)
  for (const c of a.short) console.error(`  ${c.sha.slice(0, 9)} освобождение есть, довод короче ${EXEMPT_REASON_MIN} знаков`)
  for (const text of a.malformed) console.error(`  освобождение не разобрано: ${text}`)
  console.error('')
  console.error('Такой коммит уезжает к потребителю, а сверка его не видит вовсе и печатает')
  console.error('«названы все» — обе дыры из DS-352: код в теме без скобок и src/вход сборки,')
  console.error('разнесённые по двум коммитам. Поставь код в скобки темы — или, если адреса')
  console.error('у правки честно нет, освободи КОММИТ строкой в самом разделе:')
  console.error('  <!-- без адреса: 0123456 — что ушло в поставку и почему задачи за этим нет -->')
  console.error('Бамп и тело не тронуты: поправь CHANGELOG.md и зови make release заново.')
  process.exit(EXIT_UNADDRESSED)
}

function refuseUnnamed(version, r) {
  console.error(`раздел ## [${version}] не называет задачи, чья правка ушла в поставку:`)
  for (const code of r.missing) console.error(`  ${code} — ${r.subjects.get(code) ?? ''}`)
  for (const code of r.short) console.error(`  ${code} — освобождение есть, довод короче ${EXEMPT_REASON_MIN} знаков`)
  for (const text of r.malformed) console.error(`  освобождение не разобрано: ${text}`)
  console.error('')
  console.error('Это «visibly changes without an error» без адреса — то, из-за чего заведена DS-350.')
  console.error('Либо впиши пункт с командой поиска, либо освободи задачу в самом разделе:')
  console.error('  <!-- без пункта: DS-0 — что именно ушло в dist и почему адрес не нужен -->')
  console.error('Бамп и тело не тронуты: поправь CHANGELOG.md и зови make release заново.')
  process.exit(EXIT_UNNAMED)
}

/**
 * Корень артефактов — ЯВНАЯ настройка. Не задан или задан мимо — отказ, а не
 * догадка: догаданный путь, не найдя ни одного файла, дал бы правдоподобный
 * отчёт «пункта нет ни у одной задачи», неотличимый от пустого выпуска.
 */
export function docsRoot(env = process.env) {
  const p = env[DOCS_ENV]
  if (!p) {
    throw new Error(`${DOCS_ENV} не задан: корень артефактов задач не угадывается.\n`
      + `Задай каталог, где лежит tasks/<CODE>/<CODE>.md, например:\n`
      + `  ${DOCS_ENV}=<каталог артефактов задач> make changelog-draft`)
  }
  if (!existsSync(resolve(p, 'tasks'))) {
    throw new Error(`${DOCS_ENV}=${p}: в нём нет каталога tasks/ — путь задан мимо`)
  }
  return p
}

/**
 * Разбор по `###`. Заголовок внутри ограды кода — не заголовок: в пунктах
 * бывают примеры markdown. Раздел кончается на следующем `###` или на заголовке
 * уровня 1–2; текст вне разделов возвращается отдельно, чтобы о нём сказать.
 */
export function parseSections(md) {
  const preamble = []
  const outside = []
  const sections = []
  let cur = null
  let seenHigher = false
  let fence = false
  for (const line of md.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    if (!fence && /^### /.test(line)) {
      cur = { title: line.slice(4).trim(), lines: [] }
      sections.push(cur)
      continue
    }
    if (!fence && /^#{1,2} /.test(line)) {
      cur = null
      seenHigher = true
      outside.push(line)
      continue
    }
    if (cur) cur.lines.push(line)
    else if (sections.length || seenHigher) outside.push(line)
    else preamble.push(line)
  }
  return { preamble, outside, sections }
}

function trimBlank(lines) {
  let a = 0, b = lines.length
  while (a < b && !lines[a].trim()) a++
  while (b > a && !lines[b - 1].trim()) b--
  return lines.slice(a, b)
}

/** Слияние по имени раздела; порядок разделов — порядок первого появления. */
export function mergeSections(parts) {
  const order = []
  const byTitle = new Map()
  for (const part of parts) {
    for (const s of part) {
      const body = trimBlank(s.lines)
      if (!byTitle.has(s.title)) { byTitle.set(s.title, []); order.push(s.title) }
      if (body.length) byTitle.get(s.title).push(body.join('\n'))
    }
  }
  return order.map((title) => ({ title, chunks: byTitle.get(title) }))
}

function sectionRange(lines, match) {
  const start = lines.findIndex(match)
  if (start === -1) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## \[/.test(lines[i])) { end = i; break }
  }
  return { start, end }
}

/**
 * `## [Unreleased]` ВБИРАЕТСЯ в раздел выпуска, и его заголовок снимается.
 * Агенты кладут туда пункты по ходу работы, и у них те же артефакты: пункт
 * задачи, чей код уже упомянут в разделе выпуска или в Unreleased, из
 * артефакта не берётся. Отсюда же идемпотентность: второй прогон видит все коды
 * в разделе и не переносит ничего.
 */
export function assembleDraft(root, docs) {
  const version = pkgVersion(root)
  if (tagExists(`v${version}`, root)) {
    throw new Error(`v${version} уже выпущен — раздела следующего выпуска нет. Сначала make bump`)
  }
  const path = resolve(root, 'CHANGELOG.md')
  let lines = readFileSync(path, 'utf8').split('\n')
  if (!sectionRange(lines, (l) => l.startsWith(`## [${version}]`))) {
    throw new Error(`нет раздела ## [${version}] в CHANGELOG.md. Сначала make bump`)
  }

  const bodyOf = (r) => lines.slice(r.start + 1, r.end)
  const unrel = sectionRange(lines, (l) => /^## \[Unreleased\]/i.test(l))
  const unrelBody = unrel ? bodyOf(unrel) : []
  if (unrel) lines = [...lines.slice(0, unrel.start), ...lines.slice(unrel.end)]
  const target = sectionRange(lines, (l) => l.startsWith(`## [${version}]`))
  const own = parseSections(bodyOf(target).join('\n'))
  const fromUnrel = parseSections(unrelBody.join('\n'))
  const present = [...bodyOf(target), ...unrelBody].join('\n')

  const report = { version, included: [], present: [], missing: [], noSections: [], outside: [], codeless: [] }
  const artefacts = []
  // Поставляемые отделяются ЗДЕСЬ, чтобы отчёт их различал (DS-350): на
  // сборке 4.2.6 строк «нет пункта: CODE» набралось больше сотни, и задача
  // верстака давала ровно тот же вывод, что задача с ломающей правкой API.
  // Сигнал был, различения не было — и 12 задач уехали без единой строки,
  // включая два Breaking. Дальше это держит отказ в `prepare`; здесь — чтобы
  // человек увидел их ДО того, как отказ случится.
  const shipped = new Set(shippedCodes(latestTag(root), root))
  for (const code of taskCodes(latestTag(root), root)) {
    if (new RegExp(`\\b${code}(?!\\d)`).test(present)) { report.present.push(code); continue }
    const file = resolve(docs, 'tasks', code, `${code}.md`)
    if (!existsSync(file)) { report.missing.push({ code, file, shipped: shipped.has(code) }); continue }
    const parsed = parseSections(readFileSync(file, 'utf8'))
    if (!parsed.sections.length) { report.noSections.push({ code, file, shipped: shipped.has(code) }); continue }
    // Код в пункте не обязателен, поэтому второй признак «уже перенесён» —
    // сам текст: сборка копирует дословно, и повторный прогон находит каждый
    // кусок артефакта в разделе как есть.
    const chunks = parsed.sections.map((s) => trimBlank(s.lines).join('\n')).filter(Boolean)
    if (chunks.length && chunks.every((c) => present.includes(c))) { report.present.push(code); continue }
    if ([...parsed.preamble, ...parsed.outside].some((l) => l.trim())) report.outside.push(code)
    // Пункт есть, кода в нём нет — а сверка в `prepare` ищет именно код, и
    // отказала бы на задаче, у которой пункт как раз написан (ревью
    // DS-350). Здесь это ловится раньше и дешевле: переписывать текст
    // пункта сборка не вправе (команды поиска в нём прогнаны на фикстуре), но
    // назвать задачу обязана.
    if (shipped.has(code) && !new RegExp(`\\b${code}(?!\\d)`).test(chunks.join('\n'))) {
      report.codeless.push(code)
    }
    artefacts.push(parsed.sections)
    report.included.push(code)
  }

  const preamble = [trimBlank(own.preamble).join('\n'), trimBlank(fromUnrel.preamble).join('\n')]
    .filter(Boolean)
  const merged = mergeSections([own.sections, fromUnrel.sections, ...artefacts])
  const out = [...preamble]
  for (const s of merged) out.push(`### ${s.title}\n\n${s.chunks.join('\n\n')}`.trimEnd())
  const body = ['', out.join('\n\n'), '', '']
  lines = [...lines.slice(0, target.start + 1), ...body, ...lines.slice(target.end)]
  writeFileSync(path, lines.join('\n'))
  return report
}

function printDraftReport(r) {
  console.log(`черновик раздела ## [${r.version}] собран в CHANGELOG.md — прочти и поправь до make release`)
  for (const c of r.included) console.log(`  перенесён: ${c}`)
  for (const c of r.present) console.log(`  уже в разделе: ${c} — из артефакта не взят`)
  // Поставляемые печатаются ОТДЕЛЬНЫМ списком, а не помечаются словом в общем:
  // в общем они тонут — их единицы на сотню строк, и глаз читает список целиком
  // как шум. Ниже они стоят последними и последними же остаются на экране.
  const loud = (e) => e.shipped
  for (const { code, file } of r.missing.filter((e) => !loud(e))) console.log(`  нет пункта: ${code} — файла ${file} нет`)
  for (const { code, file } of r.noSections.filter((e) => !loud(e))) console.log(`  нет пункта: ${code} — в ${file} ни одного раздела ###`)
  for (const c of r.outside) console.log(`  текст вне разделов ### не перенесён: ${c} — проверь, не пункт ли это`)
  const shipped = [...r.missing, ...r.noSections].filter(loud)
  if (shipped.length) {
    console.log('')
    console.log(`ПОСТАВЛЯЕТСЯ, а пункта нет (${shipped.length}) — правка у потребителя, адреса нет:`)
    for (const { code, file } of shipped) console.log(`  ${code} — ни пункта в разделе, ни артефакта ${file}`)
    console.log('Это остановит `make release`. Впиши пункт или освободи задачу строкой в разделе:')
    console.log('  <!-- без пункта: CODE — что именно ушло в dist и почему адрес не нужен -->')
  }
  if (r.codeless.length) {
    console.log('')
    console.log(`ПОСТАВЛЯЕТСЯ, пункт перенесён, но кода в нём нет (${r.codeless.length}) — это остановит release:`)
    for (const c of r.codeless) console.log(`  ${c} — допиши код в текст пункта`)
  }
}

const VERSION_FILES = [
  'package.json',
  // DS-318: бамп пишет корневую версию lock, значит lock обязан ехать в
  // релизный коммит (`commit`), не считаться посторонним (`dirtyNonVersion`) и
  // откатываться вместе с остальными (`rollback`) — все три читают этот список.
  LOCKFILE,
  'CHANGELOG.md',
  'docs/portal-migration/consumption.md',
  '.design-sync/conventions.md',
  'tokens/tokens.css',
]

function pkgVersion(root) {
  return JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version
}

/**
 * Незакоммиченные изменения вне версионных файлов — и трекнутые (`M path`), и
 * нетрекнутые (`?? path`). Посторонний untracked-файл — ровно та ситуация,
 * которую страж обязан ловить: `prepare()` не вправе тащить в релиз то, что
 * не входит в VERSION_FILES, независимо от того, знает ли git об этом файле.
 * Тестовый харнесс (`setupTempRepo` в `release-flow.helpers.ts`) кладёт свой
 * scratch-файл `fake-editor.mjs` в `.gitignore` заранее, поэтому он не
 * появляется в `git status --porcelain` вовсе и на эту проверку не влияет.
 */
function dirtyNonVersion(root) {
  // Не .trim() всей строки целиком: `git status --porcelain` кодирует статус
  // двумя ведущими символами на КАЖДОЙ строке (` M path`, `?? path`, …), и
  // trim() над многострочным блоком снимает первый из них только у первой
  // строки вывода — `line.slice(3)` после этого режет путь с потерей первого
  // символа (у `.design-sync/conventions.md` это ведущая точка), и сравнение
  // с VERSION_FILES молча не совпадает. Пусто/непусто проверяем длиной строк
  // после split, не тронутой строки целиком.
  const out = git(['status', '--porcelain'], root)
  return out.split('\n')
    .filter((line) => line.length > 0)
    .filter((line) => !VERSION_FILES.includes(line.slice(3)))
}

// `stageBuiltDist` снят с JIG-28: `dist/` больше не едет в релизный коммит
// (см. VERSION_FILES выше и `commit()` ниже) — CI собирает его сам, ПОСЛЕ
// тега, из пуша `v*`. Ни бампу, ни `commit` собирать `dist/` больше незачем,
// и гонять `npm run build` внутри `prepare` тестового харнесса — тоже.

function today() {
  return process.env.RELEASE_DATE || new Date().toISOString().slice(0, 10)
}

/**
 * Запуск редактора, и ответ РАЗЛИЧАЕТ два исхода, которые прежде сливались в
 * один (DS-146). `{ ran: false }` — `$EDITOR` не задан, редактор НЕ
 * запускался; `{ ran: true, status, signal }` — запускался и вот чем кончил.
 *
 * До этого функция при пустом `$EDITOR` возвращала `{ status: 1 }`, и `prepare`
 * честно печатал «редактор вышел с кодом 1». Сообщение врало дважды: редактор
 * не выходил, он не стартовал; и починка была не «разберись с редактором», а
 * другой порядок вызовов. Слить эти два случая в один код возврата — значит
 * назвать причиной то, чего не было.
 */
function openEditor(root) {
  const editor = process.env.EDITOR
  if (!editor) return { ran: false }
  const file = resolve(root, 'CHANGELOG.md')
  const r = spawnSync(editor, [file], { stdio: 'inherit', shell: true })
  return { ran: true, status: r.status, signal: r.signal }
}

/**
 * Отказ БЕЗ отката, когда тело писать нечем: `$EDITOR` не задан.
 *
 * Откат здесь вреден, а не просто лишний. Он выбрасывает уже посчитанный
 * уровень и уже вписанный scaffold — то есть ровно ту работу, которую следующий
 * прогон повторит один в один, — и оставляет человека с сообщением, из которого
 * не следует, что делать. Оставленный бамп, наоборот, ЕСТЬ состояние «после
 * `make bump`»: заполни раздел и зови `make release`, тот пойдёт по ветке
 * resume, потому что тело уже не пусто.
 *
 * Путь этот существовал и до задачи (`bumpFromArgs`), но узнать о нём можно
 * было только из докблока в исходнике: ни `make help`, ни CLAUDE.md, ни само
 * сообщение об ошибке его не называли. Инструкция поэтому печатается ЗДЕСЬ,
 * в точке отказа, — там, где её прочтут.
 *
 * ПРОВЕРКИ `!process.stdin.isTTY` тут НЕТ, и это решение, а не недосмотр.
 * Тело задачи называло её вторым условием, но она запретила бы единственный
 * способ, которым этот поток вообще проверяем: E2E-харнесс гейта `release-flow`
 * гоняет `prepare` через `execFileSync` со скриптовым `$EDITOR` и без всякого
 * TTY — и это законная, работающая конфигурация, а не подделка. Настоящий
 * экранный редактор без терминала и так падает громко (`Vim: Warning: Input is
 * not from a terminal`, ненулевой код), то есть попадает в ветку «запускался и
 * упал», где причина названа верно. Условие на TTY добавило бы к этому ноль и
 * отняло бы проверяемость.
 */
function refuseNoEditor(root, next) {
  console.error('релиз не начат: $EDITOR не задан, тело раздела CHANGELOG писать нечем.')
  console.error('Редактор при этом НЕ запускался и ни с каким кодом не выходил.')
  console.error('')
  console.error(`Версии уже подняты до ${next}, и это НЕ откачено намеренно — дерево сейчас`)
  console.error('ровно в том состоянии, которое даёт `make bump`. Дальше три шага:')
  console.error('')
  console.error('  1. make bump          # уже сделано этим прогоном, повторять не нужно')
  console.error(`  2. впиши тело раздела ## [${next}] в CHANGELOG.md руками`)
  console.error('  3. make release       # пойдёт по resume: тело не пусто, редактор не нужен')
  console.error('')
  console.error('Либо задай $EDITOR и позови `make release` заново.')
  void root
  process.exit(1)
}

/** Непустое содержимое под `## [Unreleased]` или '' (раздела нет / пуст). */
export function unreleasedBody(root) {
  const lines = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8').split('\n')
  const r = sectionRange(lines, (l) => /^## \[Unreleased\]/i.test(l))
  return r ? lines.slice(r.start + 1, r.end).join('\n').trim() : ''
}

/**
 * Код возврата СВОЙ, не 1: «нечем писать тело» и «тело уже написано, но не там»
 * лечатся разным — первое `$EDITOR`, второе `make changelog-draft`. Слитые в
 * один код, они снова стали бы одним отказом с неверной починкой.
 */
export const EXIT_UNRELEASED = 3

function refuseUnreleased(fresh) {
  console.error('релиз не начат: под ## [Unreleased] в CHANGELOG.md есть пункты.')
  console.error('Путь с $EDITOR их не вбирает: раздел выпуска стоит НАД ними, и они')
  console.error('ушли бы мимо релизного коммита.')
  // На resume бамп уже стоит и НЕ откатывается: откат выбросил бы посчитанный
  // уровень, как и в отказе без $EDITOR.
  console.error(fresh ? 'Дерево не тронуто, бампа не было.' : 'Бамп уже стоит и не откачен — шаг 1 не повторять.')
  console.error('')
  console.error(fresh ? '  1. make bump' : '  1. make bump          # уже сделано')
  console.error('  2. DS_DOCS_PATH=<корень с tasks/> make changelog-draft   # вбирает Unreleased в раздел')
  console.error('  3. прочти и поправь раздел, затем make release')
  process.exit(EXIT_UNRELEASED)
}

function rollback(root) {
  git(['checkout', '--', ...VERSION_FILES], root)
}

/**
 * Оркестрация подготовки релиза: fresh-старт по отсутствующему тегу `v<next>`
 * (детект уровня → бамп версионных файлов (`VERSION_FILES`) → scaffold CHANGELOG) либо resume (тег ещё не
 * существует, но бамп/scaffold уже на месте от прежнего прогона) — заполняет
 * тело CHANGELOG через `$EDITOR`, откатывая версионные файлы на любой
 * ненормальный исход (SIGINT, ненулевой статус редактора, пустое тело).
 * Откат применяется только на fresh-старте: на resume бамп не наш, трогать
 * его нельзя.
 *
 * ОДИН ИСХОД ИЗ ЭТОГО РЯДА ВЫНЕСЕН И ОТКАТА НЕ ВЛЕЧЁТ: `$EDITOR` не задан
 * (DS-146). Это не ненормальный исход редактора, это отсутствие редактора,
 * и лечится оно не тем же — см. `refuseNoEditor`.
 */
export function prepare(root = process.cwd()) {
  const dirty = dirtyNonVersion(root)
  if (dirty.length) {
    console.error('Рабочее дерево грязное (помимо версионных файлов):')
    console.error(dirty.join('\n'))
    process.exit(1)
  }
  const V = pkgVersion(root)
  const fresh = tagExists(`v${V}`, root)
  let next
  // И на свежем старте (до бампа), и на resume (`make bump` → `make release`
  // мимо черновика): раздел выпуска стоит НАД Unreleased, редактор откроется на
  // пустом, и пункты останутся под старым заголовком — мимо релизного коммита,
  // молча (DS-257). Ничего не откатывается.
  if (unreleasedBody(root)) refuseUnreleased(fresh)
  if (fresh) {
    const prev = latestTag(root)
    let level
    try { level = detectBumpLevel(prev, root) }
    catch (e) { console.error(e.message); process.exit(1) }
    next = computeNext(V, level)
    console.log(`level=${level} → ${next}`)
    bumpFiles(root, next)
    scaffoldChangelog(root, next, today())
  } else {
    next = V
    const cl = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8')
    if (!cl.includes(`## [${next}]`)) {
      console.error(`нет раздела ## [${next}] — начни заново на чистом дереве`)
      process.exit(1)
    }
  }
  if (!changelogBody(root, next)) {
    // Порядок важен: «нечем писать» проверяется ДО того, как заводится обработчик
    // SIGINT и делается откат. Это не ошибка редактора, и лечится она не тем же.
    if (!process.env.EDITOR) refuseNoEditor(root, next)
    const onSigint = fresh ? () => { rollback(root); process.exit(1) } : null
    if (onSigint) process.on('SIGINT', onSigint)
    const r = openEditor(root)
    if (onSigint) process.removeListener('SIGINT', onSigint)
    const reason = r.signal ? `редактор прерван сигналом ${r.signal}`
      : r.status !== 0 ? `редактор вышел с кодом ${r.status}`
      : 'пустое тело CHANGELOG'
    if (r.status !== 0 || r.signal || !changelogBody(root, next)) {
      if (fresh) rollback(root)
      console.error(`релиз отменён: ${reason}`)
      process.exit(1)
    }
  }
  // «Тег уже существует» ПЕРЕД сверкой раздела: отказ точнее, и человек,
  // начавший выпуск на занятой версии, не должен читать диагноз про CHANGELOG.
  if (tagExists(`v${next}`, root)) {
    console.error(`тег v${next} уже существует`)
    process.exit(1)
  }
  // Сверка «поставлено — названо» стоит ЗДЕСЬ, до `check-full`, а не в
  // `commit`: отказ после проверок стоил бы человеку целого прогона
  // `check-full` за правку двух строк в CHANGELOG. Отката нет намеренно —
  // тело уже написано, и выбрасывать его ради перезапуска незачем.
  checkNamed(root, next)
  console.log(`готово к проверкам: ${next}`)
}

/**
 * Оркестрация фиксации релиза (JIG-28, упрощено): `git add` версионные файлы
 * → коммит с телом раздела CHANGELOG в сообщении → аннотированный тег
 * `v<next>` НА НЕГО. `dist/` в этот коммит не входит и в git не идёт вовсе —
 * его собирает и пакует GitHub Actions на push тега (`.github/workflows/release.yml`),
 * а не `release.mjs`. Сообщение коммита пишется во временный файл и передаётся
 * `-F <путь>` — НЕ `-m <строка>`: тело CHANGELOG может занимать несколько
 * строк и содержать символы, небезопасные для аргумента командной строки.
 */
export function commit(root = process.cwd()) {
  const next = pkgVersion(root)
  if (tagExists(`v${next}`, root)) {
    console.error(`тег v${next} уже существует`)
    process.exit(1)
  }
  checkNamed(root, next)
  const body = changelogBody(root, next)
  if (!body) {
    console.error(`раздел ## [${next}] пуст`)
    process.exit(1)
  }
  git(['add', ...VERSION_FILES], root)

  const msgFile = resolve(tmpdir(), `release-msg-${next}-${process.pid}.txt`)
  writeFileSync(msgFile, `chore(release): ${next}\n\n${body}\n`)
  try {
    git(['commit', '-F', msgFile], root)
  } finally {
    try { unlinkSync(msgFile) } catch { /* уже нет */ }
  }
  const source = git(['rev-parse', 'HEAD'], root).trim()
  git(['tag', '-a', `v${next}`, '-m', `jig ${next}`], root)
  console.log(`RELEASE ${next} — тег v${next} на ${source.slice(0, 8)}.`)
  console.log('Отправить: make push')
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  const cmd = process.argv[2]
  if (cmd === 'prepare') prepare()
  else if (cmd === 'commit') commit()
  else if (cmd === 'bump') bumpFromArgs(process.cwd(), process.argv[3])
  else if (cmd === 'draft') {
    try { printDraftReport(assembleDraft(process.cwd(), docsRoot())) }
    catch (e) { console.error(e.message); process.exit(1) }
  }
  else {
    console.error(`неизвестная команда: ${cmd ?? '(пусто)'} — ожидается: prepare|commit|bump|draft`)
    process.exit(1)
  }
}

/**
 * Бамп + scaffold CHANGELOG без коммита и без `$EDITOR`. То, что `prepare`
 * делает до открытия редактора, — вынесено сюда, чтобы агент мог готовить
 * релиз в неинтерактивной среде (где у `prepare` редактор выходит с кодом 1
 * и откатывает бамп). Дальше агент заполняет тело раздела CHANGELOG сам, и
 * `prepare` на resume пропускает редактор (тело не пусто).
 *
 * `arg`:
 * - пусто — уровень по коммитам с последнего тега (как `prepare`), только
 *   когда тег есть хоть один;
 * - `'major'|'minor'|'patch'` — явный уровень (перекрывает auto, даже если
 *   коммиты говорят иное), только когда тег есть хоть один;
 * - `'X.Y.Z'` (`make bump version=X.Y.Z`) — явная версия ПЕРВОГО выпуска,
 *   разрешена ТОЛЬКО когда тегов `v*` нет вовсе (JIG-3). Форма аргумента та
 *   же, что раньше служила «прыжком версии в обход каталога» при живых
 *   тегах, — этот старый режим снят: `version=` больше не средство перепрыгнуть
 *   счёт по каталогу на обычном выпуске, а единственный способ задать версию,
 *   когда считать её не от чего (см. докблок `detectBumpLevel`).
 *
 * Идемпотентна на scaffold (`scaffoldChangelog` не дублирует раздел). На
 * статусе «уже забампено, тега ещё нет» (при живых тегах) — не трогает
 * версии: повторный бамп поверх был бы следующим шагом, а не повтором.
 */
export function bumpFromArgs(root = process.cwd(), arg) {
  const dirty = dirtyNonVersion(root)
  if (dirty.length) {
    console.error('Рабочее дерево грязное (помимо версионных файлов):')
    console.error(dirty.join('\n'))
    process.exit(1)
  }
  const V = pkgVersion(root)
  const prev = latestTag(root)
  const isVersionArg = !!arg && /^\d+\.\d+\.\d+$/.test(arg)

  if (!prev) {
    // Тегов v* нет вовсе — первый выпуск (JIG-3). Сравнивать каталог не с
    // чем, и «minor, потому что всё новое» решила бы версию первого выпуска
    // за владельца молча (см. докблок `detectBumpLevel`) — версия поэтому
    // задаётся явно, и `level=`/auto здесь смысла не имеют вовсе.
    if (!isVersionArg) {
      console.error('тегов v* нет вовсе — версия первого выпуска не вычисляется.')
      console.error('Задай её явно: `make bump version=X.Y.Z`, например `make bump version=1.0.0`.')
      process.exit(1)
    }
    const next = arg
    bumpFiles(root, next)
    scaffoldChangelog(root, next, today())
    console.log(
      `bump → ${next} (первый выпуск: тегов не было, версия задана явно; `
      + 'scaffold CHANGELOG; заполни тело и зови make release)',
    )
    return
  }

  // Теги есть — `version=` тут не про первый выпуск, а про прыжок версии в
  // обход счёта по каталогу, и это ровно тот режим, что снят этой задачей.
  if (isVersionArg) {
    console.error(`version=${arg}: разрешена только когда тегов v* нет вовсе — тег ${prev} уже существует.`)
    console.error('Выбери уровень: `make bump level=major|minor|patch`, либо не задавай ничего — посчитает каталог.')
    process.exit(1)
  }

  if (!tagExists(`v${V}`, root)) {
    console.log(`уже на ${V} без тега v${V} — бампить нечего, заполни CHANGELOG и зови release`)
    return
  }
  let next
  if (arg) {
    next = computeNext(V, arg)
  } else {
    // ТЕГ, а не диапазон: `detectBumpLevel` сама строит `${prevTag}..HEAD` и
    // сама сравнивает каталоги на двух ревизиях. Здесь стоял готовый диапазон,
    // оставшийся от прежней сигнатуры, и склеивался в `v3.0.2..HEAD..HEAD` —
    // `git log` падал, то есть `make bump` не работал вовсе. Гейты этого не
    // видели: все они зовут `detectBumpLevel` напрямую, мимо `bumpFromArgs`.
    const level = detectBumpLevel(prev, root)
    next = computeNext(V, level)
  }
  bumpFiles(root, next)
  scaffoldChangelog(root, next, today())
  console.log(`bump → ${next} (scaffold CHANGELOG; заполни тело и зови make release)`)
}
