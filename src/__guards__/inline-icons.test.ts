import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

/**
 * Глиф, который система уже экспортирует, компонент не рисует заново.
 *
 * `Accordion` держал свой `<svg>` с путём `m6 9 6 6 6-6` — тем самым, что
 * отдаёт `icons/glyphs.tsx` как `ChevronDown`. Копия совпадала до последней
 * цифры, поэтому и была невидима: расходиться ей предстояло в тот день, когда
 * кто-нибудь поправит толщину линии или скругление в общем глифе — и один
 * шеврон в системе останется прежним.
 *
 * Проверка сравнивает пути, а не имена компонентов: `<svg>` с чужой геометрией
 * (домик у `FormTabs`) — законный собственный глиф, и трогать его незачем.
 */
const SRC = resolve(__dirname, '..')

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...tsxFiles(p))
    else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) out.push(p)
  }
  return out
}

/** Пути `d="…"` с нормализованными пробелами. */
const paths = (src: string) => [...src.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]!.trim().replace(/\s+/g, ' '))

/**
 * Подпись глифа: ВСЯ его геометрия, а не только пути.
 *
 * Первая редакция сравнивала `d="…"` и потому не видела ни одного глифа,
 * нарисованного примитивами. Лупа `SearchBar` (`<circle>` плюс `<line>`) была
 * невидима гейту не по недосмотру, а по устройству проверки — и это дыра
 * общего вида, а не частный случай лупы (DS-119).
 *
 * Числа нормализуются: `7.50` и `7.5` — одна и та же окружность, а `.5` без
 * ведущего нуля законно в SVG.
 */
const num = (v: string) => String(Number(v))

function geometry(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(/\bd="([^"]+)"/g)) out.push(`path:${m[1]!.trim().replace(/\s+/g, ' ')}`)
  for (const m of src.matchAll(/<circle\b([^>]*)>/g)) {
    const a = attrs(m[1]!)
    if (a.cx && a.cy && a.r) out.push(`circle:${num(a.cx)},${num(a.cy)},${num(a.r)}`)
  }
  for (const m of src.matchAll(/<line\b([^>]*)>/g)) {
    const a = attrs(m[1]!)
    if (a.x1 && a.y1 && a.x2 && a.y2) out.push(`line:${num(a.x1)},${num(a.y1)},${num(a.x2)},${num(a.y2)}`)
  }
  for (const m of src.matchAll(/<rect\b([^>]*)>/g)) {
    const a = attrs(m[1]!)
    if (a.x && a.y && a.width && a.height) out.push(`rect:${num(a.x)},${num(a.y)},${num(a.width)},${num(a.height)}`)
  }
  return out.sort()
}

function attrs(chunk: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of chunk.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) out[m[1]!] = m[2]!
  return out
}

/** Каждый `<svg>…</svg>` файла — один кандидат в глифы. */
const svgBlocks = (src: string) => [...src.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map((m) => m[0])

describe('inline icons', () => {
  it('ни один компонент не перерисовывает путь, который экспортирует icons/glyphs', () => {
    const shared = new Map<string, string>()
    const icons = readFileSync(join(SRC, 'icons/glyphs.tsx'), 'utf8')
    for (const m of icons.matchAll(/export const (\w+) = [\s\S]*?\bd="([^"]+)"/g)) {
      shared.set(m[2]!.trim().replace(/\s+/g, ' '), m[1]!)
    }

    const offenders: string[] = []
    for (const f of tsxFiles(join(SRC, 'components'))) {
      for (const d of paths(readFileSync(f, 'utf8'))) {
        const name = shared.get(d)
        if (name) offenders.push(`${relative(SRC, f)}: путь "${d}" — это ${name} из icons/glyphs`)
      }
    }
    // Счётчик: пустая карта глифов даёт такой же зелёный результат.
    expect(shared.size, 'в icons/glyphs не нашлось ни одного пути — сверять было не с чем').toBeGreaterThan(3)
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('и ни одну ЦЕЛИКОМ — включая нарисованные примитивами', () => {
    // Глиф из `<circle>` и `<line>` путей не имеет вовсе, поэтому проверка выше
    // его не видит. Сравнивается вся геометрия одного `<svg>` разом.
    const icons = readFileSync(join(SRC, 'icons/glyphs.tsx'), 'utf8')
    const shared = new Map<string, string>()
    const decls = [...icons.matchAll(/export const (\w+) = /g)]
    for (let i = 0; i < decls.length; i++) {
      const from = decls[i]!.index!
      const to = i + 1 < decls.length ? decls[i + 1]!.index! : icons.length
      const sig = geometry(icons.slice(from, to)).join('|')
      if (sig) shared.set(sig, decls[i]![1]!)
    }
    expect(shared.size, 'подписей глифов меньше пяти — сверять почти не с чем').toBeGreaterThanOrEqual(5)
    // Глиф из примитивов в наборе есть — иначе расширение проверки бессмысленно.
    expect([...shared.keys()].some((k) => k.startsWith('circle:')), 'ни одного глифа из примитивов').toBe(true)

    const offenders: string[] = []
    for (const f of tsxFiles(join(SRC, 'components'))) {
      for (const block of svgBlocks(readFileSync(f, 'utf8'))) {
        const name = shared.get(geometry(block).join('|'))
        if (name) offenders.push(`${relative(SRC, f)}: свой <svg> совпал с ${name} из icons/glyphs`)
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('и проверка умеет находить нарушение — но не трогает чужую геометрию', () => {
    // Утверждения выше верны и для разбора, который ничего не разбирает.
    const glyph = '<svg><circle cx="10.5" cy="10.5" r="7.5" /><line x1="16.5" y1="16.5" x2="21.75" y2="21.75" /></svg>'
    const same = '<svg><line x1="16.50" y1="16.5" x2="21.75" y2="21.75" /><circle cx="10.5" cy="10.5" r="7.50" /></svg>'
    // Порядок примитивов и запись чисел не считаются отличием.
    expect(geometry(glyph).join('|')).toBe(geometry(same).join('|'))
    // Домик `FormTabs` — законный собственный глиф, его геометрия другая.
    const house = '<svg><path d="M3 12l9-9 9 9" /></svg>'
    expect(geometry(house).join('|')).not.toBe(geometry(glyph).join('|'))
    expect(svgBlocks(`a${glyph}b${house}c`)).toHaveLength(2)
  })
})

/**
 * Шеврон раскрытия компонент не рисует ТЕКСТОМ.
 *
 * Проверка выше сравнивает геометрию и потому весь текстовый класс пропускает:
 * у символа `▸` пути нет. А расходится он сильнее нарисованного — `▸` рисует
 * ШРИФТ, а не мы: вес, посадка по базовой линии и оптический центр меняются
 * вместе со шрифтом, и держать вид знака, который ты не рисуешь, нельзя в
 * принципе. Восемь разошедшихся исполнений в шести компонентах (DS-144)
 * появились именно так, а не по небрежности.
 *
 * Ищется и в `.tsx`, и в `.css`: у `LedgerList` каретка жила в
 * `content: "▸"`, то есть проверка одного только JSX оставила бы половину
 * класса без присмотра.
 *
 * `‹ › « »` в список НЕ входят и входить не могут: это навигация (`Pagination`,
 * `Calendar`, `LogViewer`) и кавычки. Список — знаки РАСКРЫТИЯ.
 */
const CARET_GLYPHS = [...'▸▾▴◂►▼◄◀▶⌄⌃']

/**
 * `Stat` — единственное исключение, и оно здесь названо целиком.
 *
 * `▲▼` у него кодируют направление дельты (выросло/упало), а не раскрытие.
 * Другой смысл — другой знак; заменять его шевроном значило бы сказать
 * «эта строка раскрывается» там, где ничего не раскрывается.
 */
const TEXT_GLYPH_ALLOWED = new Map([['components/Stat/Stat.tsx', 'направление дельты, не раскрытие']])

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(p))
    else if (/\.(tsx|css)$/.test(entry.name) && !entry.name.includes('.test.')) out.push(p)
  }
  return out
}

/** Знаки раскрытия, найденные в исходнике, без повторов. */
const textCarets = (src: string) => [...new Set([...src].filter((ch) => CARET_GLYPHS.includes(ch)))]

describe('шеврон раскрытия', () => {
  it('ни один компонент не рисует его текстовым символом', () => {
    const offenders: string[] = []
    for (const f of sourceFiles(join(SRC, 'components'))) {
      const rel = relative(SRC, f)
      if (TEXT_GLYPH_ALLOWED.has(rel)) continue
      const found = textCarets(readFileSync(f, 'utf8'))
      if (found.length) offenders.push(`${rel}: ${found.join(' ')} — знак раскрытия рисует шрифт; возьмите Caret из internal/caret`)
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('исключение осталось ровно одно и оно на месте', () => {
    // Список исключений, разросшийся молча, снимает проверку целиком: каждый
    // следующий компонент проще внести сюда, чем поправить.
    expect([...TEXT_GLYPH_ALLOWED.keys()]).toEqual(['components/Stat/Stat.tsx'])
    // И файл исключения ещё существует — иначе проверка стережёт пустоту.
    expect(textCarets(readFileSync(join(SRC, 'components/Stat/Stat.tsx'), 'utf8'))).toContain('▼')
  })

  it('и проверка умеет находить нарушение', () => {
    // Утверждение выше верно и для разбора, который ничего не находит.
    expect(textCarets('<span>{open ? \'▾\' : \'▸\'}</span>')).toEqual(['▾', '▸'])
    expect(textCarets('content: "⌄";')).toEqual(['⌄'])
    // Навигационные стрелки и кавычки — не знаки раскрытия.
    expect(textCarets('<button>‹</button><button>›</button> «Ozon»')).toEqual([])
  })
})
