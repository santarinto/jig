import { describe, it, expect } from 'vitest'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { assertPublicRootSafe } from '../../scripts/check-public-root.mjs'
import { tempRoot } from './tmp-sandbox'

/**
 * `santarinto/jig` начинается ПУСТЫМ и открывается публично после первого
 * выпуска (JIG-3). Коммит, хоть раз побывавший на GitHub, остаётся доступен
 * по SHA даже после force-push, поэтому старая история (репозиторий этой
 * дизайн-системы под прежним именем, корень `f2565a5…`) не должна доехать
 * туда НИКОГДА — ни `make push`, ни `make published`.
 *
 * Литерал корня в самом скрипте один (`OLD_PUBLIC_ROOT`); здесь он
 * подставляется параметром — настоящий SHA этого коммита зависит от дерева,
 * родителя и таймстампов, и фикстура не может его воспроизвести, а
 * подставной параметр доказывает ровно ту же логику: «этот корень — предок
 * HEAD» отказывает, «другой корень» — нет.
 */

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd, encoding: 'utf8',
  }).trim()
}

function initRepo(prefix: string) {
  const dir = tempRoot(prefix)
  git(dir, 'init', '-q', '-b', 'main')
  return dir
}

function commit(dir: string, name: string) {
  writeFileSync(resolve(dir, name), name)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', name)
  return git(dir, 'rev-parse', 'HEAD')
}

describe('check-public-root: старая история не должна отправляться', () => {
  it('история с корнем-предохранителем — отказ', () => {
    const dir = initRepo('public-root-bad-')
    const root = commit(dir, 'root.txt')
    commit(dir, 'second.txt')
    expect(() => assertPublicRootSafe(dir, 'HEAD', root)).toThrow(/старую историю/)
  })

  it('история с другим корнем — проходит', () => {
    const dir = initRepo('public-root-ok-')
    commit(dir, 'root.txt')
    commit(dir, 'second.txt')
    // Корень из другого, никак не связанного репозитория — заведомо не предок.
    // Имя и содержимое файла другие: одинаковое дерево дало бы одинаковый SHA
    // коммита даже в разных репозиториях (git не хранит путь к репозиторию),
    // и тест тогда проверял бы совпадение случайно, а не по построению.
    const other = initRepo('public-root-other-')
    const otherRoot = commit(other, 'unrelated-fixture.txt')
    expect(() => assertPublicRootSafe(dir, 'HEAD', otherRoot)).not.toThrow()
  })
})
