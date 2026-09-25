/**
 * Помощники прокрутки узла роли `port`, без React и без монтирования кадра
 * (JIG-42). Геометрия — подменами на экземплярах, как у `frame-size.test.ts`
 * (jsdom не раскладывает).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { applyScroll, findPort, portCopies, scrollOf, watchScroll, SCROLL_SEND_MS } from './port-scroll.js'

const restores: (() => void)[] = []

function stub(obj: object, key: string, value: unknown): void {
  const prev = Object.getOwnPropertyDescriptor(obj, key)
  Object.defineProperty(obj, key, { configurable: true, value })
  restores.push(() => {
    if (prev) Object.defineProperty(obj, key, prev)
    else delete (obj as Record<string, unknown>)[key]
  })
}

/** `scrollLeft`/`scrollTop` с зажимом к [0, max] — как у настоящего узла (спецификация 0.4). */
function stubClamped(el: HTMLElement, key: 'scrollLeft' | 'scrollTop', max: number): void {
  let v = 0
  const prev = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), key)
  Object.defineProperty(el, key, {
    configurable: true,
    get: () => v,
    set: (n: number) => { v = Math.min(Math.max(0, n), max) },
  })
  restores.push(() => {
    if (prev) Object.defineProperty(el, key, prev)
    else delete (el as unknown as Record<string, unknown>)[key]
  })
}

// jsdom не реализует `ResizeObserver` — `watchScroll` его заводит, и без
// заглушки любой тест здесь падал бы на «not a constructor» (тот же приём,
// что у `frame-slots.test.tsx`). Наблюдатель никого не зовёт: предел трека
// (JIG-9) — предмет chromium-приёмки, не этого юнита.
class DeadRO {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', DeadRO)
})

afterEach(() => {
  while (restores.length) restores.pop()!()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

/** Узел #p: clientWidth 380/scrollWidth 532 (xMax 152), clientHeight 300/scrollHeight 900 (yMax 600). */
function mountPort(): HTMLElement {
  document.body.innerHTML = '<div id="p"></div>'
  const p = document.getElementById('p')!
  stub(p, 'clientWidth', 380)
  stub(p, 'scrollWidth', 532)
  stub(p, 'clientHeight', 300)
  stub(p, 'scrollHeight', 900)
  stubClamped(p, 'scrollLeft', 152)
  stubClamped(p, 'scrollTop', 600)
  return p
}

describe('scrollOf', () => {
  it('x/xMax, y/yMax из scrollLeft/Top и остатка scrollWidth/Height − client', () => {
    const p = mountPort()
    expect(scrollOf(p)).toEqual({ x: 0, xMax: 152, y: 0, yMax: 600 })
  })

  it('дробный scrollLeft проходит как есть', () => {
    const p = mountPort()
    p.scrollLeft = 151.5
    expect(scrollOf(p).x).toBe(151.5)
  })
})

describe('applyScroll', () => {
  it('упор: просьба сверх максимума зажимается, ось null не трогается', () => {
    const p = mountPort()
    p.scrollTop = 40
    const got = applyScroll(p, { x: 600, y: null })
    expect(got.x).toBe(152)
    expect(got.y).toBe(40)
  })
})

describe('findPort', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('узел, добавленный до срока, резолвится им', async () => {
    document.body.innerHTML = ''
    const promise = findPort(document, '#late', 200)
    setTimeout(() => {
      const el = document.createElement('div')
      el.id = 'late'
      stub(el, 'getBoundingClientRect', () => ({ width: 10, height: 10 }))
      document.body.appendChild(el)
    }, 60)
    await vi.advanceTimersByTimeAsync(60)
    await vi.runOnlyPendingTimersAsync()
    const el = await promise
    expect(el?.id).toBe('late')
  })

  it('не дождался за ms — null', async () => {
    document.body.innerHTML = ''
    const promise = findPort(document, '#never', 100)
    await vi.advanceTimersByTimeAsync(150)
    expect(await promise).toBeNull()
  })
})

describe('portCopies', () => {
  it('копии с ненулевой коробкой — не все совпадения', () => {
    document.body.innerHTML = '<div class="q" id="q0"></div><div class="q" id="q1"></div><div class="q" id="q2"></div>'
    const [q0, q1, q2] = [...document.querySelectorAll<HTMLElement>('.q')]
    stub(q0!, 'getBoundingClientRect', () => ({ width: 0, height: 0 }))
    stub(q1!, 'getBoundingClientRect', () => ({ width: 380, height: 300 }))
    stub(q2!, 'getBoundingClientRect', () => ({ width: 380, height: 300 }))
    expect(portCopies(document, '.q')).toEqual([q1, q2])
  })
})

describe('watchScroll', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('сразу один вызов при подписке', () => {
    const p = mountPort()
    const send = vi.fn()
    const stop = watchScroll(p, send)
    expect(send).toHaveBeenCalledTimes(1)
    stop()
  })

  it('пять scroll за 10 мс — ровно 2 (ведущий + хвост через SCROLL_SEND_MS)', () => {
    const p = mountPort()
    const send = vi.fn()
    const stop = watchScroll(p, send)
    send.mockClear()

    for (let i = 0; i < 5; i++) {
      p.scrollLeft = (i + 1) * 10
      p.dispatchEvent(new Event('scroll'))
      vi.advanceTimersByTime(2)
    }
    expect(send).toHaveBeenCalledTimes(1) // ведущий, на первом scroll
    vi.advanceTimersByTime(SCROLL_SEND_MS)
    expect(send).toHaveBeenCalledTimes(2) // хвост со свежим значением
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ x: 50 }))
    stop()
  })

  it('отписка снимает слушатель и таймер хвоста', () => {
    const p = mountPort()
    const send = vi.fn()
    const stop = watchScroll(p, send)
    send.mockClear()
    p.scrollLeft = 10
    p.dispatchEvent(new Event('scroll'))
    stop()
    p.scrollLeft = 20
    p.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(SCROLL_SEND_MS)
    expect(send).toHaveBeenCalledTimes(1) // только ведущий до stop()
  })
})
