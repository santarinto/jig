import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { assignPaletteSlots } from './paletteSlots.js'
import { chartSeriesVar } from '../../tokens/chartPalette.js'
import { LineChart, type ChartSeries } from '../components/LineChart/LineChart.js'
import { BarChart, type BarSeries } from '../components/BarChart/BarChart.js'
import { DonutChart, type DonutSlice } from '../components/DonutChart/DonutChart.js'

/** DS-185 §3. */
const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}` }))
const slotOf = (v: string | undefined) => Number(v?.match(/--ds-chart-(\d)/)?.[1])

describe('assignPaletteSlots', () => {
  it('без закреплений — ровно chartSeriesVar(индекс), с заворотом после восьмого', () => {
    const m = assignPaletteSlots(ids(10), 'T')
    ids(10).forEach((it, i) => expect(m.get(it.id)).toBe(chartSeriesVar(i)))
  })

  it('закреплённый слот выдаётся как есть', () => {
    const m = assignPaletteSlots([{ id: 'a', paletteSlot: 7 }, { id: 'b', paletteSlot: 3 }], 'T')
    expect(m.get('a')).toBe('var(--ds-chart-7)')
    expect(m.get('b')).toBe('var(--ds-chart-3)')
  })

  it('незакреплённые берут свободные слоты по порядку, обходя закреплённые', () => {
    const m = assignPaletteSlots(
      [{ id: 'a' }, { id: 'p1', paletteSlot: 1 }, { id: 'b' }, { id: 'p3', paletteSlot: 3 }, { id: 'c' }],
      'T',
    )
    expect(['a', 'b', 'c'].map((id) => slotOf(m.get(id)))).toEqual([2, 4, 5])
  })

  it('когда свободные кончились, незакреплённые заворачиваются по свободным, а не по закреплённым', () => {
    const pinned = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `p${n}`, paletteSlot: n as 1 }))
    const m = assignPaletteSlots([...pinned, { id: 'x' }, { id: 'y' }, { id: 'z' }], 'T')
    expect(['x', 'y', 'z'].map((id) => slotOf(m.get(id)))).toEqual([7, 8, 7])
  })

  it('один слот у двух рядов — исключение с обоими id и номером слота', () => {
    expect(() => assignPaletteSlots(
      [{ id: 'south', paletteSlot: 4 }, { id: 'mid' }, { id: 'north', paletteSlot: 4 }], 'LineChart',
    )).toThrow(/LineChart.*paletteSlot 4.*«south».*«north»/)
  })

  it('слот вне 1..8 через any — исключение, а не заворот', () => {
    expect(() => assignPaletteSlots([{ id: 'a', paletteSlot: 9 as unknown as 1 }], 'T')).toThrow(/paletteSlot 9/)
    expect(() => assignPaletteSlots([{ id: 'a', paletteSlot: 0 as unknown as 1 }], 'T')).toThrow(/paletteSlot 0/)
  })

  it('слот вне 1..8 — ошибка типа у всех трёх компонентов', () => {
    // @ts-expect-error — 9 вне литерального союза
    const a: ChartSeries = { id: 'a', label: 'A', points: [], paletteSlot: 9 }
    // @ts-expect-error — 0 вне литерального союза
    const b: BarSeries = { id: 'b', label: 'B', values: [], paletteSlot: 0 }
    // @ts-expect-error — 9 вне литерального союза
    const c: DonutSlice = { id: 'c', label: 'C', value: 1, paletteSlot: 9 }
    expect([a, b, c]).toHaveLength(3)
  })
})

/*
 * Полный набор без закреплений против поднабора, закреплённого за своими
 * исходными слотами: у одного и того же id цвет обязан совпасть — в отметке
 * И в точке легенды. Поднабор взят дальний (третий и седьмой), потому что
 * ближний (первый и второй) совпал бы и без закрепления.
 */
const EIGHT_IDX = [2, 6]

describe('LineChart: поднабор с закреплёнными слотами рисуется цветами полного', () => {
  const EIGHT: ChartSeries[] = Array.from({ length: 8 }, (_, i) => ({
    id: `c${i}`, label: `Колонна ${i + 1}`, points: [{ x: 'a', y: i }, { x: 'b', y: i + 1 }],
  }))
  const strokes = (c: HTMLElement) =>
    [...c.querySelectorAll<SVGPathElement>('.ds-chart__line')].map((p) => p.style.stroke)
  const dots = (c: HTMLElement) =>
    [...c.querySelectorAll<HTMLElement>('.ds-chart__chip-dot')].map((d) => d.style.background)

  it('LineChart', () => {
    const full = render(<LineChart series={EIGHT} />)
    const fullStrokes = strokes(full.container)
    expect(dots(full.container)).toEqual(fullStrokes)
    full.unmount()

    const pair = EIGHT_IDX.map((i) => ({ ...EIGHT[i]!, paletteSlot: (i + 1) as 3 }))
    const { container } = render(<LineChart series={pair} />)
    expect(strokes(container)).toEqual(EIGHT_IDX.map((i) => fullStrokes[i]))
    expect(dots(container)).toEqual(EIGHT_IDX.map((i) => fullStrokes[i]))
  })

  it('LineChart: один слот у двух рядов бросает при отрисовке', () => {
    const bad = [{ ...EIGHT[0]!, paletteSlot: 2 as const }, { ...EIGHT[1]!, paletteSlot: 2 as const }]
    const err = console.error
    console.error = () => {}
    try {
      expect(() => render(<LineChart series={bad} />)).toThrow(/LineChart.*paletteSlot 2.*«c0».*«c1»/)
    } finally { console.error = err }
  })
})

describe('BarChart: поднабор с закреплёнными слотами рисуется цветами полного', () => {
  const EIGHT: BarSeries[] = Array.from({ length: 8 }, (_, i) => ({
    id: `c${i}`, label: `Колонна ${i + 1}`, values: [i + 1, i + 2],
  }))
  const fills = (c: HTMLElement) => {
    // Одна категория на серию достаточно: столбцы идут серия за серией внутри категории.
    const g = c.querySelector('svg > g')!
    return [...g.querySelectorAll<SVGPathElement>('.ds-bar__rect')].map((p) => p.style.fill)
  }
  const dots = (c: HTMLElement) =>
    [...c.querySelectorAll<HTMLElement>('.ds-bar__chip-dot')].map((d) => d.style.background)

  it('BarChart', () => {
    const full = render(<BarChart categories={['a', 'b']} series={EIGHT} />)
    const fullFills = fills(full.container)
    expect(fullFills).toHaveLength(8)
    expect(dots(full.container)).toEqual(fullFills)
    full.unmount()

    const pair = EIGHT_IDX.map((i) => ({ ...EIGHT[i]!, paletteSlot: (i + 1) as 3 }))
    const { container } = render(<BarChart categories={['a', 'b']} series={pair} />)
    expect(fills(container)).toEqual(EIGHT_IDX.map((i) => fullFills[i]))
    expect(dots(container)).toEqual(EIGHT_IDX.map((i) => fullFills[i]))
  })

  it('BarChart: один слот у двух серий бросает при отрисовке', () => {
    const bad = [{ ...EIGHT[0]!, paletteSlot: 5 as const }, { ...EIGHT[3]!, paletteSlot: 5 as const }]
    const err = console.error
    console.error = () => {}
    try {
      expect(() => render(<BarChart categories={['a', 'b']} series={bad} />)).toThrow(/BarChart.*paletteSlot 5.*«c0».*«c3»/)
    } finally { console.error = err }
  })
})

describe('DonutChart: поднабор с закреплёнными слотами рисуется цветами полного', () => {
  const EIGHT: DonutSlice[] = Array.from({ length: 8 }, (_, i) => ({
    id: `d${i}`, label: `Доля ${i + 1}`, value: 10 + i,
  }))
  const slices = (c: HTMLElement) =>
    [...c.querySelectorAll<SVGPathElement>('.ds-donut__slice')].map((p) => p.style.fill)
  const dots = (c: HTMLElement) =>
    [...c.querySelectorAll<HTMLElement>('.ds-donut__dot')].map((d) => d.style.background)

  it('DonutChart', () => {
    const full = render(<DonutChart data={EIGHT} />)
    const fullFills = slices(full.container)
    expect(dots(full.container)).toEqual(fullFills)
    full.unmount()

    const pair = EIGHT_IDX.map((i) => ({ ...EIGHT[i]!, paletteSlot: (i + 1) as 3 }))
    const { container } = render(<DonutChart data={pair} />)
    expect(slices(container)).toEqual(EIGHT_IDX.map((i) => fullFills[i]))
    expect(dots(container)).toEqual(EIGHT_IDX.map((i) => fullFills[i]))
  })

  it('DonutChart: один слот у двух долей бросает при отрисовке', () => {
    const bad = [{ ...EIGHT[1]!, paletteSlot: 8 as const }, { ...EIGHT[2]!, paletteSlot: 8 as const }]
    const err = console.error
    console.error = () => {}
    try {
      expect(() => render(<DonutChart data={bad} />)).toThrow(/DonutChart.*paletteSlot 8.*«d1».*«d2»/)
    } finally { console.error = err }
  })
})
