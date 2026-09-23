import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { VIEWING, deltaE, parseThemeTokens, simulate, worstDeltaE } from './colour-science.js'
import {
  TINT_IS_NOT_A_CARRIER,
  TONES,
  TONE_JND,
  THEMES,
  THEME_SELECTOR,
  toneColour,
  tonePairs,
  type ToneCarrier,
} from './colourPairs.js'

/**
 * РАЗЛИЧИМОСТЬ ТОНОВ (DS-181, вторая дыра).
 *
 * Метод палитры серий — CAM16-UCS по всем парам и четырём зрениям — существует
 * в системе с DS-122 и к СЛОВАРЮ ТОНОВ не применялся ни разу. Между тем
 * именно тоны несут смысл в интерфейсе: `success` против `warning` в списке
 * уведомлений решает больше, чем две серии на графике.
 *
 * ЧТО ЗАМЕР ПОКАЗАЛ, И ЭТО ГЛАВНЫЙ ВЫВОД ЗАДАЧИ. У тона три цветовых носителя,
 * и они держатся ПО-РАЗНОМУ:
 *   `tone`  (сам токен: значок, рамка, заливка) — худшая пара 2.92 в светлой,
 *           3.57 в тёмной;
 *   `label` (подпись на своём тинте) — 2.94 и 3.61;
 *   `tint`  (заливка 12%) — **0.00** в светлой: `warning` и `error` при
 *           дейтеранопии совпадают ПОБАЙТОВО.
 *
 * То есть заливка тона не носитель вовсе, а два оставшихся держатся втрое ниже
 * планки палитры серий (5.5). Из этого НЕ следует, что систему надо
 * перекрашивать: у тона есть носитель, которого у серии нет, — знак и слово
 * (DS-157, гейт `tone-carrier`). Из этого следует правило, которое здесь
 * и закрепляется: **цвет тона подтверждает, а не несёт.**
 *
 * ПОЧЕМУ ПОЛ 1.0, А НЕ 5.5. Порог палитры серий снят с палитр, где цвет —
 * единственный носитель, и переписать его сюда значило бы взять чужое число
 * вместо своего рассуждения (`docs/writing-checks.md`, п.8). Здесь другой
 * вопрос: подтверждению не нужен запас, но врать оно не имеет права. Ноль —
 * это категория без категории. Пол ровно на пороге различения (JND ≈ 1 в
 * CAM16-UCS) — минимум, ниже которого цвет ПРОТИВОРЕЧИТ знаку.
 */

const ROOT = resolve(__dirname, '..')
const css = readFileSync(join(ROOT, 'tokens', 'tokens.css'), 'utf8')

const VALUES = Object.fromEntries(
  THEMES.map((t) => [t, parseThemeTokens(css, THEME_SELECTOR[t])]),
) as Record<(typeof THEMES)[number], Map<string, string>>

/** Носители, от которых система ТРЕБУЕТ непротиворечия. `tint` сюда не входит — см. ниже. */
const CARRIERS: readonly ToneCarrier[] = ['tone', 'label']

describe('словарь тонов: цвет подтверждает знак и не противоречит ему', () => {
  it('в словаре шесть тонов, и это те самые шесть', () => {
    expect(TONES).toEqual(['neutral', 'accent', 'success', 'warning', 'error', 'info'])
    // 15 пар шести тонов — не цепочка из пяти соседей. Соседство по порядку
    // объявления на экране не существует: `Timeline` показывает все тоны сразу.
    for (const t of THEMES) expect(tonePairs('tone', t, VALUES[t])).toHaveLength(15)
  })

  for (const theme of THEMES) {
    for (const carrier of CARRIERS) {
      it(`${theme} / ${carrier}: любые два тона различимы при всех четырёх зрениях`, () => {
        const weak = tonePairs(carrier, theme, VALUES[theme])
          .filter((p) => p.de < TONE_JND)
          .map((p) => `${theme}/${carrier} ${p.a}/${p.b}: ΔE' ${p.de.toFixed(2)} при ${p.vision}`)
        expect(
          weak,
          weak.join('\n') +
            '\n\nДва тона слились в один цвет. Знак и слово (гейт `tone-carrier`) ' +
            'смысл донесут, но цвет при этом УТВЕРЖДАЕТ обратное — что это одна ' +
            'категория. Лечится значением токена, а не снятием проверки.',
        ).toEqual([])
      })
    }
  }

  /**
   * ЗАФИКСИРОВАННЫЙ ДЕФЕКТ, а не порог. Заливка 12% в светлой теме не различает
   * `warning` и `error` вовсе. Проверка стоит здесь не затем, чтобы объявить это
   * нормой, а затем, чтобы правка тинтов не проехала молча: тронет кто-нибудь
   * `--ds-warning` — покраснеет тут, и число в правиле придётся пересчитать, а
   * не вспомнить.
   *
   * И отдельно — что потолок здесь НЕ природный: пара 12%-тинтов разводится до
   * ΔE' 5.74 (замер по сетке 6³ базовых цветов, худшее из четырёх зрений). То
   * есть «тинты нельзя развести» было бы неправдой; их МОЖНО развести ценой
   * смены смысловых цветов системы, и это отдельное решение с потребителем.
   */
  it('заливка тона — НЕ носитель, и это записано числом, а не мнением', () => {
    const { theme, pair, vision, de, ceiling } = TINT_IS_NOT_A_CARRIER
    const worst = tonePairs('tint', theme, VALUES[theme]).reduce((a, b) => (a.de <= b.de ? a : b))
    expect(`${worst.a}/${worst.b}`, 'худшая пара тинтов сменилась — перечитайте правило').toBe(pair)
    expect(worst.vision).toBe(vision)
    expect(worst.de, 'ΔE\' худшей пары тинтов уехал — число в правиле устарело').toBeCloseTo(de, 2)
    expect(ceiling).toBeGreaterThan(TONE_JND * 5)

    // И это НЕ «тинты вообще неразличимы»: тёмная тема на том же носителе
    // держится выше JND. Различаются они плохо, а не никак — разница важна,
    // потому что «никак» звучало бы как невозможность.
    const darkWorst = tonePairs('tint', 'dark', VALUES.dark).reduce((a, b) => (a.de <= b.de ? a : b))
    expect(darkWorst.de).toBeGreaterThan(TONE_JND)
  })

  /**
   * САНИТАР: гейт обязан краснеть И НАЗЫВАТЬ ПАРУ. Сдвиг одного тона к соседу —
   * ровно та мутация, которую требует постановка задачи.
   */
  it('сдвиг одного тона к соседнему находится и называется по имени', () => {
    const sabotaged = new Map(VALUES.light)
    sabotaged.set('success', sabotaged.get('info')!)
    const weak = tonePairs('tone', 'light', sabotaged).filter((p) => p.de < TONE_JND)
    expect(weak.length, 'подмена --ds-success на --ds-info обязана быть найдена').toBeGreaterThan(0)
    expect(weak.map((p) => `${p.a}/${p.b}`)).toContain('success/info')
    // Обратная сторона: на нетронутых значениях слабых пар нет ни на одном носителе.
    for (const theme of THEMES) {
      for (const carrier of CARRIERS) {
        expect(tonePairs(carrier, theme, VALUES[theme]).filter((p) => p.de < TONE_JND)).toEqual([])
      }
    }
  })

  /**
   * Против способа №1 из `writing-checks`: если `worstDeltaE` начнёт возвращать
   * константу, всё выше станет зелёным навсегда. Машинка проверяется на
   * утверждениях, ответ на которые известен без неё.
   */
  it('машинка отличает «далеко» от «одинаково»', () => {
    const vc = VIEWING.light
    expect(worstDeltaE('#BB2F28', '#BB2F28', vc).de).toBeCloseTo(0, 6)
    expect(worstDeltaE('#000000', '#FFFFFF', vc).de).toBeGreaterThan(20)
    // Дихромазия обязана СБЛИЖАТЬ то, что различается только тоном, — иначе
    // матрицы применены не в том пространстве и все числа выше не о том.
    const red = '#C00000'
    const green = '#00A000'
    expect(deltaE(simulate(red, 'deutan'), simulate(green, 'deutan'), vc)).toBeLessThan(
      deltaE(red, green, vc),
    )
    // и худшее зрение для красного с зелёным — не нормальное
    expect(worstDeltaE(red, green, vc).vision).not.toBe('normal')
  })

  /**
   * Утверждение «носитель тона — знак и слово» опирается на ЧУЖУЮ проверку.
   * Если её удалят, правило здесь останется правдоподобным текстом без опоры —
   * и именно так тихо расходятся правило и система.
   */
  it('носитель тона — знак и слово, и это держит отдельный гейт', () => {
    expect(
      existsSync(join(ROOT, 'src/__guards__/tone-carrier.test.tsx')),
      'гейт `tone-carrier` (DS-157) пропал — тогда пол 1.0 здесь ничем не оправдан: ' +
        'он занижен ровно потому, что смысл несёт не цвет',
    ).toBe(true)
  })

  it('нейтральный тон берётся из общих токенов, а не из своего цвета', () => {
    // «Нейтральный» — отсутствие тона, а не шестой цвет. Заведись у него
    // собственный токен, словарь стал бы палитрой, и к нему пришлось бы
    // предъявлять требования палитры серий.
    expect(toneColour('tone', 'neutral', VALUES.light)).toBe(VALUES.light.get('text-secondary'))
    expect(toneColour('tint', 'neutral', VALUES.light)).toBe(VALUES.light.get('surface-subtle'))
    expect([...VALUES.light.keys()].filter((k) => k === 'neutral')).toEqual([])
  })
})
