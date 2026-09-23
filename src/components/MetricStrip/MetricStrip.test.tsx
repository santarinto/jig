import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MetricStrip } from './MetricStrip.js'

const metrics = [
  { id: 'revenue', label: 'Выручка', value: '1 240 500 ₽' },
  { id: 'debt', label: 'Задолженность', value: '86 300 ₽', tone: 'warning' as const },
  { id: 'docs', label: 'Документов', value: 42, hint: 'за месяц' },
]

describe('MetricStrip', () => {
  it('renders every metric with its label and value', () => {
    render(<MetricStrip metrics={metrics} />)
    expect(screen.getByText('Выручка')).toBeInTheDocument()
    expect(screen.getByText('1 240 500 ₽')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('за месяц')).toBeInTheDocument()
  })

  it('marks a toned value so it reads as a status, not decoration', () => {
    render(<MetricStrip metrics={metrics} />)
    expect(screen.getByText('86 300 ₽')).toHaveClass('ds-metrics__value--warning')
    expect(screen.getByText('1 240 500 ₽')).not.toHaveClass('ds-metrics__value--warning')
  })

  it('is a list, so a screen reader announces how many metrics there are', () => {
    render(<MetricStrip metrics={metrics} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })
})

/* Обратная связь портала: на 430px четыре метрики режутся многоточием —
   grid-auto-flow: column держит их в одну строку любой ценой. */
describe('MetricStrip on a narrow screen', () => {
  it('stays on one row by default', () => {
    const { container } = render(<MetricStrip metrics={metrics} />)
    const el = container.querySelector('.ds-metrics') as HTMLElement
    expect(el.className).not.toMatch(/ds-metrics--cols-/)
  })

  it('wraps into the number of columns asked for', () => {
    const { container } = render(<MetricStrip metrics={metrics} columns={2} />)
    const el = container.querySelector('.ds-metrics') as HTMLElement
    expect(el).toHaveClass('ds-metrics--cols-2')
  })

  it('stretches a cell left alone on the last row', () => {
    const css = readFileSync(resolve(__dirname, 'MetricStrip.css'), 'utf8')
    // Замер показал: три метрики в две колонки оставляют третью шириной 159 из
    // 320 — на её месте зияет дорожка цвета сетки. auto-fit + minmax этого не
    // решает: он схлопывает только полностью пустые дорожки, а nth-child не
    // принимает переменную, поэтому число колонок должно быть известно.
    for (const n of [2, 3, 4]) {
      const rule = new RegExp(`\\.ds-metrics--cols-${n}[^{]*:last-child:nth-child\\(${n}n\\+1\\)\\s*\\{([^}]+)\\}`)
      const block = css.match(rule)
      expect(block, `нет правила растяжения для ${n} колонок`).not.toBeNull()
      expect(block![1]).toMatch(/grid-column\s*:\s*1\s*\/\s*-1/)
    }
  })
})

describe('MetricStrip dense', () => {
  const css = () => readFileSync(resolve(__dirname, 'MetricStrip.css'), 'utf8')

  it('applies the tighter padding only under the dense modifier', () => {
    const block = css().match(/\.ds-metrics--dense \.ds-metrics__cell\s*\{([^}]+)\}/)
    expect(block, 'нет правила .ds-metrics--dense .ds-metrics__cell').not.toBeNull()
    expect(block![1]).toMatch(/--ds-space-3/)
  })

  it('leaves the roomy padding as the default', () => {
    // Разорванный модификатор оставил это правило неквалифицированным, и все
    // полосы стали уплотнёнными: замер в браузере дал 6px 8px в обоих режимах.
    const rules = [...css().matchAll(/(^|\n)([^{}\n][^{}]*)\{([^}]*)\}/g)]
    const unqualified = rules.filter(
      (m) => m[2]!.trim() === '.ds-metrics__cell' && /--ds-space-3/.test(m[3]!),
    )
    expect(unqualified, 'уплотнённый padding задан без модификатора').toHaveLength(0)
  })
})

describe('MetricStrip columns 5/6 (DS-23)', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, label: `L${i}`, value: i }))
  // Число колонок держит measure-инвариант «columns=5 даёт пять колонок»;
  // здесь — что проп доводит модификатор до разметки.
  it('columns=5 задаёт модификатор cols-5', () => {
    const { container } = render(<MetricStrip metrics={many(5)} columns={5} />)
    expect(container.querySelector('.ds-metrics')).toHaveClass('ds-metrics--cols-5')
  })
  it('columns=6 задаёт модификатор cols-6', () => {
    const { container } = render(<MetricStrip metrics={many(6)} columns={6} />)
    expect(container.querySelector('.ds-metrics')).toHaveClass('ds-metrics--cols-6')
  })
})

/**
 * «Данных нет» в метрике (DS-93).
 *
 * Потребитель перевёл свою полосу счётчиков на `MetricStrip` и получил три
 * жирных тёмных прочерка на карточке воркера без прогонов — читаются как три
 * значения. Замерено в браузере до правки: голый прочерк в
 * `.ds-metrics__value` давал вес 700 и цвет `rgb(38, 38, 38)`, ровно как
 * соседнее настоящее число. Не «похоже» — неотличимо.
 *
 * `Money value={null}` сюда не годится: это компонент СУММЫ (валюта, знак,
 * эквивалент), а метрики бывают счётчиками. `tone` расширять нельзя — он про
 * состояние САМОГО ЧИСЛА, а «данных нет» это его отсутствие; слить их значило
 * бы повторить болезнь `__num`, одно имя на две идеи.
 */
describe('MetricStrip · данных нет', () => {
  const withEmpty = [
    { id: 'runs', label: 'Прогонов', value: null },
    { id: 'msgs', label: 'Сообщений', value: 1240 },
  ]

  it('value: null рисует прочерк, а не пустоту', () => {
    render(<MetricStrip metrics={withEmpty} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('прочерк помечен так, что отличим от значения — и метка НЕ достаётся соседу', () => {
    render(<MetricStrip metrics={withEmpty} />)
    const dash = screen.getByText('—').closest('.ds-metrics__value')!
    const real = screen.getByText('1240')
    expect(dash).toHaveClass('ds-metrics__value--empty')
    // Сосед с заведомо известным значением: без него проверка проходила бы и
    // на разметке, которая метит КАЖДУЮ ячейку.
    expect(real).not.toHaveClass('ds-metrics__value--empty')
  })

  /**
   * Ноль — ЗНАЧЕНИЕ, а не его отсутствие, и это единственная ловушка правки.
   * Схлопни их — и «0 прогонов» покажется прочерком, то есть данные, которые
   * есть, объявятся отсутствующими. Та же ошибка, что `!!c.width` вместо
   * `c.width !== undefined` у колонок (DS-88): ложность вместо заданности.
   */
  it('ноль и пустая строка — значения, а не «данных нет»', () => {
    render(<MetricStrip metrics={[
      { id: 'z', label: 'Прогонов', value: 0 },
      { id: 'e', label: 'Строка', value: '' },
    ]} />)
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.queryByText('—')).toBeNull()
    expect(screen.getByText('0')).not.toHaveClass('ds-metrics__value--empty')
  })

  it('повод показывает hint — второго способа сказать одно не заводим', () => {
    render(<MetricStrip metrics={[{ id: 'r', label: 'Прогонов', value: null, hint: 'прогонов не было' }]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('прогонов не было')).toBeInTheDocument()
  })

  /**
   * Диктор на «—» говорит либо «тире», либо молчит: ни то ни другое не
   * сообщает, что данных нет. Имя даётся СКРЫТЫМ ТЕКСТОМ, а не `aria-label`:
   * на `<div>` без роли `aria-label` дикторы игнорируют, и проверка
   * `toHaveAccessibleName` прошла бы там, где вживую не звучит ничего —
   * зелёное, которое не проверяет (docs/writing-checks.md).
   */
  it('прочерк уходит в дерево доступности словами, а сам знак от диктора скрыт', () => {
    render(<MetricStrip metrics={withEmpty} />)
    expect(screen.getByText('—')).toHaveAttribute('aria-hidden', 'true')
    const said = screen.getByText('данных нет')
    expect(said).toHaveClass('ds-visually-hidden')
    expect(said.closest('.ds-metrics__value')).toHaveClass('ds-metrics__value--empty')
  })
})
