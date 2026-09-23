import { defineConfig } from 'vitest/config'

/**
 * Проверки СОБРАННОГО, а не исходника (JIG-3).
 *
 * `src/__guards__/dist-bundles.test.ts` читает `dist/theme-auto.css` и
 * `dist/styles.bundle.css` и намеренно превращает их отсутствие в КРАСНОЕ, а
 * не в пропуск (DS-303) — тогда это было верно, потому что `dist/` лежал в
 * git и отсутствие значило «забыли закоммитить». С JIG-28 `dist/` из git
 * убран: потребитель ставит тарбол, который на push тега собирает GitHub
 * Actions. На свежем клоне `dist/` не существует ДО первого `make build`, и
 * тот же самый ENOENT, что раньше значил «забыли закоммитить», стал значить
 * «ещё не собирали» — `guards`/`test` шли ДО `build` в `check-src`, и файл
 * падал на каждом свежем клоне, не только на сломанной сборке.
 *
 * Решение то же, каким уже разведены `dist-version` и `dist-untracked`:
 * утверждение о собранном — это шаг ПОСЛЕ `build`, не guard. Здесь это отдельный
 * vitest-проект, а не ещё один node-скрипт, потому что сам гейт уже написан на
 * vitest (`expect`, снапшоты состава токенов) — переписывать его в
 * `assert`-скрипт значило бы менять утверждение, а не порядок его прогона.
 *
 * `vitest.config.ts` этот файл ИСКЛЮЧАЕТ (`guards`, `test`) — иначе он снова
 * подхватился бы до сборки тем же путём. Гоняет его отдельная цель Makefile
 * `dist-checks`, стоящая в `check-src` сразу после `build`, рядом с
 * `dist-version` и `dist-untracked` — группой шагов, читающих `dist/`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__guards__/dist-bundles.test.ts'],
  },
})
