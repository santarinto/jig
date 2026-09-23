import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * Кольцо фокуса — один объект системы, а не приём, который каждый компонент
 * набирает заново. К 1.40.0 их набралось пять литералов: четыре поля рисовали
 * кольцо ошибки как `0 0 0 2px var(--ds-error)` (TextField, Textarea,
 * CodeInput, NumberField), Accordion — внутреннее как `inset 0 0 0 2px
 * var(--ds-accent)`. Пока толщину никто не трогал, копии совпадали с токеном
 * и выглядели безобидно: дефект тут не в том, что видно сейчас, а в том, что
 * правка `--ds-focus-ring` пройдёт мимо них — и невалидное поле останется с
 * прежним кольцом рядом со здоровым, у которого оно уже другое.
 *
 * Отсюда два утверждения: варианты кольца различаются только цветом и
 * стороной, и никто не пишет кольцо в обход токена.
 */
const TOKENS = resolve(__dirname, '../../tokens/tokens.css')
/**
 * Обход идёт по всему `src`, а не по `src/components`: в 1.42.0 правила фокуса
 * полей уехали в общий `src/styles/field-surface.css`, и обход по компонентам
 * перестал бы их видеть, оставшись зелёным. Это случай №1 из CLAUDE.md — гейт
 * верный, просто смотрит не туда; ловится только тем, что охват шире места.
 */
const SRC = resolve(__dirname, '..')

/** Геометрия кольца: всё до цвета — `[inset] <offset-x> <offset-y> <blur> <spread>`. */
const RING_TOKEN = /--ds-focus-ring[a-z-]*\s*:\s*([^;]+);/gi

function collectCss(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectCss(p))
    else if (entry.name.endsWith('.css')) out.push(p)
  }
  return out
}

/**
 * Правила `селектор { тело }` — по одному, включая записанные в несколько строк.
 * Комментарии снимаются до разбора: фигурная скобка в тексте комментария
 * рассекла бы правило пополам, и разбор поехал бы дальше со сдвигом.
 */
function rules(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = []
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ selector: m[1]!.trim(), body: m[2]! })
  }
  return out
}

/**
 * Толщина ЦВЕТНОЙ ПОЛОСЫ кольца — того, что видно как кольцо.
 *
 * До DS-193 все варианты были однослойными, и «геометрия» сводилась к
 * строке до цвета: сравнивать можно было её целиком. Двухслойное кольцо
 * (`--ds-focus-ring-contrast`) — другая ФОРМА, а не другая толщина: кромка в
 * 1px и акцент до 3px дают ту же полосу акцента в 2px. Сравнение строк объявило
 * бы это расхождением и позвало бы «починить» кольцо, у которого всё верно.
 *
 * Утверждение поэтому переписано на то, ради чего гейт заведён: правка толщины
 * обязана дойти до всех вариантов. Толщина — это разность спредов последнего и
 * предпоследнего слоя (у однослойного — просто спред).
 */
function colourBand(value: string): number {
  const spreads = value
    .split(/,(?![^(]*\))/)
    .map((layer) => {
      // `var(--ds-…)` вырезается ДО разбора чисел: иначе цифры из имени токена
      // (их там нет сегодня, но `--ds-heat-4` в системе есть) поехали бы в
      // геометрию, и число вышло бы правдоподобным.
      const bare = layer.replace(/var\([^)]*\)/g, '').replace(/\binset\b/g, '')
      const nums = [...bare.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
      return nums.length >= 4 ? nums[3]! : NaN
    })
  if (spreads.some(Number.isNaN)) return NaN
  return spreads.length === 1 ? spreads[0]! : spreads[spreads.length - 1]! - spreads[spreads.length - 2]!
}

describe('focus ring discipline', () => {
  it('цветная полоса кольца — 2px во всех вариантах, расходятся только цвет и сторона', () => {
    const css = readFileSync(TOKENS, 'utf8')
    const bands = [...css.matchAll(RING_TOKEN)]
      .filter(([, value]) => !/^\s*#/.test(value!)) // --ds-focus-ring-edge — цвет, а не кольцо
      .map(([whole, value]) => ({ name: whole!.split(':')[0]!.trim(), band: colourBand(value!) }))
    expect(
      bands.length,
      'в tokens.css меньше трёх --ds-focus-ring*-колец — сверять нечего, проверка пуста',
    ).toBeGreaterThanOrEqual(4)
    const wrong = bands.filter((b) => b.band !== 2).map((b) => `${b.name}: полоса ${b.band}px`)
    expect(
      wrong,
      `толщина цветной полосы разошлась между вариантами:\n${wrong.join('\n')}\n` +
        'Правка толщины обязана дойти до ВСЕХ вариантов, иначе невалидное поле ' +
        'останется с прежним кольцом рядом со здоровым, у которого оно уже другое.',
    ).toEqual([])
    // Санитар на сам разборщик: он обязан отличать 2px от не-2px и одинаково
    // считать оба вида записи. Без этого `colourBand`, вернувший константу 2,
    // сделал бы проверку выше зелёной навсегда.
    expect(colourBand('0 0 0 2px var(--ds-accent)')).toBe(2)
    expect(colourBand('inset 0 0 0 2px var(--ds-accent)')).toBe(2)
    expect(colourBand('0 0 0 3px var(--ds-accent)')).toBe(3)
    expect(colourBand('inset 0 0 0 1px var(--ds-focus-ring-edge), inset 0 0 0 3px var(--ds-accent)')).toBe(2)
    expect(colourBand('inset 0 0 0 1px var(--ds-focus-ring-edge), inset 0 0 0 4px var(--ds-accent)')).toBe(3)
  })

  it('ни один компонент не набирает кольцо фокуса сам', () => {
    const files = collectCss(SRC)
    const offenders: string[] = []
    for (const f of files) {
      for (const { selector, body } of rules(readFileSync(f, 'utf8'))) {
        if (!/:focus-visible|:focus-within/.test(selector)) continue
        const shadow = body.match(/box-shadow\s*:\s*([^;]+)/i)?.[1]
        if (!shadow || /^\s*none\s*$/i.test(shadow)) continue
        if (!shadow.includes('var(--ds-focus-ring')) {
          offenders.push(`${f.replace(resolve(__dirname, '../..') + '/', '')}: ${selector} — ${shadow.trim()}`)
        }
      }
    }
    // Счётчик рядом с «нарушений нет»: обход, свернувшийся в ноль файлов, даёт
    // ровно такой же зелёный результат, и без числа его не отличить.
    expect(files.length, 'обход CSS компонентов пуст — проверять было нечего').toBeGreaterThan(40)
    expect(
      offenders,
      `кольцо фокуса мимо токена (--ds-focus-ring / -inset / -error):\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
