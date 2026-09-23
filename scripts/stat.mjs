#!/usr/bin/env node
/**
 * Project size as one JSON object.
 *
 * The file set is what git tracks — that is the project, as opposed to what
 * happens to sit on disk: `node_modules`, `dist`, `ds-bundle` and the sync
 * scratch are all build output or dependencies and would swamp the numbers.
 *
 * Binaries are left out of `files`, `lines` and `textBytes` — a `.woff2` has
 * bytes but no lines, and counting it as a file next to a line count invites
 * arithmetic that does not hold. Their weight is not lost: `totalBytes` covers
 * everything git tracks, so the two figures answer two different questions —
 * how much there is to read, and how much the project weighs.
 *
 * Usage: npm run stat   |   make stat
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync, existsSync } from 'node:fs'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

// В поверхностном клоне история обрезана: считать по ней нечего, и сообщать
// нечего тоже. Ключи просто отсутствуют — как `version`, когда её нет.
const shallow = git('rev-parse', '--is-shallow-repository') === 'true'
const commits = shallow ? undefined : Number(git('rev-list', '--count', 'HEAD'))
// git tag печатает пустую строку при нуле тегов — отсюда filter, иначе выйдет 1.
const tags = shallow ? undefined : git('tag').split('\n').filter(Boolean).length
const tracked = git('ls-files').split('\n').filter(Boolean)

// Версии может не быть: этот же скрипт полезен и в репозитории, который не пакет.
const version = existsSync('package.json')
  ? JSON.parse(readFileSync('package.json', 'utf8')).version
  : undefined

let files = 0
let lines = 0
let textBytes = 0
let totalBytes = 0

for (const file of tracked) {
  let buf
  try {
    buf = readFileSync(file)
    totalBytes += statSync(file).size
  } catch {
    continue // файл в индексе, но не на диске — не наша забота
  }
  // NUL в первых килобайтах — признак двоичного файла; у шрифта строк не бывает.
  if (buf.subarray(0, 8000).includes(0)) continue
  files++
  textBytes += buf.length
  const text = buf.toString('utf8')
  lines += text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}

console.log(JSON.stringify({
  ...(version ? { version } : {}),
  ...(commits !== undefined ? { commits } : {}),
  ...(tags !== undefined ? { tags } : {}),
  files, lines, textBytes, totalBytes,
}, null, 2))
