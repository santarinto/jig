import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Guard, обратный по смыслу к `chartPalette.test.ts`.
 *
 * Палитра серий категориальная: её тест требует ΔE ≥ 25 между соседями, то есть
 * добивается, чтобы соседние цвета НЕ читались как «чуть больше». Рамп теплокарты
 * упорядоченный, и требование ровно противоположное — сосед обязан читаться как
 * следующая ступень одной шкалы.
 *
 * Поэтому здесь проверяется не расстояние, а РОВНОСТЬ ШАГА по перцептивной
 * светлоте. Яркость для этого не годится: она не перцептивно равномерна, и
 * равные шаги в ней выглядят неравными.
 */
const css = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8')

function block(selector: string): string {
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\n\\}`)
  const m = css.match(re)
  expect(m, `блок ${selector} не найден`).not.toBeNull()
  // Комментарии выкидываем, чтобы закомментированное значение не сошло за живое.
  return m![1]!.replace(/\/\*[\s\S]*?\*\//g, '')
}

function ramp(selector: string): string[] {
  const body = block(selector)
  return Array.from({ length: 5 }, (_, i) => {
    const m = body.match(new RegExp(`--ds-heat-${i}:\\s*(#[0-9A-Fa-f]{6})`))
    expect(m, `--ds-heat-${i} отсутствует в ${selector}`).not.toBeNull()
    return m![1]!
  })
}

/** Перцептивная светлота CIE Lab. */
export function lstar(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const lin = (s: number) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4)
  const y = 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!)
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y
}

const steps = (colors: string[]) =>
  colors.slice(1).map((c, i) => lstar(c) - lstar(colors[i]!))

describe('heat ramp', () => {
  const light = ramp(':root')
  const dark = ramp('[data-theme="dark"]')

  it('светлый рамп темнеет монотонно, тёмный — светлеет', () => {
    expect(steps(light).every((s) => s < 0), `шаги светлой: ${steps(light).map((s) => s.toFixed(1))}`).toBe(true)
    // В тёмной теме «больше» обязано быть светлее: с направлением светлой
    // максимум утонул бы в фоне, а пустой день оказался бы ярче активного.
    expect(steps(dark).every((s) => s > 0), `шаги тёмной: ${steps(dark).map((s) => s.toFixed(1))}`).toBe(true)
  })

  it.each([['светлая', light], ['тёмная', dark]] as const)(
    '%s: соседние ступени различимы (ΔL* ≥ 8)',
    (_name, colors) => {
      // Ступень, которой не различить, — это шкала с меньшим числом делений,
      // чем она обещает. Первая версия светлого рампа давала здесь 4.9:
      // один коммит выглядел как ни одного.
      const abs = steps(colors).map(Math.abs)
      expect(Math.min(...abs), `шаги: ${abs.map((s) => s.toFixed(1)).join(', ')}`).toBeGreaterThanOrEqual(8)
    },
  )

  it.each([['светлая', light], ['тёмная', dark]] as const)(
    '%s: шаги ровные (разброс ≤ ×1.6)',
    (_name, colors) => {
      // Неровные ступени искажают величину: переход 3 → 6 выглядел бы крупнее,
      // чем 6 → 10, хотя данные говорят обратное.
      const abs = steps(colors).map(Math.abs)
      const spread = Math.max(...abs) / Math.min(...abs)
      expect(spread, `шаги: ${abs.map((s) => s.toFixed(1)).join(', ')}`).toBeLessThanOrEqual(1.6)
    },
  )

  it('нулевая ступень нейтральна — «ничего не было» это не малое значение', () => {
    for (const [name, zero] of [['светлая', light[0]!], ['тёмная', dark[0]!]] as const) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(zero.slice(i, i + 2), 16))
      const spread = Math.max(r!, g!, b!) - Math.min(r!, g!, b!)
      expect(spread, `${name}: ${zero} слишком цветной для «пусто»`).toBeLessThanOrEqual(10)
    }
  })

  it('пустая ячейка отличима от поверхности, на которой лежит', () => {
    // Нашлось глазами на превью: пустых дней в календаре больше всего, и если
    // они сливаются с подложкой, сетка распадается на цветные точки — виден
    // не календарь, а россыпь. Порог низкий намеренно: «пусто» обязано читаться
    // как пусто, а не как заполненная ячейка.
    //
    // Теплокарта живёт на --ds-surface, а не на --ds-bg-app: на фоне приложения
    // светлая нулевая ступень даёт 1.03 и пропадает совсем. Это требование к
    // размещению, и оно записано в AGENTS.md — затемнять ступень до читаемости
    // на любом фоне нельзя, «пустой» день стал бы похож на заполненный.
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      const lin = (s: number) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4)
      return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!)
    }
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)]
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
    }
    const surface = (selector: string) =>
      block(selector).match(/--ds-surface:\s*(#[0-9A-Fa-f]{6})/)![1]!

    for (const [name, zero, sel] of [
      ['светлая', light[0]!, ':root'],
      ['тёмная', dark[0]!, '[data-theme="dark"]'],
    ] as const) {
      const r = ratio(zero, surface(sel))
      expect(r, `${name}: ${zero} на ${surface(sel)} даёт ${r.toFixed(3)}`).toBeGreaterThanOrEqual(1.15)
    }
  })

  it('отвергнутый рамп, подобранный на глаз, этим порогам не удовлетворяет', () => {
    // Страховка от смягчения порогов до бессмысленности: эти значения
    // прошли бы проверку «пять разных цветов», но ΔL* между «пусто» и
    // «один» у них 4.9 при 15.8 в конце — разброс ×3.19.
    const rejected = ['#E6E9E9', '#C9E4E3', '#8FC9C7', '#4FA5A3', '#0E7C7C']
    const abs = steps(rejected).map(Math.abs)
    const fails = Math.min(...abs) < 8 || Math.max(...abs) / Math.min(...abs) > 1.6
    expect(fails, `отвергнутый рамп прошёл бы: шаги ${abs.map((s) => s.toFixed(1)).join(', ')}`).toBe(true)
  })
})
