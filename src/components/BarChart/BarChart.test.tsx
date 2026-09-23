import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BarChart, keepChars, rotateCatLabels } from './BarChart.js'

const CATS = ['Янв', 'Фев', 'Мар']
const SERIES = [
  { id: 'in', label: 'Поступления', values: [820, 940, 760] },
  { id: 'out', label: 'Списания', values: [610, 700, 690] },
]

const bars = (c: HTMLElement) => [...c.querySelectorAll('.ds-bar__rect')] as SVGPathElement[]

/** Bounding box of a bar: every path command here takes plain x,y pairs. */
function box(bar: SVGPathElement) {
  const n = (bar.getAttribute('d')!.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  const xs = n.filter((_, i) => i % 2 === 0)
  const ys = n.filter((_, i) => i % 2 === 1)
  const x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}
/** Rounded corners, one quadratic curve each. */
const corners = (bar: SVGPathElement) => (bar.getAttribute('d')!.match(/Q/g) ?? []).length

describe('BarChart', () => {
  it('draws one bar per category and series', () => {
    const { container } = render(<BarChart categories={CATS} series={SERIES} />)
    expect(bars(container)).toHaveLength(6)
  })

  it('scales bar length by value against the largest bar', () => {
    const { container } = render(
      <BarChart categories={['a', 'b']} series={[{ id: 's', label: 'S', values: [50, 100] }]} />,
    )
    const [small, big] = bars(container).map((b) => box(b).h)
    expect(small).toBeCloseTo(big! / 2, 0)
  })

  it('stacks bars of one category on the same x', () => {
    const { container } = render(<BarChart categories={CATS} series={SERIES} mode="stacked" />)
    const xs = new Set(bars(container).map((b) => box(b).x))
    expect(xs.size).toBe(CATS.length)
  })

  it('places each stacked bar on top of the one below it', () => {
    const { container } = render(<BarChart categories={['a']} series={SERIES} mode="stacked" />)
    const [lower, upper] = bars(container).map(box)
    // Верхний сегмент кончается ровно там, где начинается нижний.
    expect(upper!.y + upper!.h).toBeCloseTo(lower!.y, 1)
  })

  it('stacks horizontal bars along x, keeping them on one y', () => {
    const { container } = render(
      <BarChart categories={['a']} series={SERIES} mode="stacked" orientation="horizontal" />,
    )
    const [first, second] = bars(container).map(box)
    expect(second!.y).toBeCloseTo(first!.y, 1)
    expect(second!.x).toBeCloseTo(first!.x + first!.w, 1)
  })

  it('keeps bar geometry identical whether value labels are shown', () => {
    const geom = (labels: boolean) => {
      const { container, unmount } = render(
        <BarChart categories={CATS} series={SERIES} valueLabels={labels} />,
      )
      const g = bars(container).map((b) => JSON.stringify(box(b)))
      unmount()
      return g
    }
    // Подпись — необязательное содержимое; раскладка не должна от неё зависеть.
    expect(geom(true)).toEqual(geom(false))
  })

  it('rounds only the corners at the value end, leaving the axis side square', () => {
    const { container } = render(<BarChart categories={['a']} series={[SERIES[0]!]} radius={5} />)
    const bar = bars(container)[0]!
    expect(corners(bar)).toBe(2)
    // Нижние углы — точно на оси: столбец не должен отрываться от неё.
    const { x, y, w, h } = box(bar)
    expect(bar.getAttribute('d')).toContain(`M ${x} ${y + h}`)
    expect(bar.getAttribute('d')).toContain(`L ${x + w} ${y + h}`)
  })

  it('squares the corners inside a stack, rounding only its outer end', () => {
    const { container } = render(
      <BarChart categories={['a']} series={SERIES} mode="stacked" radius={5} />,
    )
    const [lower, upper] = bars(container)
    expect(corners(lower!)).toBe(0)
    expect(corners(upper!)).toBe(2)
  })

  it('leaves every corner square at radius 0', () => {
    const { container } = render(<BarChart categories={CATS} series={SERIES} radius={0} />)
    for (const b of bars(container)) expect(corners(b)).toBe(0)
  })

  it('never rounds a bar by more than half its width', () => {
    const { container } = render(
      <BarChart categories={['a']} series={[{ id: 's', label: 'S', values: [100] }]} radius={999} />,
    )
    // Иначе дуги перехлёстываются и столбец выворачивается наизнанку.
    expect(box(bars(container)[0]!).w).toBeGreaterThan(0)
    expect(bars(container)[0]!.getAttribute('d')).not.toContain('NaN')
  })

  describe('signed values', () => {
    const plot = (c: HTMLElement) => {
      const svg = c.querySelector('svg')!
      return { h: Number(svg.getAttribute('height')) }
    }

    it('leaves an all-positive chart exactly as it was before signed support', () => {
      const { container } = render(
        <BarChart categories={['a', 'b']} series={[{ id: 's', label: 'S', values: [50, 100] }]} />,
      )
      // Закреплено замером до правки: ось от нуля, шкала та же.
      expect(bars(container).map(box).map((b) => [b.y, b.h])).toEqual([[107, 89], [18, 178]])
    })

    it('keeps a negative bar inside the plot instead of running off the canvas', () => {
      const { container } = render(
        <BarChart categories={['a', 'b']} series={[{ id: 's', label: 'S', values: [-50, 100] }]} />,
      )
      const svgH = plot(container).h
      for (const b of bars(container).map(box)) {
        expect(b.y).toBeGreaterThanOrEqual(0)
        expect(b.y + b.h).toBeLessThanOrEqual(svgH)
      }
    })

    it('hangs a negative bar below the same zero line a positive one stands on', () => {
      const { container } = render(
        <BarChart categories={['a', 'b']} series={[{ id: 's', label: 'S', values: [-50, 50] }]} />,
      )
      const [neg, pos] = bars(container).map(box)
      // Оба касаются нуля: низ положительного и верх отрицательного совпадают.
      expect(neg!.y).toBeCloseTo(pos!.y + pos!.h, 1)
      expect(neg!.h).toBeCloseTo(pos!.h, 1)
    })

    it('scales an all-negative series to the box rather than to a unit axis', () => {
      const { container } = render(
        <BarChart categories={['a', 'b']} series={[{ id: 's', label: 'S', values: [-50, -20] }]} />,
      )
      const svgH = plot(container).h
      for (const b of bars(container).map(box)) expect(b.h).toBeLessThan(svgH)
    })

    it('rounds a negative bar on the end it grows towards', () => {
      const { container } = render(
        <BarChart categories={['a', 'b']} series={[{ id: 's', label: 'S', values: [-50, 50] }]} radius={5} />,
      )
      const [neg, pos] = bars(container)
      const negBox = box(neg!), posBox = box(pos!)
      expect(corners(neg!)).toBe(2)
      // У отрицательного скруглён низ: верхние углы лежат ровно на нуле.
      expect(neg!.getAttribute('d')).toContain(`M ${negBox.x} ${negBox.y}`)
      expect(pos!.getAttribute('d')).toContain(`M ${posBox.x} ${posBox.y + posBox.h}`)
    })

    it('mirrors the same rule when the bars run horizontally', () => {
      const { container } = render(
        <BarChart categories={['a', 'b']} series={[{ id: 's', label: 'S', values: [-50, 50] }]}
          orientation="horizontal" />,
      )
      const [neg, pos] = bars(container).map(box)
      expect(neg!.x + neg!.w).toBeCloseTo(pos!.x, 1)
      expect(neg!.w).toBeCloseTo(pos!.w, 1)
    })

    it('stacks negatives downward and positives upward from zero', () => {
      const { container } = render(
        <BarChart
          categories={['a']}
          series={[
            { id: 'up', label: 'Up', values: [60] },
            { id: 'down', label: 'Down', values: [-40] },
            { id: 'up2', label: 'Up2', values: [30] },
          ]}
          mode="stacked"
        />,
      )
      const [up, down, up2] = bars(container).map(box)
      // Обе положительные — друг на друге; отрицательная уходит вниз от нуля.
      expect(up2!.y + up2!.h).toBeCloseTo(up!.y, 1)
      expect(down!.y).toBeCloseTo(up!.y + up!.h, 1)
    })

    it('draws a zero line when the scale crosses zero', () => {
      const { container } = render(
        <BarChart categories={['a']} series={[{ id: 's', label: 'S', values: [-50] }]} />,
      )
      expect(container.querySelectorAll('.ds-bar__zero')).toHaveLength(1)
    })

    it('leaves out the zero line when nothing is negative', () => {
      const { container } = render(<BarChart categories={CATS} series={SERIES} />)
      expect(container.querySelectorAll('.ds-bar__zero')).toHaveLength(0)
    })
  })

  it('labels each bar with its value', () => {
    render(<BarChart categories={['Янв']} series={[{ id: 's', label: 'S', values: [1430] }]} />)
    expect(screen.getByText('1 430')).toBeInTheDocument()
  })

  it('labels a stack with the category total, not the parts', () => {
    render(<BarChart categories={['Янв']} series={SERIES} mode="stacked" />)
    expect(screen.getByText('1 430')).toBeInTheDocument()
    expect(screen.queryByText('820')).not.toBeInTheDocument()
  })

  it('drops tick labels but keeps the bars when axis is off', () => {
    const { container } = render(<BarChart categories={CATS} series={SERIES} axis={false} />)
    expect(container.querySelectorAll('.ds-bar__axis')).toHaveLength(0)
    expect(bars(container)).toHaveLength(6)
  })

  it('hides the grid on request', () => {
    const { container } = render(<BarChart categories={CATS} series={SERIES} grid={false} />)
    expect(container.querySelectorAll('.ds-bar__grid')).toHaveLength(0)
  })

  it('widens bars as the gap between groups shrinks', () => {
    const width = (gap: number) => {
      const { container, unmount } = render(
        <BarChart categories={CATS} series={SERIES} groupGap={gap} />,
      )
      const w = box(bars(container)[0]!).w
      unmount()
      return w
    }
    expect(width(4)).toBeGreaterThan(width(24))
  })

  it('names itself for screen readers', () => {
    render(<BarChart categories={CATS} series={SERIES} ariaLabel="Движение средств" />)
    expect(screen.getByRole('img', { name: 'Движение средств' })).toBeInTheDocument()
  })

  it('names itself from its own series when the caller gives none', () => {
    render(<BarChart categories={CATS} series={SERIES} />)
    expect(screen.getByRole('img', { name: 'Столбчатая диаграмма: Поступления, Списания' })).toBeInTheDocument()
  })

  it('never hides the plot away from the legend that controls it', () => {
    const { container } = render(<BarChart categories={CATS} series={SERIES} />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
    expect(container.querySelectorAll('.ds-bar__chip').length).toBeGreaterThan(0)
  })

  it('releases the hover dimming where there is no pointer to hover with', () => {
    const css = readFileSync(resolve(__dirname, 'BarChart.css'), 'utf8')
    // На тач-экране :hover залипает после тапа — все столбцы остаются блёклыми.
    const block = css.match(/@media \(hover: none\)\s*\{([\s\S]*?)\n\}/)
    expect(block, 'нет отката подсветки для @media (hover: none)').not.toBeNull()
    expect(block![1]).toMatch(/opacity:\s*1/)
  })

  it('offers a legend only when there is more than one series', () => {
    const { container, rerender } = render(<BarChart categories={CATS} series={SERIES} />)
    expect(container.querySelectorAll('.ds-bar__chip')).toHaveLength(2)
    rerender(<BarChart categories={CATS} series={[SERIES[0]!]} />)
    expect(container.querySelectorAll('.ds-bar__chip')).toHaveLength(0)
  })

  it('drops a series from the plot when its legend chip is switched off', async () => {
    const user = userEvent.setup()
    const { container } = render(<BarChart categories={CATS} series={SERIES} />)
    await user.click(screen.getByRole('button', { name: /Списания/ }))
    expect(bars(container)).toHaveLength(3)
  })

  it('formats values with the formatter given', () => {
    render(
      <BarChart
        categories={['Янв']}
        series={[{ id: 's', label: 'S', values: [1430] }]}
        format={(n) => `${n} ₽`}
      />,
    )
    expect(screen.getByText('1430 ₽')).toBeInTheDocument()
  })

  it('survives a series of zeros without producing a broken scale', () => {
    const { container } = render(
      <BarChart categories={['a', 'b']} series={[{ id: 's', label: 'S', values: [0, 0] }]} />,
    )
    for (const b of bars(container)) {
      expect(box(b).h).toBe(0)
      expect(b.getAttribute('d')).not.toContain('NaN')
    }
  })
})

describe('BarChart variant=spark', () => {
  const series = [{ id: 'c', label: 'коммиты', values: [4, 7, 2, 9, 5, 1, 6] }]
  const categories = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

  it('снимает оси, сетку и подписи', () => {
    const full = render(<BarChart categories={categories} series={series} />)
    const spark = render(<BarChart categories={categories} series={series} variant="spark" />)
    // Проверяем ВИДИМЫЕ подписи осей, а не любое вхождение строки: имя графика
    // для скринридера тоже перечисляет категории («коммиты, пн: 4…»), и его
    // спарклайн сохраняет намеренно.
    const axisText = (c: HTMLElement) =>
      Array.from(c.querySelectorAll('.ds-bar__axis')).map((t) => t.textContent)
    expect(axisText(full.container)).toContain('пн')
    expect(axisText(spark.container)).toHaveLength(0)
    expect(spark.container.querySelectorAll('line').length)
      .toBeLessThan(full.container.querySelectorAll('line').length)
  })

  it('снимает легенду даже при нескольких сериях', () => {
    // Легенда — часть обвязки; спарклайн живёт в карточке, где ей нет места.
    const { container } = render(
      <BarChart
        categories={['пн', 'вт']} variant="spark"
        series={[
          { id: 'a', label: 'добавлено', values: [3, 4] },
          { id: 'b', label: 'удалено', values: [1, 2] },
        ]}
      />,
    )
    expect(container.querySelector('.ds-bar__legend')).toBeNull()
  })

  it('столбцы рисуются — спарклайн это тот же график без обвязки', () => {
    const { container } = render(
      <BarChart categories={categories} series={series} variant="spark" />,
    )
    expect(container.querySelectorAll('path[style]').length).toBe(7)
  })

  it('имя для скринридера сохраняется — обвязку снимаем, доступность нет', () => {
    const { container } = render(
      <BarChart categories={categories} series={series} variant="spark" />,
    )
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('role', 'img')
    expect(svg.getAttribute('aria-label')).toBeTruthy()
  })
})

describe('BarChart: состояние столбца', () => {
  const cats = ['9:00', '10:00', '11:00', '12:00']
  const one = [{ id: 'h', label: 'коммиты', values: [7, 0, 3, 0] }]
  const state = (i: number): 'neutral' | 'accent' | undefined =>
    (i < 2 ? 'neutral' : i === 2 ? 'accent' : undefined)

  it('без track дорожек нет — всё аддитивно', () => {
    const { container } = render(<BarChart categories={cats} series={one} />)
    expect(container.querySelectorAll('.ds-bar__track')).toHaveLength(0)
  })

  it('track даёт по дорожке на категорию, включая нулевые', () => {
    // Нулевой столбец рисуется вырожденным путём нулевой высоты — без дорожки
    // категория просто исчезает с графика.
    const { container } = render(<BarChart categories={cats} series={one} track />)
    expect(container.querySelectorAll('.ds-bar__track')).toHaveLength(4)
  })

  it('barTone красит столбец и дорожку одним тоном', () => {
    const { container } = render(
      <BarChart categories={cats} series={one} track barTone={state} />,
    )
    const tracks = container.querySelectorAll('.ds-bar__track')
    expect(tracks[0]).toHaveClass('ds-bar__track--neutral')
    expect(tracks[2]).toHaveClass('ds-bar__track--accent')
    // Категория без тона остаётся нейтральной дорожкой без модификатора тона.
    expect(tracks[3]!.getAttribute('class')).not.toMatch(/track--(neutral|accent)/)
  })

  it('barTone игнорируется при нескольких сериях — иначе легенда солгала бы', () => {
    // Чип легенды показывал бы один цвет, а столбец другой. Отказ видимый:
    // цвета просто не меняются, и это заметно сразу.
    const { container } = render(
      <BarChart
        categories={cats} track barTone={state}
        series={[
          { id: 'a', label: 'добавлено', values: [1, 2, 3, 4] },
          { id: 'b', label: 'удалено', values: [1, 1, 1, 1] },
        ]}
      />,
    )
    const tracks = container.querySelectorAll('.ds-bar__track')
    expect(tracks[0]!.getAttribute('class')).not.toMatch(/track--/)
  })

  it('highlightIndex даёт обводку ровно одной колонке', () => {
    const { container } = render(
      <BarChart categories={cats} series={one} track highlightIndex={2} />,
    )
    expect(container.querySelectorAll('.ds-bar__mark')).toHaveLength(1)
  })

  it('обводка есть и у нулевой колонки — она цепляется за дорожку, не за столбец', () => {
    const { container } = render(
      <BarChart categories={cats} series={one} track highlightIndex={3} />,
    )
    const mark = container.querySelector('.ds-bar__mark')!
    expect(mark).not.toBeNull()
    expect(Number(mark.getAttribute('height'))).toBeGreaterThan(10)
  })

  it('тон не меняет геометрию столбца — цвет это состояние, высота величина', () => {
    const plain = render(<BarChart categories={cats} series={one} />)
    const toned = render(<BarChart categories={cats} series={one} barTone={state} />)
    const d = (c: HTMLElement) =>
      Array.from(c.querySelectorAll('path[style]')).map((p) => p.getAttribute('d'))
    expect(d(toned.container)).toEqual(d(plain.container))
  })
})

// DS-185 §1. В jsdom канвы нет, ширина — оценка `textWidth` (0.6 em на
// символ при 12 px, DS-375: `.ds-bar__axis` теперь на `--ds-fs-sm`,
// литерал оценки в `BarChart.tsx` пересчитан следом), холст — откат 520.
// Числа ниже выведены из неё; настоящий шрифт и настоящую ширину держит
// случай `make measure` «BarChart горизонтальный: подпись категории не
// срезается с начала».
describe('BarChart: поле подписей категорий', () => {
  const one = [{ id: 's', label: 'S', values: [1, 2] }]
  const catLabels = (c: HTMLElement) =>
    [...c.querySelectorAll('text.ds-bar__axis[text-anchor="end"]')]
  const barLeft = (c: HTMLElement) => Math.min(...bars(c).map((b) => box(b).x))

  it('короткие подписи оставляют пол поля (DS-375: 44 → 53)', () => {
    const { container } = render(<BarChart categories={['Янв', 'Фев']} series={one} orientation="horizontal" />)
    expect(barLeft(container)).toBeCloseTo(53, 5)
  })

  it('длинная подпись расширяет поле под себя', () => {
    // 21 символ × 7.2 (0.6 × 12) = 151.2, плюс зазоры 8 — 159.2, меньше потолка 0.4 × 520.
    const { container } = render(
      <BarChart categories={['Центральный таксопарк', 'Юг']} series={one} orientation="horizontal" />,
    )
    expect(barLeft(container)).toBeCloseTo(159.2, 5)
    expect(catLabels(container)[0]!.querySelector('title')).toBeNull()
  })

  it('подпись длиннее 40 % ширины режется с конца и несёт полное имя в <title>', () => {
    const long = 'Очень длинное название автоколонны номер двенадцать'
    const { container } = render(
      <BarChart categories={[long, 'Юг']} series={one} orientation="horizontal" />,
    )
    expect(barLeft(container)).toBeCloseTo(0.4 * 520, 5)
    const t = catLabels(container)[0]!
    const shown = [...t.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('')
    expect(shown.endsWith('…')).toBe(true)
    expect(long.startsWith(shown.slice(0, -1))).toBe(true)
    expect(t.querySelector('title')!.textContent).toBe(long)
    expect(catLabels(container)[1]!.querySelector('title')).toBeNull()
  })

  it('вертикальная ориентация не трогается: поле на полу при любой длине подписи (DS-375: 44 → 53)', () => {
    const { container } = render(
      <BarChart categories={['Центральный таксопарк', 'Юг']} series={one} />,
    )
    expect(barLeft(container)).toBeCloseTo(53 + 5, 5) // + половина groupGap
  })
})

// DS-185 §2.2: при всех скрытых рядах ось не вырождается в 0…1.
describe('BarChart: все ряды скрыты', () => {
  const CATS2 = ['Юг', 'Север', 'Восток']
  const S2 = [
    { id: 'plan', label: 'План', values: [180, 140, 96] },
    { id: 'fact', label: 'Факт', values: [74, 51, 40] },
  ]
  const ticks = (c: HTMLElement) =>
    [...c.querySelectorAll('text.ds-bar__axis[text-anchor="end"]')].map((t) => t.textContent)

  it.each(['grouped', 'stacked'] as const)('%s: ось по всем рядам, подпись в поле, вернул ряд — ось по нему', async (mode) => {
    const full = render(<BarChart categories={CATS2} series={S2} mode={mode} />)
    const fullTicks = ticks(full.container)
    full.unmount()
    const solo = render(<BarChart categories={CATS2} series={[S2[1]!]} mode={mode} />)
    const soloTicks = ticks(solo.container)
    solo.unmount()
    // Иначе «ось по вернувшемуся ряду» не отличить от «ось по всем».
    expect(soloTicks).not.toEqual(fullTicks)

    const { container } = render(<BarChart categories={CATS2} series={S2} mode={mode} />)
    for (const chip of screen.getAllByRole('button')) await userEvent.click(chip)
    expect(bars(container)).toHaveLength(0)
    expect(container.querySelector('.ds-bar__empty')?.textContent).toBe('Все ряды скрыты')
    expect(ticks(container)).toEqual(fullTicks)
    expect(ticks(container)[ticks(container).length - 1]).not.toBe('1')

    await userEvent.click(screen.getByRole('button', { name: /Факт/ }))
    expect(container.querySelector('.ds-bar__empty')).toBeNull()
    expect(ticks(container)).toEqual(soloTicks)
  })
})

// DS-295: сколько символов имени обязана показать подпись. Чистая
// функция — сама раскладка живёт в `make measure`, где есть шрифт и ширина
// холста. Требований два, и каждое обязано срабатывать ПОРОЗНЬ: иначе одно из
// них — мёртвый код, а случай про него читается как проверка.
describe('BarChart: требование к подписи категории', () => {
  const parks = ['Автопарк-Юг', 'Автопарк-Север']

  it('ПОЛ: одиночной категории хватает четырёх символов, трёх — нет', () => {
    // Уникальность здесь вырождена (сосед один, и он же сам), и держит только
    // пол. Обе границы — те же, что система признавала именем по правилу
    // «половина»: «Авто…» проходило, «Авт…» нет.
    expect(keepChars(['Автопарк'], 0)).toBe(4)
    expect(rotateCatLabels(['Автопарк'], ['Авт…'])).toBe(true)
    expect(rotateCatLabels(['Автопарк'], ['Авто…'])).toBe(false)
  })

  it('ПОЛ не требует больше, чем есть: имя короче пола показывается целиком', () => {
    // Требуй четыре — и «Юг» не мог бы удовлетворить правилу никогда, то есть
    // ряд с коротким именем крутился бы вечно ни за чем.
    expect(keepChars(['Юг'], 0)).toBe(2)
    expect(rotateCatLabels(['Юг'], ['Юг'])).toBe(false)
    expect(rotateCatLabels(['Юг'], ['Ю…'])).toBe(true)
  })

  it('УНИКАЛЬНОСТЬ: общее начало требует символа сверх него', () => {
    // «Автопарк-» — девять общих символов, значит десять у каждого.
    expect(keepChars(parks, 0)).toBe(10)
    expect(keepChars(parks, 1)).toBe(10)
  })

  it('УНИКАЛЬНОСТЬ срабатывает ОДНА, выше пола', () => {
    // Восемь символов у обоих — пол пройден с запасом, а показано одно и то же
    // у РАЗНЫХ парков. Ровно дефект 280, который доля пропускала.
    expect(rotateCatLabels(parks, ['Автопар…', 'Автопар…'])).toBe(true)
    // Тот же ряд, на символ длиннее: показанное разошлось — поворота нет.
    expect(rotateCatLabels(parks, ['Автопарк-Ю', 'Автопарк-С…'])).toBe(false)
  })

  it('ПОЛ срабатывает ОДИН, при уникальном показанном', () => {
    // «Ю» и «Це…» друг друга различают, но именами не являются.
    expect(rotateCatLabels(['Юго-запад', 'Центр'], ['Ю…', 'Це…'])).toBe(true)
  })

  it('одинаковым ИМЕНАМ уникальность не требуется: её не дала бы никакая длина', () => {
    // Иначе ряд из двух «Депо» крутился бы всегда и ни к чему не приходил.
    expect(keepChars(['Депо', 'Депо'], 0)).toBe(4)
    expect(rotateCatLabels(['Депо', 'Депо'], ['Депо', 'Депо'])).toBe(false)
  })

  it('требование не превышает длины самого имени, но соседа не освобождает', () => {
    // «Автопарк» — начало «Автопарк-Юг». Своей длины короткому не перешагнуть,
    // и требование упирается в неё: целое имя правилу удовлетворяет всегда.
    // Длинному это поблажки не даёт — «Автопарк…» не называет его вовсе, а
    // лишь сообщает, что это не «Автопарк»; опознание по исключению работает
    // на двух соседях и разваливается на трёх.
    const nest = ['Автопарк', 'Автопарк-Юг']
    expect(keepChars(nest, 0)).toBe(8)
    expect(keepChars(nest, 1)).toBe(9)
    expect(rotateCatLabels(nest, ['Автопарк', 'Автопарк…'])).toBe(true)
    expect(rotateCatLabels(nest, ['Автопарк', 'Автопарк-…'])).toBe(false)
  })

  it('порог у ОДНОЙ категории поворачивает ВЕСЬ ряд', () => {
    // Первая подпись целая, вторая не дотянула. Ряд один, и прямые вперемешку
    // с повёрнутыми читались бы как два разных ряда.
    expect(rotateCatLabels(['Автопарк-Юг', 'Восточная колонна'], ['Автопарк-Юг', 'Во…'])).toBe(true)
  })

  it('многоточие именем не считается', () => {
    // «Авт…» — три символа имени и четвёртый знак обрезки. Считай многоточие
    // именем, и порог срабатывал бы на символ позже, чем должен.
    expect(rotateCatLabels(['Автопарк'], ['Авт…'])).toBe(true)
  })

  it('пустая подпись — столбец без имени, это всегда поворот', () => {
    expect(rotateCatLabels(['Юг'], [''])).toBe(true)
  })

  it('считается в СИМВОЛАХ, а не в ширинах', () => {
    // Замер на 360 × 1: «Центральный таксопарк» получил 57.2 px полосы при
    // полных 113.0 — ровно половину ШИРИНЫ — и оставил 8 символов из 21.
    // Восемь символов пол проходят, и поворот здесь решает не длина, а сосед.
    const name = 'Центральный таксопарк'
    expect(Array.from(name).length).toBe(21)
    expect(rotateCatLabels([name], ['Централь…'])).toBe(false)
    expect(rotateCatLabels([name], ['Це…'])).toBe(true)
  })
})
