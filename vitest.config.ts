import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { kindsPlugin } from './workbench/kinds-plugin.js'

export default defineConfig({
  // `kindsPlugin` — тот же виртуальный модуль карты видов, что у дев-верстака
  // (DS-67). Здесь он не роскошь: `workbench/registry.ts` импортирует
  // `virtual:ds-wb/kinds`, и без плагина не собрался бы ни один тест верстака.
  // Один плагин на оба места намеренно — вторая реализация карты означала бы,
  // что тесты проверяют не то, что видит человек.
  plugins: [react(), kindsPlugin(import.meta.dirname)],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Песочница `/tmp` на прогон (DS-165). Именно globalSetup, а не
    // setupFiles: `TMPDIR` надо подменить ОДИН раз и ДО поднятия воркеров —
    // из setupFiles каждый воркер завёл бы свой корень, и снести общий было
    // бы некому. Замысел: `src/__guards__/tmp-sandbox.ts`.
    globalSetup: ['./vitest.globalSetup.ts'],
    css: false,
    // Рабочие деревья харнесса лежат ВНУТРИ репозитория (`.claude/worktrees/<имя>`),
    // и это полная копия `src/` со своим `node_modules`. Без исключения vitest
    // собирает тесты и оттуда: React приезжает двумя экземплярами, и падает не
    // проверка, а хуки — `Cannot read properties of null (reading 'useState')`.
    // Симптом выглядит как поломка компонента, хотя сломан только охват прогона.
    //
    // `dist-bundles.test.ts` читает СОБРАННОЕ (`dist/theme-auto.css`,
    // `dist/styles.bundle.css`) и намеренно не пропускает их отсутствие
    // (DS-303) — на свежем клоне, где `dist/` не в git (JIG-28), это красным
    // ENOENT, а не сигналом о сломанной сборке. Здесь и в `guards` (тот же
    // конфиг) файл исключён; прогоняет его `vitest.dist.config.ts` шагом
    // `dist-checks`, стоящим в `check-src` ПОСЛЕ `build`, рядом с
    // `dist-version` и `dist-untracked`.
    exclude: [...configDefaults.exclude, '.claude/**', 'src/__guards__/dist-bundles.test.ts'],
  },
})
