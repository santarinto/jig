import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { LineChart, pickXLabels, type ChartSeries } from './LineChart.js'

const money: ChartSeries[] = [
  { id: 'in', label: 'Доход', points: [{ x: 'Янв', y: 10 }, { x: 'Фев', y: 14 }, { x: 'Мар', y: 12 }] },
  { id: 'out', label: 'Расход', points: [{ x: 'Янв', y: 8 }, { x: 'Фев', y: 9 }, { x: 'Мар', y: 11 }] },
]

describe('LineChart', () => {
  it('draws one line per series and no area by default (fill="line")', () => {
    const { container } = render(<LineChart series={money} />)
    // Роль проверяется в блоке accessibility: без ariaLabel её осознанно нет.
    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(container.querySelectorAll('.ds-chart__line')).toHaveLength(2)
    expect(container.querySelectorAll('.ds-chart__area')).toHaveLength(0)
  })

  it('renders an area path when fill="area"', () => {
    const { container } = render(<LineChart series={[money[0]]} fill="area" />)
    expect(container.querySelectorAll('.ds-chart__area')).toHaveLength(1)
  })

  it('shows a legend for multiple series and toggles a series off', async () => {
    const { container } = render(<LineChart series={money} />)
    const chip = screen.getByRole('button', { name: /Расход/ })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(container.querySelectorAll('.ds-chart__line')).toHaveLength(1)
  })

  it('renders y-axis tick labels and x-axis category labels', () => {
    render(<LineChart series={money} />)
    expect(screen.getByText('Янв')).toBeInTheDocument()
    expect(screen.getByText('Мар')).toBeInTheDocument()
  })

  it('colors series from --ds-chart-* tokens, not semantic status colors', () => {
    const { container } = render(<LineChart series={money} />)
    const lines = container.querySelectorAll<SVGPathElement>('.ds-chart__line')
    expect(lines[0].style.stroke).toBe('var(--ds-chart-1)')
    expect(lines[1].style.stroke).toBe('var(--ds-chart-2)')
  })

  // C5: the sparkline is a mode, not a second component — same path maths, the
  // chrome (axes, grid, legend, labels) is what goes away.
  describe('variant="spark"', () => {
    it('drops grid, axis labels and legend', () => {
      const { container } = render(<LineChart series={money} variant="spark" />)
      expect(container.querySelectorAll('.ds-chart__grid')).toHaveLength(0)
      expect(container.querySelectorAll('.ds-chart__ylabel')).toHaveLength(0)
      expect(container.querySelectorAll('.ds-chart__xlabel')).toHaveLength(0)
      expect(container.querySelector('.ds-chart__legend')).toBeNull()
    })

    it('still draws the line, and fills by default because it is a single trend', () => {
      const { container } = render(<LineChart series={[money[0]]} variant="spark" />)
      expect(container.querySelectorAll('.ds-chart__line')).toHaveLength(1)
      expect(container.querySelectorAll('.ds-chart__area')).toHaveLength(1)
    })

    it('marks the last point so the current value is findable', () => {
      const { container } = render(<LineChart series={[money[0]]} variant="spark" lastPoint />)
      expect(container.querySelector('.ds-chart__last')).toBeInTheDocument()
    })

    // Without an explicit height the svg keeps the viewBox aspect ratio, so a
    // sparkline in a wide card grew to 260px instead of the 96 it asks for.
    it('pins its height instead of scaling with the card width', () => {
      const { container } = render(<LineChart series={[money[0]]} variant="spark" />)
      const svg = container.querySelector('svg')!
      expect(svg.getAttribute('style')).toContain('96px')
    })

    it('does not change the full chart default: a single series still gets no area', () => {
      const { container } = render(<LineChart series={[money[0]]} />)
      expect(container.querySelectorAll('.ds-chart__area')).toHaveLength(0)
    })

    it('keeps the full chart untouched — grid and labels stay in the default variant', () => {
      const { container } = render(<LineChart series={money} />)
      expect(container.querySelectorAll('.ds-chart__grid').length).toBeGreaterThan(0)
      expect(container.querySelectorAll('.ds-chart__xlabel').length).toBeGreaterThan(0)
    })
  })
})

/* Полный чарт рисует viewBox 1:1 к пикселям контейнера (useChartBox — тот же
   хук, что у BarChart): раньше он держал пропорции холста 520×H и на широкой
   карточке раздувался по высоте вместе с подписями. jsdom не умеет layout,
   поэтому ResizeObserver подменяется. */
describe('LineChart responsive width', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const stubResizeObserver = (width: number, height: number) => {
    const callbacks: ResizeObserverCallback[] = []
    vi.stubGlobal('ResizeObserver', class {
      cb: ResizeObserverCallback
      constructor(cb: ResizeObserverCallback) { this.cb = cb; callbacks.push(cb) }
      observe() { this.cb([{ contentRect: { width, height } } as ResizeObserverEntry], this as unknown as ResizeObserver) }
      disconnect() {}
      unobserve() {}
    })
    return callbacks
  }

  it('widens the viewBox to the measured container instead of scaling up', async () => {
    stubResizeObserver(1200, 220)
    const { container } = render(<LineChart series={money} height={220} />)
    await act(async () => {})
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('viewBox')).toBe('0 0 1200 220')
    // Высота при этом остаётся собственной, а не производной от ширины.
    expect(svg.getAttribute('style')).toContain('220px')
  })

  it('follows the measured height under --ds-ui-scale, so text is not distorted', async () => {
    // Контейнер выше запрошенных 220 ровно в масштаб UI (1.25): viewBox обязан
    // взять замеренную высоту, иначе glyph'ы растягиваются по вертикали.
    stubResizeObserver(1000, 275)
    const { container } = render(<LineChart series={money} height={220} />)
    await act(async () => {})
    expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 1000 275')
  })

  it('keeps the base canvas when ResizeObserver is unavailable (jsdom default)', () => {
    const { container } = render(<LineChart series={money} />)
    expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 520 200')
  })

  it('leaves the sparkline on the fixed canvas — it is a strip, not a plot', async () => {
    stubResizeObserver(1200, 96)
    const { container } = render(<LineChart series={[money[0]]} variant="spark" />)
    await act(async () => {})
    expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 520 96')
  })
})

describe('LineChart accessibility', () => {
  it('takes the accessible name the caller gives it', () => {
    render(<LineChart series={money} ariaLabel="Остаток на счетах" />)
    expect(screen.getByRole('img', { name: 'Остаток на счетах' })).toBeInTheDocument()
  })

  it('names itself from its own series when the caller gives none', () => {
    // «Изображение» без имени скринридер объявит и на этом замолчит.
    render(<LineChart series={money} />)
    expect(screen.getByRole('img', { name: 'График: Доход, Расход' })).toBeInTheDocument()
  })

  it('never hides the plot away from the legend that controls it', () => {
    const { container } = render(<LineChart series={money} />)
    // Спрятать полотно, оставив фокусируемые фишки легенды, — управление
    // невидимым содержимым, и фокус внутри aria-hidden сам по себе нарушение.
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
    expect(container.querySelectorAll('.ds-chart__chip').length).toBeGreaterThan(0)
  })
})

/* Серии разной длины — портал строит такие каждый раз, когда счёт открыт позже
   соседнего. Всё, что ниже, воспроизведено замером, а не рассуждением. */
const ragged: ChartSeries[] = [
  { id: 'short', label: 'Расчётный счёт', points: [{ x: 'Янв', y: 10 }, { x: 'Фев', y: 12 }, { x: 'Мар', y: 11 }] },
  { id: 'long', label: 'Валютный счёт', points: ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг'].map((x, i) => ({ x, y: 20 + i })) },
]

describe('LineChart with series of unequal length', () => {
  it('omits the tooltip row for a series that has no point there', async () => {
    const user = userEvent.setup()
    const { container } = render(<LineChart series={ragged} />)
    const svg = container.querySelector('svg')!
    svg.getBoundingClientRect = () => ({ left: 0, width: 520, top: 0, height: 200, right: 520, bottom: 200, x: 0, y: 0, toJSON: () => {} })
    await user.hover(svg)
    await user.pointer({ target: svg, coords: { clientX: 500, clientY: 100 } })
    const rows = [...container.querySelectorAll('.ds-chart__tip-row')]
    // Ноль вместо «данных нет» читается как «счёт обнулили» — это выдуманное число.
    expect(rows.map((r) => r.querySelector('.ds-chart__tip-label')!.textContent)).toEqual(['Валютный счёт'])
  })

  it('labels the x axis across the whole plot, not just the first series', () => {
    const { container } = render(<LineChart series={ragged} />)
    const labels = [...container.querySelectorAll('.ds-chart__xlabel')].map((n) => n.textContent)
    // Позиции масштабируются по самой длинной серии, значит и подписи должны.
    expect(labels).toContain('Авг')
  })

  it('keeps the hover cursor inside the plot when the series shrinks under it', async () => {
    const user = userEvent.setup()
    const long: ChartSeries[] = [{ id: 'a', label: 'Счёт', points: Array.from({ length: 12 }, (_, i) => ({ x: `М${i}`, y: i })) }]
    const short: ChartSeries[] = [{ id: 'a', label: 'Счёт', points: Array.from({ length: 3 }, (_, i) => ({ x: `М${i}`, y: i })) }]
    const { container, rerender } = render(<LineChart series={long} />)
    const svg = container.querySelector('svg')!
    svg.getBoundingClientRect = () => ({ left: 0, width: 520, top: 0, height: 200, right: 520, bottom: 200, x: 0, y: 0, toJSON: () => {} })
    await user.pointer({ target: svg, coords: { clientX: 510, clientY: 100 } })
    rerender(<LineChart series={short} />)
    const cursor = container.querySelector('.ds-chart__cursor')
    if (cursor) {
      // 520 — ширина viewBox; курсор за ней означает подсказку в соседней карточке.
      expect(Number(cursor.getAttribute('x1'))).toBeLessThanOrEqual(520)
    }
    const tip = container.querySelector('.ds-chart__tip') as HTMLElement | null
    if (tip) {
      // Плашка стоит СБОКУ от направляющей (DS-279): у точек правой
      // половины холста задан `right`, у остальных `left`, и оба — отступы от
      // края холста в px, а не прежний процент от него. Предмет тот же:
      // отрицательный отступ и есть «подсказка уехала в соседнюю карточку»,
      // ровно тот исход, который даёт индекс наведения, не зажатый по длине
      // сжавшегося ряда.
      const side = tip.style.left || tip.style.right
      expect(side, 'плашка без стороны — положение не посчитано вовсе').not.toBe('')
      expect(parseFloat(side)).toBeGreaterThanOrEqual(0)
      // 520 — ширина viewBox: дальше неё отступ от края холста не бывает.
      expect(parseFloat(side)).toBeLessThanOrEqual(520)
    }
  })

  // curve="straight" не рендерился ни в одном тесте (DS-12,
  // LineChart.tsx:176). straightPath — только M/L, smoothPath — C-кривые.
  it('curve="straight" рисует прямые сегменты — L, без C', () => {
    const { container } = render(<LineChart series={[money[0]]} curve="straight" />)
    const d = container.querySelector('.ds-chart__line')!.getAttribute('d')!
    expect(d).toContain('L')
    expect(d).not.toContain('C')
  })

  it('по умолчанию сглажено — C-кривые (контраст к straight)', () => {
    const { container } = render(<LineChart series={[money[0]]} />)
    expect(container.querySelector('.ds-chart__line')!.getAttribute('d')).toContain('C')
  })
})

// DS-185 §2.2. Данные — случай `eight` фикстуры: восемь рядов в 30…120,
// где синтетическая шкала 0…1 печатала бы «0.3» и «0.8».
describe('LineChart: все ряды скрыты', () => {
  const MONTHS = ['Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь']
  const EIGHT: ChartSeries[] = Array.from({ length: 8 }, (_, i) => ({
    id: `c${i}`, label: `Колонна № ${i + 1}`,
    points: MONTHS.map((x, m) => ({ x, y: 40 + i * 9 + Math.round(14 * Math.sin(m + i)) })),
  }))
  const ticks = (c: HTMLElement) =>
    [...c.querySelectorAll('.ds-chart__ylabel')].map((t) => t.textContent)
  const chips = () => screen.getAllByRole('button')

  it('ось по всем рядам, а не 0…1; в поле подпись; вернул ряд — ось по нему', async () => {
    const full = render(<LineChart series={EIGHT} />)
    const fullTicks = ticks(full.container)
    full.unmount()
    const solo = render(<LineChart series={[EIGHT[2]!]} />)
    const soloTicks = ticks(solo.container)
    solo.unmount()
    // Иначе «ось по вернувшемуся ряду» не отличить от «ось по всем».
    expect(soloTicks).not.toEqual(fullTicks)

    const { container } = render(<LineChart series={EIGHT} />)
    expect(container.querySelector('.ds-chart__empty')).toBeNull()
    for (const chip of chips()) await userEvent.click(chip)

    expect(container.querySelectorAll('.ds-chart__line')).toHaveLength(0)
    expect(container.querySelector('.ds-chart__empty')?.textContent).toBe('Все ряды скрыты')
    const ys = EIGHT.flatMap((s) => s.points.map((p) => p.y))
    const lo = Math.min(...ys), hi = Math.max(...ys)
    const hidden = ticks(container)
    expect(hidden).toEqual(fullTicks)
    // Ось накрывает данные круглыми делениями и не шире двух их размахов:
    // синтетическая 0…1 не проходит ни по одному из трёх условий.
    const ns = hidden.map(Number)
    expect(Math.min(...ns)).toBeLessThanOrEqual(lo)
    expect(Math.max(...ns)).toBeGreaterThanOrEqual(hi)
    expect(Math.max(...ns) - Math.min(...ns)).toBeLessThanOrEqual(2 * (hi - lo))
    expect(hidden).not.toContain('0.3')
    expect(hidden).not.toContain('0.8')

    await userEvent.click(chips()[2]!)
    expect(container.querySelector('.ds-chart__empty')).toBeNull()
    expect(ticks(container)).toEqual(soloTicks)
  })

  // Подпись садилась ровно на среднюю линию сетки (приёмка глазами 276, З-3):
  // центр поля при нечётном числе тиков совпадает с линией. Порог — полкегля
  // подписи (--ds-fs-sm ≈ 12px): ближе линия проходит сквозь текст.
  it('подпись «Все ряды скрыты» не лежит на линии сетки', async () => {
    // Свой набор, а не EIGHT: число делений круглой шкалы зависит от данных
    // (DS-275), а случаю нужно нечётное. 22…98 даёт 20…100 шагом 20 —
    // пять линий, средняя ровно в центре поля.
    const ODD: ChartSeries[] = EIGHT.slice(0, 2).map((s, i) => ({
      ...s, points: s.points.map((p, m) => ({ ...p, y: i ? 98 - m * 4 : 22 + m * 4 })),
    }))
    const { container } = render(<LineChart series={ODD} />)
    for (const chip of chips()) await userEvent.click(chip)
    const caption = container.querySelector('.ds-chart__empty')!
    const y = Number(caption.getAttribute('y'))
    const lines = [...container.querySelectorAll('.ds-chart__grid')].map((l) => Number(l.getAttribute('y1')))
    // Сосед: линий нечётное число и центр поля на одной из них — иначе случай
    // зелен и на старом коде.
    expect(lines.length % 2).toBe(1)
    const mid = (Math.min(...lines) + Math.max(...lines)) / 2
    expect(lines.some((l) => Math.abs(l - mid) < 0.5)).toBe(true)
    for (const l of lines) expect(Math.abs(l - y), `подпись на линии сетки y=${l}`).toBeGreaterThan(6)
  })

  // Курсор указывает на точки; при нуле видимых рядов пунктир в пустом поле
  // читался бы меткой значения, которого нет (находка ревью 185). Наведение
  // ставится ПОСЛЕ скрытия: клик по чипу уводит указатель из поля, и проверка
  // «курсора нет» была бы зелёной от mouseleave, а не от правки.
  it('при нуле видимых рядов курсора наведения нет, при одном — есть', async () => {
    const user = userEvent.setup()
    const { container } = render(<LineChart series={EIGHT} />)
    const svg = container.querySelector('svg')!
    svg.getBoundingClientRect = () => ({ left: 0, width: 520, top: 0, height: 200, right: 520, bottom: 200, x: 0, y: 0, toJSON: () => {} })
    const hoverPlot = () => user.pointer({ target: svg, coords: { clientX: 260, clientY: 100 } })

    for (const chip of chips()) await user.click(chip)
    await hoverPlot()
    expect(container.querySelector('.ds-chart__cursor')).toBeNull()

    // Сосед: тот же жест при одном видимом ряде обязан курсор дать, иначе
    // «курсора нет» верно и тогда, когда наведение в тесте не доезжает вовсе.
    await user.click(chips()[2]!)
    await hoverPlot()
    expect(container.querySelector('.ds-chart__cursor')).not.toBeNull()
  })
})

/**
 * Выбор подписанных точек оси X — арифметика, и она снимается без браузера
 * (DS-281). Живой замер `measure` смотрит на ИТОГОВЫЕ bbox в настоящем
 * шрифте; здесь проверяется правило, по которому эти места назначаются, — на
 * ширинах, заданных руками, чтобы случай не зависел от метрик шрифта.
 */
describe('pickXLabels', () => {
  /** Ровная ось: точка i в `left + i * step`, все подписи одной ширины. */
  const axis = (left: number, spacing: number) => (i: number) => left + i * spacing

  it('идёт ровным шагом ОТ ПОСЛЕДНЕЙ точки назад и первую не добавляет силой', () => {
    // Шаг 4 от 9 назад даёт 9, 5, 1 — точка 0 в шаг не попала и подписи не
    // получает. Прежний жадный проход слева давал 0,4,8 плюс принудительную 9,
    // то есть промежутки 4,4,1.
    const p = pickXLabels({
      n: 10, widths: Array(10).fill(20), xAt: axis(40, 70), minStep: 4, gap: 8, leftEdge: 2, lineH: 12,
    })
    expect(p.shown).toEqual([1, 5, 9])
    expect(p.step).toBe(4)
    expect(p.anchors).toEqual(['middle', 'middle', 'end'])
  })

  it('крайние якорятся: точка 0 началом, последняя концом, внутренние серединой', () => {
    const p = pickXLabels({
      n: 12, widths: Array(12).fill(20), xAt: axis(40, 70), minStep: 1, gap: 8, leftEdge: 2, lineH: 12,
    })
    expect(p.shown).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(p.anchors[0]).toBe('start')
    expect(p.anchors[11]).toBe('end')
    expect(new Set(p.anchors.slice(1, 11))).toEqual(new Set(['middle']))
  })

  it('первая ПОДПИСАННАЯ точка берёт start только когда серединой вышла бы за левый край', () => {
    // Одна и та же раскладка, разная ширина первой подписи: 120 не влезает
    // серединой в точку 50 (край −10 при поле 2), 60 влезает (край 20).
    const widths = (w1: number) => [10, w1, 10, 10, 10, 10, 10]
    const wide = pickXLabels({ n: 7, widths: widths(120), xAt: axis(10, 40), minStep: 5, gap: 8, leftEdge: 2, lineH: 12 })
    expect(wide.shown).toEqual([1, 6])
    expect(wide.anchors).toEqual(['start', 'end'])

    const narrow = pickXLabels({ n: 7, widths: widths(60), xAt: axis(10, 40), minStep: 5, gap: 8, leftEdge: 2, lineH: 12 })
    expect(narrow.shown).toEqual([1, 6])
    expect(narrow.anchors).toEqual(['middle', 'end'])
  })

  it('шаг растёт, пока подписи с этими якорями не разойдутся', () => {
    // Ширина 40 при шаге точек 30. Через одну середины бы разошлись (30 × 2 =
    // 60 ≥ 40 + 8), но шаг 2 подписывает и точку 0, а она якорится НАЧАЛОМ и
    // занимает всю свою ширину ВПРАВО — соседке места не остаётся. Просвет
    // считается по итоговым местам с якорями, поэтому шаг уходит на 3, и точка
    // 0 из подписанных выпадает.
    const p = pickXLabels({
      n: 9, widths: Array(9).fill(40), xAt: axis(60, 30), minStep: 1, gap: 8, leftEdge: 2, lineH: 12,
    })
    expect(p.step).toBe(3)
    expect(p.shown).toEqual([2, 5, 8])
    expect(p.anchors).toEqual(['middle', 'middle', 'end'])
  })

  it('прямой ряд из двух и больше подписей не поворачивается и остаётся прежним', () => {
    // Те же входы, что у «шаг растёт…», — ответ обязан совпасть с ним целиком,
    // и флаг поворота снят: высоту поля платить не за что.
    const p = pickXLabels({
      n: 9, widths: Array(9).fill(40), xAt: axis(60, 30), minStep: 1, gap: 8, leftEdge: 2, lineH: 12,
    })
    expect(p).toEqual({ step: 3, shown: [2, 5, 8], anchors: ['middle', 'middle', 'end'], rotated: false })
  })

  it('прямой ряд даёт одну подпись — ряд поворачивается ЦЕЛИКОМ, якорь end у каждой (DS-296)', () => {
    // 100 px подписи при шаге точек 30: по прямой две не разойдутся ни при
    // каком шаге. Повёрнутые — параллельные диагонали: 30 × sin45 = 21.2 не
    // меньше строки 12 и просвета 8, шаг 1. Хвост диагонали уходит влево на
    // sin45 × (100 + 12) = 79.2, и точки 10, 40, 70 выпали бы за край 2 —
    // они не подписываются, шаг от последней назад сохраняется.
    const p = pickXLabels({
      n: 6, widths: Array(6).fill(100), xAt: axis(10, 30), minStep: 1, gap: 8, leftEdge: 2, lineH: 12,
    })
    expect(p.rotated).toBe(true)
    expect(p.shown).toEqual([3, 4, 5])
    expect(p.anchors).toEqual(['end', 'end', 'end'])
  })

  it('в повёрнутом ряду шаг растёт, пока параллельные диагонали не разойдутся', () => {
    // Шаг точек 12: по прямой крайние (40…140 и 72…172) перекрываются, остаётся
    // одна. Повёрнутым шаг 1 даёт 12 × sin45 = 8.5, шаг 2 — 17.0, оба меньше
    // строки 12 и просвета 8; шаг 3 даёт 25.5 — годится. От последней назад:
    // 11, 8, 5, 2; точка 2 (x = 64) хвостом sin45 × 112 = 79.2 уходит за край.
    // Пол плотности 5 повёрнутому ряду не указ: он про горизонтальный след
    // прямой подписи, и с ним шаг вышел бы 5, а не 3.
    const p = pickXLabels({
      n: 12, widths: Array(12).fill(100), xAt: axis(40, 12), minStep: 5, gap: 8, leftEdge: 2, lineH: 12,
    })
    expect(p.rotated).toBe(true)
    expect(p.step).toBe(3)
    expect(p.shown).toEqual([5, 8, 11])
    const gaps = p.shown.slice(1).map((i, j) => (i - p.shown[j]!) * 12 * Math.SQRT1_2)
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(20)
    for (const i of p.shown) expect(40 + i * 12 - Math.SQRT1_2 * 112).toBeGreaterThanOrEqual(2)
  })

  it('повёрнутый ряд в разметке: текст подписи целиком, −45° у своей точки, поле данных ниже', () => {
    // jsdom меряет откатом `символы × 0.6 × размер`: подпись в 58 символов —
    // 348 px на холсте 520, по прямой две не расходятся ни при каком шаге. Обрезанная дата врёт,
    // поэтому текст сверяется с данными ПОСИМВОЛЬНО, а не «начинается с».
    const xs = Array.from({ length: 12 }, (_, i) => `неделя с 2026-07-${String(i + 1).padStart(2, '0')} 00:00 по 2026-07-${String(i + 7).padStart(2, '0')} 23:59 включительно`)
    const long: ChartSeries[] = [{ id: 'a', label: 'Выручка', points: xs.map((x, i) => ({ x, y: 100 + i })) }]
    const short: ChartSeries[] = [{ id: 'a', label: 'Выручка', points: xs.map((_, i) => ({ x: `Н${i}`, y: 100 + i })) }]
    const turned = render(<LineChart series={long} height={400} />).container
    const labels = [...turned.querySelectorAll('.ds-chart__xlabel')]
    expect(labels.length).toBeGreaterThanOrEqual(2)
    for (const l of labels) {
      expect(xs).toContain(l.textContent)
      expect(l.getAttribute('text-anchor')).toBe('end')
      expect(l.getAttribute('transform')).toBe(`rotate(-45 ${l.getAttribute('x')} ${l.getAttribute('y')})`)
    }
    // Базовая линия поля данных — верх риски. Под повёрнутым рядом она выше,
    // чем под прямым: поле подписей выросло, поле данных стало ниже.
    const flat = render(<LineChart series={short} height={400} />).container
    const base = (c: Element) => +c.querySelector('.ds-chart__xtick')!.getAttribute('y1')!
    expect(flat.querySelector('.ds-chart__xlabel')!.getAttribute('transform')).toBeNull()
    expect(base(turned)).toBeLessThan(base(flat))
  })

  it('не сходится и повёрнутый — остаётся прямой ряд из одной последней', () => {
    // Холст начинается в 10, шаг точек 10: повёрнутым нужна дистанция 20 / sin45
    // = 28.3 по X и хвост 79.2 влево — двух не набрать ни при каком шаге.
    const p = pickXLabels({
      n: 6, widths: Array(6).fill(100), xAt: axis(10, 10), minStep: 1, gap: 8, leftEdge: 2, lineH: 12,
    })
    expect(p).toEqual({ step: 6, shown: [5], anchors: ['end'], rotated: false })
  })

  it('одна точка подписывается серединой: крайней ей быть не с чем', () => {
    const p = pickXLabels({ n: 1, widths: [20], xAt: axis(100, 0), minStep: 1, gap: 8, leftEdge: 2, lineH: 12 })
    expect(p.shown).toEqual([0])
    expect(p.anchors).toEqual(['middle'])
  })
})
