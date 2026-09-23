import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CHART_SERIES_COUNT, chartSeriesVars } from './chartPalette.js'
import {
  VIEWING,
  VISIONS as ALL_VISIONS,
  Viewing,
  contrastRatio,
  deltaE,
  simulate,
  type Vision as VisionName,
} from './colour-science.js'

/**
 * Гейт палитры серий (DS-122).
 *
 * ЧТО ЗДЕСЬ БЫЛО И ПОЧЕМУ ЭТО НЕ РАБОТАЛО. Прежняя редакция утверждала
 * «ΔE (CIE76) ≥ 25 между СОСЕДЯМИ», сравнивая colors[i] с colors[i+1]. Она была
 * зелёной на палитре, в которой восемь серий при дейтеранопии читались как три.
 * Две ошибки, и обе — из тех, что дают зелёный результат, а не красный:
 *
 * 1. СОСЕДСТВО ПО ИНДЕКСУ НА ЭКРАНЕ НЕ СУЩЕСТВУЕТ. Легенда показывает все восемь
 *    сразу, в DonutChart каждая пара соседняя по построению, а chartSeriesVar(i)
 *    выдаёт потребителю любой поднабор. Проверялись 7 пар из 28. Не проверенная
 *    пара 1/7 давала ΔE76 23.0 при пороге 25 — то есть дыра была не гипотетической.
 *
 * 2. CIE76 РАНЖИРУЕТ ПАРЫ НАОБОРОТ. Это не «неточная метрика», это неверный
 *    порядок: пара 2/7 старой палитры имела ΔE76 31 (порог проходила) и была
 *    ХУДШЕЙ по восприятию, а пара 1/7 имела ΔE76 23 (порог не проходила) и была
 *    ЛУЧШЕ неё. Отношение «воспринимаемое / CIE76» гуляло по парам в 2.29 раза.
 *    Гейт заваливал лучшую пару и пропускал худшую.
 *
 * 3. И ГЛАВНОЕ, ЧЕГО НЕ БЫЛО ВОВСЕ: дальтонизма. Старая палитра при НОРМАЛЬНОМ
 *    зрении держалась пристойно (худшая пара 7.56 светлая), а при дейтеранопии
 *    падала до 2.66 в тёмной теме. Ни один человек с нормальным зрением этого не
 *    видел, поэтому дефект прожил столько, сколько существовала палитра.
 *
 * ЧТО ПРОВЕРЯЕТСЯ ТЕПЕРЬ: любые две серии различимы — при нормальном зрении и
 * при трёх видах дихромазии, в обеих темах. 28 пар × 4 зрения × 2 темы.
 *
 * ПОРОГ 5.5 НЕ НАЗНАЧЕН, А СНЯТ С ПАЛИТР, ПРО КОТОРЫЕ ИЗВЕСТНО, ЧТО ОНИ РАБОТАЮТ:
 * Tol bright 5.20, Tol vibrant 5.60, Okabe-Ito 6.41, Tol muted 6.67 (худшая пара
 * по тем же четырём зрениям). 5.5 стоит между худшим и лучшим из них: ниже —
 * пускали бы то, что хуже общепризнанно рабочего минимума; выше — гейт краснел бы
 * на Tol bright, а объявлять дефектной палитру, которой пользуются годами, значит
 * проверять свой вкус. Нынешняя палитра даёт 6.48, то есть запас ~1.0.
 */

const css = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8')

/** Минимум ΔE' (CAM16-UCS) между ЛЮБЫМИ двумя сериями, при любом из четырёх зрений. */
const MIN_PAIR_DE = 5.5

/** Худшая пара у палитр-эталонов — источник порога, а не украшение комментария. */
const BENCHMARKS = { 'Tol bright': 5.2, 'Tol vibrant': 5.6, 'Okabe-Ito': 6.41, 'Tol muted': 6.67 }

/** WCAG 1.4.11: линия и заливка серии — графические объекты, несущие смысл. */
const MIN_SURFACE_CONTRAST = 3

/* ------------------------------------------------------------------ цвет
   Колориметрия УЕХАЛА В МОДУЛЬ `colour-science.ts` (DS-181).

   До той задачи вся машинка — контраст, CAM16-UCS, матрицы Machado — жила
   здесь, потому что читатель был один. Читателей стало четверо (матрица пар,
   словарь тонов, страница-справка, этот гейт), и копия на каждого разошлась бы
   молча: поправленная в одном файле матрица оставила бы остальные считать
   по-старому, а числа везде выглядели бы одинаково правдоподобно.

   Проверка самой машинки уехала туда же — `colour-science.test.ts`. Она про
   реализацию CAM16, а не про палитру серий, и держать её здесь значило бы
   ронять этот гейт на чужом дефекте и наоборот. */

type Vision = VisionName
const VISIONS = ALL_VISIONS


// ------------------------------------------------------------------ разбор

function extractBlock(source: string, selector: string): string {
  const re = new RegExp(
    `${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\n\\}`,
  )
  const m = source.match(re)
  expect(m, `block for ${selector} missing`).not.toBeNull()
  return m![1]
}

function parseChartColors(block: string): string[] {
  const bare = block.replace(/\/\*[\s\S]*?\*\//g, '')
  const colors: string[] = []
  for (let i = 1; i <= CHART_SERIES_COUNT; i++) {
    const m = bare.match(new RegExp(`--ds-chart-${i}\\s*:\\s*(#[0-9a-fA-F]{3,8})\\s*;`))
    expect(m, `--ds-chart-${i} missing or not a hex`).not.toBeNull()
    colors.push(m![1])
  }
  return colors
}

function parseSurface(block: string): string {
  const bare = block.replace(/\/\*[\s\S]*?\*\//g, '')
  const m = bare.match(/--ds-surface\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/)
  expect(m, '--ds-surface missing').not.toBeNull()
  return m![1]
}

const THEMES = [
  { name: 'light', selector: ':root', vc: VIEWING.light },
  { name: 'dark', selector: '[data-theme="dark"]', vc: VIEWING.dark },
] as const

/**
 * ВСЕ пары индексов. Отдельной функцией, а не циклом по месту, ровно потому,
 * что сузить её обратно до соседей — это правка в ОДНОМ месте, и на ней стоит
 * позитивный контроль ниже. Первая редакция этого гейта считала пары во втором,
 * собственном цикле и была зелёной на сужении настоящего: тест проверял сам
 * себя (способ №3 из writing-checks).
 */
function allPairs(n: number): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([i, j])
  return out
}

/** Пары ниже порога — то, что гейт объявляет дефектом. Чистая функция: её и проверяем. */
function weakPairs(colors: string[], vc: Viewing, threshold: number): string[] {
  const bad: string[] = []
  for (const vision of VISIONS) {
    const sim = colors.map((c) => simulate(c, vision))
    for (const [i, j] of allPairs(sim.length)) {
      const de = deltaE(sim[i], sim[j], vc)
      if (de < threshold) {
        bad.push(
          `${vision} chart-${i + 1}/${j + 1}: ΔE' ${de.toFixed(2)} < ${threshold}` +
            ` (${colors[i]} vs ${colors[j]}, как ${sim[i]} vs ${sim[j]})`,
        )
      }
    }
  }
  return bad
}

/** Худшая пара палитры: минимум по всем парам и всем зрениям. */
function worstPair(colors: string[], vc: Viewing): { de: number; a: number; b: number; vision: Vision } {
  let worst = { de: Infinity, a: 0, b: 0, vision: 'normal' as Vision }
  for (const vision of VISIONS) {
    const sim = colors.map((c) => simulate(c, vision))
    for (let i = 0; i < sim.length; i++) {
      for (let j = i + 1; j < sim.length; j++) {
        const de = deltaE(sim[i], sim[j], vc)
        if (de < worst.de) worst = { de, a: i + 1, b: j + 1, vision }
      }
    }
  }
  return worst
}

// ------------------------------------------------------------------- гейт

describe('chart series palette', () => {
  it(`exposes ${CHART_SERIES_COUNT} CSS-variable refs for charts`, () => {
    expect(chartSeriesVars).toHaveLength(CHART_SERIES_COUNT)
    expect(chartSeriesVars[0]).toBe('var(--ds-chart-1)')
    expect(chartSeriesVars[7]).toBe('var(--ds-chart-8)')
  })

  /* САНИТАР МАШИНКИ уехал в `colour-science.test.ts` вместе с самой машинкой
     (DS-181). Он проверяет реализацию CAM16 и матрицы Machado на
     эталонном стимуле — утверждение про КОЛОРИМЕТРИЮ, а не про палитру серий.
     Пока он стоял здесь, дефект реализации ронял бы гейт палитры, и чинили бы
     палитру. */

  /**
   * ПОЗИТИВНЫЙ КОНТРОЛЬ — та проверка, которой не хватило первой редакции.
   * Синтетическая палитра, у которой плохая пара ТОЛЬКО несоседняя (1 и 7):
   * соседи разведены, цепочка i/i+1 её не видит. Гейт обязан её завалить.
   * Сузит кто-нибудь allPairs обратно до соседей — покраснеет здесь, а не
   * через год у потребителя.
   */
  it('гейт ловит плохую пару, которая НЕ соседняя по индексу', () => {
    const vc = THEMES[0].vc
    const base = parseChartColors(extractBlock(css, ':root'))
    const sabotaged = [...base]
    sabotaged[6] = base[0] // chart-7 := chart-1, расстояние 0, соседи не тронуты
    const bad = weakPairs(sabotaged, vc, MIN_PAIR_DE)
    expect(bad.length, 'подмена chart-7 на chart-1 обязана быть найдена').toBeGreaterThan(0)
    expect(bad.join('\n')).toContain('chart-1/7')
    // и контроль обратной стороны: неиспорченная палитра проходит
    expect(weakPairs(base, vc, MIN_PAIR_DE)).toEqual([])
  })

  it('allPairs — это все 28 пар восьми цветов, а не цепочка из 7', () => {
    expect(allPairs(CHART_SERIES_COUNT)).toHaveLength(28)
    expect(allPairs(4)).toHaveLength(6)
    // среди них обязана быть несмежная — та, которую цепочка соседей теряет
    expect(allPairs(8)).toContainEqual([0, 6])
  })

  /**
   * ПОРЯДОК. Большинство графиков рисуют две-три серии — работает ПРЕФИКС
   * палитры, а не восьмёрка. Перестановка внутри того же набора меняла пару
   * chart-1/chart-2 с 7.33 до 11.92 даром.
   *
   * Проверяется ЖАДНОСТЬ, а не «префикс не хуже целого»: первая редакция
   * требовала второго, и обмен chart-2 с chart-8 её проходил — условие
   * выполнялось и на испорченном порядке. Жадность же говорит точно: на каждой
   * позиции стоит тот из ОСТАВШИХСЯ цветов, который дальше всего от уже
   * выбранных. Одно на обе темы: порядок общий, и слабое звено решает, поэтому
   * расстояние берётся как худшее из двух тем.
   */
  it('порядок жадный по обеим темам — первые цвета разведены максимально', () => {
    const light = parseChartColors(extractBlock(css, ':root'))
    const dark = parseChartColors(extractBlock(css, '[data-theme="dark"]'))
    const d = (i: number, j: number): number =>
      Math.min(
        ...VISIONS.map((v) => deltaE(simulate(light[i], v), simulate(light[j], v), THEMES[0].vc)),
        ...VISIONS.map((v) => deltaE(simulate(dark[i], v), simulate(dark[j], v), THEMES[1].vc)),
      )
    const wrong: string[] = []
    for (let k = 1; k < CHART_SERIES_COUNT; k++) {
      const chosen = d(k, 0) === Infinity ? 0 : Math.min(...[...Array(k).keys()].map((p) => d(k, p)))
      for (let c = k + 1; c < CHART_SERIES_COUNT; c++) {
        const alt = Math.min(...[...Array(k).keys()].map((p) => d(c, p)))
        if (alt > chosen + 1e-9) {
          wrong.push(
            `позиция ${k + 1}: стоит chart-${k + 1} (${chosen.toFixed(2)} до префикса),` +
              ` а chart-${c + 1} дал бы ${alt.toFixed(2)} — порядок не жадный`,
          )
        }
      }
    }
    expect(wrong, wrong.join('\n')).toEqual([])
  })

  /**
   * Стенд `demo/palette-lab.tsx` держит копию палитры — не для рисования
   * (вариант «как есть» ничего не подставляет и берёт цвета из tokens.css),
   * а для самопроверки своего фильтра дихромазии. Копия, которую ничто не
   * сверяет, расходится молча: стенд продолжит показывать «совпало», проверяя
   * фильтр против цветов, которых в системе больше нет.
   */
  it('копия палитры в стенде совпадает с tokens.css', () => {
    const lab = readFileSync(resolve(__dirname, '../demo/palette-data.ts'), 'utf8')
    const m = lab.match(/"tokens":\s*\{"light":\s*\[([^\]]+)\],\s*"dark":\s*\[([^\]]+)\]/)
    expect(m, 'demo/palette-data.ts: блок "tokens" не разобран').not.toBeNull()
    const hexes = (s: string): string[] => [...s.matchAll(/#[0-9A-Fa-f]{6}/g)].map((x) => x[0].toUpperCase())
    expect(hexes(m![1]), 'светлая тема разошлась со стендом').toEqual(
      parseChartColors(extractBlock(css, ':root')).map((c) => c.toUpperCase()),
    )
    expect(hexes(m![2]), 'тёмная тема разошлась со стендом').toEqual(
      parseChartColors(extractBlock(css, '[data-theme="dark"]')).map((c) => c.toUpperCase()),
    )
  })

  it('порог стоит между эталонными палитрами, а не взят с потолка', () => {
    const worst = Math.min(...Object.values(BENCHMARKS))
    const best = Math.max(...Object.values(BENCHMARKS))
    expect(MIN_PAIR_DE).toBeGreaterThanOrEqual(worst)
    expect(MIN_PAIR_DE).toBeLessThanOrEqual(best)
  })

  for (const theme of THEMES) {
    describe(theme.name, () => {
      const block = extractBlock(css, theme.selector)
      const colors = parseChartColors(block)

      it('любые две серии различимы при всех четырёх зрениях', () => {
        const bad = weakPairs(colors, theme.vc, MIN_PAIR_DE).map((s) => `${theme.name}/${s}`)
        expect(bad, bad.join('\n')).toEqual([])
      })

      it('каждый цвет даёт >= 3:1 к поверхности своей темы', () => {
        const surface = parseSurface(block)
        const weak = colors
          .map((c, i) => ({ i: i + 1, c, ratio: contrastRatio(c, surface) }))
          .filter((x) => x.ratio < MIN_SURFACE_CONTRAST)
          .map((x) => `${theme.name} chart-${x.i}: ${x.ratio.toFixed(2)}:1 (${x.c} на ${surface})`)
        expect(weak, weak.join('\n')).toEqual([])
      })

      it('держится с запасом над эталонной планкой', () => {
        const w = worstPair(colors, theme.vc)
        expect(
          w.de,
          `худшая пара chart-${w.a}/chart-${w.b} при ${w.vision}: ΔE' ${w.de.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(BENCHMARKS['Tol bright'])
      })
    })
  }
})
