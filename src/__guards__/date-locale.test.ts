import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

/**
 * Локаль дат, времени и чисел берётся у системы, а не у браузера и не у
 * литерала в файле (DS-184).
 *
 * ЧТО ЭТО ЛОВИТ. До этой задачи в `src/` было восемь мест с `Intl`, и они
 * делились ровно пополам: четыре прибили `'ru-RU'`, четыре звали
 * `Intl.DateTimeFormat(undefined, …)`, то есть брали локаль браузера. Раскол
 * был не смысловой, а хронологический — числа и названия дней прибили, отметки
 * времени оставили как вышло, — и обе половины плохи по отдельности:
 *
 * - прибитый `'ru-RU'` делает систему одноязычной, хотя текст уже живёт в
 *   словаре потребителя: прибивать язык дат, отдав язык подписей, —
 *   противоречие внутри одного компонента;
 * - локаль браузера даёт «09/02/2026» рядом с русским интерфейсом, а это не
 *   «непривычно», а ДРУГАЯ ДАТА для читателя: 09/02 в ru — девятое февраля.
 *   Ошибка молчаливая и правдоподобная, то есть худшая из возможных.
 *
 * ПОЧЕМУ ГЕЙТ, А НЕ ДОГОВОРЁННОСТЬ. Возврат любой из половин НИЧЕГО не ломает:
 * компиляция проходит, тесты зелены, на русской машине разницы не видно вовсе.
 * Дефект виден только тому, у кого браузер не русский, — то есть не нам.
 *
 * ЧТО ИМЕННО ЗАПРЕЩЕНО: конструкторы `Intl` и семейство `toLocale*String` в
 * коде компонентов и примеров. Разрешённая дорога одна — `internal/intl.ts`,
 * который принимает локаль аргументом и потому не умеет взять её ниоткуда.
 */
const SRC = resolve(__dirname, '..')

/** Единственное место, где конструкторы `Intl` законны: там локаль — аргумент. */
const ALLOWED = ['internal/intl.ts']

/**
 * Утверждения РАЗНЫЕ у кода системы и у примеров, и это не поблажка.
 *
 * `components`, `internal`, `dictionary` — наш код, и там конструктор запрещён
 * совсем: `Heatmap` зовёт форматтер на каждый день года, а конструктор `Intl`
 * из дорогих. Дорога одна — `internal/intl.ts` с его кэшем.
 *
 * `examples` — образец кода ПОТРЕБИТЕЛЯ, и `internal/` ему недоступен: там
 * законно `new Intl.NumberFormat(locale, …)`, лишь бы `locale` пришла из
 * `useDsLocale()`, а не из литерала. Запретить ему конструктор значило бы
 * показывать в примере то, чего он повторить не может, — а пример сильнее
 * `CHANGELOG` именно потому, что его копируют дословно.
 */
const OWN_ROOTS = ['components', 'internal', 'dictionary']
const EXAMPLE_ROOTS = ['examples']

/** Вызовы, у которых первым аргументом идёт локаль. */
const CALLS = [
  { re: /\bnew\s+Intl\.DateTimeFormat\s*\(/g, what: 'new Intl.DateTimeFormat(' },
  { re: /\bnew\s+Intl\.NumberFormat\s*\(/g, what: 'new Intl.NumberFormat(' },
  { re: /\.toLocaleString\s*\(/g, what: '.toLocaleString(' },
  { re: /\.toLocaleDateString\s*\(/g, what: '.toLocaleDateString(' },
  { re: /\.toLocaleTimeString\s*\(/g, what: '.toLocaleTimeString(' },
]

/**
 * Первый аргумент вызова, обрезанный до запятой или до закрывающей скобки.
 * Разбирать выражение целиком незачем: предмет — ИСТОЧНИК локали, и его видно
 * по первому токену.
 */
function firstArg(src: string, openParen: number): string {
  let depth = 0
  for (let i = openParen; i < src.length; i++) {
    const c = src[i]!
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') {
      depth--
      if (depth === 0) return src.slice(openParen + 1, i).trim()
    } else if (c === ',' && depth === 1) return src.slice(openParen + 1, i).trim()
  }
  return src.slice(openParen + 1).trim()
}

/** Локаль, взятая НЕ у системы: литерал, `undefined`, либо её нет вовсе. */
function localeIsNotOurs(arg: string): string | null {
  if (arg === '') return 'локали нет вовсе — это локаль браузера, написанная умолчанием'
  if (arg === 'undefined') return '`undefined` — это локаль браузера, написанная так, будто мнения нет'
  if (/^['"`]/.test(arg)) return `прибитый литерал ${arg} — система становится одноязычной`
  return null
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...sourceFiles(p))
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue
    // Тесты и фикстуры — не код, который уезжает потребителю: фикстура
    // изображает ЕГО данные, и прибитая локаль в ней иногда и есть предмет
    // случая. Проверять их этим гейтом значило бы запрещать стенду показывать
    // то, ради чего он существует.
    if (/\.test\.|\.fixture\./.test(entry.name)) continue
    out.push(p)
  }
  return out
}

/** Адрес нарушения — строка, а не только файл: адрес дороже утверждения. */
function at(src: string, index: number): number {
  return src.slice(0, index).split('\n').length
}

describe('date-locale', () => {
  it('код системы форматирует только через internal/intl.ts', () => {
    const offenders: string[] = []
    for (const root of OWN_ROOTS) {
      for (const file of sourceFiles(join(SRC, root))) {
        const rel = relative(SRC, file).split('\\').join('/')
        if (ALLOWED.includes(rel)) continue
        const src = readFileSync(file, 'utf8')
        for (const { re, what } of CALLS) {
          for (const m of src.matchAll(re)) {
            offenders.push(
              `${rel}:${at(src, m.index)} — ${what} — зовите dateFormat/numberFormat из internal/intl.js: `
              + 'там локаль аргумент, и там кэш, без которого конструктор Intl платится в каждой ячейке',
            )
          }
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('пример берёт локаль у системы, а не у литерала и не у браузера', () => {
    const offenders: string[] = []
    for (const root of EXAMPLE_ROOTS) {
      for (const file of sourceFiles(join(SRC, root))) {
        const rel = relative(SRC, file).split('\\').join('/')
        const src = readFileSync(file, 'utf8')
        for (const { re, what } of CALLS) {
          for (const m of src.matchAll(re)) {
            const open = m.index + m[0].length - 1
            const complaint = localeIsNotOurs(firstArg(src, open))
            if (complaint) {
              offenders.push(`${rel}:${at(src, m.index)} — ${what} — ${complaint}; берите useDsLocale()`)
            }
          }
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  /**
   * Вторая половина утверждения, и без неё первая ничего не стоит: запретить
   * вызовы легко и молча — достаточно перестать форматировать вовсе.
   *
   * Проверяется, что дорога, оставленная открытой, ДЕЙСТВИТЕЛЬНО ведёт к
   * контексту: `internal/intl.ts` не смеет брать локаль сам, у него её обязаны
   * спросить.
   */
  it('internal/intl.ts не знает локали по умолчанию', () => {
    const src = readFileSync(join(SRC, 'internal/intl.ts'), 'utf8')
    expect(src).not.toMatch(/['"][a-z]{2}-[A-Z]{2}['"]/)
    expect(src).not.toMatch(/navigator\.language/)
    // `undefined` первым аргументом — это и есть «локаль браузера», написанная
    // так, что выглядит отсутствием мнения.
    expect(src).not.toMatch(/Intl\.(DateTime|Number)Format\s*\(\s*undefined/)
  })
})
