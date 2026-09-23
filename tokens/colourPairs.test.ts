import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { parseThemeTokens } from './colour-science.js'
import {
  FOREGROUNDS,
  NOT_A_SURFACE,
  NOT_PROMISED,
  SURFACES,
  THEMES,
  THEME_SELECTOR,
  brokenPromises,
  pairsFor,
  type Pair,
} from './colourPairs.js'

/**
 * ГЕЙТ СОЧЕТАЕМОСТИ (DS-181): матрица «передний план × поверхность × тема»
 * строится целиком и объявленные пары берут свой пол.
 *
 * ЧЕГО ЗДЕСЬ НЕ БЫЛО ДО ЭТОЙ ЗАДАЧИ. Контраст в системе мерили в трёх местах и
 * все три — по образцам: `color-mix-contrast` обходит каждый `color-mix` в
 * листах, `badgeTintContrast` держит восемь пар бейджа, `measure` смотрит на
 * видимые пиксели превью. Общее у них то, что проверяется ВСТРЕТИВШЕЕСЯ. Пара,
 * которую никто не написал, но которую напишут завтра, не проверялась нигде, и
 * ответа на вопрос «а можно ли так» в системе не было — его каждый раз выводили
 * заново из `docs/contrast-report.md`, где числа уже разошлись с токенами.
 *
 * ПОЧЕМУ ПОЛНОТА — ОТДЕЛЬНОЕ УТВЕРЖДЕНИЕ, а не следствие цикла. Сузить обход до
 * «пар, встречающихся в превью» — правка в одну строку, и после неё гейт
 * останется зелёным, проверяя вчетверо меньше. Ровно способ №3 из
 * `docs/writing-checks.md`: проверка, которая проверяет сама себя.
 */

const ROOT = resolve(__dirname, '..')
const css = readFileSync(join(ROOT, 'tokens', 'tokens.css'), 'utf8')

const VALUES = Object.fromEntries(
  THEMES.map((t) => [t, parseThemeTokens(css, THEME_SELECTOR[t])]),
) as Record<(typeof THEMES)[number], Map<string, string>>

const ALL: Pair[] = THEMES.flatMap((t) => pairsFor(t, VALUES[t]))

// ------------------------------------------------------- что стоит в листах

/** Все `.css` компонентов и общих стилей — источник для проверки полноты словарей. */
function componentSheets(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === '__guards__' || e.name === '__smoke__') continue
        walk(p)
      } else if (e.name.endsWith('.css')) out.push(readFileSync(p, 'utf8'))
    }
  }
  walk(join(ROOT, 'src'))
  return out
}

const SHEETS = componentSheets().join('\n')

/** Токены `:root`, которые вообще существуют — чтобы не требовать словаря от локальных `--ds-tone` компонента. */
const ROOT_TOKENS = new Set(VALUES.light.keys())

const usedAs = (re: RegExp): string[] => {
  const names = new Set<string>()
  for (const m of SHEETS.matchAll(re)) names.add(m[1])
  return [...names].filter((n) => ROOT_TOKENS.has(n)).sort()
}

const USED_AS_COLOUR = usedAs(/(?:^|[^-\w])color:\s*var\(--ds-([a-z0-9-]+)\)/g)
const USED_AS_BACKGROUND = usedAs(/background(?:-color)?:\s*var\(--ds-([a-z0-9-]+)\)/g)

// -------------------------------------------------------------------- гейт

describe('матрица сочетаемости: передний план × поверхность', () => {
  const fgNames = new Set(FOREGROUNDS.map((f) => f.token))
  const bgNames = new Set(SURFACES.map((s) => s.token))

  it('строится ЦЕЛИКОМ: пар ровно столько, сколько произведение словарей', () => {
    // Полнота, а не выборка. Число не прибито: оно считается из тех же списков,
    // из которых строится матрица, — прибитое устарело бы при первом пополнении.
    expect(ALL).toHaveLength(FOREGROUNDS.length * SURFACES.length * THEMES.length)
    // Обратная мутация: пустые словари дали бы 0 === 0 и зелёный результат.
    expect(FOREGROUNDS.length, 'словарь передних планов пуст').toBeGreaterThan(15)
    expect(SURFACES.length, 'словарь поверхностей пуст').toBeGreaterThan(10)
    // Ни одной повторённой пары — иначе «полнота» набирается дублями.
    const keys = new Set(ALL.map((p) => `${p.theme}/${p.fg}/${p.bg}`))
    expect(keys.size).toBe(ALL.length)
  })

  it('каждая ОБЪЯВЛЕННАЯ пара берёт свой пол', () => {
    const broken = brokenPromises(ALL).map(
      (p) =>
        `${p.theme}: --ds-${p.fg} (${p.fgHex}) на --ds-${p.bg} (${p.bgHex}) — ` +
        `${p.ratio.toFixed(2)} при поле ${p.floor}`,
    )
    expect(
      broken,
      broken.join('\n') +
        '\n\nПара объявлена законной в tokens/colourPairs.ts и не держит пол. ' +
        'Лечится либо значением токена, либо снятием пары из объявления — но тогда ' +
        'в `why` обязано быть сказано, что берут вместо неё.',
    ).toEqual([])
  })

  it('состояние `unintended` не пустое — иначе объявлено всё и различать нечего', () => {
    // Позитивный контроль против самого дешёвого способа сделать гейт зелёным:
    // объявить каждую пару законной. Тогда «не предназначена» перестанет
    // существовать как состояние, а именно оно и есть предмет задачи.
    const unintended = ALL.filter((p) => p.state === 'unintended')
    expect(unintended.length).toBeGreaterThan(100)
    const legal = ALL.filter((p) => p.state === 'legal')
    expect(legal.length).toBeGreaterThan(50)
    // И три состояния действительно ТРИ, а не два с пустым третьим.
    expect(new Set(ALL.map((p) => p.state))).toEqual(new Set(['legal', 'unintended', 'fail']))
  })

  it('у каждого переднего плана названа земля, на которой он законен', () => {
    const orphans = FOREGROUNDS.filter(
      (f) =>
        f.on.length === 0 &&
        (f.onLightOnly ?? []).length === 0 &&
        (f.onDarkOnly ?? []).length === 0 &&
        f.onMix == null,
    ).map((f) => `--ds-${f.token}`)
    expect(
      orphans,
      `${orphans.join(', ')}: токен, о котором не сказано, где он законен, — это токен, ` +
        'который поставят куда угодно',
    ).toEqual([])
  })

  it('у каждой поверхности есть хотя бы один законный передний план', () => {
    const bare = SURFACES.filter(
      (s) => !ALL.some((p) => p.bg === s.token && p.state === 'legal'),
    ).map((s) => `--ds-${s.token}`)
    expect(
      bare,
      `${bare.join(', ')}: поверхность, на которой не законен ни один передний план, — ` +
        'либо не поверхность (тогда ей место в NOT_A_SURFACE), либо дыра в объявлении',
    ).toEqual([])
  })

  it('каждая объявленная поверхность и земля существуют в словаре', () => {
    const unknown: string[] = []
    for (const f of FOREGROUNDS) {
      for (const b of [...f.on, ...(f.onLightOnly ?? []), ...(f.onDarkOnly ?? [])]) {
        if (!bgNames.has(b)) unknown.push(`--ds-${f.token} объявлен на --ds-${b}, которого нет в SURFACES`)
      }
    }
    expect(unknown, unknown.join('\n')).toEqual([])
  })

  /**
   * СЛОВАРИ ПОЛНЫ ПО ОТНОШЕНИЮ К КОДУ. Без этого матрица может быть безупречной
   * и при этом не про систему: достаточно не вписать в неё токен, и он молча
   * останется вне всякой проверки. Проверяется механически, по листам, а не по
   * памяти.
   */
  it('каждый цветовой токен, стоящий в листах текстом, есть в словаре переднего плана', () => {
    const missing = USED_AS_COLOUR.filter((t) => !fgNames.has(t)).map((t) => `--ds-${t}`)
    expect(
      missing,
      `${missing.join(', ')} стоит в компоненте как color: и не объявлен в FOREGROUNDS — ` +
        'то есть про него нигде не сказано, на какой поверхности он законен',
    ).toEqual([])
    // Счётчик против пустого обхода: листы прочитаны и в них что-то нашлось.
    expect(USED_AS_COLOUR.length, 'ни одного color: var(--ds-…) в листах — обход пуст').toBeGreaterThan(10)
  })

  it('каждый цветовой токен, стоящий в листах фоном, объявлен поверхностью или названа причина, почему нет', () => {
    const known = new Set([...bgNames, ...NOT_A_SURFACE.map((s) => s.token)])
    const missing = USED_AS_BACKGROUND.filter((t) => !known.has(t)).map((t) => `--ds-${t}`)
    expect(
      missing,
      `${missing.join(', ')} стоит фоном и не назван ни поверхностью, ни исключением. ` +
        'Молчание тут читается как «поверхность проверена», а она не проверена вовсе',
    ).toEqual([])
    expect(USED_AS_BACKGROUND.length).toBeGreaterThan(10)
    // Списки не пересекаются: токен не может быть одновременно поверхностью и не-поверхностью.
    const both = NOT_A_SURFACE.filter((s) => bgNames.has(s.token)).map((s) => s.token)
    expect(both, `${both.join(', ')} объявлен и поверхностью, и исключением`).toEqual([])
    // И у каждого исключения есть причина, а не пустая строка.
    for (const s of NOT_A_SURFACE) expect(s.why.length, `--ds-${s.token} без причины`).toBeGreaterThan(30)
  })

  /**
   * САНИТАР: гейт обязан КРАСНЕТЬ. Пары «объявлена и провалилась» сегодня нет
   * ни одной, поэтому проверка выше зелена — и была бы зелена и на сломанной
   * машинке. Мутация делает дефект руками и требует, чтобы он нашёлся И был
   * НАЗВАН: сообщение без имени пары бесполезно ровно тогда, когда нужно.
   */
  it('находит подложенный дефект и называет пару', () => {
    const sabotaged = new Map(VALUES.light)
    sabotaged.set('surface', sabotaged.get('bg-app')!) // белая поверхность потемнела до фона приложения
    sabotaged.set('text-faint', '#909090') // и слабый текст уехал вверх
    const broken = brokenPromises(pairsFor('light', sabotaged))
    expect(broken.length, 'подмена --ds-text-faint обязана быть найдена').toBeGreaterThan(0)
    const named = broken.map((p) => `${p.fg}/${p.bg}`)
    expect(named).toContain('text-faint/surface')
    // и обратная сторона: на неиспорченных значениях дефекта нет
    expect(brokenPromises(pairsFor('light', VALUES.light))).toEqual([])
  })

  it('различает «пара проходит» и «пара не проходит», а не отвечает одно и то же', () => {
    const white = new Map(VALUES.light)
    white.set('text-primary', '#FFFFFF') // белый на белой поверхности
    const p = pairsFor('light', white).find((x) => x.fg === 'text-primary' && x.bg === 'surface')!
    expect(p.ratio).toBeCloseTo(1, 2)
    expect(p.state).toBe('fail')
    const ok = ALL.find((x) => x.theme === 'light' && x.fg === 'text-primary' && x.bg === 'surface')!
    expect(ok.state).toBe('legal')
  })

  it('матрица говорит о своих границах, а не только о числах', () => {
    expect(NOT_PROMISED.length).toBeGreaterThanOrEqual(5)
    const text = NOT_PROMISED.join(' ')
    // Полоска в 2 px — та граница, из-за которой DS-157 нашли глазами,
    // а не проверкой. Матрица, молчащая о ней, обещает больше, чем может.
    expect(text).toMatch(/полоск/i)
    expect(text).toMatch(/второй носитель/i)
    expect(text).toMatch(/DS-157/)
    for (const line of NOT_PROMISED) expect(line.length).toBeGreaterThan(60)
  })
})
