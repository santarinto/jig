/**
 * `window.jig` — сторона оболочки (JIG-40): делегирование `FRAME_API`
 * главному кадру, слот `#jig-scratch`, `frame(which)`.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { Shell } from './shell-app.js'
import { makeShellJig } from './jig-shell.js'
import { FRAME_API, SCRATCH_ID, type Env, type FrameJig, type NodeInfo } from './jig-api.js'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  window.history.pushState(null, '', '/')
})

/** Подставной `FrameJig`: методы измерения не зовутся здесь, только делегирование. */
function fakeFrameJig(envOverride: Partial<Env> = {}, nodesOverride: Record<string, NodeInfo> = {}): FrameJig {
  const baseEnv: Env = {
    theme: 'light',
    scale: '1',
    clientWidth: 440,
    empty: null,
    innerWidth: 440,
    innerHeight: 640,
    dpr: 1,
    docBar: 0,
    container: 380,
    floor: 440,
    belowFloor: false,
    params: { address: { of: 'frame', asked: {}, unknown: [], replaced: [], ignored: [] }, fixture: null },
    ...envOverride,
  }
  return {
    help: 'jig.ready(...) → ...',
    ready: vi.fn(async () => ({ ...baseEnv, live: true, fonts: 'loaded' as FontFaceSetLoadStatus, ms: 1 })),
    env: vi.fn(() => baseEnv),
    box: vi.fn(() => ({
      width: 0, height: 0, clientWidth: 0, clientHeight: 0, bar: 0, barX: 0,
      scrollLeft: 0, scrollMax: 0, scrollTop: 0, scrollTopMax: 0, endX: false, endY: false, matched: 1,
    })),
    visible: vi.fn(() => ({
      state: 'full' as const, width: 0, height: 0, hiddenX: 0, hiddenY: 0,
      box: { l: 0, t: 0, r: 0, b: 0 }, seen: null, cutBy: [], matched: 1,
    })),
    norm: vi.fn((css: string) => css),
    node: vi.fn(() => document.createElement('div')),
    nodes: vi.fn(() => nodesOverride),
  }
}

function makeFrame(): HTMLIFrameElement {
  const f = document.createElement('iframe')
  f.className = 'wb__frame'
  document.body.appendChild(f)
  return f
}

function makeScratch(): HTMLElement {
  const el = document.createElement('section')
  el.id = SCRATCH_ID
  document.body.appendChild(el)
  return el
}

describe('jig-shell: ручной DOM (без Shell)', () => {
  it('clearScratch() убирает детей слота и не трогает прочий body; повторно — 0', () => {
    const scratch = makeScratch()
    scratch.append(document.createElement('iframe'), document.createElement('iframe'), document.createElement('div'))
    const outside = document.createElement('div')
    outside.id = 'outside'
    document.body.appendChild(outside)

    const jig = makeShellJig(window, { loadSearch: '' })
    expect(jig.clearScratch()).toBe(3)
    expect(scratch.children.length).toBe(0)
    expect(document.getElementById('outside')).not.toBeNull()
    expect(jig.clearScratch()).toBe(0)
  })

  it('без слота — scratch бросает «нет #jig-scratch»', () => {
    const jig = makeShellJig(window, { loadSearch: '' })
    expect(() => jig.scratch).toThrow('нет #jig-scratch')
  })

  it('frame(): один кадр по умолчанию, без аргумента при кадрах > 1 — бросок с числом', () => {
    const f1 = makeFrame()
    const jig1 = fakeFrameJig()
    ;(f1.contentWindow as Window & { jig?: FrameJig }).jig = jig1
    const shellOne = makeShellJig(window, { loadSearch: '' })
    expect(shellOne.frame()).toBe(jig1)

    const f2 = makeFrame()
    const jig2 = fakeFrameJig()
    ;(f2.contentWindow as Window & { jig?: FrameJig }).jig = jig2
    const shellTwo = makeShellJig(window, { loadSearch: '' })
    expect(() => shellTwo.frame()).toThrow('в сетке 2 кадров')
  })

  it('frame(i) берёт кадр по индексу, frame(iframeEl) — переданный элемент', () => {
    const f1 = makeFrame()
    const jig1 = fakeFrameJig()
    ;(f1.contentWindow as Window & { jig?: FrameJig }).jig = jig1
    const f2 = makeFrame()
    const jig2 = fakeFrameJig()
    ;(f2.contentWindow as Window & { jig?: FrameJig }).jig = jig2

    const jig = makeShellJig(window, { loadSearch: '' })
    expect(jig.frame(1)).toBe(jig2)
    expect(jig.frame(f1)).toBe(jig1)
  })

  it('окно кадра без своего jig — «кадр ещё грузится»', () => {
    const f = makeFrame()
    const jig = makeShellJig(window, { loadSearch: '' })
    expect(() => jig.frame(f)).toThrow('кадр ещё грузится')
  })

  it('делегированный env(): поля кадра, но address.of === shell и аудит адреса оболочки', () => {
    const f = makeFrame()
    const frameJig = fakeFrameJig({ container: 999 })
    ;(f.contentWindow as Window & { jig?: FrameJig }).jig = frameJig
    const jig = makeShellJig(window, { loadSearch: '?c=Tabs&wdth=768' })
    const e = jig.env()
    expect(e.container).toBe(999)
    expect(e.params.address.of).toBe('shell')
    expect(e.params.address.unknown).toEqual(['wdth'])
  })

  it('делегированный ready() дожидается jig, поставленного позже', async () => {
    const f = makeFrame()
    const jig = makeShellJig(window, { loadSearch: '' })
    const frameJig = fakeFrameJig()
    setTimeout(() => {
      ;(f.contentWindow as Window & { jig?: FrameJig }).jig = frameJig
    }, 30)
    const r = await jig.ready({ timeoutMs: 500 })
    expect(r.live).toBe(true)
  })

  it('каждое имя FRAME_API делегировано', () => {
    makeFrame()
    const jig = makeShellJig(window, { loadSearch: '' })
    expect(FRAME_API.every((k) => typeof (jig as unknown as Record<string, unknown>)[k] === 'function')).toBe(true)
  })

  // `nodes()` оболочки (JIG-42) добавляет `page` — коробку во вьюпорте
  // ОБОЛОЧКИ, а не только кадра: решение 1.3 спецификации, область для зума
  // без снимка-ориентира.
  it('nodes() оболочки несёт page во вьюпорте оболочки', () => {
    const f = makeFrame()
    const frameJig = fakeFrameJig({}, {
      port: { found: true, matched: 1, path: 'div.x', box: { l: 30, t: 30, r: 410, b: 430 } },
      panel: { found: false, matched: 0, path: null, box: null },
    })
    ;(f.contentWindow as Window & { jig?: FrameJig }).jig = frameJig
    Object.defineProperty(f, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 260, top: 48, right: 700, bottom: 688, width: 440, height: 640, x: 260, y: 48, toJSON() { return {} } }),
    })
    Object.defineProperty(f, 'clientLeft', { configurable: true, value: 1 })
    Object.defineProperty(f, 'clientTop', { configurable: true, value: 1 })

    const jig = makeShellJig(window, { loadSearch: '' })
    const n = jig.nodes()
    expect(n.port!.box).toEqual({ l: 30, t: 30, r: 410, b: 430 })
    expect(n.port!.page).toEqual({ l: 291, t: 79, r: 671, b: 479 })
    expect(n.panel!.page).toBeNull()
  })
})

describe('jig-shell: слот в реальном Shell', () => {
  const widths = () => within(screen.getByRole('group', { name: 'Ширина кадра' }))

  it('ровно один #jig-scratch, с подписью и пустой', () => {
    render(<Shell />)
    const scratches = document.querySelectorAll(`#${SCRATCH_ID}`)
    expect(scratches.length).toBe(1)
    const el = scratches[0] as HTMLElement
    expect(el.dataset.caption).toBe('пробы агента')
    expect(el.children.length).toBe(0)
  })

  it('чужой iframe, вставленный в слот, переживает перерисовку оболочки', () => {
    render(<Shell />)
    const el = document.getElementById(SCRATCH_ID)!
    const probe = document.createElement('iframe')
    el.append(probe)
    expect(el.children.length).toBe(1)

    fireEvent.click(widths().getByRole('button', { name: '1024' }))

    expect(el.children.length).toBe(1)
  })
})
