import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Коллизия имени npm-скрипта с его собственным pre/post-хуком (JIG-3).
 *
 * `npm run K` — ДО тела `K` — сам зовёт `preK`, если такой скрипт есть, и
 * ПОСЛЕ тела — `postK` (это поведение npm, не решение этого репозитория).
 * Ровно на этом сломался бывший скрипт `pack`: `"pack": "npm run build &&
 * npm pack --pack-destination ."`, `"prepack": "node scripts/strip-manifest.mjs
 * strip"` — `npm run pack` сначала звал `prepack`, тот срезал ключ `scripts`
 * из `package.json` (готовя манифест к УПАКОВКЕ), и `npm run build` внутри
 * тела `pack` падал `Missing script: "build"`, потому что скриптов на тот
 * момент уже не было. Воспроизведено на npm 11.13.0.
 *
 * Настоящий `npm pack` (не `npm run pack`) хуки `prepack`/`postpack` звать
 * ОБЯЗАН — в этом их назначение, см. `scripts/strip-manifest.mjs` и гейт
 * `dist-shipped` — поэтому чинить это снятием хуков нельзя, только тем, чтобы
 * НИ ОДИН скрипт не назывался так же, как их предмет (`pack`). Починка JIG-3 —
 * скрипт переименован в `tarball`, у него нет собственного pre/post-хука, и
 * настоящий `npm pack` внутри его тела сам зовёт `prepack`/`postpack`, как и
 * задумано.
 *
 * Два разных утверждения, а не одно:
 * 1. Общее: любой скрипт `K`, у которого в `scripts` есть `preK` или `postK`,
 *    обязан быть в явном списке разрешённых пар с доводом — иначе это
 *    непризнанная коллизия, и следующий, кто добавит `preK`/`postK`, рискует
 *    повторить JIG-3 молча.
 * 2. Частное и более острое: ни один скрипт, в ТЕЛЕ которого есть `npm pack`,
 *    не может иметь pre/post-хук вовсе — `npm pack` внутри `npm run` даёт
 *    ДВОЙНОЙ обход (внешний `npm run K` через `preK`/`postK`, и внутри него
 *    ещё раз настоящий `npm pack` через `prepack`/`postpack`), и это ровно
 *    форма дефекта JIG-3, даже если K называется не `pack` дословно.
 */
const ROOT = resolve(__dirname, '../..')
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>
}
const scripts = pkg.scripts ?? {}
const names = Object.keys(scripts)

/**
 * Легальные пары `K`/`preK`|`postK`, если такие когда-нибудь понадобятся —
 * с доводом, почему они не наступают на грабли JIG-3 (например, хук не
 * трогает `scripts` и тело `K` не зовёт `npm run`/`npm pack` повторно).
 * Сейчас пусто: прогон реального `package.json` показал, что легальных пар
 * нет — единственная прежняя (`pack`/`prepack`/`postpack`) и была дефектом.
 */
const ALLOWED_HOOK_PAIRS: Record<string, string> = {}

describe('коллизия имени npm-скрипта с pre/post-хуком (JIG-3)', () => {
  it('обход не выродился — в package.json есть чем поймать коллизию', () => {
    expect(names.length, 'scripts в package.json').toBeGreaterThan(10)
  })

  it('каждый K с preK/postK — в списке разрешённых пар, иначе непризнанная коллизия', () => {
    const collisions = names
      .filter((k) => scripts[`pre${k}`] != null || scripts[`post${k}`] != null)
      .filter((k) => !(k in ALLOWED_HOOK_PAIRS))
      .map((k) => {
        const hooks = [scripts[`pre${k}`] != null ? `pre${k}` : null, scripts[`post${k}`] != null ? `post${k}` : null]
          .filter(Boolean)
          .join(', ')
        return `${k} (хук: ${hooks}) — npm run ${k} сначала зовёт ${hooks.split(', ')[0]}, автоматически, до тела ${k}`
      })
    expect(
      collisions,
      'скрипт делит имя со своим pre/post-хуком без записи в ALLOWED_HOOK_PAIRS: '
      + collisions.join('; ')
      + '. Это ровно форма дефекта JIG-3 (`pack`/`prepack`/`postpack`) — npm run вызывает хук'
      + ' автоматически, и если тело скрипта или хук трогают друг друга, порядок вызова решает'
      + ' npm, а не автор package.json.',
    ).toEqual([])
  })

  it('ни один скрипт с `npm pack` в теле не имеет собственного pre/post-хука', () => {
    const offenders = names
      .filter((k) => /\bnpm pack\b/.test(scripts[k]!))
      .filter((k) => scripts[`pre${k}`] != null || scripts[`post${k}`] != null)
      .map((k) => {
        const hook = scripts[`pre${k}`] != null ? `pre${k}` : `post${k}`
        return `${k} — тело зовёт \`npm pack\`, и при этом npm run ${k} сначала зовёт ${hook}: `
          + 'двойной обход, настоящий npm pack внутри тела получит те же хуки ещё раз'
      })
    expect(
      offenders,
      'скрипт, зовущий `npm pack` в своём теле, не может иметь pre/post-хук: '
      + offenders.join('; '),
    ).toEqual([])
  })
})
