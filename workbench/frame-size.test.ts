/**
 * jsdom не знает ResizeObserver вовсе (проверено), поэтому подставляется
 * заглушка, которая ЗАПОМИНАЕТ колбэк и список наблюдаемых узлов и даёт
 * тесту дёрнуть колбэк руками. Это не имитация раскладки: проверяется
 * договор модуля — что он мерит (объединение боксов детей, не бокс хоста),
 * что наблюдает и что отписывается.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { reportSize, roomOf } from './frame-size.js'

let fire: (() => void) | null = null
let disconnected = 0
let observed: Element[] = []

class FakeRO {
  constructor(private cb: () => void) {
    fire = () => this.cb()
  }
  observe(el: Element): void {
    observed.push(el)
  }
  disconnect(): void {
    disconnected += 1
  }
}

beforeEach(() => {
  fire = null
  disconnected = 0
  observed = []
  vi.stubGlobal('ResizeObserver', FakeRO)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Ставит фиксированный бокс на элемент через координаты углов. */
const box = (
  el: HTMLElement,
  r: { left: number; top: number; right: number; bottom: number },
): void => {
  el.getBoundingClientRect = () =>
    ({ ...r, width: r.right - r.left, height: r.bottom - r.top }) as DOMRect
}

describe('reportSize', () => {
  it('мерит объединение боксов детей, а не первого', () => {
    const send = vi.fn()
    const host = document.createElement('div')
    const a = document.createElement('span')
    const b = document.createElement('div')
    // a — узкий и невысокий (как бейдж), b — шире и ниже (как соседняя панель).
    box(a, { left: 0, top: 0, right: 74, bottom: 18 })
    box(b, { left: 0, top: 18, right: 300, bottom: 132 })
    host.append(a, b)

    reportSize(host, send)
    fire!()

    // Ширина и высота — по объединению боксов, не по первому ребёнку (74×18).
    expect(send).toHaveBeenCalledWith(300, 132, expect.anything())
  })

  it('скрытый ребёнок с нулевым боксом не раздувает объединение', () => {
    const send = vi.fn()
    const host = document.createElement('div')
    const visible = document.createElement('div')
    const hidden = document.createElement('div')
    // Скрытый форс-слой: display:none даёт нулевой бокс в начале координат.
    // Без фильтра left/top съехали бы к 0, раздувая объединение.
    box(visible, { left: 40, top: 40, right: 140, bottom: 90 })
    box(hidden, { left: 0, top: 0, right: 0, bottom: 0 })
    host.append(visible, hidden)

    reportSize(host, send)
    fire!()

    expect(send).toHaveBeenCalledWith(100, 50, expect.anything())
  })

  it('откатывается на бокс хоста, если детей нет', () => {
    const send = vi.fn()
    const host = document.createElement('div')
    box(host, { left: 0, top: 0, right: 360, bottom: 19 })

    reportSize(host, send)
    fire!()

    expect(send).toHaveBeenCalledWith(360, 19, expect.anything())
  })

  it('наблюдает и хост, и каждого ребёнка', () => {
    const host = document.createElement('div')
    const a = document.createElement('span')
    const b = document.createElement('span')
    host.append(a, b)

    reportSize(host, vi.fn())

    // Список, а не последний узел: хост наблюдается ради смены состава детей,
    // каждый ребёнок — ради смены своего размера.
    expect(observed).toEqual([host, a, b])
  })

  it('отписывается', () => {
    const host = document.createElement('div')
    host.append(document.createElement('span'))
    const stop = reportSize(host, vi.fn())
    stop()
    expect(disconnected).toBe(1)
  })
})

/**
 * Место, отданное компоненту (DS-314). jsdom не раскладывает, поэтому
 * `clientWidth` хоста и документа подставляются — проверяется договор: из
 * ширины хоста вычитаются ЕГО паддинги (вычисленные, не литерал), а полоса —
 * это разница вьюпорта и `clientWidth` документа.
 */
describe('roomOf', () => {
  const stubWidth = (el: Element, w: number): void => {
    Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => w })
  }
  const host = (w: number): HTMLElement => {
    const el = document.createElement('div')
    el.style.padding = '30px'
    document.body.append(el)
    stubWidth(el, w)
    return el
  }
  afterEach(() => {
    stubWidth(document.documentElement, 0)
    document.body.replaceChildren()
  })

  it('кадр 440 с полосой 15: контейнеру 365, а не 380', () => {
    vi.stubGlobal('innerWidth', 440)
    stubWidth(document.documentElement, 425)
    expect(roomOf(host(425))).toEqual({ cw: 365, bar: 15 })
  })

  it('без полосы: контейнеру ширина кадра минус паддинги', () => {
    vi.stubGlobal('innerWidth', 440)
    stubWidth(document.documentElement, 440)
    expect(roomOf(host(440))).toEqual({ cw: 380, bar: 0 })
  })

  it('reportSize отдаёт место третьим аргументом', () => {
    vi.stubGlobal('innerWidth', 440)
    stubWidth(document.documentElement, 425)
    const send = vi.fn()
    const h = host(425)
    box(h, { left: 0, top: 0, right: 425, bottom: 19 })

    reportSize(h, send)
    fire!()

    expect(send).toHaveBeenCalledWith(425, 19, { cw: 365, bar: 15 })
  })
})
