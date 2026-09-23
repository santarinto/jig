/**
 * Вход сборки полон (JIG-28): всё, что реально паковает `npm pack`, отображается
 * в исходник среди `buildInputConfig()` (`release.mjs`).
 *
 * Предмет — не «сборка работает» (это `build` и соседний шаг про `--ds-`
 * токен), а то, что СПИСОК
 * входов, которым `release.mjs` решает, дошла ли правка до потребителя
 * (`shippedTasks`/`unaddressedShipped`), НИЧЕГО НЕ ЗАБЫЛ. Список выводится из
 * `tsconfig.build.json` плюс горстки исключений, которые `tsc` не видит вовсе
 * (`fonts/*`, генераторы бандлов) — и забытая категория была бы тихой дырой того
 * же рода, что чинила DS-350: коммит, поменявший исходник, который реально
 * едет в пакет, не считался бы поставкой, и «поставляемых задач N, названы все»
 * лгало бы, не заметив адреса.
 *
 * ДВА СЛОЯ, тем же приёмом, что у `fixtures-not-shipped`.
 *
 * Слой 1 — намерение: `buildInputConfig` действительно выводит директории и
 * файлы, а не хранит их отдельным написанным списком. Работает всегда.
 *
 * Слой 2 — результат: КАЖДЫЙ файл из `npm pack --dry-run --json` отображается в
 * исходник среди входов. Работает только когда `dist/` уже собран (пропускается
 * иначе, как в `fixtures-not-shipped`) — мутация «убрать fonts из набора»
 * красит именно этот слой, называя конкретный файл из `dist/fonts/`.
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { buildInputConfig } from '../../scripts/release.mjs'

const ROOT = resolve(__dirname, '../..')
const DIST = join(ROOT, 'dist')

describe('вход сборки: список выводится', () => {
  const cfg = buildInputConfig(ROOT)

  it('include содержит то же, что tsconfig.build.json компилирует', () => {
    expect(cfg.include).toEqual(expect.arrayContaining(['src', 'tokens', 'types']))
  })

  it('exclude — те же тесты/фикстуры/гварды, что видит tsc', () => {
    expect(cfg.exclude).toEqual(expect.arrayContaining([
      '**/*.test.tsx', '**/*.fixture.tsx', 'src/__guards__',
    ]))
  })

  it('extraDirs и extraFiles называют то, что копируется мимо tsc', () => {
    expect(cfg.extraDirs).toContain('fonts')
    expect(cfg.extraFiles).toEqual(expect.arrayContaining([
      'scripts/build-bundles.mjs', 'package.json', 'README.md',
    ]))
  })
})

describe.skipIf(!existsSync(DIST))('npm pack --dry-run — каждый упакованный файл отображается в источник', () => {
  const cfg = buildInputConfig(ROOT)
  // `--ignore-scripts`: список путей не зависит от манифеста, и без флага
  // `npm pack` гоняет НАСТОЯЩИЕ `prepack`/`postpack` (JIG-28) — те правят
  // `package.json` НА ДИСКЕ репозитория (см. докблок `scripts/strip-manifest.mjs`),
  // и параллельный гейт, читающий этот файл в тот же момент (vitest гоняет
  // файлы параллельно), поймал бы его СЕРЕДИНУ strip → restore — гонка,
  // пойманная на живую на `lockfile-deps.test.ts`.
  //
  // `npm pack` заводит дочерний node — тот кладёт `node-compile-cache` в TMPDIR,
  // а он здесь подменён на песочницу гейта tmp-hygiene. Тот же приём, что в
  // release-flow.test.ts у настоящей сборки в песочнице.
  const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, NODE_DISABLE_COMPILE_CACHE: '1' },
  })
  const [{ files }] = JSON.parse(out) as { files: { path: string }[] }[]
  const paths = files.map((f) => f.path)

  /** Источник упакованного файла среди входов, или `null`, если его нет. */
  function mappedSource(path: string): string | null {
    if (path === 'package.json' || path === 'README.md') {
      return cfg.extraFiles.includes(path) ? path : null
    }
    // Бандлы — генерируются `scripts/build-bundles.mjs` из src/tokens, а не
    // копируются 1:1; источник у них — сам генератор.
    if (path === 'dist/styles.bundle.css' || path === 'dist/theme-auto.css') {
      return cfg.extraFiles.includes('scripts/build-bundles.mjs') ? 'scripts/build-bundles.mjs' : null
    }
    const m = /^dist\/([^/]+)\/(.+)$/.exec(path)
    if (!m) return null
    const [, dir, rest] = m
    if (cfg.extraDirs.includes(dir)) {
      // Копируется как есть: `cp fonts/* dist/fonts/`.
      const src = join(dir, rest)
      return existsSync(join(ROOT, src)) ? src : null
    }
    if (!cfg.include.includes(dir)) return null
    if (rest.endsWith('.css')) {
      // CSS копируется рядом с исходником, а не компилируется.
      const src = join(dir, rest)
      return existsSync(join(ROOT, src)) ? src : null
    }
    // .js / .d.ts — скомпилированы tsc из .ts или .tsx.
    const base = rest.replace(/\.d\.ts$/, '').replace(/\.js$/, '')
    for (const ext of ['.ts', '.tsx']) {
      const src = join(dir, `${base}${ext}`)
      if (existsSync(join(ROOT, src))) return src
    }
    return null
  }

  it('dist обойдён целиком — иначе утверждение ниже ничего не значит', () => {
    expect(paths.length, 'npm pack --dry-run не назвал ни одного файла').toBeGreaterThan(300)
  })

  it('у каждого упакованного файла есть источник среди входов сборки', () => {
    const unmapped = paths.filter((p) => mappedSource(p) === null)
    expect(unmapped, `нет источника среди входов сборки: ${unmapped.slice(0, 10).join(', ')}`
      + (unmapped.length > 10 ? ` и ещё ${unmapped.length - 10}` : '')).toEqual([])
  })
})
