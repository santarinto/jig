import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { channelsOf, contrastOf, deltaE76, alphaOf, blend } from '../../scripts/colour.mjs'
import { seenPair, seenOn, SEEN_INSTALL } from '../../scripts/seen-colour.mjs'

/**
 * Разбор цвета в `scripts/measure-invariants.mjs` брал из строки первые три
 * числа и делил их на 255 (DS-216). На том, что chromium отдаёт за
 * `color-mix()` — `color(srgb 0.867686 0.928078 0.928078)` — это читает доли как
 * каналы: почти белый становится почти чёрным. Замеренная в нашем
 * playwright-chromium строка взята ниже дословно.
 *
 * Разряд дефекта — «прошло, не проверив»: ошибка не падает, не печатает
 * предупреждения и отдаёт правдоподобное число. На светлом тексте по
 * «почерневшему» фону отношение ЗАВЫШАЕТСЯ, то есть гейт зеленеет на паре,
 * которая AA не проходит.
 *
 * Утверждения здесь — РАЗЛИЧАЮЩИЕ, а не «стало считать»:
 *  1. один и тот же цвет, записанный двумя способами, обязан дать одно число;
 *  2. незнакомый формат обязан УПАСТЬ с текстом, а не быть посчитанным.
 * Обе функции проверяются отдельно: у них был один и тот же разбор, и починка
 * одной оставила бы вторую — при зелёном прогоне.
 */

/** Что chromium вернул на `.ds-tabs__count`, c=Tabs&case=count-vs-icon. */
const MEASURED_LIGHT = 'color(srgb 0.867686 0.928078 0.928078)'
const MEASURED_DARK = 'color(srgb 0.151765 0.229176 0.226431)'

/** Тот же цвет в `rgb()`: 0.867686·255 = 221.3, 0.928078·255 = 236.7. */
const SAME_LIGHT = 'rgb(221, 237, 237)'

/** Доли, представимые в 0–255 ТОЧНО, — пара без округления вовсе. */
const EXACT_SRGB = 'color(srgb 0.2 0.4 0.6)'
const EXACT_RGB = 'rgb(51, 102, 153)'

const WHITE = 'rgb(255, 255, 255)'
const INK = 'rgb(14, 124, 124)' // --ds-accent светлой темы, #0E7C7C

describe('разбор цвета в гейтах', () => {
  it('color(srgb …) читается как цвет, а не как три доли в роли каналов', () => {
    // Прямая проверка каналов: до правки здесь было [0.87, 0.93, 0.93].
    const [r, g, b] = channelsOf(MEASURED_LIGHT)
    expect(r).toBeCloseTo(221.3, 1)
    expect(g).toBeCloseTo(236.7, 1)
    expect(b).toBeCloseTo(236.7, 1)
  })

  it('один цвет двумя записями — одно отношение контраста', () => {
    // Точная пара: округления нет вовсе, числа обязаны совпасть до разряда.
    expect(contrastOf(INK, EXACT_SRGB)).toBeCloseTo(contrastOf(INK, EXACT_RGB), 10)
    // И живая, снятая с браузера: 221.26 против 221 — расхождение только на
    // округлении одного канала, то есть меньше сотой доли отношения.
    expect(Math.abs(contrastOf(INK, MEASURED_LIGHT) - contrastOf(INK, SAME_LIGHT))).toBeLessThan(0.05)
    // И РАЗЛИЧАЮЩАЯ половина: тот самый дефектный разбор, вписанный сюда
    // дословно, обязан дать ДРУГОЕ число. Без неё утверждение выше проходило
    // бы и на разборе, который обе записи ломает одинаково.
    const legacy = (s: string) => s.match(/[\d.]+/g)!.slice(0, 3).map(Number)
    const lum = (c: number[]) => c
      .map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 })
      .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i]!, 0)
    const legacyContrast = (a: string, b: string) => {
      const [hi, lo] = [lum(legacy(a)), lum(legacy(b))].sort((x, y) => y - x) as [number, number]
      return (hi + 0.05) / (lo + 0.05)
    }
    expect(legacyContrast(INK, SAME_LIGHT)).toBeCloseTo(contrastOf(INK, SAME_LIGHT), 6)
    expect(Math.abs(legacyContrast(WHITE, MEASURED_LIGHT) - contrastOf(WHITE, MEASURED_LIGHT)))
      .toBeGreaterThan(3)
    // Пара берётся БЕЛАЯ, и вот почему. На `--ds-accent` дефект прячется:
    // верный разбор даёт (0.82+0.05)/(0.16+0.05) = 4.16, дефектный переворачивает
    // пару и даёт (0.16+0.05)/(0.0003+0.05) = 4.17. Числа сходятся с точностью
    // до сотой — СЛУЧАЙНО, потому что светимость акцента почти ровно средняя
    // геометрическая. Это и есть то везение, из-за которого сегодняшний прогон
    // зелёный; пара, чей текст светлее подложки, вскрывает промах сразу:
    // 1.21 против 20.9.
    expect(contrastOf(WHITE, MEASURED_LIGHT)).toBeCloseTo(1.21, 1)
    expect(legacyContrast(WHITE, MEASURED_LIGHT)).toBeCloseTo(20.9, 0)
  })

  it('то же для deltaE76 — у неё был тот же разбор и та же дыра', () => {
    expect(deltaE76(INK, EXACT_SRGB)).toBeCloseTo(deltaE76(INK, EXACT_RGB), 10)
    expect(deltaE76(MEASURED_LIGHT, SAME_LIGHT)).toBeLessThan(0.5)
    // Тёмная тоже: пара «светлый × тёмный» обязана быть далёкой, а при
    // дефектном разборе обе стороны схлопывались в почти чёрное и ΔE падал.
    expect(deltaE76(MEASURED_LIGHT, MEASURED_DARK)).toBeGreaterThan(50)
  })

  it('незнакомый формат — отказ с текстом, а не тихо посчитанное число', () => {
    for (const css of ['oklch(0.7 0.1 200)', 'color(display-p3 0.1 0.2 0.3)', 'rebeccapurple', 'lab(50% 40 59)']) {
      expect(() => channelsOf(css), `${css} разобран молча`).toThrow(/colour:/)
      expect(() => contrastOf(css, EXACT_RGB), `${css} посчитан в contrastOf`).toThrow(/colour:/)
      expect(() => deltaE76(css, EXACT_RGB), `${css} посчитан в deltaE76`).toThrow(/colour:/)
    }
  })

  it('число компонентов проверяется, а не берётся первыми тремя', () => {
    // Ровно тот приём, который и был дефектом: «взять первые три» проходит на
    // любой строке, где цифр хотя бы три.
    expect(() => channelsOf('color(srgb 0.1 0.2)')).toThrow(/3/)
    expect(() => channelsOf('rgb(1 2 3 4 5)')).toThrow(/3/)
    // Альфа отбрасывается — так было и раньше, правка 216 не меняет ни одного
    // зелёного числа.
    expect(channelsOf('rgba(51, 102, 153, 0.5)')).toEqual([51, 102, 153])
    expect(channelsOf('color(srgb 0.2 0.4 0.6 / 0.5)')).toEqual([51, 102, 153])
  })

  it('измеряющий скрипт берёт разбор ОТСЮДА, а не заводит свой', () => {
    // Обратная мутация: гейт зелен и на модуле, который никто не вызывает.
    const src = readFileSync(resolve(__dirname, '../../scripts/measure-invariants.mjs'), 'utf8')
    // Якорь по началу строки обязателен: без него утверждение проходит и на
    // ЗАКОММЕНТИРОВАННОМ импорте — проверено мутацией, она выживала.
    expect(src, 'measure-invariants больше не импортирует colour.mjs').toMatch(
      /^import \{[^}]*contrastOf[^}]*deltaE76[^}]*\} from '\.\/colour\.mjs'$/m,
    )
    expect(src, 'в measure-invariants снова заведён свой разбор цвета').not.toMatch(/function (contrastOf|deltaE76)\b/)
    expect(src, 'в measure-invariants вернулся разбор «первые три числа»').not.toMatch(/match\(\/\[\\d\.\]\+\/g\)/)
  })
})

/**
 * «Цвет, каким его видно» — DS-209.
 *
 * Тот же разряд дефекта, что и у 216, и та же ловушка: контраст считался по
 * НОМИНАЛЬНОМУ `getComputedStyle(el).color` против `backgroundColor`, а
 * `opacity` предка в вычисленные значения не входит вовсе — она применяется при
 * отрисовке. `.ds-cal__day--out` (`--ds-text-muted` при `opacity: .65` на
 * кнопке) давал 5.33 номинально и 2.65 на экране. Оба числа правдоподобны, ни
 * одно не падает, и расходятся они ВДВОЕ.
 *
 * Проверяется здесь, в node, на синтетических цепочках: арифметика, уехавшая в
 * `page.evaluate`, не видна ни одному гейту. Утверждения РАЗЛИЧАЮЩИЕ — каждое
 * названо вместе с тем, какая поломка его роняет.
 */
describe('цвет, каким его видно (opacity предка и альфа)', () => {
  const WHITE_BG = 'rgb(255, 255, 255)'
  const MUTED = 'rgb(107, 107, 107)' // --ds-text-muted светлой темы, #6B6B6B
  const CLEAR = 'rgba(0, 0, 0, 0)'
  const layer = (bg: string, opacity = 1) => ({ bg, opacity })

  it('альфа читается в обеих записях и падает на незнакомом формате', () => {
    expect(alphaOf('rgb(1, 2, 3)')).toBe(1)
    expect(alphaOf('rgba(1, 2, 3, 0.4)')).toBeCloseTo(0.4, 10)
    expect(alphaOf('rgb(1 2 3 / 0.4)')).toBeCloseTo(0.4, 10)
    expect(alphaOf('rgb(1 2 3 / 40%)')).toBeCloseTo(0.4, 10)
    expect(alphaOf('color(srgb 0.2 0.4 0.6)')).toBe(1)
    expect(alphaOf('color(srgb 0.2 0.4 0.6 / 0.25)')).toBeCloseTo(0.25, 10)
    // Правило colour.mjs «незнакомое БРОСАЕТ» распространяется и сюда: иначе
    // цвет, который никто не разобрал, тихо получил бы альфу 1.
    expect(() => alphaOf('oklch(0.7 0.1 200)')).toThrow(/colour:/)
  })

  it('blend смешивает, а не выбирает: середина, края и собственная альфа цвета', () => {
    const BLACK = 'rgb(0, 0, 0)'
    expect(blend(BLACK, WHITE_BG, 1)).toBe('rgb(0, 0, 0)')
    expect(blend(BLACK, WHITE_BG, 0)).toBe('rgb(255, 255, 255)')
    expect(blend(BLACK, WHITE_BG, 0.5)).toBe('rgb(127.5, 127.5, 127.5)')
    // Альфа самого цвета — ТОТ ЖЕ слой: при отрисовке «цвет полупрозрачен» и
    // «предок приглушён» неразличимы, значит они обязаны перемножиться.
    // Реализация, которая одну из них теряет, проходит первые три строки.
    expect(blend('rgba(0, 0, 0, 0.5)', WHITE_BG, 0.5)).toBe('rgb(191.25, 191.25, 191.25)')
    // Полупрозрачная ПОДЛОЖКА — вопрос, заданный не до конца («а что под ней?»).
    // Тихий ответ здесь был бы ровно тем правдоподобным числом, против которого
    // написан весь модуль.
    expect(() => blend(BLACK, 'rgba(255, 255, 255, 0.5)', 1)).toThrow(/полупрозрачн/)
  })

  it('живой случай DS-209: номинальные 5.33 против видимых 2.65', () => {
    // Цепочка `.ds-cal__day--out`: белая панель, прозрачная кнопка с opacity.
    const snap = { color: MUTED, layers: [layer(WHITE_BG), layer(CLEAR, 0.65)] }
    const seen = seenPair(snap)
    expect(seen.background).toBe(WHITE_BG)
    expect(seen.alpha).toBeCloseTo(0.65, 10)
    expect(contrastOf(seen.color, seen.background)).toBeCloseTo(2.65, 1)
    // РАЗЛИЧАЮЩАЯ половина: без неё утверждение выше прошло бы и на помощнике,
    // который просто возвращает номинальную пару.
    expect(contrastOf(snap.color, WHITE_BG)).toBeCloseTo(5.33, 1)
    expect(contrastOf(snap.color, WHITE_BG) - contrastOf(seen.color, seen.background)).toBeGreaterThan(2)
  })

  it('прозрачности ПЕРЕМНОЖАЮТСЯ по цепочке, а не берётся ближайшая', () => {
    // Две вложенные по 0.5 — это 0.25. Реализация, читающая только сам элемент
    // или только его родителя, отдаёт 0.5 и на одном уровне неотличима.
    const nested = seenPair({ color: 'rgb(0, 0, 0)', layers: [layer(WHITE_BG), layer(CLEAR, 0.5), layer(CLEAR, 0.5)] })
    expect(nested.alpha).toBeCloseTo(0.25, 10)
    expect(nested.color).toBe('rgb(191.25, 191.25, 191.25)')
  })

  it('opacity красит ГРУППУ: свой фон элемента гаснет вместе с текстом', () => {
    // Чёрная плашка при 0.5 на белом — это серая плашка, и текст на ней лежит
    // уже на сером. Помощник, гасящий только текст, вернёт фон rgb(0, 0, 0) и
    // отдаст контраст, которого на экране нет.
    const seen = seenPair({ color: WHITE_BG, layers: [layer(WHITE_BG), layer('rgb(0, 0, 0)', 0.5)] })
    expect(seen.background).toBe('rgb(127.5, 127.5, 127.5)')
    expect(seen.color).toBe('rgb(191.25, 191.25, 191.25)')
  })

  it('полупрозрачный ФОН — такой же слой, как opacity', () => {
    const seen = seenPair({ color: 'rgb(0, 0, 0)', layers: [layer(WHITE_BG), layer('rgba(0, 0, 0, 0.5)')] })
    expect(seen.background).toBe('rgb(127.5, 127.5, 127.5)')
  })

  it('seenOn берёт прозрачность из снимка, а подложку — из вопроса', () => {
    // Для случаев с ПРОБНИКОМ токена: «а как это будет на зебре». Подложка
    // гипотетическая, накопленная прозрачность настоящая.
    const snap = { color: 'rgb(0, 0, 0)', layers: [layer(WHITE_BG), layer(CLEAR, 0.5)] }
    expect(seenOn(snap, 'rgb(0, 0, 255)')).toBe('rgb(0, 0, 127.5)')
    // Различающая: без учёта снимка вернулось бы rgb(0, 0, 0).
    expect(seenOn(snap, 'rgb(0, 0, 255)')).not.toBe('rgb(0, 0, 0)')
  })

  it('снимок в браузере не считает сам — он только собирает слои', () => {
    // Обратная мутация: помощник в node проверен выше, но он бесполезен, если
    // страница отдаёт уже посчитанное число. `SEEN_INSTALL` обязан оставаться
    // сборщиком: цвет, фон, opacity — и ни одной арифметики.
    expect(SEEN_INSTALL).toMatch(/window\.__seen/)
    expect(SEEN_INSTALL).toMatch(/parentElement/)
    expect(SEEN_INSTALL, 'снимок считает в браузере').not.toMatch(/contrast|blend|0\.2126/)
  })

  it('измеряющий скрипт зовёт помощник, а не оставил его лежать', () => {
    // Тот же приём, что у соседнего утверждения про colour.mjs: гейт зелен и на
    // модуле, который никто не вызывает.
    const src = readFileSync(resolve(__dirname, '../../scripts/measure-invariants.mjs'), 'utf8')
    expect(src, 'measure-invariants не импортирует seen-colour.mjs').toMatch(
      /^import \{[^}]*SEEN_INSTALL[^}]*\} from '\.\/seen-colour\.mjs'$/m,
    )
    expect(src, 'window.__seen не заводится в странице').toMatch(/page\.evaluate\(SEEN_INSTALL\)/)
    expect(src, 'снимок снимается, но никем не используется').toMatch(/window\.__seen\(/)
  })
})
