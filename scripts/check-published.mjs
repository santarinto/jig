#!/usr/bin/env node
// Is every released tag actually reachable at the URL the documentation gives
// the consumer, and does the asset there carry what was actually built?
//
// С JIG-28 канал один: GitHub Actions на push тега `v*` собирает `dist/`,
// пакует `npm pack` и прикладывает `santarinto-jig-X.Y.Z.tgz` к GitHub Release
// того же тега. С JIG-3 это единственная задокументированная точка входа —
// прежний манёвр с `origin`/публичным зеркалом снят вместе с гитфликом:
// remote теперь один, `origin`, и он же публичный `santarinto/jig`.
//
// Два разных способа доехать «мимо»:
//  1. Тег есть локально, но origin его не получил (`make push` не позвали,
//     упал, или тег переставлен уже ПОСЛЕ пуша) — офлайн-половина, сверяет
//     `git ls-remote` с локальными тегами.
//  2. Тег доехал, но CI ещё не собрал ассет, собрал не то, или собрал ИЗ
//     ДРУГОГО коммита — сетевая половина, единственная, что трогает GitHub
//     HTTP: HEAD на адрес ассета плюс побайтовое-по-содержимому сравнение с
//     тем, что `npm pack` собирает здесь из ТОГО ЖЕ тега.
//
// Usage: node scripts/check-published.mjs
import { readFileSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

export const DOC = 'docs/portal-migration/consumption.md'
export const REMOTE = 'origin'

/**
 * Установочный URL из документации — из строки `npm install`, а не из прозы:
 * документ может упоминать форму где угодно ещё, но команда — единственное,
 * что потребитель копирует, и единственное, что стоит проверять как канон.
 */
export function installUrl(text) {
  for (const line of text.split('\n')) {
    if (!line.includes('npm install')) continue
    const m = line.match(/https:\/\/[^\s'"`]+\.tgz/)
    if (m) return m[0]
  }
  throw new Error(`${DOC}: не нашёл установочный URL в строке npm install — документ перестроили?`)
}

/**
 * Форма адреса ассета GitHub Release: репозиторий, тег и версия в имени
 * файла обязаны совпадать. Расхождение — не педантизм: если бампнули только
 * имя файла или только тег, CI соберёт ассет под именем, которого документ не
 * назвал (или назовёт версию, которой в этом релизе не было), и установка
 * упадёт 404 далеко от того места, где цифру забыли поправить.
 */
const ASSET_URL_RE = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/download\/v(\d+\.\d+\.\d+)\/([a-z0-9-]+)-(\d+\.\d+\.\d+)\.tgz$/

export function parseAssetUrl(url) {
  const m = url.match(ASSET_URL_RE)
  if (!m) {
    throw new Error(
      `${url}: не форма GitHub Release ассета — ожидается `
      + 'https://github.com/<owner>/<repo>/releases/download/vX.Y.Z/<pkg>-X.Y.Z.tgz',
    )
  }
  const [, repo, tagVersion, pkg, fileVersion] = m
  if (tagVersion !== fileVersion) {
    throw new Error(
      `${url}: тег версии v${tagVersion}, а в имени файла ${fileVersion} — CI собирает ассет по`
      + ' тегу, и на расхождении отдаст 404 или не тот файл.',
    )
  }
  return { repo, version: tagVersion, pkg, tag: `v${tagVersion}` }
}

/** Локальные релизные теги → коммит, на который они указывают. */
export function localTags(root) {
  const out = execFileSync('git', ['tag', '--list', 'v*'], { cwd: root, encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((tag) => ({
    tag,
    sha: execFileSync('git', ['rev-parse', `${tag}^{commit}`], { cwd: root, encoding: 'utf8' }).trim(),
  }))
}

/**
 * Разбор `git ls-remote --tags`. Аннотированный тег приезжает двумя строками:
 * сам объект и `^{}` — коммит под ним. Сравнивать надо с коммитом, иначе
 * аннотированный тег никогда не совпадёт с локальным `rev-parse ^{commit}`.
 */
export function remoteTagCommits(lsRemoteText) {
  const raw = new Map()
  const peeled = new Map()
  for (const line of lsRemoteText.split('\n')) {
    const m = line.match(/^([0-9a-f]{40})\s+refs\/tags\/(.+?)(\^\{\})?$/)
    if (!m) continue
    ;(m[3] ? peeled : raw).set(m[2], m[1])
  }
  const commits = new Map()
  for (const [tag, sha] of raw) commits.set(tag, peeled.get(tag) ?? sha)
  return commits
}

/**
 * Что не так с публикацией: тега нет вовсе, или он там указывает на другой
 * коммит. Второе — не педантизм: тег можно переставить, и потребитель тогда
 * ставит не то, что лежит здесь под тем же именем.
 */
export function diffTags(local, remoteCommits) {
  const missing = []
  const diverged = []
  for (const { tag, sha } of local) {
    const there = remoteCommits.get(tag)
    if (!there) missing.push(tag)
    else if (there !== sha) diverged.push({ tag, local: sha, remote: there })
  }
  return { missing, diverged }
}

/** Офлайн-половина: локальные теги против `origin`. Сети не трогает. */
export function checkTagsReached(root = process.cwd()) {
  const tags = localTags(root)
  if (tags.length === 0) throw new Error('нет локальных тегов v* — публиковать нечего')

  let ls
  try {
    ls = execFileSync('git', ['ls-remote', '--tags', REMOTE], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (e) {
    throw new Error(
      `не достучался до ${REMOTE}: ${String(e.stderr ?? e.message).trim()}\n`
      + 'Публикацию проверить нельзя — это не значит, что она есть.',
    )
  }
  const { missing, diverged } = diffTags(tags, remoteTagCommits(ls))
  const problems = []
  if (missing.length) problems.push(`${REMOTE}: нет тегов ${missing.join(', ')}`)
  for (const d of diverged) {
    problems.push(`${REMOTE}: ${d.tag} указывает на ${d.remote.slice(0, 8)}, здесь ${d.local.slice(0, 8)}`)
  }
  if (problems.length) {
    throw new Error(`Релизные теги не доехали до ${REMOTE}:\n  ${problems.join('\n  ')}\nДогнать: make push`)
  }
  return { remote: REMOTE, tags: tags.map((t) => t.tag) }
}

// ---------------------------------------------------------------------------
// Сетевая половина: доехал ли АССЕТ, и то ли в нём содержимое.
// Сравнение — по списку файлов и ИХ СОДЕРЖИМОМУ, а не по байтам архива:
// `tar` пишет mtime в заголовок каждого файла, и два тарбола из одного дерева,
// собранные в разное время, побайтово не совпадут никогда — проверено ниже
// мутацией `compareTgzContents.test.ts`, отдельно от гейта, потому что
// живого `tar` он касается и файлов на диске, а не только парсеров.

/** Список файлов тарбола и их содержимое — без сортировки, её делает hashEntries. */
export function readTgzEntries(tgzPath) {
  const dir = mkdtempSync(join(tmpdir(), 'jig-tgz-'))
  try {
    execFileSync('tar', ['-xzf', tgzPath, '-C', dir])
    const root = join(dir, 'package') // `npm pack` всегда кладёт всё под package/
    const entries = []
    const walk = (d) => {
      for (const name of readdirSync(d)) {
        const p = join(d, name)
        if (statSync(p).isDirectory()) walk(p)
        else entries.push({ path: relative(root, p).split('\\').join('/'), content: readFileSync(p) })
      }
    }
    walk(root)
    return entries
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** sha512 по пути и содержимому каждого файла, отсортированных по пути. Без mtime — его тут и нет. */
export function hashEntries(entries) {
  const h = createHash('sha512')
  for (const { path, content } of [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    h.update(path)
    h.update('\u0000')
    h.update(content)
  }
  return h.digest('hex')
}

export function compareTgzContents(a, b) {
  return hashEntries(readTgzEntries(a)) === hashEntries(readTgzEntries(b))
}

/** Тег в своём `git worktree` (детач, без правки основного дерева) — тем же
 *  `npm run tarball`, каким его соберёт CI. Возвращает путь собранного тарбола и
 *  его снос — снос вызывает ВЫЗЫВАЮЩИЙ, когда сравнение содержимого закончено. */
function packTagLocally(root, tag) {
  const wt = mkdtempSync(join(tmpdir(), 'jig-pack-'))
  rmSync(wt, { recursive: true, force: true }) // worktree add требует несуществующий путь
  execFileSync('git', ['worktree', 'add', '-q', '--detach', wt, tag], { cwd: root })
  try {
    execFileSync('npm', ['ci', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: wt, stdio: 'ignore' })
    execFileSync('npm', ['run', 'tarball'], { cwd: wt, stdio: ['ignore', 'ignore', 'inherit'] })
    const version = JSON.parse(readFileSync(join(wt, 'package.json'), 'utf8')).version
    const tgz = join(wt, `santarinto-jig-${version}.tgz`)
    const dest = join(mkdtempSync(join(tmpdir(), 'jig-local-tgz-')), `santarinto-jig-${version}.tgz`)
    execFileSync('cp', [tgz, dest])
    return { path: dest, cleanup: () => rmSync(dest, { force: true }) }
  } finally {
    execFileSync('git', ['worktree', 'remove', '--force', wt], { cwd: root, stdio: 'ignore' })
  }
}

/** Скачивает ассет во временный файл. Единственное место сетевого fetch.
 *  Путь и снос возвращаются вместе — снос вызывает вызывающий после сравнения. */
async function downloadAsset(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status} — ассета там нет`)
  const buf = Buffer.from(await res.arrayBuffer())
  const dest = join(mkdtempSync(join(tmpdir(), 'jig-remote-tgz-')), 'asset.tgz')
  const { writeFileSync } = await import('node:fs')
  writeFileSync(dest, buf)
  return { path: dest, cleanup: () => rmSync(dest, { force: true }) }
}

/**
 * Сетевая проверка: ассет из документации лежит на месте и несёт то же
 * содержимое, что и локальный `npm pack` того же тега. Единственная функция
 * этого файла, которая ходит в сеть — `make published` её и зовёт, а
 * `check`/`check-full` её не видят вовсе.
 */
export async function checkAssetReached(root = process.cwd()) {
  const url = installUrl(readFileSync(resolve(root, DOC), 'utf8'))
  const { tag } = parseAssetUrl(url)
  if (!localTags(root).some((t) => t.tag === tag)) {
    throw new Error(`${DOC} велит ставить ${tag}, но локального тега с таким именем нет`)
  }
  const remote = await downloadAsset(url)
  const local = packTagLocally(root, tag)
  const same = compareTgzContents(remote.path, local.path)
  remote.cleanup()
  local.cleanup()
  if (!same) {
    throw new Error(
      `${url}: содержимое ассета (список файлов + их содержимое) не совпадает с тем, что тег ${tag}`
      + ' пакует здесь `npm run tarball` — CI собрал релиз из другого дерева, либо ассет устарел.',
    )
  }
  return { url, tag }
}

export async function checkPublished(root = process.cwd()) {
  const tags = checkTagsReached(root)
  const asset = await checkAssetReached(root)
  return { ...tags, asset: asset.url }
}

/**
 * Вход `make release` (JIG-3). Перед выпуском проверяется, что ПРОШЛЫЙ выпуск
 * дошёл до потребителя. На первом выпуске прошлого нет — тегов `v*` ноль, и это
 * не ошибка, а режим: проверять нечего. Строгая форма без тегов остаётся за
 * `make published` (конец `make push`): там ноль тегов значит «публиковать
 * нечего», и это отказ.
 *
 * `check` передаётся параметром, чтобы случай «теги есть — проверка идёт»
 * проверялся без сети.
 */
export async function checkBeforeRelease(root = process.cwd(), check = checkPublished) {
  if (localTags(root).length === 0) return { first: true }
  return { first: false, ...(await check(root)) }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  try {
    if (process.argv[2] === '--before-release') {
      const r = await checkBeforeRelease(process.cwd())
      console.log(r.first
        ? 'PUBLISHED OK — первый выпуск: тегов v* нет, прошлого выпуска проверять нечего'
        : `PUBLISHED OK — ${r.tags.length} тег(ов) на ${r.remote}, ассет совпал → ${r.asset}`)
    } else if (process.argv[2] === '--tags-only') {
      const { remote, tags } = checkTagsReached(process.cwd())
      console.log(`PUBLISHED TAGS OK — ${tags.length} тег(ов) на ${remote}`)
    } else {
      const { remote, tags, asset } = await checkPublished(process.cwd())
      console.log(`PUBLISHED OK — ${tags.length} тег(ов) на ${remote}, ассет совпал → ${asset}`)
    }
  } catch (e) {
    console.error(`PUBLISH CHECK FAILED\n${e.message}`)
    process.exit(1)
  }
}
