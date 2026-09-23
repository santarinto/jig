import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

/**
 * КЕГЛЬ ТЕКСТА БЕРЁТСЯ ИЗ ШКАЛЫ РАЗМЕРОВ, а не пишется величиной (DS-294).
 *
 * У системы объявлены ступени `--ds-fs-*`, и на момент заведения гейта ПЯТЬ
 * правил стояли мимо них литералом: подписи осей `BarChart` (две), подпись
 * `LineChart`, стрелка сортировки `DataTable` — все `calc(0.625rem * scale)`,
 * то есть 10px, ниже прежнего пола `--ds-fs-xs` в 11px, — и стрелка тренда
 * `Stat` на `calc(0.5625rem * scale)`, 9px, о которой не знала даже задача.
 * (История на свою дату: DS-375 убрала ступени 10 и 11px из шкалы
 * целиком — `--ds-fs-2xs` и `--ds-fs-xs` больше не существуют, сегодняшний
 * пол шкалы — `--ds-fs-sm`, 12px.)
 *
 * Прежние гейты этого не видели ПО ПОСТРОЕНИЮ, и это стоит сказать вслух:
 * `rem-units` смотрит, едет ли размер со шкалой, — а эти ехали. Они ехали от
 * НЕВЕРНОГО ОСНОВАНИЯ, и такой дефект не отличается от здорового кода ничем,
 * кроме знания о шкале. Согласованность четырёх мест держалась совпадением
 * числа: первая же правка одного из них разошлась бы молча.
 *
 * ЧТО ЗАПРЕЩЕНО — АБСОЛЮТНАЯ величина, а не всякая. `em` и `%` это ОТНОШЕНИЕ к
 * контексту: `.ds-prose code` на `0.9em` обязан следовать за своим абзацем, а
 * не за ступенью шкалы, и токен сломал бы ровно то, ради чего он там написан.
 * Это разделение по предмету, а не список исключений: ступень отвечает на
 * вопрос «какой кегль», отношение — на вопрос «во сколько раз мельче соседа».
 *
 * ОБЛАСТЬ — `src`, и `workbench` в неё не входит НАМЕРЕННО: хром инструмента
 * объявляет свой `--wbf-fs` и не едет за `--ds-ui-scale` вовсе (довод в шапке
 * `workbench/frame.css`) — судить его этой шкалой значило бы требовать, чтобы
 * служебная подпись росла вместе с предметом, который она комментирует.
 */
const ROOT = resolve(__dirname, '../..')

/** Абсолютные единицы кегля. `em`, `%` и `inherit` сюда не входят — они отношения. */
const ABSOLUTE = /\b\d*\.?\d+(?:rem|px|pt|pc|in|cm|mm|q|vw|vh|vmin|vmax)\b/i

/** Комментарии — пробелами, переносы сохранены: номера строк не съезжают. */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

export interface FontSizeDecl { line: number; value: string }

/** Все объявления `font-size` файла, вне комментариев. */
export function fontSizeDecls(css: string): FontSizeDecl[] {
  const out: FontSizeDecl[] = []
  stripCssComments(css).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/font-size\s*:\s*([^;}]+)/gi)) {
      out.push({ line: i + 1, value: m[1].trim() })
    }
  })
  return out
}

/** Нарушение — абсолютная величина, не пришедшая из ступени `--ds-fs-*`. */
export function offends(value: string): boolean {
  if (/var\(\s*--ds-fs-[a-z0-9-]+/i.test(value)) return false
  return ABSOLUTE.test(value)
}

function collectCss(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectCss(p))
    else if (entry.name.endsWith('.css')) out.push(p)
  }
  return out
}

const FILES = collectCss(resolve(ROOT, 'src'))

describe('кегль текста — только из ступеней --ds-fs-*', () => {
  // САНИТАР ОБХОДА: пустой список файлов или сломанный разбор дают зелёный,
  // неотличимый от чистого кода. Числа не прибиты — они двигаются каждой
  // второй задачей; прибит только факт «мерить было что».
  it('обход не пуст: листы найдены и объявления в них разобраны', () => {
    expect(FILES.length).toBeGreaterThan(20)
    const total = FILES.reduce((n, f) => n + fontSizeDecls(readFileSync(f, 'utf8')).length, 0)
    expect(total).toBeGreaterThan(100)
  })

  it('ни одно правило не задаёт кегль абсолютной величиной', () => {
    const bad: string[] = []
    for (const f of FILES) {
      for (const d of fontSizeDecls(readFileSync(f, 'utf8'))) {
        if (offends(d.value)) bad.push(`${relative(ROOT, f)}:${d.line} — font-size: ${d.value}`)
      }
    }
    expect(
      bad,
      'кегль мимо ступеней --ds-fs-*: величина едет со шкалой, но от неверного основания, '
      + 'и от здорового кода отличается только знанием о шкале. Заведите ступень или '
      + 'выразите отношением (em), если размер считается от соседа:\n' + bad.join('\n'),
    ).toEqual([])
  })

  it('правило про КЕГЛЬ, а не про литерал: те же величины в width и padding не трогаются', () => {
    // Иначе гейт был бы про другое, а зелёным выглядел бы так же.
    const css = '.a { width: calc(0.625rem * var(--ds-ui-scale)); padding: 10px; border-radius: 0.5rem }'
    expect(fontSizeDecls(css)).toEqual([])
  })

  it('ловит и `calc(...)`, и голый `rem`, и `px`', () => {
    expect(offends('calc(0.625rem * var(--ds-ui-scale))')).toBe(true)
    expect(offends('0.625rem')).toBe(true)
    expect(offends('10px')).toBe(true)
  })

  it('отношение к контексту — не нарушение: `em`, `%`, `inherit`', () => {
    expect(offends('0.9em')).toBe(false)
    expect(offends('75%')).toBe(false)
    expect(offends('inherit')).toBe(false)
  })

  it('ступень проходит, любая', () => {
    // Запасное значение у токена системы НЕ проверяется здесь и не может быть
    // проверено: его запрещает `token-exists` («фолбэк не ставится на токен
    // системы»), и фикстура с ним уронила бы тот гейт — он читает и этот файл.
    expect(offends('var(--ds-fs-sm)')).toBe(false)
    expect(offends('var(--ds-fs-lg)')).toBe(false)
  })

  it('закомментированный кегль не считается объявлением', () => {
    // В листах `font-size` не раз упомянут в доводах — разбор по тексту без
    // снятия комментариев краснел бы на объяснении, а не на правиле.
    const css = '/* font-size: 10px — так было */\n.a { font-size: var(--ds-fs-sm) }'
    expect(fontSizeDecls(css).map((d) => d.value)).toEqual(['var(--ds-fs-sm)'])
  })
})
