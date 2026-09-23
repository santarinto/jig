#!/usr/bin/env node
/**
 * Печатает тело раздела `## [version]` из CHANGELOG.md в stdout — для
 * `gh release create --notes-file` в `.github/workflows/release.yml` (JIG-28).
 *
 * Переиспользует `changelogBody` из `release.mjs`, а не парсит CHANGELOG
 * заново: два разбора одного формата разошлись бы молча, и это ровно тот
 * класс дефекта, которого пункт CHANGELOG «Команда поиска» требует избегать
 * (см. CLAUDE.md, Release).
 *
 * Версия — аргументом (workflow передаёт `${GITHUB_REF_NAME#v}`), а не читается
 * из package.json: на релизе тег и рабочее дерево совпадают по построению
 * (workflow чекаутит именно тег), но явный аргумент не зависит от этого
 * совпадения и печатает точную причину, если разошлось.
 */
import { changelogBody } from './release.mjs'

const version = process.argv[2]
if (!version) {
  console.error('usage: node scripts/print-changelog-section.mjs <version>')
  process.exit(1)
}
const body = changelogBody(process.cwd(), version)
if (!body) {
  console.error(`раздел ## [${version}] в CHANGELOG.md пуст или не найден`)
  process.exit(1)
}
process.stdout.write(body + '\n')
