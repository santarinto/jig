import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Корневая запись `package-lock.json` повторяет диапазоны манифеста дословно
 * (DS-318).
 *
 * Повод: lock держал `"react": "^18.3.1 || ^19"` в `peerDependencies`, когда
 * манифест давно говорил `^19`, и ничто не краснело. Не краснело бы и дальше:
 * смоуки `check-full` ставят пакет из git и тарбола, а в поставочном коммите
 * lock нет вовсе.
 *
 * Почему равенство, а не «`npm ci` проходит». Замер в задаче (npm 11.13.0, чистый
 * клон): `npm ci` сверяет манифест с РАЗРЕШЁННЫМ деревом, а не с корневой
 * записью, — разъехавшийся peer-диапазон, вычеркнутый из корня devDependency и
 * корневой `react: ^18.3.1` при установленном 19.2.8 дают exit 0. Падает он
 * (`EUSAGE … are in sync`) только когда дерево манифест уже не удовлетворяет:
 * `Missing: left-pad@1.3.0 from lock file`, `Invalid: lock file's
 * react@19.2.8 does not satisfy react@18.3.1`. То есть рассинхрон копится
 * молча и взрывается у того, кто первым позовёт `npm ci`, в чужой момент.
 * Корень lock пишет только `npm install`, и равенство его с манифестом —
 * дешёвый признак «правили package.json, не прогнав npm install», который
 * ловит оба класса раньше `npm ci` и без сети. Прогонять сам `npm ci --dry-run`
 * отвергнуто: реестр или кэш в `make check`, а peer-дрейф он не видит всё
 * равно.
 *
 * Лечение красного — одна команда: `npm install --package-lock-only`.
 * Версию корня держит `doc-version` (её пишет бамп), здесь — только диапазоны.
 */
const ROOT = resolve(__dirname, '../..')
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
const lock = JSON.parse(readFileSync(resolve(ROOT, 'package-lock.json'), 'utf8'))

/** Поля манифеста, которые npm переносит в `packages[""]`. */
const SECTIONS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  // Не проверено на живом lock: манифест optionalDependencies не имеет. Если
  // npm продублирует их в корневые dependencies, сравнение ниже покраснеет на
  // верном lock — тогда сливать две секции, а не снимать гейт.
  'optionalDependencies',
  'peerDependenciesMeta',
] as const

describe('package-lock.json root record mirrors package.json', () => {
  it('has a packages[""] root record and it is this package', () => {
    // Санитар: без корня каждый случай ниже сравнивал бы undefined с undefined
    // по отсутствующим секциям и был бы зелёным на пустоте.
    expect(lock.packages?.[''], 'no packages[""] — lockfileVersion changed?').toBeDefined()
    expect(lock.packages[''].name).toBe(pkg.name)
    expect(Object.keys(pkg.devDependencies ?? {}).length, 'manifest has no devDependencies — wrong file?')
      .toBeGreaterThan(0)
  })

  it.each(SECTIONS)('%s: same names, same ranges', (section) => {
    const want = pkg[section] ?? {}
    const got = lock.packages?.['']?.[section] ?? {}
    expect(got, `package-lock.json packages[""].${section} ≠ package.json — run: npm install --package-lock-only`)
      .toEqual(want)
  })
})
