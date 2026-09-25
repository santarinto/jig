import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Текст события на подложке своего календаря — восемь цветов, две темы.
 *
 * Общий гейт `color-mix-contrast` сюда не дотягивается принципиально: он
 * считает пары ТОКЕНОВ, а подложка события собрана из `--ds-eventcal-tone`,
 * который приходит инлайновым стилем и принимает восемь разных значений
 * (`--ds-chart-1…8`). Пара «токен × токен» тут не одна, их шестнадцать, и
 * худшая из них решает всё.
 *
 * Ради этого замера цвет календаря и НЕ стал фоном под буквами: белым по
 * `--ds-chart-2` (охра) AA не проходит ни при каком проценте, а тинт с
 * обычным текстом проходит с запасом. Тест держит границу, за которой начнётся
 * соблазн «сделать поярче».
 */

const tokens = readFileSync(resolve(__dirname, '../../../tokens/tokens.css'), 'utf8')
const css = readFileSync(resolve(__dirname, 'EventCalendar.css'), 'utf8')

const AA = 4.5

function hex2rgb(h: string): [number, number, number] {
  let s = h.replace('#', '')
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  const n = parseInt(s, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(fg: string, bg: string, pct: number): string {
  const t = pct / 100
  const a = hex2rgb(fg)
  const b = hex2rgb(bg)
  const c = a.map((v, i) => Math.round(v * t + b[i]! * (1 - t)))
  return '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('')
}

function contrastRatio(a: string, b: string): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const L = (hex: string) => {
    const [r, g, b] = hex2rgb(hex).map(lin)
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
  }
  const [l1, l2] = [L(a), L(b)].sort((x, y) => y - x)
  return (l1! + 0.05) / (l2! + 0.05)
}

/** Значения токена в светлой (`:root`) и тёмной теме. */
function themeValues(name: string): [light: string, dark: string] {
  const all = [...tokens.matchAll(new RegExp(`--${name}\\s*:\\s*(#[0-9A-Fa-f]{3,8})\\s*;`, 'g'))]
  expect(all.length, `${name}: ожидались два объявления, светлое и тёмное`).toBe(2)
  return [all[0]![1]!, all[1]![1]!]
}

/** Процент тинта берётся ИЗ CSS, а не дублируется здесь: иначе тест проверял бы себя. */
function tintAlpha(selector: string): number {
  const re = new RegExp(`\\${selector}\\s*\\{[^}]*color-mix\\(in srgb, var\\(--ds-eventcal-tone\\) (\\d+)%`)
  const m = css.match(re)
  expect(m, `${selector}: подложка не собрана через color-mix от тона`).not.toBeNull()
  return Number(m![1])
}

describe('текст события на подложке календаря', () => {
  // Три вхождения тинта в компоненте, все три меряются здесь: событие в сетке,
  // полоса пояса и чип месяца под курсором.
  for (const selector of ['.ds-eventcal__event', '.ds-eventcal__bar', '.ds-eventcal__chip-event:hover']) {
    it(`${selector}: восемь тонов в обеих темах держат AA`, () => {
      const alpha = tintAlpha(selector)
      const surface = themeValues('ds-surface')
      const text = themeValues('ds-text-primary')

      const worst: Array<[string, number]> = []
      for (let i = 1; i <= 8; i++) {
        const tone = themeValues(`ds-chart-${i}`)
        for (const theme of [0, 1] as const) {
          const tint = mix(tone[theme], surface[theme], alpha)
          worst.push([`--ds-chart-${i} ${theme ? 'тёмная' : 'светлая'}`, contrastRatio(text[theme], tint)])
        }
      }

      const failed = worst.filter(([, ratio]) => ratio < AA)
        .map(([name, ratio]) => `${name}: ${ratio.toFixed(2)}`)
      expect(failed, `текст на подложке при ${alpha}%`).toEqual([])
    })
  }
})
