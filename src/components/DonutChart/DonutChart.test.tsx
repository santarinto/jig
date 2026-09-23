import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DonutChart } from './DonutChart.js'

const DATA = [
  { id: 'goods', label: 'Товары', value: 1240 },
  { id: 'services', label: 'Услуги', value: 860 },
  { id: 'rent', label: 'Аренда', value: 420 },
]

const arcs = (c: HTMLElement) => [...c.querySelectorAll('.ds-donut__slice')] as SVGPathElement[]
const nums = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)

/** Angular span of a slice, from the two outer-arc endpoints. */
function sweep(path: SVGPathElement, size: number) {
  const [x0, y0, , , , , , x1, y1] = nums(path.getAttribute('d')!)
  const c = size / 2
  const a = (x: number, y: number) => Math.atan2(y - c, x - c)
  let d = a(x1!, y1!) - a(x0!, y0!)
  if (d < -Math.PI) d += 2 * Math.PI
  return d
}

describe('DonutChart', () => {
  it('draws one arc per slice', () => {
    const { container } = render(<DonutChart data={DATA} />)
    expect(arcs(container)).toHaveLength(3)
  })

  it('sizes each arc by its share of the total', () => {
    const { container } = render(
      <DonutChart data={[{ id: 'a', label: 'A', value: 75 }, { id: 'b', label: 'B', value: 25 }]} sliceGap={0} />,
    )
    const [a, b] = arcs(container).map((p) => sweep(p, 180))
    expect(a! / (a! + b!)).toBeCloseTo(0.75, 2)
  })

  it('cuts the hole to the thickness given', () => {
    const inner = (thickness: number) => {
      const { container, unmount } = render(<DonutChart data={DATA} thickness={thickness} />)
      const n = nums(arcs(container)[0]!.getAttribute('d')!)
      const outer = n[2]!, hole = n[11]!
      unmount()
      return hole / outer
    }
    expect(inner(0.4)).toBeCloseTo(0.6, 2)
    expect(inner(0.2)).toBeCloseTo(0.8, 2)
  })

  it('marks a slice over half the circle as a large arc', () => {
    const { container } = render(
      <DonutChart data={[{ id: 'a', label: 'A', value: 70 }, { id: 'b', label: 'B', value: 30 }]} sliceGap={0} />,
    )
    // Без флага крупной дуги SVG нарисует короткую сторону — доля вывернется.
    expect(nums(arcs(container)[0]!.getAttribute('d')!)[5]).toBe(1)
    expect(nums(arcs(container)[1]!.getAttribute('d')!)[5]).toBe(0)
  })

  it('never inverts a slice narrower than the gap between slices', () => {
    const { container } = render(
      <DonutChart
        data={[{ id: 'big', label: 'Big', value: 1000 }, { id: 'tiny', label: 'Tiny', value: 1 }]}
        sliceGap={6}
      />,
    )
    expect(sweep(arcs(container)[1]!, 180)).toBeGreaterThanOrEqual(0)
    for (const p of arcs(container)) expect(p.getAttribute('d')).not.toContain('NaN')
  })

  it('shows the total in the middle, under a caption', () => {
    render(<DonutChart data={DATA} center="sumLabel" />)
    expect(screen.getByText('Всего')).toBeInTheDocument()
    expect(screen.getByText('2 520')).toBeInTheDocument()
  })

  it('drops the caption but keeps the total for center="sum"', () => {
    render(<DonutChart data={DATA} center="sum" />)
    expect(screen.queryByText('Всего')).not.toBeInTheDocument()
    expect(screen.getByText('2 520')).toBeInTheDocument()
  })

  it('leaves the middle empty on request', () => {
    render(<DonutChart data={DATA} center="none" />)
    expect(screen.queryByText('2 520')).not.toBeInTheDocument()
  })

  it('takes the caption from the caller', () => {
    render(<DonutChart data={DATA} centerLabel="Оборот" />)
    expect(screen.getByText('Оборот')).toBeInTheDocument()
  })

  it('lists every slice in the legend with its value', () => {
    const { container } = render(<DonutChart data={DATA} legendValue="value" />)
    expect(container.querySelectorAll('.ds-donut__row')).toHaveLength(3)
    expect(screen.getByText('Аренда')).toBeInTheDocument()
    expect(screen.getByText('1 240')).toBeInTheDocument()
  })

  it('shows shares instead of values when asked', () => {
    render(<DonutChart data={[{ id: 'a', label: 'A', value: 3 }, { id: 'b', label: 'B', value: 1 }]} legendValue="percent" />)
    expect(screen.getByText('75 %')).toBeInTheDocument()
    expect(screen.getByText('25 %')).toBeInTheDocument()
  })

  it('drops the legend entirely for legend="none"', () => {
    const { container } = render(<DonutChart data={DATA} legend="none" />)
    expect(container.querySelectorAll('.ds-donut__row')).toHaveLength(0)
    expect(arcs(container)).toHaveLength(3)
  })

  it('names itself for screen readers', () => {
    render(<DonutChart data={DATA} ariaLabel="Структура расходов" />)
    expect(screen.getByRole('img', { name: 'Структура расходов' })).toBeInTheDocument()
  })

  it('names itself from its own slices when the caller gives none', () => {
    render(<DonutChart data={DATA} />)
    expect(screen.getByRole('img', { name: 'Круговая диаграмма: Товары, Услуги, Аренда' })).toBeInTheDocument()
  })

  it('leaves nothing hidden from assistive tech', () => {
    const { container } = render(<DonutChart data={DATA} />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('formats values with the formatter given', () => {
    render(<DonutChart data={DATA} format={(n) => `${n} ₽`} />)
    expect(screen.getByText('2520 ₽')).toBeInTheDocument()
  })

  it('renders nothing but survives an all-zero total', () => {
    const { container } = render(
      <DonutChart data={[{ id: 'a', label: 'A', value: 0 }, { id: 'b', label: 'B', value: 0 }]} legend="none" />,
    )
    for (const p of arcs(container)) expect(p.getAttribute('d')).not.toContain('NaN')
    // Делить на нулевую сумму нечего — доли обнуляются, а не становятся NaN.
    expect(container.querySelector('.ds-donut__center-value')).toHaveTextContent('0')
  })
})

describe('DonutChart — некорректный ввод', () => {
  it('keeps the hole inside the ring however thick it is asked to be', () => {
    for (const thickness of [1.5, -0.5, 0]) {
      const { container, unmount } = render(<DonutChart data={DATA} thickness={thickness} />)
      const n = nums(arcs(container)[0]!.getAttribute('d')!)
      const outer = n[2]!, hole = n[11]!
      expect(hole, `thickness=${thickness}`).toBeGreaterThanOrEqual(0)
      expect(hole, `thickness=${thickness}`).toBeLessThan(outer)
      unmount()
    }
  })

  it('keeps the shares within one whole when a value is negative', () => {
    const { container } = render(
      <DonutChart
        data={[{ id: 'a', label: 'A', value: 70 }, { id: 'b', label: 'B', value: -30 }]}
        legendValue="percent"
      />,
    )
    // Считать доли от обрезанных значений, а сумму — от сырых, значит выдать
    // 175 %: кольцо прокрутится больше оборота и ляжет само на себя.
    const shares = [...container.querySelectorAll('.ds-donut__value')]
      .map((el) => Number(el.textContent!.replace(/[^\d-]/g, '')))
    expect(shares.reduce((s, x) => s + x, 0)).toBeLessThanOrEqual(100)
  })

  it('does not sweep a negative slice backwards over its neighbours', () => {
    const { container } = render(
      <DonutChart data={[{ id: 'a', label: 'A', value: 70 }, { id: 'b', label: 'B', value: -30 }]} sliceGap={0} />,
    )
    // Доля целого не бывает отрицательной; дуга обязана выродиться, а не пойти вспять.
    expect(sweep(arcs(container)[1]!, 180)).toBeGreaterThanOrEqual(0)
    for (const p of arcs(container)) expect(p.getAttribute('d')).not.toContain('NaN')
  })
})
