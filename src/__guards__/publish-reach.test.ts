import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  installUrl, parseAssetUrl, remoteTagCommits, diffTags, checkTagsReached, checkBeforeRelease,
  readTgzEntries, hashEntries, compareTgzContents,
} from '../../scripts/check-published.mjs'
import { tempRoot } from './tmp-sandbox'

/**
 * Релиз доехал до потребителя — это утверждение про МЕСТО и про
 * СОДЕРЖИМОЕ, а не про то, что `git push` вернул ноль.
 *
 * До JIG-3 «место» было отдельным remote, который мог отстать от `origin`
 * (DS-85: гитфлик 125 коммитов позади, два выпуска не публиковались вовсе, а
 * все гейты были зелёные). С JIG-3 remote один — `origin`, он же публичный
 * `santarinto/jig`, и старый разрез «указывает ли документ туда же, куда
 * настроен remote» больше не нужен. Новый источник того же класса ошибки:
 * GitHub Actions собирает ассет релиза ПОСЛЕ пуша тега, отдельным прогоном —
 * тег может доехать, а ассет не собраться, собраться не из того коммита, или
 * называться не так, как думает `consumption.md`.
 *
 * Отсюда разрез этого файла: чистые разборщики URL и сравнение содержимого
 * тарбола — здесь, офлайн; E2E на настоящем bare-репозитории — тоже здесь,
 * это по-прежнему не сеть; а HTTP до `github.com` — только в
 * `checkAssetReached`, которую зовёт `make published`, не `check`/`check-full`.
 */

describe('parseAssetUrl — форма адреса GitHub Release ассета', () => {
  it('разбирает репозиторий, тег и версию', () => {
    const r = parseAssetUrl('https://github.com/santarinto/jig/releases/download/v1.2.3/santarinto-jig-1.2.3.tgz')
    expect(r).toEqual({ repo: 'santarinto/jig', version: '1.2.3', pkg: 'santarinto-jig', tag: 'v1.2.3' })
  })

  it('версия тега и версия в имени файла обязаны совпадать', () => {
    expect(() => parseAssetUrl(
      'https://github.com/santarinto/jig/releases/download/v1.2.3/santarinto-jig-1.2.4.tgz',
    )).toThrow(/тег версии v1\.2\.3.*1\.2\.4/)
  })

  it('падает на чужой форме адреса (не GitHub Release ассет)', () => {
    expect(() => parseAssetUrl('https://github.com/santarinto/jig/archive/refs/tags/v1.2.3.tar.gz'))
      .toThrow(/не форма GitHub Release ассета/)
  })
})

describe('installUrl — берётся из команды, а не из прозы', () => {
  it('игнорирует прозу и берёт строку npm install', () => {
    const doc = [
      'Ассет лежит на GitHub Release, адрес вида https://github.com/o/r/releases/download/vX.Y.Z/p-X.Y.Z.tgz.',
      "npm install --save '@santarinto/jig@https://github.com/santarinto/jig/releases/download/v1.0.0/santarinto-jig-1.0.0.tgz'",
    ].join('\n')
    expect(installUrl(doc)).toBe('https://github.com/santarinto/jig/releases/download/v1.0.0/santarinto-jig-1.0.0.tgz')
  })

  // Guard, который ничего не нашёл и потому «прошёл», — худший вид guard'а.
  it('падает, если команды установки в документе нет', () => {
    expect(() => installUrl('просто текст про santarinto/jig')).toThrow(/не нашёл установочный URL/)
  })
})

describe('remoteTagCommits', () => {
  // Аннотированный тег приезжает двумя строками; сравнение с объектом тега, а не
  // с коммитом под ним, не совпало бы НИКОГДА — гейт бы краснел всегда.
  it('аннотированный тег читается как коммит под ним, а не как объект тега', () => {
    const ls = [
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\trefs/tags/v1.0.0',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\trefs/tags/v1.0.0^{}',
      'cccccccccccccccccccccccccccccccccccccccc\trefs/tags/v0.9.0',
    ].join('\n')
    const m = remoteTagCommits(ls)
    expect(m.get('v1.0.0')).toBe('b'.repeat(40))
    expect(m.get('v0.9.0')).toBe('c'.repeat(40))
  })
})

describe('diffTags', () => {
  const local = [{ tag: 'v1.0.0', sha: 'a'.repeat(40) }, { tag: 'v1.1.0', sha: 'b'.repeat(40) }]

  it('различает «тега нет» и «тег указывает на другое»', () => {
    const remote = new Map([['v1.0.0', 'z'.repeat(40)]])
    const { missing, diverged } = diffTags(local, remote)
    expect(missing).toEqual(['v1.1.0'])
    expect(diverged.map((d) => d.tag)).toEqual(['v1.0.0'])
  })
})

// ---------------------------------------------------------------------------
// Содержимое ассета: по списку файлов и ИХ содержимому, не по байтам архива.

function makeTgz(dir: string, files: Record<string, string>): string {
  const src = tempRoot('pkgsrc-')
  const pkgDir = join(src, 'package')
  mkdirSync(pkgDir, { recursive: true })
  for (const [path, content] of Object.entries(files)) {
    const full = join(pkgDir, path)
    mkdirSync(resolve(full, '..'), { recursive: true })
    writeFileSync(full, content)
  }
  const out = join(dir, `t-${Math.random().toString(36).slice(2)}.tgz`)
  execFileSync('tar', ['-czf', out, '-C', src, 'package'])
  return out
}

describe('readTgzEntries / hashEntries / compareTgzContents — сравнение по содержимому', () => {
  it('одно и то же дерево, собранное дважды, — хэши совпадают, хотя байты архива разные', () => {
    const dir = tempRoot('tgz-content-')
    const a = makeTgz(dir, { 'dist/index.js': 'export default 1;\n', 'package.json': '{"name":"p"}' })
    // Пауза даёт mtime разойтись гарантированно — иначе секунды tar может не хватить.
    execFileSync('sleep', ['1.1'])
    const b = makeTgz(dir, { 'dist/index.js': 'export default 1;\n', 'package.json': '{"name":"p"}' })

    const rawBytesEqual = Buffer.compare(readFileSync(a), readFileSync(b)) === 0
    // Байты архива РАЗЪЕХАЛИСЬ (mtime в заголовке tar) — вот зачем сравнение по
    // содержимому, а не `diff -q`/побайтовый хэш всего .tgz.
    expect(rawBytesEqual, 'байты архивов внезапно совпали — mtime перестал писаться в заголовок?').toBe(false)

    expect(hashEntries(readTgzEntries(a))).toBe(hashEntries(readTgzEntries(b)))
    expect(compareTgzContents(a, b)).toBe(true)
  })

  it('разное содержимое одного файла — хэши расходятся', () => {
    const dir = tempRoot('tgz-content-diff-')
    const a = makeTgz(dir, { 'dist/index.js': 'export default 1;\n' })
    const b = makeTgz(dir, { 'dist/index.js': 'export default 2;\n' })
    expect(compareTgzContents(a, b)).toBe(false)
  })

  it('разный СОСТАВ файлов при одинаковом содержимом остальных — хэши расходятся', () => {
    const dir = tempRoot('tgz-content-missing-')
    const a = makeTgz(dir, { 'dist/index.js': 'x', 'README.md': 'r' })
    const b = makeTgz(dir, { 'dist/index.js': 'x' })
    expect(compareTgzContents(a, b)).toBe(false)
  })
})

// ---------------------------------------------------------------------------

type Repo = { root: string; bare: string; git: (...a: string[]) => string }

function setup(): Repo {
  const dir = tempRoot('publish-e2e-')
  const root = resolve(dir, 'jig')
  const bare = resolve(dir, 'origin.git')
  mkdirSync(root)
  execFileSync('git', ['init', '-q', '--bare', bare])
  const git = (...a: string[]) => execFileSync('git', a, { cwd: root, encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 't')
  writeFileSync(resolve(root, 'f.txt'), 'a')
  git('add', '-A')
  git('commit', '-q', '-m', 'init')
  git('remote', 'add', 'origin', bare)
  return { root, bare, git }
}

function release(r: Repo, tag: string) {
  writeFileSync(resolve(r.root, 'f.txt'), tag)
  r.git('add', '-A')
  r.git('commit', '-q', '-m', `chore(release): ${tag}`)
  r.git('tag', '-a', tag, '-m', tag)
}

describe('checkTagsReached (E2E, офлайн — только локальный bare-репозиторий)', () => {
  it('всё запушено — зелено', () => {
    const r = setup()
    release(r, 'v1.0.0')
    r.git('push', '-q', 'origin', 'main', '--follow-tags')
    expect(checkTagsReached(r.root).tags).toEqual(['v1.0.0'])
  })

  // Тот самый случай: релиз сделан, ушёл не туда, все локальные проверки зелёные.
  it('тег есть локально, но не доехал — красное с именем тега', () => {
    const r = setup()
    release(r, 'v1.0.0')
    r.git('push', '-q', 'origin', 'main', '--follow-tags')
    release(r, 'v1.1.0')
    expect(() => checkTagsReached(r.root)).toThrow(/нет тегов v1\.1\.0/)
  })

  it('тег доехал, но переставлен на той стороне — тоже красное', () => {
    const r = setup()
    release(r, 'v1.0.0')
    r.git('push', '-q', 'origin', 'main', '--follow-tags')
    // Тег переставлен здесь на другой коммит; на той стороне остался прежний.
    writeFileSync(resolve(r.root, 'f.txt'), 'moved')
    r.git('add', '-A')
    r.git('commit', '-q', '-m', 'fix: moved')
    r.git('tag', '-f', '-a', 'v1.0.0', '-m', 'v1.0.0')
    expect(() => checkTagsReached(r.root)).toThrow(/указывает на/)
  })
})

// JIG-3: первый выпуск на корне без тегов. `make release` первым шагом зовёт
// эту проверку, и без режима первого выпуска она отказывала «публиковать
// нечего» — выпуск 1.0.0 не начинался вовсе.
describe('checkBeforeRelease — вход make release', () => {
  it('тегов нет — первый выпуск, проверять нечего, и строгая проверка НЕ зовётся', async () => {
    const r = setup()
    let called = false
    const res = await checkBeforeRelease(r.root, async () => { called = true; return {} })
    expect(res.first).toBe(true)
    expect(called).toBe(false)
  })

  it('теги есть — идёт строгая проверка, и её отказ не глотается', async () => {
    const r = setup()
    release(r, 'v1.0.0')
    await expect(checkBeforeRelease(r.root, async () => { throw new Error('не доехал') })).rejects.toThrow(/не доехал/)
  })

  it('строгая форма без тегов по-прежнему отказывает — это make published', () => {
    const r = setup()
    expect(() => checkTagsReached(r.root)).toThrow(/нет локальных тегов/)
  })
})
