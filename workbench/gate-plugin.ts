/**
 * Дев-плагин Vite: предикат гейта по имени случая (DS-222).
 *
 * `GET /api/gate/predicate/<случай>` отдаёт ES-модуль, из которого в странице
 * вызывается `run()`. Это НЕ копия предиката и не его пересказ: модуль
 * ре-экспортирует `workbench/gate-predicates.ts` — ровно тот файл, который
 * исполняет сам гейт (`scripts/measure-invariants.mjs` берёт его через
 * esbuild). Тождество ПО ПОСТРОЕНИЮ: копии, которой можно разойтись, нет.
 *
 * ЗАЧЕМ АДРЕС, если `/@fs` уже открыт. Канал агенту не отрезан и адрес его не
 * заменяет — он даёт ТОЧНЫЙ ОТВЕТ вместо файла: имя случая вместо знания о
 * раскладке репозитория, и `run()` вместо пересказа предиката своими словами.
 * До него санитар считался ПРИБЛИЖЕНИЕМ, совпавшим с точным ответом, — а
 * совпадение приближения ничего не доказывает.
 *
 * ГРАНИЦА, и она обязательная часть задачи: сервис не должен стать вторым
 * `/@fs`. Имя случая — из ЗАКРЫТОГО списка, а не из пути: всё, что не совпало,
 * отвечает 404 и называет валидные имена. Поэтому ни `..`, ни абсолютный путь,
 * ни расширение файла сюда не пролезают — их просто негде подставить.
 *
 * Отвечает ТОЛЬКО dev-сервер верстака: плагин `apply: 'serve'`, в сборку
 * пакета `workbench/` не входит вовсе.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

export const PREFIX = '/api/gate/predicate/'

interface Predicate {
  /** Файл-источник относительно корня репозитория. Он же — предмет ре-экспорта. */
  file: string
  /** Что именно отдаётся под именем `run`. */
  run: string
  /** Случай гейта, чей предикат это, — человеку в шапке ответа. */
  gate: string
}

/**
 * Закрытый список. Имя — ключ, а не отрезок пути: подставить сюда файл нельзя
 * в принципе. Что список согласован с модулем, держит `gate-plugin.test.ts`:
 * переименованный экспорт обязан ронять гейт, а не отдавать `undefined`.
 */
export const PREDICATES: Record<string, Predicate> = {
  'target-size': {
    file: 'workbench/gate-predicates.ts',
    run: 'scanTargets',
    gate: 'Цель клика: ни один интерактивный элемент не мельче 24×24',
  },
}

/**
 * Тело ответа: ре-экспорт живого модуля плюс его же исходник строкой.
 *
 * `root` — КОРЕНЬ РЕПОЗИТОРИЯ, а не корень дев-сервера: конфиг передаёт
 * `import.meta.dirname`, и лежит он рядом с `vite.workbench.config.ts`, тогда
 * как `root` самого сервера — папка `workbench`. Два разных корня с одним
 * именем — ровно то место, где первая редакция и промахнулась мимо файла.
 */
export function moduleFor(name: string, root: string): string {
  const p = PREDICATES[name]
  if (!p) throw new Error(`неизвестный предикат «${name}»`)
  const abs = resolve(root, p.file)
  const source = readFileSync(abs, 'utf8')
  return `/* Предикат гейта «${p.gate}».
   Источник: ${p.file} — ТОТ ЖЕ модуль, который исполняет гейт, а не его копия.

   В странице:
     const { run, source } = await import('${PREFIX}${name}')
     run()      // замер на ТЕКУЩЕЙ шкале
     source     // исходник предиката, чтобы прочитать, а не пересказать
*/
export { ${p.run} as run } from '/@fs${abs}'
export * from '/@fs${abs}'
export const source = ${JSON.stringify(source)}
`
}

export function gatePlugin(root: string): Plugin {
  return {
    name: 'ds-gate-predicate',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0] ?? ''
        if (!url.startsWith(PREFIX)) return next()
        const name = decodeURIComponent(url.slice(PREFIX.length))
        // `in` по прототипу здесь не опасен: ключи берутся из своего же
        // литерала, а имя сверяется с ним, а не подставляется в путь. Но
        // `toString` и `constructor` пролезли бы, поэтому спрашиваем СПИСОК.
        if (!Object.keys(PREDICATES).includes(name)) {
          // Отказ НАЗЫВАЕТ, что искали и что бывает: молчаливый 404 читается
          // как «сервиса нет», и агент уходит воспроизводить предикат заново.
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({
            error: `неизвестный предикат «${name}»`,
            valid: Object.keys(PREDICATES),
            note: 'Имя из закрытого списка, а не путь к файлу: файлы читаются через /@fs.',
          }))
          return
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        res.end(moduleFor(name, root))
      })
    },
  }
}
