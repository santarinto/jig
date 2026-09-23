#!/usr/bin/env node
/**
 * `dist/` больше НЕ в git (JIG-28). Собранное лежит на диске (для `measure`,
 * `states`, `dock-floor`, `smoke*`, для чтения глазами), но под контролем git
 * его быть не должно: с JIG-28 потребитель ставит тарбол, который собирает и
 * прикладывает к GitHub Release GitHub Actions на push тега, а не git-пин с
 * собранным в дереве (DS-244/246, снято — см. `docs/release.md`).
 *
 * Заменяет `dist-committed` (сверял `dist/` с ИНДЕКСОМ — утверждение имело
 * смысл только пока собранное там жило). Здесь утверждение проще и грубее:
 * `git ls-files -- dist` обязан вернуть ПУСТО. Не «есть незакоммиченное» —
 * этого мало, `.gitignore` может молчать, а `git add -f` всё равно закинет
 * файл в индекс, откуда он поедет в следующий коммит незамеченным.
 *
 * Стоит в `check-src` сразу за `build`, тем же местом, что держал
 * `dist-committed`: причина не в порядке (это утверждение от `build` не
 * зависит вовсе), а в том, что здесь исторически стоит вся группа проверок
 * "dist/" — рядом с `dist-version`, который СОБРАННОЕ как раз требует.
 */
import { execFileSync } from 'node:child_process'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })

const tracked = git('ls-files', '--', 'dist').split('\n').filter(Boolean)
if (tracked.length > 0) {
  console.error(
    `dist-untracked FAIL: под контролем git ${tracked.length} файлов dist/:\n` +
    tracked.slice(0, 20).join('\n') +
    (tracked.length > 20 ? `\n… и ещё ${tracked.length - 20}` : '') +
    '\n\ndist/ больше не поставляется через git (JIG-28) — потребитель ставит тарбол,\n' +
    'который собирает GitHub Actions на push тега. Убрать из индекса:\n' +
    '  git rm --cached ' + (tracked.length === 1 ? tracked[0] : '-r dist'),
  )
  process.exit(1)
}

console.log('dist-untracked OK — dist/ не под контролем git')
