#!/usr/bin/env node
/**
 * `prepack`/`postpack` (JIG-28): манифест, каким его видит потребитель В
 * ТАРБОЛЕ, без `devDependencies` и без `scripts` — тем же доводом, каким на
 * DS-246 их убирал `deliveryManifest` на отдельном поставочном коммите.
 * Механизм другой: там резалось дерево коммита, здесь — сам pack-lifecycle
 * пакующей машины (наша или CI), который у ПОТРЕБИТЕЛЯ не запускается никогда
 * — `prepack`/`postpack` не входят в lifecycle обычной установки (в отличие
 * от `prepare`/`install`/`postinstall`, запрещённых `dist-shipped`), они
 * срабатывают только у того, кто зовёт `npm pack`/`npm publish`.
 *
 * npm читает `package.json` ОДИН РАЗ в начале `npm pack`, до первого
 * lifecycle-скрипта, и решает по этому снимку, какие скрипты (`prepack`,
 * `postpack`) звать дальше — то, что `prepack` вычистит ключ `scripts`
 * (внутри которого и сам `postpack`) из файла НА ДИСКЕ, не мешает npm вызвать
 * `postpack` следом: он звонит по снимку, а не перечитывает файл. Проверено
 * эмпирически на песочнице (npm 11.13.0): `postpack` срабатывает и после
 * того, как `scripts` пропал из package.json на диске.
 *
 * Оба ключа удаляются ЦЕЛИКОМ, а не только `devDependencies` — если бы
 * `scripts` уцелел без `devDependencies`, потребитель получил бы манифест,
 * ссылающийся на `tsconfig.build.json`/`scripts/`, которых в пакете нет
 * (`files: ["dist","README.md"]`), то есть мёртвые ссылки на несуществующее.
 *
 * Бэкап — файл `.package.json.prepack-backup`, не в `files`, поэтому в
 * тарбол не попадает НЕЗАВИСИМО от того, лежит ли он на диске в момент
 * `npm pack` (проверено на песочнице: `files`-allowlist решает раньше, чем
 * какой-либо `.gitignore`). Он же в `.gitignore` — чтобы не выглядеть
 * посторонним в `git status`, если `restore` не позвали (упавший `npm pack`).
 *
 * Корень — `process.cwd()`, НЕ путь скрипта через `import.meta.url`. npm
 * всегда зовёт lifecycle-скрипты с `cwd` в корне пакуемого пакета — это и
 * есть контракт, которым нужно пользоваться, а не путь до самого файла:
 * `scripts/strip-manifest.mjs`, вызванный через СИМЛИНК (гейт
 * `dist-shipped` пакует ИЗОЛИРОВАННУЮ КОПИЮ, а не этот репозиторий, чтобы не
 * мутировать живой package.json параллельным прогоном других гейтов),
 * резолвится Node'ом до РЕАЛЬНОГО пути, и `import.meta.url` указал бы на
 * ЭТОТ репозиторий, а не на копию, которую пакуют, — то есть на не тот
 * package.json. `process.cwd()` от символических ссылок не зависит вовсе.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = process.cwd()
const PKG = resolve(ROOT, 'package.json')
const BACKUP = resolve(ROOT, '.package.json.prepack-backup')

function strip() {
  const text = readFileSync(PKG, 'utf8')
  writeFileSync(BACKUP, text)
  const pkg = JSON.parse(text)
  delete pkg.devDependencies
  delete pkg.scripts
  writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n')
}

function restore() {
  if (!existsSync(BACKUP)) {
    console.error('.package.json.prepack-backup нет — restore позван без strip')
    process.exit(1)
  }
  writeFileSync(PKG, readFileSync(BACKUP, 'utf8'))
  unlinkSync(BACKUP)
}

const cmd = process.argv[2]
if (cmd === 'strip') strip()
else if (cmd === 'restore') restore()
else {
  console.error(`неизвестная команда: ${cmd ?? '(пусто)'} — ожидается strip|restore`)
  process.exit(1)
}
