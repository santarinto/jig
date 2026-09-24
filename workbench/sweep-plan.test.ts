import { describe, it, expect } from 'vitest'
import { evaluate, summarize, validateSpec, type Cell, type SweepSpec } from './sweep-plan.js'

const cell = (o: Partial<Cell>): Cell => ({
  c: 'X', caseId: 'base', theme: 'light', scale: 1, width: 440, target: 't', found: true, overflow: false, h: 30, w: 80, hit: true, ...o,
})

const spec = (o: Partial<SweepSpec> = {}): SweepSpec => ({
  c: 'X', cases: ['base'], widths: [440], targets: [{ name: 't', selector: '.x' }], ...o,
})

describe('validateSpec: пустое задание — отказ, а не пустой зелёный отчёт', () => {
  it('целое задание проходит', () => expect(validateSpec(spec())).toEqual([]))
  it('пустые ширины, случаи, цели названы полем', () => {
    expect(validateSpec(spec({ widths: [], cases: [], targets: [] }))).toEqual(['cases: пусто', 'widths: пусто', 'targets: пусто'])
  })
  it('метрика «до» без единой цели с before', () => {
    expect(validateSpec(spec({ invariants: [{ metric: 'h', gt: 'hBefore' }] }))).toEqual(['invariants: hBefore без единой цели с before'])
  })
  it('метрика превью без цели с preview', () => {
    expect(validateSpec(spec({ invariants: [{ metric: 'hPreview', eq: 'h', tol: 1 }] }))).toEqual(['invariants: hPreview без единой цели с preview'])
  })
  it('имя цели дважды', () => {
    expect(validateSpec(spec({ targets: [{ name: 't', selector: '.a' }, { name: 't', selector: '.b' }] }))).toEqual(['targets: имя t дважды'])
  })
})

describe('evaluate', () => {
  it('ненайденная цель — нарушение, а не пропуск', () => {
    const v = evaluate([cell({ found: false, h: undefined })], [{ metric: 'h', min: 24 }])
    expect(v.map((x) => x.rule)).toEqual(['цель найдена'])
  })

  it('min называет ячейку и число', () => {
    const v = evaluate([cell({ h: 21.4, scale: 0.875 }), cell({ h: 30 })], [{ metric: 'h', min: 24 }])
    expect(v).toEqual([{ rule: 'h >= 24', at: 'X/base light ×0.875 @440 t', got: '21.4', miss: 24 - 21.4 }])
  })

  it('grows по шкале сравнивает соседей ПРИ ПРОЧИХ РАВНЫХ, а не всех со всеми', () => {
    const cells = [
      cell({ scale: 1, width: 440, h: 30 }), cell({ scale: 1.5, width: 440, h: 45 }),
      // На другой ширине высота меньше — это не нарушение роста по шкале.
      cell({ scale: 1, width: 900, h: 20 }), cell({ scale: 1.5, width: 900, h: 20 }),
    ]
    const v = evaluate(cells, [{ metric: 'h', grows: 'scale' }])
    expect(v.map((x) => x.at)).toEqual(['X/base light ×1.5 @900 t (×1→×1.5)'])
  })

  it('grows не путает темы: соседи по шкале внутри одной темы', () => {
    const cells = [cell({ theme: 'light', scale: 1, h: 30 }), cell({ theme: 'dark', scale: 1.5, h: 29 })]
    expect(evaluate(cells, [{ metric: 'h', grows: 'scale' }])).toEqual([])
  })

  it('same по теме — разброс выше допуска, ось в адресе вынесена', () => {
    const cells = [cell({ theme: 'light', h: 30 }), cell({ theme: 'dark', h: 31 })]
    expect(evaluate(cells, [{ metric: 'h', same: 'theme', tol: 0.5 }])).toEqual([
      { rule: 'h одинаково по theme ±0.5', at: 'X/base {theme} ×1 @440 t', got: 'разброс 1', miss: 1 },
    ])
    expect(evaluate(cells, [{ metric: 'h', same: 'theme', tol: 1 }])).toEqual([])
  })

  it('gt: после больше до', () => {
    const v = evaluate([cell({ h: 24, hBefore: 24 }), cell({ h: 28, hBefore: 20, width: 900 })], [{ metric: 'h', gt: 'hBefore' }])
    expect(v.map((x) => x.at)).toEqual(['X/base light ×1 @440 t'])
  })

  it('eq с допуском: превью против живого', () => {
    const v = evaluate([cell({ h: 30, hPreview: 30.4 }), cell({ h: 30, hPreview: 32, width: 900 })], [{ metric: 'h', eq: 'hPreview', tol: 1 }])
    expect(v.map((x) => x.got)).toEqual(['30 против 32'])
  })

  it('fits и hit', () => {
    const v = evaluate([cell({ overflow: true }), cell({ hit: false, width: 900 })], [{ fits: true }, { hit: true }])
    expect(v.map((x) => `${x.rule} ${x.at}`)).toEqual(['fits X/base light ×1 @440', 'hit X/base light ×1 @900 t'])
  })

  it('fits — одно нарушение на документ, сколько бы целей в нём ни мерилось', () => {
    const v = evaluate([cell({ overflow: true, target: 'a' }), cell({ overflow: true, target: 'b' })], [{ fits: true }])
    expect(v.map((x) => x.at)).toEqual(['X/base light ×1 @440'])
  })
})

describe('summarize', () => {
  it('худшее — по величине промаха', () => {
    const cells = [cell({ h: 23 }), cell({ h: 10, width: 300 })]
    const s = summarize(cells, evaluate(cells, [{ metric: 'h', min: 24 }]), true)
    expect(s).toBe('2 нарушений на 2 ячейках в 1 случаях, худшее — h >= 24: X/base light ×1 @300 t = 10')
  })
  it('спящая вкладка — первой строкой, даже при нуле нарушений', () => {
    expect(summarize([cell({})], [], false)).toMatch(/^ВКЛАДКА СПИТ/)
  })
  it('пустая матрица не выдаётся за чистую', () => {
    expect(summarize([], [], true)).toBe('пустая матрица: ничего не мерилось')
  })
})
