import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Закон «цвет кодирует состояние или категорию, никогда величину» записан ДВАЖДЫ:
 * в `CLAUDE.md` (раздел System law) и в `.design-sync/conventions.md`. Дубль
 * намеренный и односторонний — это не два источника правды, а закон и его выдача
 * наружу: `conventions.md` уезжает в заголовок агента Claude Design, который
 * `CLAUDE.md` не читает и прочитать не может.
 *
 * Внешнее ревью (DS-107) предложило убрать закон из `CLAUDE.md` и оставить
 * ссылку. Диагноз верный — синхронность не держало ничто, — а лечение нет: закон
 * применяется в тот момент, когда цвет НАЗНАЧАЮТ, и ссылка «сходи проверь»
 * проигрывает, потому что цвет назначат и не сходят. Правильный ответ на «два
 * места могут разойтись» в этом проекте — проверка, а не удаление одного из мест.
 *
 * Проверяется СУТЬ, не буквы. Формулировки в файлах разные и должны такими
 * остаться: в `CLAUDE.md` закон краток, в `conventions.md` он развёрнут для
 * читателя, который не знает системы. Гейт на дословное совпадение заставил бы
 * их сойтись в один текст и тем самым испортил бы оба.
 */

const ROOT = resolve(__dirname, '../..')

const FILES: [name: string, path: string][] = [
  ['CLAUDE.md', resolve(ROOT, 'CLAUDE.md')],
  ['.design-sync/conventions.md', resolve(ROOT, '.design-sync/conventions.md')],
]

/**
 * Пять утверждений закона. Каждое обязано стоять в ОБОИХ файлах — в любой
 * формулировке, лишь бы утверждало то же самое. Альтернативы в регулярках
 * (`goes|lives`, `only|one place`) — это уже случившееся расхождение слов при
 * совпадении смысла, и оно законно.
 */
const CLAIMS: [claim: string, re: RegExp][] = [
  ['цвет кодирует состояние или категорию', /colou?r encodes state or category/i],
  ['и никогда — величину', /never magnitude/i],
  ['величина живёт в позиции, высоте или упорядоченной шкале', /magnitude (?:goes|lives) in position/i],
  ['--ds-heat-* существует и назван единственным местом цвета-величины', /--ds-heat-/],
  ['--ds-chart-* существует и назван категориальным', /--ds-chart-/],
]

/** Утверждения, для которых мало упомянуть токен — нужна и роль. */
const ROLE_CLAIMS: [claim: string, re: RegExp][] = [
  ['ramp — единственное место цвета как величины', /(?:only|one) place[\s\S]{0,60}magnitude/i],
  ['серии графика категориальны', /categorical/i],
  ['тип дня кодируется формой, а не ступенью', /day'?s? type[\s\S]{0,40}(?:by )?shape|shape, not by a (?:step|darker)/i],
  // DS-181. Два правила, добавленные вместе с матрицей сочетаемости.
  // Формулировки в файлах РАЗНЫЕ намеренно — гейт про смысл, а не про буквы.
  ['цвет тона подтверждает знак и никогда не несёт его один', /colou?r (?:confirms|ratifies) (?:a |the )?tone[\s\S]{0,60}never carr(?:ies|y)/i],
  ['законность пары «передний план × поверхность» ОБЪЯВЛЕНА, а не решается на глаз', /legal on which surface is declared/i],
]

/**
 * Пробельные схлопываются в один пробел ПЕРЕД проверкой. Markdown переносит строку
 * там, где кончилась ширина, а не там, где кончилась мысль: в `conventions.md`
 * фраза стоит как «Magnitude lives in\nposition, height…», и первая редакция гейта
 * покраснела на переносе, объявив утверждение пропавшим. Это был бы способ 4 из
 * `docs/writing-checks.md` — гейт верен, но проверяет вёрстку абзаца вместо
 * правила, и чинили бы по нему документ, в котором всё на месте.
 */
const flat = (text: string) => text.replace(/\s+/g, ' ')

const SOURCES = FILES.map(
  ([name, path]) => [name, flat(readFileSync(path, 'utf8'))] as const,
)

describe('закон цвета записан одинаково в обоих местах', () => {
  it('оба файла на месте и непусты', () => {
    for (const [name, text] of SOURCES) {
      expect(text.length, `${name} пуст или не прочитан`).toBeGreaterThan(1000)
    }
    // Против способа 3: список утверждений, съёжившийся до нуля, дал бы зелёный
    // результат на любой паре файлов.
    expect(CLAIMS.length + ROLE_CLAIMS.length).toBeGreaterThanOrEqual(8)
  })

  for (const [claim, re] of [...CLAIMS, ...ROLE_CLAIMS]) {
    it(`утверждает: ${claim}`, () => {
      const missing = SOURCES.filter(([, text]) => !re.test(text)).map(([name]) => name)
      expect(
        missing,
        `утверждение пропало из: ${missing.join(', ')}.\n` +
          'Закон живёт в двух местах намеренно — CLAUDE.md для меня, ' +
          '.design-sync/conventions.md для агента Claude Design, который CLAUDE.md ' +
          'не читает. Правка одного файла без второго разводит их молча.',
      ).toEqual([])
    })
  }

  /**
   * Против способа 5: сам детектор обязан отличать «утверждение есть» от
   * «утверждение отсутствует». Регулярка, совпадающая с чем угодно, дала бы
   * зелёный результат на пустом тексте.
   */
  it('детектор отличает наличие утверждения от отсутствия', () => {
    for (const [, re] of [...CLAIMS, ...ROLE_CLAIMS]) {
      expect(re.test(''), `${re} совпадает с пустым текстом`).toBe(false)
      expect(re.test('ничего об этом не сказано'), `${re} совпадает с чужим текстом`).toBe(false)
    }
    // И наоборот: разные формулировки одного смысла обязаны обе проходить —
    // иначе гейт про буквы, а не про правило.
    const re = CLAIMS[2]![1]
    expect(re.test('Magnitude goes in position, in height, or in an ordered ramp.')).toBe(true)
    expect(re.test('Magnitude lives in position, height, or an ordered ramp.')).toBe(true)
    // И через перенос строки — ровно то, на чём первая редакция покраснела зря:
    expect(re.test(flat('Magnitude lives in\nposition, height, or an ordered ramp.'))).toBe(true)
  })
})
