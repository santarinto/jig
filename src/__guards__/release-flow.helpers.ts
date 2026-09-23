import { writeFileSync, mkdirSync, chmodSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { tempRoot } from './tmp-sandbox'

const SCRIPT = resolve(__dirname, '../../scripts/release.mjs')

export function seedFiles(root: string, version: string) {
  writeFileSync(
    resolve(root, 'package.json'),
    JSON.stringify({ name: '@santarinto/jig', version }, null, 2) + '\n',
  )
  // Lock с DS-318 — версионный файл: бамп пишет его корневую запись, а
  // `rollback`/`commit` зовут git по ВСЕМУ `VERSION_FILES`, и без lock в
  // песочнице `git checkout --` падал бы на pathspec. Пакет под `node_modules/`
  // посеян намеренно: его `version` бамп трогать не вправе, и без него случай
  // «правит только корень» не мог бы покраснеть.
  writeFileSync(
    resolve(root, 'package-lock.json'),
    JSON.stringify({
      name: '@santarinto/jig', version, lockfileVersion: 3, requires: true,
      packages: {
        '': { name: '@santarinto/jig', version },
        'node_modules/react': { version: '19.2.8' },
      },
    }, null, 2) + '\n',
  )
  mkdirSync(resolve(root, 'docs/portal-migration'), { recursive: true })
  mkdirSync(resolve(root, '.design-sync'), { recursive: true })
  writeFileSync(
    resolve(root, 'docs/portal-migration/consumption.md'),
    `Текущая версия пакета — **${version}**.\n\nsantarinto-jig-${version}.tgz\n`,
  )
  writeFileSync(resolve(root, '.design-sync/conventions.md'), `> **Version ${version}**\n`)
  // Пятое версионное место с DS-215. Не декорация харнесса: `bumpFiles`
  // читает КАЖДЫЙ файл из `DOC_SITES`, и без этой строки он падал бы на ENOENT
  // — то есть сценарии проверяли бы не релиз, а отсутствие файла.
  mkdirSync(resolve(root, 'tokens'), { recursive: true })
  writeFileSync(resolve(root, 'tokens/tokens.css'), `:root {\n  --ds-version: "${version}";\n}\n`)
  writeFileSync(
    resolve(root, 'CHANGELOG.md'),
    `# Changelog\n\nintro — [Keep a Changelog].\n\n## [${version}] — 2026-01-01\n\n- seed\n`,
  )
  writeFileSync(resolve(root, 'README.md'), '# jig (песочница)\n')
  // Вход сборки (JIG-28): `buildInputConfig`/`shippedPathspec` читают
  // tsconfig.build.json — без него `shippedTasks`/`checkNamed` отказывали бы
  // ВСЕГДА, а не только там, где сценарий это проверяет нарочно. Форма — та
  // же, что у настоящего `tsconfig.build.json` в корне репозитория.
  writeFileSync(resolve(root, 'tsconfig.build.json'), JSON.stringify({
    extends: './tsconfig.json',
    compilerOptions: { outDir: 'dist', rootDir: '.' },
    include: ['src', 'tokens', 'types'],
    exclude: [
      '**/*.test.tsx', '**/*.test.ts', '**/*.fixture.tsx',
      'src/internal/fixture.ts', 'src/internal/fixture-validate.ts',
      'src/__smoke__', 'src/__guards__', 'vitest.config.ts', 'vitest.setup.ts',
    ],
  }, null, 2) + '\n')
}

// Ветка по умолчанию у `git init` зависит от конфига пользователя (`master`/`main`/что
// угодно ещё) — здесь и во всех сценариях харнесса имя ветки задаётся явно (`main`),
// чтобы E2E не зависел от машины, на которой запущен.
export function setupTempRepo() {
  // `tempRoot`, а не голый `mkdtempSync`: репозиторий сносится по окончании
  // теста, который его завёл. До DS-165 уборки не было вовсе — 4579
  // git-репозиториев в /tmp, по одному на каждый прогон каждого сценария.
  const root = tempRoot('rel-e2e-')
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't')
  seedFiles(root, '0.0.1')
  // Скрэтч-файл харнесса (`writeFakeEditor`) не должен фигурировать в
  // `git status --porcelain` как посторонний untracked — страж чистого
  // дерева (`dirtyNonVersion` в `release.mjs`) обязан ловить ЛЮБОЙ чужой
  // файл, трекнутый или нет, поэтому исключаем свой же scratch-файл через
  // `.gitignore`, а не ослаблением проверки.
  writeFileSync(resolve(root, '.gitignore'), 'fake-editor.mjs\n')
  git('add', '-A'); git('commit', '-q', '-m', 'chore(release): 0.0.1')
  git('tag', '-a', 'v0.0.1', '-m', 'seed')
  let n = 0
  return {
    root, git,
    addCommit(msg: string) {
      writeFileSync(resolve(root, `file-${n++}.txt`), 'x')
      git('add', '-A'); git('commit', '-q', '-m', msg)
    },
    /**
     * Коммит, ДОШЕДШИЙ ДО ПОТРЕБИТЕЛЯ: правит вход сборки (JIG-28) — файл под
     * `src/`, который `tsconfig.build.json` компилирует, а не тест/фикстуру,
     * которые он исключает.
     *
     * Отдельный от `addCommit` намеренно: весь предмет проверки в том, что по
     * ТЕМЕ эти два коммита неразличимы — «fix(X): … (CODE)» и там и там, — а
     * различимы только тем, тронут ли вход сборки. Пара, где оба его трогают,
     * зеленела бы и на проверке, которая путей не смотрит вовсе.
     */
    addShippedCommit(msg: string) {
      mkdirSync(resolve(root, 'src'), { recursive: true })
      writeFileSync(resolve(root, 'src/marker.ts'), `export const seeded = ${n++}\n`)
      git('add', '-A'); git('commit', '-q', '-m', msg)
    },
    /**
     * Компонент каталога — КАТАЛОГ в `src/components`, то же определение, что у
     * гейта `agents-catalog`. Два ответа на «что такое компонент» разошлись бы
     * молча: гейт требовал бы секцию в AGENTS.md на одно множество, а релиз
     * считал бы уровень по другому.
     *
     * `src/components` — вход сборки (JIG-28), значит этот коммит теперь ТОЖЕ
     * поставленный: код в скобках обязателен, если сценарий доходит до
     * `checkNamed` (`runPrepare`/`runCommit`, но не `runBump`, который его не
     * зовёт). `code` пуст только там, где сценарий не идёт дальше `runBump`.
     */
    addComponent(name: string, code?: string) {
      mkdirSync(resolve(root, 'src/components', name), { recursive: true })
      writeFileSync(resolve(root, 'src/components', name, 'index.ts'), `export const ${name} = 1\n`)
      git('add', '-A')
      git('commit', '-q', '-m', `feat(${name}): новый компонент${code ? ` (${code})` : ''}`)
    },
    removeComponent(name: string) {
      rmSync(resolve(root, 'src/components', name), { recursive: true, force: true })
      git('add', '-A'); git('commit', '-q', '-m', `refactor(${name}): удалён`)
    },
    read: (f: string) => readFileSync(resolve(root, f), 'utf8'),
    runPrepare: (env: Record<string, string> = {}) =>
      execFileSync('node', [SCRIPT, 'prepare'],
        { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } }),
    runCommit: (env: Record<string, string> = {}) =>
      execFileSync('node', [SCRIPT, 'commit'],
        { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } }),
    // `bump` гоняется ЧЕРЕЗ CLI, как `prepare`, а не вызовом экспортированной
    // функции: дефект, ради которого этот прогон заведён, жил в СКЛЕЙКЕ —
    // `bumpFromArgs` передавал в `detectBumpLevel` готовый диапазон вместо
    // тега. Прямой вызов `detectBumpLevel` его не видел и не увидит.
    runBump: (arg?: string, env: Record<string, string> = {}) =>
      execFileSync('node', arg ? [SCRIPT, 'bump', arg] : [SCRIPT, 'bump'],
        { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } }),
    // Черновик CHANGELOG из артефактов задач (DS-257) — тоже через CLI:
    // корень артефактов приходит ТОЛЬКО из окружения, и прямой вызов функции с
    // путём аргументом прошёл бы мимо того места, где живёт отказ «не задан».
    // `DS_DOCS_PATH` из окружения самого прогона снимается явно: у владельца он
    // может быть выставлен, и сценарий «не задан» тогда молча читал бы его vault.
    runDraft: (env: Record<string, string> = {}) => {
      const base = { ...process.env }
      delete base.DS_DOCS_PATH
      return execFileSync('node', [SCRIPT, 'draft'],
        { cwd: root, encoding: 'utf8', env: { ...base, ...env } })
    },
  }
}

/**
 * Корень артефактов задач в том виде, в каком он лежит у владельца:
 * `<docs>/tasks/<CODE>/<CODE>.md`. `null` вместо текста — каталог задачи есть,
 * а пункта нет (у настоящих задач там бывают только промты и сырьё).
 */
export function writeArtifacts(docs: string, items: Record<string, string | null>) {
  mkdirSync(resolve(docs, 'tasks'), { recursive: true })
  for (const [code, md] of Object.entries(items)) {
    mkdirSync(resolve(docs, 'tasks', code), { recursive: true })
    if (md !== null) writeFileSync(resolve(docs, 'tasks', code, `${code}.md`), md)
  }
}

// Мок $EDITOR: node-скрипт, дописывающий тело в первую секцию `## [`.
// body === null → выходит с кодом 1 (имитация отказа/:q!).
export function writeFakeEditor(root: string, body: string | null) {
  const path = resolve(root, 'fake-editor.mjs')
  const src = body === null
    ? `process.exit(1)\n`
    : `import { readFileSync, writeFileSync } from 'node:fs'
const f = process.argv[2]
const lines = readFileSync(f, 'utf8').split('\\n')
const i = lines.findIndex(l => /^## \\[/.test(l))
lines.splice(i + 1, 0, '', ${JSON.stringify(body)})
writeFileSync(f, lines.join('\\n'))
`
  writeFileSync(path, src)
  chmodSync(path, 0o755)
  return path
}
