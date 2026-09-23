import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, rmSync, symlinkSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tempRoot } from './tmp-sandbox'

/**
 * Форма поставки (JIG-28): потребитель получает СОБРАННЫЙ тарбол, установка
 * ничего не собирает и ничего не решает лишнего.
 *
 * До JIG-28 (DS-244/246) собранное лежало в git, а тег указывал на
 * отдельный поставочный коммит без `devDependencies`. С JIG-28 `dist/` в git
 * не идёт вовсе (см. `.gitignore`, гейт `dist-untracked`): GitHub Actions
 * собирает его на push тега и прикладывает `santarinto-jig-X.Y.Z.tgz` к
 * GitHub Release. Довод DS-244 не изменился ни на йоту — потребитель не
 * собирает DS на своей машине и не качает её `devDependencies` — сменился
 * только транспорт: не git-пин с собранным в дереве, а URL на готовый тарбол.
 *
 * Прежняя история (для памяти): до 09.09.2026 `package.json` нёс `"prepare":
 * "npm run build"`, и поскольку для git-зависимости npm игнорирует `files` и
 * берёт репозиторий, единственным способом доставить собранное была сборка
 * ВНУТРИ `npm ci` потребителя. У одного из потребителей это упиралось в его
 * же `timeout 600` и валило пайплайн — перемежающимся отказом, так что один
 * зелёный прогон там не доказывал ничего.
 *
 * Утверждения — про РАЗНОЕ. Первое: в package.json нет lifecycle-скрипта,
 * который собирал бы DS на машине потребителя. Второе: `build` чистит `dist`
 * перед сборкой. Третье: то, что реально едет в тарбол (`npm pack --dry-run`)
 * — это `dist/**`, `README.md`, точки входа поимённо. Четвёртое, живое
 * ядро JIG-28: УПАКОВАННЫЙ манифест (настоящий `npm pack`, не dry-run — тот
 * не даёт содержимого) не несёт ни `devDependencies`, ни `scripts` —
 * `prepack`/`postpack` (`scripts/strip-manifest.mjs`) режут их на пакующей
 * машине и никогда не выполняются у потребителя (в lifecycle обычной
 * установки `prepack`/`postpack` не входят, в отличие от `prepare`).
 */
const ROOT = resolve(__dirname, '../..')

describe('поставка: потребитель получает собранное, а не собирает сам', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const makefile = readFileSync(join(ROOT, 'Makefile'), 'utf8')

  it('в package.json НЕТ install-скриптов, что собирали бы DS на машине потребителя', () => {
    // `prepare` npm зовёт при установке git-зависимости (её у нас больше нет,
    // но источник не должен полагаться на это молча); `install`/`postinstall`/
    // `preinstall` — на ЛЮБОЙ установке пакета вообще, включая тарбол.
    // `prepack`/`postpack` сюда НЕ входят: npm зовёт их только вокруг
    // `npm pack`/`npm publish`, то есть у пакующей машины, не у потребителя.
    const shipping = ['prepare', 'install', 'postinstall', 'preinstall']
    const present = shipping.filter((s) => pkg.scripts?.[s] != null)
    expect(
      present,
      `скрипты ${present.join(', ')} собирали бы DS при установке потребителем.\n` +
      'Собранное доставляется тарболом от CI, а не собирается у него.',
    ).toEqual([])

    // Против способа 3: проверка обязана иметь что читать. Пустой scripts
    // сделал бы её зелёной, ничего не проверив.
    expect(pkg.scripts?.build, 'скрипта build нет — собирать нечем').toBeTruthy()
    expect(pkg.scripts?.pack, 'скрипта pack нет — тарбол собрать нечем').toBeTruthy()
    expect(pkg.scripts?.prepack, 'скрипта prepack нет — манифест в тарболе не почистится').toBeTruthy()
    expect(pkg.scripts?.postpack, 'скрипта postpack нет — рабочее дерево останется урезанным').toBeTruthy()
  })

  it('build ЧИСТИТ dist перед сборкой', () => {
    // `tsc` никогда не удаляет прошлый вывод, а `cp` тем более. Удалённый
    // компонент оставил бы свои `.js`/`.d.ts` в следующей сборке молча — тот
    // же класс дефекта, что нашли на ревью DS-244, актуален и здесь:
    // `dist/` больше не в git, но одна и та же рабочая копия живёт между
    // прогонами `make check`, и на ней утечка была бы такой же тихой.
    expect(
      pkg.scripts?.build,
      'build не начинается с очистки dist — устаревший артефакт уедет к потребителю молча',
    ).toMatch(/^rm -rf dist &&/)
  })

  it('шаг dist-untracked есть в check-src и стоит ПОСЛЕ build', () => {
    // Порядок — тот же довод, что был у `dist-committed`: dist-untracked не
    // сверяет с исходником, но живёт рядом с dist-version, который проверяет
    // именно СВЕЖЕСОБРАННОЕ.
    const line = /^check-src:(.*)$/m.exec(makefile)
    expect(line, 'цели check-src в Makefile нет').not.toBeNull()
    const steps = line![1]!.trim().split(/\s+/)
    expect(steps, `check-src не гонит dist-untracked: ${steps.join(' ')}`).toContain('dist-untracked')
    expect(steps.indexOf('dist-untracked')).toBeGreaterThan(steps.indexOf('build'))
  })

  describe.skipIf(!existsSync(join(ROOT, 'dist')))('npm pack --dry-run — состав тарбола', () => {
    // `--ignore-scripts`: список путей не зависит от манифеста, а без флага
    // `npm pack` гоняет настоящие `prepack`/`postpack`, которые на мгновение
    // мутируют package.json НА ДИСКЕ — гонка с параллельными гейтами, см.
    // докблок того же вызова в `build-input-mapping.test.ts`.
    const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env, NODE_DISABLE_COMPILE_CACHE: '1' },
    })
    const [{ files }] = JSON.parse(out) as { files: { path: string }[] }[]
    const paths = files.map((f) => f.path)

    it('едет dist/**, README.md, package.json — и точки входа поимённо', () => {
      expect(paths.length, 'npm pack --dry-run не назвал ни одного файла').toBeGreaterThan(300)
      expect(paths).toContain('README.md')
      expect(paths.filter((p) => p.startsWith('dist/')).length).toBeGreaterThan(300)
      const entries = [pkg.main, pkg.types, 'dist/src/styles.css', 'dist/tokens/tokens.css']
      for (const e of entries) expect(paths, `точка входа ${e} не паковалась`).toContain(e)
    })

    it('фикстуры и верстак в тарбол не попадают (см. fixtures-not-shipped)', () => {
      const leaked = paths.filter((p) => /\.fixture\./.test(p) || /(^|\/)workbench\//.test(p))
      expect(leaked).toEqual([])
    })
  })

  describe.skipIf(!existsSync(join(ROOT, 'dist')))('npm pack настоящий — манифест В ТАРБОЛЕ', () => {
    /**
     * Пакуется КОПИЯ, а не сам репозиторий. `npm pack` реальный (не dry-run)
     * — единственный способ увидеть СОДЕРЖИМОЕ манифеста, а не только список
     * путей, — а значит гоняет настоящие `prepack`/`postpack`, которые правят
     * `package.json` НА ДИСКЕ. Пакуя `ROOT` напрямую, тест мутировал бы живой
     * `package.json` репозитория на время своего прогона: `vitest` гоняет
     * файлы параллельно, и `lockfile-deps.test.ts`, читающий тот же файл в
     * этот момент, поймал бы его СЕРЕДИНУ strip → pack → restore — гонка,
     * пойманная на живую (`devDependencies: 0` там, где их 19).
     *
     * `dist/` и `scripts/` — симлинками (копировать 480 файлов дороже и
     * незачем — источник, а не то, что проверяется), `package.json` и
     * `README.md` — копией, потому что их как раз мутирует `prepack`.
     */
    function packCopy() {
      const dest = tempRoot('dist-shipped-pack-')
      symlinkSync(join(ROOT, 'dist'), join(dest, 'dist'))
      symlinkSync(join(ROOT, 'scripts'), join(dest, 'scripts'))
      writeFileSync(join(dest, 'package.json'), readFileSync(join(ROOT, 'package.json'), 'utf8'))
      writeFileSync(join(dest, 'README.md'), readFileSync(join(ROOT, 'README.md'), 'utf8'))
      return dest
    }

    it('нет ни devDependencies, ни scripts — prepack/postpack режут их у пакующей машины', () => {
      const src = packCopy()
      const out = tempRoot('dist-shipped-out-')
      execFileSync('npm', ['pack', '--pack-destination', out, '--json'], {
        cwd: src, encoding: 'utf8', env: { ...process.env, NODE_DISABLE_COMPILE_CACHE: '1' },
      })
      const version = pkg.version as string
      const tgz = join(out, `santarinto-jig-${version}.tgz`)
      expect(existsSync(tgz), `тарбол ${tgz} не создан`).toBe(true)
      const manifestText = execFileSync('tar', ['-xzO', '-f', tgz, 'package/package.json'], { encoding: 'utf8' })
      const shipped = JSON.parse(manifestText)
      expect(shipped.devDependencies, 'devDependencies уехали потребителю').toBeUndefined()
      expect(shipped.scripts, 'scripts уехали потребителю — мёртвые ссылки на tsconfig.build.json/scripts/').toBeUndefined()
      expect(shipped.version).toBe(version)
      expect(shipped.dependencies, 'настоящие зависимости потеряны').toEqual(pkg.dependencies)

      // И копия, откуда пакова́ли, восстановлена — postpack отработал НА НЕЙ,
      // а живой package.json репозитория всё это время не тронут вовсе.
      const onCopy = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8'))
      expect(onCopy.devDependencies, 'копия осталась урезанной — postpack не отработал').toBeDefined()
      expect(existsSync(join(src, '.package.json.prepack-backup')), 'бэкап не убран').toBe(false)

      rmSync(src, { recursive: true, force: true })
      rmSync(out, { recursive: true, force: true })
    })
  })
})
