import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

const SRC = resolve(__dirname, '..')
const COMPONENTS = join(SRC, 'components')

function collect(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collect(p))
    else if (/\.tsx?$/.test(entry.name)
      && !/\.test\.|\.fixture\.|\.test-fixtures\./.test(entry.name)) out.push(p)
  }
  return out
}

/**
 * Комментарии вырезаются: предмет гейта — то, что компонент ПРОИЗНОСИТ, а не
 * то, что он объясняет. Комментарии в этом репозитории русские и длинные по
 * решению, и запрет на кириллицу в них запрещал бы ровно то, ради чего они
 * пишутся.
 *
 * Заменяется комментарий НЕ пробелом, а собой же с сохранёнными переводами
 * строк (DS-189). Этот гейт печатает адрес `файл:строка` и считает номер
 * по УЖЕ вычищенному тексту, поэтому схлопнутая шапка уводила его ровно на своё
 * число строк, а вместе с номером — и напечатанный текст строки: после склейки
 * это уже не та строка, что в файле. Шапка есть почти у каждого файла в дереве,
 * то есть врал почти каждый адрес. По номеру строки работают ещё и разрешения
 * (`devMessageLines`, `localeDataLines`) — они считаются по тому же тексту и
 * потому были согласованы сами с собой и с неверным ответом.
 */
const blankKeepingLines = (m: string) => m.replace(/[^\n]/g, ' ')

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, blankKeepingLines).replace(/(^|[^:])\/\/.*$/gm, '$1')

const CYRILLIC = /[А-Яа-яЁё]/

/**
 * Сообщения РАЗРАБОТЧИКУ — не текст интерфейса. Их читают в консоли, они несут
 * коды задач и имена пропов, и перевод сделал бы их хуже (DS-139).
 *
 * Область считается по балансу скобок от `throw new Error(` / `console.warn(`,
 * а не по строке: сообщения здесь склеены из нескольких строк, и построчная
 * проверка объявила бы нарушением каждое продолжение — то есть заставила бы
 * дописывать исключения по одному на строку.
 */
function devMessageLines(src: string): Set<number> {
  const lines = src.split('\n')
  const out = new Set<number>()
  let depth = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (depth === 0 && !/\b(?:throw new \w*Error|console\.(?:warn|error|log))\s*\(/.test(line)) continue
    out.add(i)
    for (const ch of line.slice(depth === 0 ? line.search(/\b(?:throw|console)\b/) : 0)) {
      if (ch === '(') depth++
      else if (ch === ')') depth--
    }
    if (depth <= 0) depth = 0
  }
  return out
}

/**
 * Данные локали — не формулировка интерфейса, и в словарь они не идут.
 *
 * СЕЙЧАС ЭТОТ СПИСОК ПУСТ, и это результат, а не недосмотр (DS-184).
 * Единственным жильцом был `Calendar` со своими `WEEKDAYS`, `MONTHS` и
 * `DAY_NAME` — двенадцать русских названий, набранных руками. Довод «`Intl`
 * сделает это сам» стоял прямо здесь, в этом докблоке, и всё же таблицы жили в
 * файле: они пережили бы смену локали молча — подпись дня поехала бы за `Intl`,
 * а шапка и селект остались бы русскими.
 *
 * Механизм оставлен НАРОЧНО, при пустом списке. Данные локали в коде
 * компонента законны в принципе (список падежей, порядок дней), и следующему,
 * кому они понадобятся, нужен способ их объявить, а не соблазн выключить гейт.
 * Разрешение выдаётся ИМЕНАМ КОНСТАНТ, а не файлу: новая русская строка в том
 * же файле обязана падать.
 */
const LOCALE_DATA: Record<string, string[]> = {}

const rel = (file: string) => file.slice(COMPONENTS.length + 1).split('\\').join('/')

/**
 * Разрешение накрывает ОБЪЯВЛЕНИЕ целиком, а не строку с именем: `MONTHS`
 * записан в две строки, и во второй имени нет. Строчное разрешение объявило бы
 * продолжение нарушением — то есть заставило бы разложить массив в одну
 * длинную строку ради гейта.
 */
function localeDataLines(src: string, names: string[]): Set<number> {
  const lines = src.split('\n')
  const out = new Set<number>()
  for (const name of names) {
    let depth = 0
    let open = false
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      if (!open && !new RegExp(`\\b(?:const|let)\\s+${name}\\b`).test(line)) continue
      open = true
      out.add(i)
      for (const ch of line) {
        if (ch === '(' || ch === '[' || ch === '{') depth++
        else if (ch === ')' || ch === ']' || ch === '}') depth--
      }
      if (depth <= 0) { open = false; depth = 0; break }
    }
  }
  return out
}

describe('гейт: компонент не произносит русский текст мимо словаря', () => {
  const files = collect(COMPONENTS)

  it('в исходниках компонентов не осталось литеральной кириллицы', () => {
    const offenders: string[] = []
    for (const file of files) {
      const src = stripComments(readFileSync(file, 'utf8'))
      const dev = devMessageLines(src)
      const locale = localeDataLines(src, LOCALE_DATA[rel(file)] ?? [])
      src.split('\n').forEach((line, i) => {
        if (!CYRILLIC.test(line)) return
        if (dev.has(i)) return
        if (locale.has(i)) return
        offenders.push(`${rel(file)}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(offenders, `текст в словарь: src/dictionary/text.ts\n${offenders.join('\n')}`).toEqual([])
  })

  it('разрешение на данные локали не разрослось и указывает на живые константы', () => {
    for (const [file, names] of Object.entries(LOCALE_DATA)) {
      const src = readFileSync(join(COMPONENTS, file), 'utf8')
      for (const n of names) {
        expect(src, `${file}: разрешение на ${n} пережило саму константу`).toContain(`${n} =`)
      }
    }
    // Число, а не «не пусто»: разрешение обязано быть событием, которое кто-то
    // заметил, а не списком, куда дописывают. С DS-184 оно НОЛЬ — таблицы
    // месяцев и дней недели у `Calendar` заменены вызовом `Intl`, и жильцов не
    // осталось. Новый вход обязан уронить эту строку и потребовать довода.
    expect(Object.keys(LOCALE_DATA)).toHaveLength(0)
  })

  /**
   * DS-189. Гейт печатает `файл:строка`, и номер считается по вычищенному
   * тексту — значит вычистка обязана сохранять переводы строк. Проверяется
   * РАЗЛИЧЕНИЕМ: один и тот же текст с шапкой и без обязан дать разные номера,
   * оба верные. Файл без комментария даёт верный ответ и со сломанной вычисткой,
   * поэтому в одиночку не доказывает ничего.
   */
  it('адрес нарушения не уезжает на длину блочного комментария', () => {
    const addr = (src: string) => {
      const s = stripComments(src)
      const out: string[] = []
      s.split('\n').forEach((line, i) => {
        if (CYRILLIC.test(line)) out.push(`${i + 1}: ${line.trim()}`)
      })
      return out
    }

    const head = ['/**', ' * шапка файла', ' * на четыре', ' * строки', ' */'].join('\n')
    const body = ['const a = 1', 'const t = "Отмена"'].join('\n')

    // 5 строк шапки + 2 строки тела → нарушение на 7-й.
    expect(addr(`${head}\n${body}`)).toEqual(['7: const t = "Отмена"'])
    // Тот же текст без шапки — на 2-й: меряется строка, а не константа.
    expect(addr(body)).toEqual(['2: const t = "Отмена"'])
    // И текст в напечатанной строке — та самая строка, а не склейка соседних.
    expect(addr(['/* пояснение */', 'const t = "Отмена"'].join('\n'))).toEqual([
      '2: const t = "Отмена"',
    ])
  })
})
