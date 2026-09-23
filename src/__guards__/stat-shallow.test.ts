import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tempRootManual } from './tmp-sandbox'

/**
 * CI клонирует репозиторий поверхностно по умолчанию (`actions/checkout` без
 * явного `fetch-depth` берёт 1) — независимо от хоста, гитфлика в этом уже
 * нет. В таком чекауте `git rev-list --count HEAD` возвращает глубину клона,
 * а не число коммитов — замерено на прежнем хосте: 1 вместо 173, тегов 0
 * вместо 12; предмет гейта — сам факт «поверхностный клон лжёт числом», а не
 * то, у кого именно он поверхностный.
 *
 * Числа, посчитанные там, не просто неточны — они неверны, и молча: джоба
 * зелёная, метрика уходит, график роста репозитория показывает единицу на
 * каждый пуш. Поэтому `stat` не сообщает того, что не может посчитать, — так же
 * как опускает `version`, когда её нет.
 *
 * Оба случая строятся на СВОЁМ репозитории-фикстуре, а не на хозяйском. Первая
 * версия этого теста проверяла полный клон прямо в рабочем дереве и упала в CI:
 * там оно само поверхностное. Тест, который предполагает своё окружение,
 * проверяет окружение, а не код.
 */
const STAT = resolve(__dirname, '../../scripts/stat.mjs')

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd, encoding: 'utf8',
  })

const run = (cwd: string) => JSON.parse(execFileSync('node', [STAT], { cwd, encoding: 'utf8' }))

let sandbox: { dir: string; remove: () => void }
let origin: string
let full: string
let shallow: string

beforeAll(() => {
  // Один корень на все три клона: `beforeAll` живёт дольше теста, поэтому
  // `tempRootManual` со сносом в `afterAll`, а не `tempRoot` (DS-165).
  sandbox = tempRootManual('stat-e2e-')
  // Фикстура: три коммита и один тег — числа известны заранее.
  origin = join(sandbox.dir, 'origin')
  mkdirSync(origin)
  git(origin, 'init', '-q', '.')
  for (const n of [1, 2, 3]) {
    writeFileSync(join(origin, `f${n}.txt`), `строка ${n}\n`)
    git(origin, 'add', '-A')
    git(origin, 'commit', '-qm', `commit ${n}`)
  }
  git(origin, 'tag', 'v0.0.1')

  full = join(sandbox.dir, 'full')
  git(sandbox.dir, 'clone', '-q', `file://${origin}`, full)

  shallow = join(sandbox.dir, 'shallow')
  git(sandbox.dir, 'clone', '-q', '--depth', '1', `file://${origin}`, shallow)
})

afterAll(() => {
  sandbox?.remove()
})

describe('stat и глубина клона', () => {
  it('сообщает историю, когда она есть', () => {
    const d = run(full)
    expect(d.commits).toBe(3)
    expect(d.tags).toBe(1)
  })

  it('омитит счётчики истории в поверхностном клоне вместо того, чтобы соврать', () => {
    const d = run(shallow)
    expect(d).not.toHaveProperty('commits')
    expect(d).not.toHaveProperty('tags')
  })

  it('всё, что считается по файлам, поверхностность не портит', () => {
    const deep = run(full)
    const thin = run(shallow)
    expect(thin.files).toBe(deep.files)
    expect(thin.lines).toBe(deep.lines)
    expect(thin.totalBytes).toBe(deep.totalBytes)
  })
})
