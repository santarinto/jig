import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  VIEWING,
  VISIONS,
  Viewing,
  contrastRatio,
  deltaE,
  hex2rgb,
  mix,
  parseThemeTokens,
  simulate,
  ucs,
  worstDeltaE,
} from './colour-science.js'

/**
 * САНИТАР КОЛОРИМЕТРИИ (DS-181; переехал из `chartPalette.test.ts`).
 *
 * Всё, что считает цвет в этой системе — палитра серий, матрица пар, словарь
 * тонов, страница-справка, — считает ЭТИМ модулем. Если он начнёт возвращать
 * константу, каждая из этих проверок станет зелёной навсегда и ни одна не
 * покраснеет: они спрашивают «есть ли пара ниже порога», и «нет» — законный
 * ответ сломанной машинки. Способ №1 из `docs/writing-checks.md`.
 *
 * Поэтому здесь проверяются утверждения, ответ на которые известен БЕЗ этого
 * модуля: эталонный стимул CIECAM02, нейтральный серый под дихромазией,
 * расстояние цвета до себя, известные пары WCAG.
 *
 * Файл отдельный, а не хвост палитры серий, по той же причине, по которой сам
 * модуль отдельный: дефект реализации CAM16 обязан ронять проверку РЕАЛИЗАЦИИ.
 * Пока санитар стоял внутри гейта палитры, красным оказывалась палитра, и
 * чинить пошли бы её.
 */

const css = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8')

describe('колориметрия считает то, что обещает', () => {
  it('CAM16 сходится с эталонным стимулом CIECAM02', () => {
    // XYZ 19.01/20.00/21.78 при La=318.31, Yb=20, average → J=41.73, h=219.0.
    // J' = 1.7·J/(1+0.007·J); при J=41.73 это 55.0.
    const vc = new Viewing(318.31, 20, 'average')
    const grey = '#7C7C7C' // XYZ ≈ 19.16/20.16/21.95 — тот же стимул в 8 битах
    const [Jp] = ucs(grey, vc)
    expect(Jp).toBeGreaterThan(54)
    expect(Jp).toBeLessThan(56)
  })

  it('расстояние до себя — ноль, до противоположного — велико', () => {
    expect(deltaE('#0B7979', '#0B7979', VIEWING.light)).toBeCloseTo(0, 6)
    expect(deltaE('#000000', '#FFFFFF', VIEWING.light)).toBeGreaterThan(20)
  })

  it('дихромазия не трогает нейтральный серый и сближает то, что различается тоном', () => {
    // Если серый поехал — матрицы Machado применены не в линейном RGB, и все
    // числа системы правдоподобны и неверны.
    for (const v of VISIONS) expect(simulate('#808080', v)).toBe('#808080')
    const red = '#C00000'
    const green = '#00A000'
    expect(deltaE(simulate(red, 'deutan'), simulate(green, 'deutan'), VIEWING.light)).toBeLessThan(
      deltaE(red, green, VIEWING.light),
    )
    expect(worstDeltaE(red, green, VIEWING.light).vision).not.toBe('normal')
  })

  it('контраст совпадает с известными числами WCAG', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 4)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 6)
    // Симметричен: порядок аргументов не меняет ответа.
    expect(contrastRatio('#262626', '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', '#262626'), 9)
    // И совпадает с числом, записанным в токенах: #757575 на белом — 4.61.
    expect(contrastRatio('#757575', '#FFFFFF')).toBeCloseTo(4.61, 2)
  })

  it('смешение идёт в ЛИНЕЙНОМ пространстве, как color-mix(in srgb)', () => {
    // Половина между чёрным и белым в линейном srgb — #BCBCBC, а не #808080.
    // Смешай кто-нибудь гамма-кодированные значения — получилось бы второе, и
    // тинты в матрице тонов уехали бы на несколько единиц L*, оставшись
    // правдоподобными.
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#BCBCBC')
    expect(mix('#123456', '#123456', 0.3)).toBe('#123456')
    expect(mix('#AABBCC', '#000000', 1)).toBe('#AABBCC')
    expect(() => mix('#000000', '#FFFFFF', 1.5)).toThrow(/вне 0–1/)
  })

  it('незнакомый цвет — исключение, а не «первые три числа»', () => {
    expect(() => hex2rgb('rgb(1,2,3)')).toThrow(/не hex/)
    expect(() => hex2rgb('#12345')).toThrow(/не hex/)
    expect(hex2rgb('#abc')).toEqual([170, 187, 204])
  })

  it('условия просмотра у тем РАЗНЫЕ, и это видно в числах', () => {
    // Если бы обе темы считались одними условиями, различать их было бы незачем,
    // а комментарий про La и Yb стал бы украшением.
    const a = deltaE('#2A7030', '#2764AD', VIEWING.light)
    const b = deltaE('#2A7030', '#2764AD', VIEWING.dark)
    expect(a).not.toBeCloseTo(b, 3)
  })

  it('разбор токенов берёт значения темы и не берёт закомментированные', () => {
    const light = parseThemeTokens(css, ':root')
    const dark = parseThemeTokens(css, '[data-theme="dark"]')
    expect(light.get('accent')).toBe('#0E7C7C')
    expect(dark.get('accent')).toBe('#2BB8B3')
    expect(light.get('surface')).toBe('#FFFFFF')
    // `var(...)` и `color-mix(...)` не попадают: их значение известно только
    // после каскада, и правдоподобная подстановка дала бы число не о том.
    expect(light.has('border-overlay')).toBe(false)
    expect(dark.get('border-overlay')).toBe('#6A6A6A')
    // Комментарий не становится объявлением.
    const fake = ':root {\n  /* --ds-fake: #FF0000; */\n  --ds-real: #00FF00;\n}'
    const parsed = parseThemeTokens(fake, ':root')
    expect(parsed.has('fake')).toBe(false)
    expect(parsed.get('real')).toBe('#00FF00')
    expect(() => parseThemeTokens(css, '[data-theme="sepia"]')).toThrow(/не найден/)
  })
})
