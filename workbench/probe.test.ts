/**
 * `normColour`/`pick` — общее определение sweep и `jig` (JIG-40, решение 8).
 * До этой задачи оба жили приватно в `sweep.ts`; здесь проверяется форма
 * ответа и то, что копии не осталось.
 */
import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { normColour, pick } from './probe.js'

/**
 * Подставной контекст canvas: `fillStyle` принимает только строки из таблицы
 * (как настоящий canvas — невалидное присвоение игнорируется, прежнее
 * значение остаётся), `getImageData` отдаёт пиксель ПОСЛЕДНЕГО `fillRect`.
 */
const TABLE: Record<string, string> = {
  '#000': '#000000',
  '#fff': '#ffffff',
  red: '#ff0000',
  'color(srgb 0.867 0.928 0.928)': '#ddeded',
  'rgba(0, 0, 0, 0.5)': 'rgba(0, 0, 0, 0.5)',
}

const PIXELS: Record<string, [number, number, number, number]> = {
  '#000000': [0, 0, 0, 255],
  '#ffffff': [255, 255, 255, 255],
  '#ff0000': [255, 0, 0, 255],
  '#ddeded': [221, 237, 237, 255],
  'rgba(0, 0, 0, 0.5)': [0, 0, 0, 128],
}

function makeFakeCtx() {
  let value = '#000000'
  let lastFilled = value
  return {
    get fillStyle() {
      return value
    },
    set fillStyle(v: string) {
      // Canvas игнорирует невалидное присвоение и оставляет прежнее значение.
      if (Object.prototype.hasOwnProperty.call(TABLE, v)) value = TABLE[v]!
    },
    clearRect() {},
    fillRect() {
      lastFilled = value
    },
    getImageData() {
      const px = PIXELS[lastFilled] ?? [0, 0, 0, 255]
      return { data: px }
    },
  }
}

describe('normColour', () => {
  const fake = makeFakeCtx()
  const origGetContext = HTMLCanvasElement.prototype.getContext
  // Один и тот же `fake` на все тесты файла: `normColour` кэширует контекст
  // на уровне модуля при первом вызове (ленивое создание), и подмена,
  // отличающаяся между тестами, второй раз просто не была бы прочитана.
  HTMLCanvasElement.prototype.getContext = (() => fake) as unknown as typeof HTMLCanvasElement.prototype.getContext

  afterAll(() => {
    HTMLCanvasElement.prototype.getContext = origGetContext
  })

  it('color(srgb …) не читается как 0–255 — идёт через canvas', () => {
    expect(normColour('color(srgb 0.867 0.928 0.928)')).toBe('rgba(221, 237, 237, 1)')
  })

  it('альфа округляется до сотых', () => {
    expect(normColour('rgba(0, 0, 0, 0.5)')).toBe('rgba(0, 0, 0, 0.5)')
  })

  it('не-цвет — бросок, а не молчаливый чёрный', () => {
    expect(() => normColour('redd')).toThrow('не цвет CSS: «redd»')
  })

  it('чёрный сам по себе — цвет, а не отказ (двойная проба не путает их)', () => {
    expect(normColour('#000')).toBe('rgba(0, 0, 0, 1)')
  })

  it('sweep не держит своей копии — импортирует отсюда', () => {
    const src = readFileSync(resolve(__dirname, 'sweep.ts'), 'utf8')
    expect(src).not.toContain('getImageData')
    expect(src).not.toMatch(/function pick\(/)
    expect(src).toContain("from './probe.js'")
  })
})

describe('pick', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('первый узел селектора с ненулевой коробкой — скрытые копии не меряются', () => {
    document.body.innerHTML = '<div class="x" id="a"></div><div class="x" id="b"></div><div class="x" id="c"></div>'
    const [a, b, c] = ['a', 'b', 'c'].map((id) => document.getElementById(id)!)
    const box = (el: HTMLElement, w: number, h: number) => {
      Object.defineProperty(el, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ width: w, height: h, left: 0, top: 0, right: w, bottom: h }),
      })
    }
    box(a, 0, 0)
    box(b, 0, 0)
    box(c, 90, 300)
    expect(pick(document, '.x')).toBe(c)
  })
})
