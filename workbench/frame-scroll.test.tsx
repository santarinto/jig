/**
 * Эффект прокрутки порта внутри `Frame` (JIG-42), по образцу `frame-slots.test.tsx`
 * и `jig-frame-bind.test.tsx`: `vi.mock('./registry.js')`, фикстура с ролью
 * `port`, `<Frame/>` смонтирован напрямую — `window.parent === window`, и
 * `Down` приходит как `MessageEvent` с `source: window`.
 *
 * БЕЗ `hand` (decisions 1.7) — поле снято из протокола, мутация М14 из
 * прежней формы неприменима; чей-то живой ввод сюда не изображается.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act, waitFor } from '@testing-library/react'
import { Frame } from './frame-app.js'
import { loadFixture } from './registry.js'
import { pack } from './protocol.js'
import type { AnyFixture } from '../src/internal/fixture.js'
import type { Down, Envelope, Up } from './protocol.js'

vi.mock('./registry.js', () => ({
  fixtureNames: () => ['Host'],
  loadFixture: vi.fn(),
}))

/** Роль `port` — узел без хода (клиент 380×300, полотно 380×300) умолчанием; тесты растягивают полотно. */
const HOST: AnyFixture = {
  name: 'Host',
  group: 'G',
  props: {},
  controls: {},
  cases: [
    { id: 'base', title: 'B', nodes: { port: '#port' } },
    { id: 'bare', title: 'Без ролей' },
  ],
  render: () => (
    <div id="port">
      <div id="track" />
    </div>
  ),
}

/**
 * `ResizeObserver`, который никого не зовёт. `settle()` (шаг 3, живость
 * вкладки) падает на свой запасной таймаут (≤ 1000 мс) — здесь это дешевле,
 * чем живой наблюдатель: настоящий `ResizeObserver` асинхронен и НЕ зовёт
 * колбэк синхронно на `observe()`, а имитация «сразу микротаском» рождала
 * бы лишний вызов `onScroll` в `watchScroll` ровно в момент подписки — гонку,
 * которой в чужом коде нет, а в тесте она перебивала бы сообщение с
 * `applied: true` следующим, без него.
 */
class DeadRO {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

const restores: (() => void)[] = []
function stub(obj: object, key: string, value: unknown): void {
  const prev = Object.getOwnPropertyDescriptor(obj, key)
  Object.defineProperty(obj, key, { configurable: true, value })
  restores.push(() => {
    if (prev) Object.defineProperty(obj, key, prev)
    else delete (obj as Record<string, unknown>)[key]
  })
}

/** `scrollLeft`/`scrollTop` зажаты к [0, max] — как у настоящего узла. */
function stubClamped(el: HTMLElement, key: 'scrollLeft' | 'scrollTop', max: number): void {
  let v = 0
  Object.defineProperty(el, key, {
    configurable: true,
    get: () => v,
    set: (n: number) => {
      v = Math.min(Math.max(0, n), max)
    },
  })
}

/** Ждёт узел `#port` в DOM — рисуется только после того, как `loadFixture` разрешится. */
async function findPortEl(): Promise<HTMLElement> {
  return waitFor(() => {
    const el = document.getElementById('port')
    if (!el) throw new Error('#port ещё не в DOM')
    return el
  })
}

/** Полотно роли `port`: клиент 380×300, полотно 532×900 — xMax 152, yMax 600. */
function stubPortGeometry(port: HTMLElement): HTMLElement {
  // `pick`/`findPort` разрешают узел по НЕНУЛЕВОЙ коробке
  // (`getBoundingClientRect`), а не по `client*`/`scroll*` — без этого узел
  // никогда не находится, и `findPort` уходит в свой таймаут 3000 мс.
  stub(port, 'getBoundingClientRect', () => ({
    width: 380, height: 300, left: 0, top: 0, right: 380, bottom: 300, x: 0, y: 0,
    toJSON() { return {} },
  }))
  stub(port, 'clientWidth', 380)
  stub(port, 'scrollWidth', 532)
  stub(port, 'clientHeight', 300)
  stub(port, 'scrollHeight', 900)
  stubClamped(port, 'scrollLeft', 152)
  stubClamped(port, 'scrollTop', 600)
  return port
}

/** Сообщение `type: 'scroll'` — последнее среди отправленных спаем. */
function lastScroll(spy: ReturnType<typeof vi.spyOn>): (Up & { type: 'scroll' }) | undefined {
  const all = spy.mock.calls
    .map((c) => (c[0] as Envelope<Up>).body)
    .filter((b): b is Up & { type: 'scroll' } => b.type === 'scroll')
  return all[all.length - 1]
}

const sendDown = (sid: number, body: Down): void => {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: pack(sid, body),
        origin: window.location.origin,
        source: window,
      }),
    )
  })
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', DeadRO)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.mocked(loadFixture).mockReset()
  while (restores.length) restores.pop()!()
  window.history.pushState(null, '', '/')
})

describe('прокрутка порта: без scroll-to', () => {
  it('без scroll-to кадр шлёт живую прокрутку порта, без applied', async () => {
    vi.mocked(loadFixture).mockImplementation(async (name) => (name === 'Host' ? HOST : null))
    window.history.pushState({}, '', '/frame.html?c=Host&case=base&sid=1')
    const spy = vi.spyOn(window.parent, 'postMessage')
    render(<Frame />)
    stubPortGeometry(await findPortEl())

    await waitFor(() => expect(lastScroll(spy)).toBeDefined())
    const m = lastScroll(spy)!
    expect(m.port).toEqual({ x: 0, xMax: 152, y: 0, yMax: 600 })
    expect(m.applied).toBeUndefined()
  })

  it('случай без роли port — null и довод', async () => {
    vi.mocked(loadFixture).mockImplementation(async (name) => (name === 'Host' ? HOST : null))
    window.history.pushState({}, '', '/frame.html?c=Host&case=bare&sid=2')
    const spy = vi.spyOn(window.parent, 'postMessage')
    render(<Frame />)

    await waitFor(() => expect(lastScroll(spy)).toBeDefined())
    expect(lastScroll(spy)!.port).toBeNull()
    expect(lastScroll(spy)!.why).toBe('у случая нет роли port')
  })

  it('вид canvas — null и довод «вид canvas»', async () => {
    vi.mocked(loadFixture).mockImplementation(async (name) => (name === 'Host' ? HOST : null))
    window.history.pushState({}, '', '/frame.html?c=Host&case=base&sid=3&mode=canvas')
    const spy = vi.spyOn(window.parent, 'postMessage')
    render(<Frame />)

    await waitFor(() => expect(lastScroll(spy)).toBeDefined())
    expect(lastScroll(spy)!.port).toBeNull()
    expect(lastScroll(spy)!.why).toBe('вид canvas')
  })
})

describe('прокрутка порта: scroll-to после готовности', () => {
  it('scroll-to встаёт ПОСЛЕ готовности документа (М10)', async () => {
    vi.mocked(loadFixture).mockImplementation(async (name) => (name === 'Host' ? HOST : null))
    let resolveFonts: () => void = () => {}
    const fontsReady = new Promise<void>((res) => {
      resolveFonts = res
    })
    stub(document, 'fonts', { ready: fontsReady, status: 'loading' })

    window.history.pushState({}, '', '/frame.html?c=Host&case=base&sid=4')
    const spy = vi.spyOn(window.parent, 'postMessage')
    render(<Frame />)
    const port = stubPortGeometry(await findPortEl())

    sendDown(4, { type: 'scroll-to', x: 151, y: 480 })

    // Пока `document.fonts.ready` не разрешён, `settle()` держит применение
    // просьбы — узел ещё на нуле.
    await new Promise((r) => setTimeout(r, 80))
    expect(port.scrollLeft).toBe(0)

    resolveFonts()

    // `settle()` (шаг 3, живость вкладки) падает на запасной таймаут ≤ 1000
    // мс при `DeadRO` — заявленный предел `waitFor` увеличен, чтобы не
    // гнаться с ним.
    await waitFor(() => expect(port.scrollLeft).toBe(151), { timeout: 2000 })
    expect(port.scrollTop).toBe(480)
    expect(lastScroll(spy)?.applied).toBe(true)
    expect(lastScroll(spy)!.port).toEqual({ x: 151, xMax: 152, y: 480, yMax: 600 })
  })

  it('упор приходит честным числом', async () => {
    vi.mocked(loadFixture).mockImplementation(async (name) => (name === 'Host' ? HOST : null))
    stub(document, 'fonts', { ready: Promise.resolve(), status: 'loaded' })

    window.history.pushState({}, '', '/frame.html?c=Host&case=base&sid=5')
    const spy = vi.spyOn(window.parent, 'postMessage')
    render(<Frame />)
    const port = stubPortGeometry(await findPortEl())

    sendDown(5, { type: 'scroll-to', x: 600, y: null })

    await waitFor(() => expect(port.scrollLeft).toBe(152), { timeout: 2000 })
    expect(lastScroll(spy)?.applied).toBe(true)
    expect(lastScroll(spy)!.port?.x).toBe(152)
  })
})
