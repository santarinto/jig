import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { contrastRatio, parseThemeTokens } from './colour-science.js'
import { THEMES, THEME_SELECTOR } from './colourPairs.js'

/**
 * ГРАНИЦА КОНТРОЛА БЕРЁТ НЕТЕКСТОВЫЙ ПОРОГ (DS-267).
 *
 * ЧЕГО ДО ЭТОГО ГЕЙТА НЕ БЫЛО ВОВСЕ. `colourPairs.test.ts` считает матрицу
 * «передний план × поверхность» при поле 4.5 и границу из словаря ИСКЛЮЧАЕТ
 * явно (`NOT_A_SURFACE`). Нетекстовый порог 3:1 жил только в
 * `docs/contrast-report.md` — набранной руками таблице в файле, который сам себя
 * объявил историей. Ронять было нечему: числа никто не считал. Поэтому находка
 * «ни один контрол не берёт 3:1 нигде» пролежала незамеченной до обхода
 * каталога браузером.
 *
 * ПОЧЕМУ ПОДЛОЖКИ ПЕРЕЧИСЛЕНЫ ЗДЕСЬ, А НЕ ВЗЯТЫ ИЗ `SURFACES`. В `SURFACES`
 * девятнадцать поверхностей — это всё, на чём вообще лежит СОДЕРЖИМОЕ. Контур
 * контрола лежит не на всех: обход всего каталога (68 фикстур, 383 кейса, обе
 * темы, 766 загрузок) нашёл ЧЕТЫРЕ. Считать порог по девятнадцати значило бы
 * требовать его там, где контролов не бывает, и получить значение темнее
 * нужного; считать по одной `surface` — получить #949494, которое проваливает
 * `section-bar`. Список ниже — измеренный, и при появлении контрола на новой
 * подложке его сюда дописывают вместе с прогоном.
 *
 * ПОЧЕМУ ПОЛ 3, А НЕ 4.5. WCAG 1.4.11: «визуальная информация, необходимая,
 * чтобы опознать компоненты интерфейса». Это не текст, и вопрос не «читается
 * ли», а «видно ли, что это контрол».
 *
 * ПОЧЕМУ НОМИНАЛ, А НЕ НАПИСАННЫЙ ПИКСЕЛЬ. 1.4.11 определён на ЗАДАННЫХ цветах.
 * Гейт, стоящий на краске при одном `deviceScaleFactor`, зашил бы масштаб одной
 * машины в систему: при dpr 1 краска равна номиналу точно, при 1.15 линия
 * ложится на два устройственных пикселя и самый сильный из них слабее — хотя
 * ИНТЕГРАЛ КРАСКИ сохраняется (замерено 96–102%). Краску сторожит отдельный
 * случай `measure` с флагом `pixels`; здесь — контракт.
 */

const ROOT = resolve(__dirname, '..')
const CSS = readFileSync(resolve(ROOT, 'tokens', 'tokens.css'), 'utf8')
const VALUES = Object.fromEntries(
  THEMES.map((t) => [t, parseThemeTokens(CSS, THEME_SELECTOR[t])]),
) as Record<string, Map<string, string>>

/** Пол нетекстового контраста. WCAG 1.4.11. */
const FLOOR = 3

/**
 * Подложки, на которых контур контрола ЛЕЖИТ НА САМОМ ДЕЛЕ — из обхода
 * каталога, а не из словаря поверхностей. Число рядом — сколько вхождений дал
 * обход, оно здесь затем, чтобы «одна редкая подложка» не выглядела как
 * «основная».
 */
const REAL_BACKDROPS: ReadonlyArray<{ token: string; seen: number }> = [
  { token: 'surface', seen: 231 },
  { token: 'surface-subtle', seen: 60 },
  { token: 'bg-app', seen: 26 },
  { token: 'section-bar', seen: 7 },
]

describe('граница контрола: нетекстовый порог 3:1 (DS-267)', () => {
  for (const theme of THEMES) {
    it(`${theme}: --ds-control-border берёт ${FLOOR}:1 на КАЖДОЙ настоящей подложке`, () => {
      const fg = VALUES[theme].get('control-border')
      expect(fg, `--ds-control-border нет в теме ${theme}`).toBeTruthy()
      const fails: string[] = []
      for (const bg of REAL_BACKDROPS) {
        const hex = VALUES[theme].get(bg.token)
        expect(hex, `--ds-${bg.token} нет в теме ${theme}`).toBeTruthy()
        const k = contrastRatio(fg!, hex!)
        if (k < FLOOR) fails.push(`${bg.token} (${hex!}): ${k.toFixed(3)}`)
      }
      expect(
        fails,
        `граница контрола ${fg!} не берёт ${FLOOR}:1 на: ${fails.join(', ')}. ` +
          'Порог берётся на ХУДШЕЙ подложке, а не на удобной: до DS-267 ' +
          'значение считали по `surface`, и оно проваливало `section-bar`.',
      ).toEqual([])
    })
  }

  /**
   * САНИТАР: без него случай выше зелен и на разметке, где контролов нет вовсе.
   * Он проверяет ТОКЕНЫ, а не экраны, поэтому обязан убедиться, что предмет
   * вообще существует и что список подложек не выродился в одну удобную.
   */
  it('список настоящих подложек не выродился: их четыре и худшая в нём есть', () => {
    expect(REAL_BACKDROPS.length).toBe(4)
    for (const theme of THEMES) {
      const fg = VALUES[theme].get('control-border')!
      const ks = REAL_BACKDROPS.map((b) => contrastRatio(fg, VALUES[theme].get(b.token)!))
      const worst = Math.min(...ks)
      // Запас над полом обязан быть МАЛЫМ: значение выбрано как самое тихое,
      // берущее порог. Большой запас означал бы, что рамку задрали сверх нужного
      // и «клетчатость» оплачена зря.
      expect(worst).toBeGreaterThanOrEqual(FLOOR)
      expect(worst, `в теме ${theme} запас над полом ${(worst - FLOOR).toFixed(3)} — ` +
        'значение темнее необходимого, пересчитай по худшей подложке').toBeLessThan(FLOOR + 0.25)
    }
  })

  /**
   * Структурные токены НЕ обязаны брать этот порог — и обязаны остаться тихими.
   * Без этого случая правка «поднять всё до 3:1» прошла бы как исправление, а
   * она стёрла бы разницу между контролом и рельсом.
   */
  it('структурные границы остаются тише контрольной — предметы разделены', () => {
    for (const theme of THEMES) {
      const ctl = VALUES[theme].get('control-border')!
      const surface = VALUES[theme].get('surface')!
      const kCtl = contrastRatio(ctl, surface)
      for (const token of ['border', 'border-strong']) {
        const k = contrastRatio(VALUES[theme].get(token)!, surface)
        expect(k, `${theme}: --ds-${token} (${k.toFixed(2)}) не тише контрольной (${kCtl.toFixed(2)}) — ` +
          'разделение предметов потеряно').toBeLessThan(kCtl)
      }
    }
  })
})
