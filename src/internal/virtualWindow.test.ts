import { describe, it, expect } from 'vitest'
import { windowSlice, prependShift, offsetOf } from './virtualWindow.js'

/** Ключи k0…k(n-1) — компактная запись длинных списков в тестах. */
const keys = (n: number) => Array.from({ length: n }, (_, i) => `k${i}`)
const uniform = (n: number, h: number) => new Map(keys(n).map((k) => [k, h]))

describe('windowSlice', () => {
  it('на пустом списке отдаёт пустое окно, а не срез из воздуха', () => {
    const w = windowSlice({
      keys: [], heights: new Map(), estimate: 20, scrollTop: 0, viewportHeight: 100,
    })
    expect(w).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0, total: 0 })
  })

  it('в начале списка режет от нулевой строки', () => {
    const w = windowSlice({
      keys: keys(100), heights: uniform(100, 20), estimate: 20,
      scrollTop: 0, viewportHeight: 100,
    })
    expect(w.start).toBe(0)
    expect(w.padTop).toBe(0)
    expect(w.total).toBe(2000)
  })

  it('сдвигает окно вместе с прокруткой', () => {
    const w = windowSlice({
      keys: keys(100), heights: uniform(100, 20), estimate: 20,
      scrollTop: 400, viewportHeight: 100, overscan: 0,
    })
    // 400 / 20 = строка 20 — первая видимая; полоса 400…500 накрывает 20…24.
    expect(w.start).toBe(20)
    expect(w.padTop).toBe(400)
    expect(w.end).toBe(25)
  })

  it('неизмеренные строки считаются по оценке', () => {
    const w = windowSlice({
      keys: keys(50), heights: new Map(), estimate: 30,
      scrollTop: 0, viewportHeight: 90,
    })
    expect(w.total).toBe(1500)
    expect(w.end).toBeGreaterThanOrEqual(3)
  })

  it('смешивает измеренные и неизмеренные высоты в одной сумме', () => {
    const heights = new Map([['k0', 100], ['k1', 50]])
    const w = windowSlice({
      keys: keys(4), heights, estimate: 10, scrollTop: 0, viewportHeight: 500,
    })
    // 100 + 50 + 10 + 10
    expect(w.total).toBe(170)
  })

  it('запас расширяет окно в обе стороны', () => {
    const base = {
      keys: keys(100), heights: uniform(100, 20), estimate: 20,
      scrollTop: 400, viewportHeight: 100,
    }
    const none = windowSlice({ ...base, overscan: 0 })
    const some = windowSlice({ ...base, overscan: 3 })
    expect(some.start).toBe(none.start - 3)
    expect(some.end).toBe(none.end + 3)
  })

  it('запас не вылезает за границы списка', () => {
    const w = windowSlice({
      keys: keys(10), heights: uniform(10, 20), estimate: 20,
      scrollTop: 0, viewportHeight: 1000, overscan: 50,
    })
    expect(w.start).toBe(0)
    expect(w.end).toBe(10)
    expect(w.padTop).toBe(0)
    expect(w.padBottom).toBe(0)
  })

  it('прокрутка за пределы списка не даёт окна вне массива', () => {
    const w = windowSlice({
      keys: keys(10), heights: uniform(10, 20), estimate: 20,
      scrollTop: 99999, viewportHeight: 100,
    })
    expect(w.start).toBeLessThan(10)
    expect(w.end).toBe(10)
    expect(w.start).toBeGreaterThanOrEqual(0)
  })

  it('отрицательная прокрутка (rubber-band на macOS) не уводит окно в минус', () => {
    const w = windowSlice({
      keys: keys(10), heights: uniform(10, 20), estimate: 20,
      scrollTop: -300, viewportHeight: 100,
    })
    expect(w.start).toBe(0)
    expect(w.padTop).toBe(0)
  })

  it('нулевая высота окна отдаёт хотя бы одну строку, а не пустоту', () => {
    // Первый кадр до измерения контейнера приходит с viewportHeight 0.
    // Пустое окно на нём означало бы, что мерить нечего, и список
    // никогда бы не раскрылся — сам себя заблокировал.
    const w = windowSlice({
      keys: keys(10), heights: uniform(10, 20), estimate: 20,
      scrollTop: 0, viewportHeight: 0, overscan: 0,
    })
    expect(w.end).toBeGreaterThan(w.start)
  })

  describe('инвариант раскладки', () => {
    // Ради этого равенства всё и написано: как только сумма отступов и
    // отрисованных строк перестаёт совпадать с полной высотой, полоса
    // прокрутки начинает жить своей жизнью — «скролл дёргается» без
    // единой ошибки в консоли.
    const check = (input: Parameters<typeof windowSlice>[0]) => {
      const w = windowSlice(input)
      const rendered = input.keys
        .slice(w.start, w.end)
        .reduce((s, k) => s + (input.heights.get(k) ?? input.estimate), 0)
      expect(w.padTop + rendered + w.padBottom).toBeCloseTo(w.total, 6)
    }

    it('держится на равномерных высотах при любой прокрутке', () => {
      for (const scrollTop of [0, 1, 137, 400, 1999, 2000, 5000, -50]) {
        check({
          keys: keys(100), heights: uniform(100, 20), estimate: 20,
          scrollTop, viewportHeight: 100, overscan: 2,
        })
      }
    })

    it('держится на разнобойных высотах', () => {
      const ragged = new Map(keys(60).map((k, i) => [k, 12 + ((i * 37) % 90)]))
      for (const scrollTop of [0, 55, 300, 1200, 4000]) {
        check({
          keys: keys(60), heights: ragged, estimate: 18,
          scrollTop, viewportHeight: 220, overscan: 4,
        })
      }
    })

    it('держится, когда измерена только часть строк', () => {
      const partial = new Map(keys(40).filter((_, i) => i % 3 === 0).map((k) => [k, 64]))
      for (const scrollTop of [0, 200, 900]) {
        check({
          keys: keys(40), heights: partial, estimate: 21,
          scrollTop, viewportHeight: 150, overscan: 1,
        })
      }
    })

    it('держится на списке из одной строки', () => {
      check({
        keys: ['solo'], heights: new Map([['solo', 44]]), estimate: 20,
        scrollTop: 0, viewportHeight: 300,
      })
    })
  })
})

describe('prependShift', () => {
  it('на подгрузке вверх возвращает высоту приехавших строк', () => {
    const prev = keys(5)
    const next = ['old0', 'old1', ...prev]
    const heights = new Map([['old0', 30], ['old1', 45]])
    expect(prependShift(prev, next, heights, 20)).toBe(75)
  })

  it('неизмеренные приехавшие строки считаются по оценке', () => {
    const prev = keys(3)
    const next = ['old0', 'old1', 'old2', ...prev]
    expect(prependShift(prev, next, new Map(), 25)).toBe(75)
  })

  it('дописывание в конец не двигает прокрутку', () => {
    const prev = keys(5)
    const next = [...prev, 'new0', 'new1']
    expect(prependShift(prev, next, uniform(5, 20), 20)).toBe(0)
  })

  it('подмена всего массива даёт ноль — это не подгрузка, а другой список', () => {
    // Переключили воркера или сменили фильтр: удерживать нечего,
    // и попытка удержать увела бы в произвольное место.
    expect(prependShift(keys(5), ['x0', 'x1', 'x2'], new Map(), 20)).toBe(0)
  })

  it('первый рендер (прежних строк нет) не двигает прокрутку', () => {
    expect(prependShift([], keys(5), new Map(), 20)).toBe(0)
  })

  it('опустевший список не двигает прокрутку', () => {
    expect(prependShift(keys(5), [], new Map(), 20)).toBe(0)
  })

  it('тот же массив даёт ноль', () => {
    const k = keys(4)
    expect(prependShift(k, k, uniform(4, 20), 20)).toBe(0)
  })

  it('одновременная подгрузка сверху и дописывание снизу считает только верх', () => {
    const prev = keys(4)
    const next = ['old0', ...prev, 'new0']
    expect(prependShift(prev, next, new Map([['old0', 33]]), 20)).toBe(33)
  })
})

describe('offsetOf', () => {
  it('до первой строки — ноль', () => {
    expect(offsetOf(keys(100), uniform(100, 20), 20, 0)).toBe(0)
  })

  it('сумма высот предшествующих строк — это scrollTop, ставящий строку на кромку', () => {
    // 20 строк по 20px: до строки 10 — 200px.
    expect(offsetOf(keys(20), uniform(20, 20), 20, 10)).toBe(200)
  })

  it('неизмеренные строки считает по оценке', () => {
    expect(offsetOf(keys(50), new Map(), 30, 4)).toBe(120)
  })

  it('смешивает измеренные и оценку', () => {
    const heights = new Map([['k0', 100], ['k1', 50]])
    // k0=100, k1=50, k2,k3 по оценке 10 → до строки 4 = 100+50+10+10 = 170.
    expect(offsetOf(keys(4), heights, 10, 4)).toBe(170)
  })

  it('индекс за концом отдаёт полную высоту, отрицательный — ноль', () => {
    expect(offsetOf(keys(3), uniform(3, 20), 20, 99)).toBe(60)
    expect(offsetOf(keys(3), uniform(3, 20), 20, -5)).toBe(0)
  })
})
