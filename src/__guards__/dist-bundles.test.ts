import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * Два файла для потребителя без сборщика, и оба генерируются из того же
 * источника, что и обычная сборка. Гейт проверяет не «файл есть», а что
 * генерация не разъехалась с источником: копия, поддерживаемая отдельно,
 * расходится молча — вопрос только когда.
 *
 * Первый потребитель без бандлера появился на 1.32.0 (`fin-ilya`, отчёт
 * рендерится в строку на сервере, клиентского JS ноль). До него оба дефекта
 * — 62 последовательных запроса за CSS и закрытый путь к системной тёмной
 * теме — не всплывали: сборщику они ничего не стоят.
 */
const ROOT = resolve(__dirname, '../..')
const DIST = join(ROOT, 'dist')
const has = (p: string) => existsSync(join(DIST, p))
const read = (p: string) => readFileSync(join(DIST, p), 'utf8')

/** Имена токенов в порядке объявления — сравниваем состав, а не текст. */
const tokenNames = (css: string) => [...css.matchAll(/^\s*(--ds-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]!)

/**
 * Отсутствие файла — КРАСНОЕ, а не пропуск (DS-303). Прежде оба блока
 * стояли под `describe.skipIf(!has(...))`: условие писалось, когда `dist/` был
 * в .gitignore и на свежем клоне его не было. С DS-244 `dist/` лежит в
 * git, и пропуск стал путём зелёного на пустоте — удалённый или переименованный
 * бандл гейт бы молча не заметил, а потребитель без сборщика получил бы 404.
 */
const present = (p: string) =>
  it(`dist/${p} есть`, () => {
    expect(has(p), `dist/${p} нет — dist/ собирается шагом build до dist-checks; запусти make build`).toBe(true)
  })

describe('dist/styles.bundle.css', () => {
  present('styles.bundle.css')

  it('развёрнут целиком — ни одного @import не осталось', () => {
    const left = read('styles.bundle.css').match(/^@import/gm) ?? []
    expect(left, `осталось ${left.length} @import — потребитель без сборщика получит 404`).toEqual([])
  })

  it('содержит все правила, что и цепочка styles.css — селектор в селектор', () => {
    const bundle = read('styles.bundle.css')
    // Счётчик рядом с утверждением: сравнение с пустым списком верно и на
    // пустом бандле. Мутация, обнуляющая обход исходников, оставила бы первое
    // утверждение зелёным.
    const sources = [...read('src/styles.css').matchAll(/@import\s+["']([^"']+)["']/g)].map((m) => m[1]!)
    expect(sources.length).toBeGreaterThan(50)

    const missing = sources.filter((rel) => {
      const file = resolve(join(DIST, 'src'), rel)
      if (!existsSync(file)) return true
      // Первый селектор файла — достаточная и дешёвая подпись его содержимого.
      const first = readFileSync(file, 'utf8').match(/^([.:[@][^{\n]+)\{/m)?.[1]?.trim()
      return !!first && !bundle.includes(first)
    })
    expect(missing, `в бандл не попали: ${missing.join(', ')}`).toEqual([])
  })

  it('порядок файлов сохранён — он значим, часть каскада решается им', () => {
    // Метки ставит сам генератор (`/* ./components/Button/Button.css */`), и
    // сверяем мы именно их, а не первый селектор файла: селектор — не якорь,
    // одна и та же строка встречается в бандле не раз (в комментарии, внутри
    // более длинного селектора), и `indexOf` возвращал позицию не того куска.
    // Первая версия этой проверки падала именно на этом и была неверна сама.
    const bundle = read('styles.bundle.css')
    const inBundle = [...bundle.matchAll(/^\/\* (\.[^*]+?) \*\/$/gm)].map((m) => m[1]!)
    const inSource = [...read('src/styles.css').matchAll(/@import\s+["']([^"']+)["']/g)].map((m) => m[1]!)
    expect(inBundle.length).toBeGreaterThan(50)
    expect(inBundle, 'порядок файлов в бандле разошёлся с порядком @import').toEqual(inSource)
  })
})

describe('dist/theme-auto.css', () => {
  present('theme-auto.css')

  const auto = () => read('theme-auto.css')
  const darkBlock = () =>
    read('tokens/tokens.css').match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''

  it('состав токенов совпадает с тёмной темой — два ручных списка разъехались бы', () => {
    expect(tokenNames(auto())).toEqual(tokenNames(darkBlock()))
    expect(tokenNames(auto()).length).toBeGreaterThan(30)
  })

  it('значения совпадают, а не только имена', () => {
    const values = (css: string) =>
      Object.fromEntries([...css.matchAll(/^\s*(--ds-[a-z0-9-]+)\s*:\s*([^;]+);/gm)]
        .map((m) => [m[1]!, m[2]!.trim()]))
    expect(values(auto())).toEqual(values(darkBlock()))
  })

  it('скоуп :not([data-theme]) — явный выбор побеждает системный', () => {
    // Без :not(...) медиазапрос и атрибут оказались бы одного веса, и решал бы
    // порядок файлов у потребителя, а не намерение пользователя.
    expect(auto()).toContain(':root:not([data-theme])')
    expect(auto()).toContain('@media (prefers-color-scheme: dark)')
  })

  it('не входит в styles.css — иначе перекрасил бы всех молча', () => {
    // Ровно то, ради чего файл отдельный: приложение, не звавшее initTheme(),
    // сегодня на машине с системной тёмной рисуется светлым. Втащить это в
    // общий лист значило бы сменить внешний вид у тех, кто не просил.
    expect(read('src/styles.css')).not.toContain('theme-auto')
    expect(read('styles.bundle.css')).not.toContain('prefers-color-scheme')
  })
})

describe('экспорты пакета', () => {
  it('оба файла объявлены в exports — иначе их не импортировать по имени', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    expect(pkg.exports['./styles.bundle.css']).toBe('./dist/styles.bundle.css')
    expect(pkg.exports['./theme-auto.css']).toBe('./dist/theme-auto.css')
  })
})
