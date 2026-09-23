#!/usr/bin/env node
/**
 * Предохранитель против того, что старая история уедет на публичный GitHub
 * (JIG-3, этап 2). `santarinto/jig` начинается ПУСТЫМ и станет публичным
 * после первого выпуска — коммит, хоть раз оказавшийся там, остаётся
 * доступен по SHA даже после force-push, потому что GitHub держит объекты,
 * на которые где-то (в форке, в PR, в чьём-то fetch) уже есть ссылка. Место
 * для старой истории — архив (репозиторий, в который этот код целится
 * литералом `OLD_PUBLIC_ROOT` ниже), и туда её кладут РУКАМИ, одним
 * `git push <архивный remote> …`, а не любой целью `make`.
 *
 * Корень старой истории (репозиторий этой дизайн-системы под прежним
 * именем) — тот самый коммит, задавший её первое дерево. Если он предок
 * отправляемого HEAD, значит HEAD несёт всю эту историю целиком, и её
 * нельзя пускать наружу через `make push`/`make published`.
 *
 * Usage: node scripts/check-public-root.mjs
 */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Литерал один — этот файл. Тесты подставляют свой корень параметром. */
export const OLD_PUBLIC_ROOT = 'f2565a53968ccd55b830a2a5d968f72fdd3574f8'

/**
 * `git merge-base --is-ancestor <root> <head>` → код 0 значит «да, предок».
 * Любой другой код — «нет»: и честное «не предок» (1), и «такого объекта тут
 * вообще нет» (128, например в свежем клоне без старой истории в базе
 * объектов). Не разбирать их по отдельности — отсутствие объекта тем более
 * не делает его предком.
 */
export function hasAncestorRoot(root, headRef, oldRoot) {
  const r = spawnSync('git', ['merge-base', '--is-ancestor', oldRoot, headRef], {
    cwd: root, stdio: 'ignore',
  })
  return r.status === 0
}

export function assertPublicRootSafe(root = process.cwd(), headRef = 'HEAD', oldRoot = OLD_PUBLIC_ROOT) {
  if (hasAncestorRoot(root, headRef, oldRoot)) {
    throw new Error(
      `Отправляемый ${headRef} несёт старую историю (корень ${oldRoot}) — она НЕ уходит на\n`
      + 'публичный santarinto/jig ни через make push, ни через make published: коммит, хоть раз\n'
      + 'оказавшийся на GitHub, остаётся доступен по SHA даже после force-push.\n'
      + 'Старая история переезжает в архив ручным `git push <архивный remote> …`, не через make.',
    )
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  try {
    assertPublicRootSafe(process.cwd())
    console.log('CHECK-PUBLIC-ROOT OK — старой истории в HEAD нет')
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
