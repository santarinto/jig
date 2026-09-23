import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Both files below are consumed as instructions, not as prose: the portal copies
 * the tarball name out of `consumption.md` verbatim, and the design agent reads
 * `conventions.md` as the canonical version of the system.
 *
 * They have now gone stale twice in a row — 1.4.0 while 1.5.0 shipped, then 1.5.0
 * while 1.5.1 shipped, each time because the release bumped `package.json` alone.
 * Following the doc verbatim ends in `npm install` failing on a tarball that was
 * never built, so the version in these files is a fact under test, not a note.
 *
 * Only the sites that are instructions are checked — a stray React version in the
 * same file is nothing to compare against.
 */
const ROOT = resolve(__dirname, '../..')
const version = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).version as string

/** Where this package's own version is stated. */
const SITES = [
  /santarinto-jig-(\d+\.\d+\.\d+)\.tgz/g,
  /версия пакета — \*\*(\d+\.\d+\.\d+)\*\*/g,
  /\*\*Version (\d+\.\d+\.\d+)\*\*/g,
  // `--ds-version` (DS-215) — тоже инструкция, а не проза: по нему со
  // страницы потребителя отвечают на «а он на свежем?». Разъехавшись с
  // `package.json`, он не молчит, а ВРЁТ, и это хуже.
  /--ds-version:\s*"(\d+\.\d+\.\d+)"/g,
]

const TRACKED = [
  'docs/portal-migration/consumption.md',
  '.design-sync/conventions.md',
  'tokens/tokens.css',
]

describe('docs that carry a version number', () => {
  it.each(TRACKED)('%s names the version this package actually is', (rel) => {
    const text = readFileSync(resolve(ROOT, rel), 'utf8')
    const found = SITES.flatMap((re) => [...text.matchAll(re)].map((m) => m[1]!))
    // Guard, который ничего не нашёл и потому «прошёл», — худший вид guard'а.
    expect(found.length, `${rel}: no version site matched — has the doc been restructured?`)
      .toBeGreaterThan(0)
    const stale = [...new Set(found.filter((v) => v !== version))]
    expect(stale, `${rel} still says ${stale.join(', ')} but the package is ${version}`).toEqual([])
  })

  // Пятое место — заголовок CHANGELOG.md (DS-302). Устроено иначе, чем
  // TRACKED: версий в файле десятки, и истинна только НОВЕЙШАЯ, поэтому
  // сверяется первый версионный заголовок, а не все. `## [Unreleased]` не версия
  // и пропускается; `scaffoldChangelog` ставит новый раздел НАД ним, так что
  // после `make bump` первым идёт уже новая версия и гейт зелёный посреди релиза.
  // `release.mjs` сам держит только наличие раздела и только внутри `prepare`
  // (resume ищет `includes('## [X.Y.Z]')`) — ручная правка заголовка вне
  // релиза до этой проверки не краснела ничем.
  it('CHANGELOG.md: the newest version heading is the version this package actually is', () => {
    const text = readFileSync(resolve(ROOT, 'CHANGELOG.md'), 'utf8')
    const newest = text.match(/^## \[(\d+\.\d+\.\d+)\]/m)?.[1]
    expect(newest, 'CHANGELOG.md: no `## [X.Y.Z]` heading — has the file been restructured?')
      .toBeDefined()
    expect(newest, `CHANGELOG.md: newest heading says ${newest} but the package is ${version}`)
      .toBe(version)
  })

  // Шестое место — корневая запись `package-lock.json` (DS-318). Бамп её
  // не знал, и lock отстал на четырнадцать выпусков: 3.0.6 при 4.2.5, пока чужой
  // коммит (2202cc6) не пересобрал его попутно. `npm ci` на одну корневую версию
  // НЕ падает — замер в задаче, npm 11.13.0, exit 0, — так что предмет здесь не
  // установка, а lock, который врёт и всплывает шумом в посторонних диффах.
  // Корней ДВА, и сверяются оба: npm пишет `version` и в шапку, и в
  // `packages[""]`, а разбор, правящий одно, оставил бы второе врать.
  it('package-lock.json: the root record names the version this package actually is', () => {
    const lock = JSON.parse(readFileSync(resolve(ROOT, 'package-lock.json'), 'utf8'))
    const root = lock.packages?.['']
    expect(root, 'package-lock.json: no packages[""] root record — lockfileVersion changed?').toBeDefined()
    expect({ top: lock.version, root: root.version },
      `package-lock.json says ${lock.version} / packages[""] ${root.version} but the package is ${version}`)
      .toEqual({ top: version, root: version })
  })
})
