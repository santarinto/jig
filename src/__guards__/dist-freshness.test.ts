import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * Утверждение о СОБРАННОМ пакете не имеет права жить в шаге, идущем ДО сборки
 * (DS-238).
 *
 * `make release` гонит `prepare` (бамп пяти версионных файлов) → `check-full` →
 * `commit`. В `check-src` guards идут первыми, а `build` — пятым, так что
 * гейт, сравнивающий содержимое `dist/` с версией из `package.json`, читает
 * артефакт ПРОШЛОЙ сборки и говорит «версия не доехала» там, где она не
 * доехала ЕЩЁ. Ответ выглядит дефектом кода, а является порядком шагов, и
 * `skipIf(!existsSync(dist))` его не закрывает: dist есть, он ПРОТУХ.
 *
 * Дефект существовал ровно столько, сколько существовал гейт `version-token`
 * (заведён после тега v4.2.0), и сработал на первом же релизе — 4.2.1.
 *
 * Два утверждения, и второе не следствие первого: первое держит ПОРЯДОК шагов
 * (шаг существует и стоит после build), второе — ЗАПРЕТ заводить такую же
 * проверку в guards заново. Без второго правило живёт в памяти, а память
 * заканчивается на следующем гейте про сборку.
 */
const ROOT = resolve(__dirname, '../..')
const GUARDS = __dirname
const SELF = 'dist-freshness.test.ts'

describe('свежесть dist проверяется ПОСЛЕ сборки', () => {
  const makefile = readFileSync(join(ROOT, 'Makefile'), 'utf8')

  it('шаг dist-version есть в check-src и стоит ПОСЛЕ build', () => {
    const line = /^check-src:(.*)$/m.exec(makefile)
    expect(line, 'цели check-src в Makefile нет — проверять порядок не в чем').not.toBeNull()
    const steps = line![1]!.trim().split(/\s+/)
    expect(steps, `check-src не гонит dist-version: ${steps.join(' ')}`).toContain('dist-version')
    expect(steps.indexOf('dist-version')).toBeGreaterThan(steps.indexOf('build'))
  })

  it('цель dist-version зовёт скрипт, и скрипт на месте', () => {
    const target = /^dist-version:\n((?:\t.*\n)+)/m.exec(makefile)
    expect(target, 'цели dist-version в Makefile нет').not.toBeNull()
    expect(target![1]).toMatch(/scripts\/check-dist-version\.mjs/)
    expect(existsSync(join(ROOT, 'scripts/check-dist-version.mjs'))).toBe(true)
  })

  it('ни один guard не сравнивает содержимое dist с версией из package.json', () => {
    // Признак — три имени в одном файле: `package.json`, `version`, `dist`.
    // Ловится ровно тот класс, что краснеет на релизе: величина, которую бамп
    // двигает В ИСХОДНИКЕ, сравнивается с артефактом, который бамп не трогает.
    // `shipped-imports` и `type-exports` тоже читают dist до сборки, и это
    // осознанно оставлено: они сверяют состав, а не версию — протухший
    // артефакт для них внутренне непротиворечив и красным не врёт.
    // `dist-bundles` сюда больше не относится: JIG-3 вынес его из guards
    // целиком, в `dist-checks` после build (см. запись гейта).
    const offenders = readdirSync(GUARDS)
      .filter((f) => f !== SELF && /\.tsx?$/.test(f))
      .filter((f) => {
        const src = readFileSync(join(GUARDS, f), 'utf8')
        // Файл, работающий во ВРЕМЕННОМ репозитории, под утверждение не
        // подпадает: он не читает наш `dist`, он делает свой и тут же его
        // проверяет, поэтому «прочтёт прошлую сборку» к нему неприменимо.
        // Признак — песочница, а не имя файла: список имён рос бы по строке
        // за раз и через полгода стал бы размером с проверку, тогда как
        // «работает в temp-репозитории» — это само утверждение о безопасности.
        // Понадобилось на DS-244: релиз обязан увозить собранное, значит
        // его тест обязан писать `dist` в своей песочнице.
        if (/setupTempRepo|tempRoot/.test(src)) return false
        return /package\.json/.test(src) && /\bversion\b/.test(src)
          && /['"]dist['"]|\bdist\//.test(src)
      })
    expect(offenders, `guards идут ДО build: ${offenders.join(', ')} прочтёт ПРОШЛУЮ сборку`)
      .toEqual([])
  })

  /**
   * Против способа 3: исключение по песочнице обязано ЧТО-ТО исключать. Если
   * ни один guard больше не работает в temp-репозитории, оно мертво и тихо
   * расширяет площадь, на которой гейт молчит, — а выглядит по-прежнему
   * действующим.
   */
  it('исключение по песочнице живое: хотя бы один guard работает в temp-репозитории', () => {
    const sandboxed = readdirSync(GUARDS)
      .filter((f) => f !== SELF && /\.tsx?$/.test(f))
      .filter((f) => /setupTempRepo|tempRoot/.test(readFileSync(join(GUARDS, f), 'utf8')))
    expect(sandboxed, 'исключение по песочнице никого не исключает — снимите его').not.toEqual([])
  })
})
