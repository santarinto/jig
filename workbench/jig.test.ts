/**
 * `window.jig` — сторона кадра (JIG-40).
 *
 * jsdom не раскладывает: коробки и `clientWidth`/`offsetWidth`/`scrollWidth`
 * подставляются на экземплярах (образец `gate-plugin.test.ts:113-125`,
 * `frame-size.test.ts:121-165`). Правда чисел в chromium (полоса в видимом
 * кадре, настоящая липкая колонка, `ready()` в фоновой вкладке) здесь не
 * видна по построению — общая приёмка 40+42, лог задачи.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { bindJigFrame, makeFrameJig } from './jig.js'
import { FRAME_API } from './jig-api.js'
import { normColour } from './probe.js'
import { parseFrameUrl } from './frame-url.js'
import { WIDTH_FLOOR } from '../scripts/width-surface.mjs'
import { NODE_ROLES } from '../src/internal/fixture.js'
import type { AnyFixture } from '../src/internal/fixture.js'

type Box = [left: number, top: number, width: number, height: number]

const restores: (() => void)[] = []

function stub(obj: object, key: string, value: unknown): void {
  const prev = Object.getOwnPropertyDescriptor(obj, key)
  Object.defineProperty(obj, key, { configurable: true, value })
  restores.push(() => {
    if (prev) Object.defineProperty(obj, key, prev)
    else delete (obj as Record<string, unknown>)[key]
  })
}

function stubGet(obj: object, key: string, get: () => unknown): void {
  const prev = Object.getOwnPropertyDescriptor(obj, key)
  Object.defineProperty(obj, key, { configurable: true, get })
  restores.push(() => {
    if (prev) Object.defineProperty(obj, key, prev)
    else delete (obj as Record<string, unknown>)[key]
  })
}

const rectOf = (l: number, t: number, w: number, h: number) => ({
  left: l, top: t, width: w, height: h, right: l + w, bottom: t + h, x: l, y: t,
  toJSON() { return { left: l, top: t, width: w, height: h, right: l + w, bottom: t + h } },
})

/** Ставит DOM, вьюпорт кадра (440×640 умолчанием) и коробки узлов по id. */
function mount(html: string, boxes: Record<string, Box>, vw = 440, vh = 640): void {
  document.body.innerHTML = html
  stubGet(document.documentElement, 'clientWidth', () => vw)
  stubGet(document.documentElement, 'clientHeight', () => vh)
  for (const [id, [l, t, w, h]] of Object.entries(boxes)) {
    const el = document.getElementById(id)
    if (!el) throw new Error(`тест: нет #${id}`)
    stub(el, 'getBoundingClientRect', () => rectOf(l, t, w, h))
  }
}

afterEach(() => {
  while (restores.length) restores.pop()!()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

/**
 * «Неделя EventCalendar на кадре 440, порт прокручен на 14» (спецификация,
 * раздел 3.4). Классы настоящие — пути в `cutBy` читаются так же, как в
 * живом компоненте.
 */
const BASE_BOXES: Record<string, Box> = {
  host: [0, 0, 440, 640],
  port: [30, 30, 380, 400],
  top: [16, 30, 690, 40],
  corner: [30, 30, 60, 40],
  dh: [76, 30, 90, 40],
  canvas: [16, 70, 690, 300],
  hours: [30, 70, 60, 300],
  h9: [30, 200, 60, 20],
  mon: [76, 70, 90, 300],
  wed: [256, 70, 90, 300],
  thu: [346, 70, 90, 300],
  sun: [616, 70, 90, 300],
}

function calendarHtml(opts: { corner?: string; canvasExtra?: string; portExtra?: string; hostExtra?: string } = {}): string {
  const corner = opts.corner ?? 'position: sticky; left: 0'
  return `<div class="wbf-host" id="host" style="padding: 30px">
    <div class="ds-eventcal__grid" id="port" style="overflow-x: auto; overflow-y: auto">
      <div class="ds-eventcal__top" id="top" style="position: sticky; top: 0">
        <div class="ds-eventcal__corner" id="corner" style="${corner}"></div>
        <div class="ds-eventcal__dayhead-cell" id="dh"></div>
      </div>
      <div class="ds-eventcal__canvas" id="canvas">
        <div class="ds-eventcal__hours" id="hours" style="position: sticky; left: 0"><span id="h9"></span></div>
        <div class="ds-eventcal__col" id="mon"></div><div class="ds-eventcal__col" id="wed"></div>
        <div class="ds-eventcal__col" id="thu"></div><div class="ds-eventcal__col" id="sun"></div>
        ${opts.canvasExtra ?? ''}
      </div>
      ${opts.portExtra ?? ''}
    </div>
    ${opts.hostExtra ?? ''}
  </div>`
}

describe('visible', () => {
  it('часы (sticky left) отрезают от понедельника 14 px', () => {
    mount(calendarHtml(), BASE_BOXES)
    const jig = makeFrameJig(window, { loadSearch: '' })
    const v = jig.visible('#mon')
    expect(v.state).toBe('partial')
    expect(v.width).toBe(76)
    expect(v.height).toBe(300)
    expect(v.hiddenX).toBe(14)
    expect(v.hiddenY).toBe(0)
    expect(v.cutBy).toHaveLength(1)
    expect(v.cutBy[0]).toMatch(/div\.ds-eventcal__hours$/)
  })

  it('угол режет ячейку шапки только по x (двусторонний sticky top+left)', () => {
    mount(calendarHtml({ corner: 'position: sticky; top: 0; left: 0' }), BASE_BOXES)
    const jig = makeFrameJig(window, { loadSearch: '' })
    const v = jig.visible('#dh')
    expect(v.state).toBe('partial')
    expect(v.width).toBe(76)
    expect(v.height).toBe(40)
  })

  it('шапка (sticky top) режет ячейку снизу прокрученного', () => {
    mount(calendarHtml({ canvasExtra: '<div id="slot"></div>' }), {
      ...BASE_BOXES,
      slot: [166, 50, 90, 100],
    })
    const jig = makeFrameJig(window, { loadSearch: '' })
    const v = jig.visible('#slot')
    expect(v.state).toBe('partial')
    expect(v.height).toBe(80)
    expect(v.hiddenY).toBe(20)
  })

  it('липкий предок не режет своё', () => {
    mount(calendarHtml(), BASE_BOXES)
    const jig = makeFrameJig(window, { loadSearch: '' })
    const v = jig.visible('#h9')
    expect(v.state).toBe('full')
    expect(v.width).toBe(60)
  })

  it('липкий из ЧУЖОГО контейнера прокрутки не режет', () => {
    mount(
      calendarHtml({
        portExtra: '<div id="late"></div>',
        hostExtra: '<div class="ds-eventcal__side" id="side" style="overflow-x: auto; overflow-y: auto">'
          + '<div class="ds-eventcal__side-head" id="side-head" style="position: sticky; top: 0"></div></div>',
      }),
      { ...BASE_BOXES, late: [100, 400, 50, 20], side: [30, 405, 380, 200], 'side-head': [30, 405, 380, 30] },
    )
    const jig = makeFrameJig(window, { loadSearch: '' })
    const v = jig.visible('#late')
    expect(v.state).toBe('full')
  })

  it('обрезка предком (port, overflow-x/y: auto)', () => {
    mount(calendarHtml(), BASE_BOXES)
    const jig = makeFrameJig(window, { loadSearch: '' })
    const v = jig.visible('#thu')
    expect(v.state).toBe('partial')
    expect(v.width).toBe(64)
    expect(v.hiddenX).toBe(26)
    expect(v.cutBy).toHaveLength(1)
    expect(v.cutBy[0]).toMatch(/div\.ds-eventcal__grid$/)
  })

  it('за краем порта — none, а не отрицательная ширина', () => {
    mount(calendarHtml(), BASE_BOXES)
    const jig = makeFrameJig(window, { loadSearch: '' })
    const v = jig.visible('#sun')
    expect(v.state).toBe('none')
    expect(v.width).toBe(0)
    expect(v.seen).toBeNull()
  })

  it('целиком видна — cutBy пуст', () => {
    mount(calendarHtml(), BASE_BOXES)
    const jig = makeFrameJig(window, { loadSearch: '' })
    const v = jig.visible('#wed')
    expect(v.state).toBe('full')
    expect(v.width).toBe(90)
    expect(v.cutBy).toEqual([])
  })

  it('вьюпорт кадра режет низ — cutBy называет его словом', () => {
    // #low лежит прямо в хосте (не в port): единственный клип, который его
    // может срезать, — вьюпорт кадра, а не overflow предка.
    mount(calendarHtml({ hostExtra: '<div id="low"></div>' }), {
      ...BASE_BOXES,
      low: [100, 600, 90, 100],
    })
    const jig = makeFrameJig(window, { loadSearch: '' })
    const v = jig.visible('#low')
    expect(v.state).toBe('partial')
    expect(v.height).toBe(40)
    expect(v.cutBy).toEqual(['вьюпорт кадра'])
  })
})

describe('box', () => {
  it('рамка ds-pivot не читается полосой (переведено на rect.width, JIG-40)', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"><div class="ds-pivot" id="pv" style="overflow: auto; border: 1px solid"></div></div>'
    stub(document.getElementById('pv')!, 'getBoundingClientRect', () => rectOf(0, 0, 382, 400))
    stubGet(document.getElementById('pv')!, 'clientWidth', () => 380)
    const jig = makeFrameJig(window, { loadSearch: '' })
    expect(jig.box('#pv').bar).toBe(0)
  })

  it('полоса читается, когда она правда есть (переведено на rect.width, JIG-40)', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"><div class="ds-pivot" id="pv" style="overflow: auto; border: 1px solid"></div></div>'
    const pv = document.getElementById('pv')!
    stub(pv, 'getBoundingClientRect', () => rectOf(0, 0, 382, 400))
    stubGet(pv, 'clientWidth', () => 365)
    const jig = makeFrameJig(window, { loadSearch: '' })
    expect(jig.box('#pv').bar).toBe(15)
  })

  it('dpr 1.15, рамка прижата к 0.87 CSS px — без полосы это 0, не отрицательное дробное (JIG-40)', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"><div class="ds-pivot" id="pv" style="overflow: auto; border: 0.87px solid"></div></div>'
    const pv = document.getElementById('pv')!
    stub(pv, 'getBoundingClientRect', () => rectOf(0, 0, 707.74, 400))
    stubGet(pv, 'clientWidth', () => 706)
    const jig = makeFrameJig(window, { loadSearch: '' })
    expect(jig.box('#pv').bar).toBe(0)
  })

  it('dpr 1.15, полоса при той же прижатой рамке — 15, не теряется в округлении (JIG-40)', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"><div class="ds-pivot" id="pv" style="overflow: auto; border: 0.87px solid"></div></div>'
    const pv = document.getElementById('pv')!
    stub(pv, 'getBoundingClientRect', () => rectOf(0, 0, 707.74, 400))
    stubGet(pv, 'clientWidth', () => 691)
    const jig = makeFrameJig(window, { loadSearch: '' })
    expect(jig.box('#pv').bar).toBe(15)
  })

  // На литералах владельца (707.74/0.87/706 и .../691) вычитание кратно и в
  // IEEE754 сокращается ДО целого без остатка — на них снятый round/max не
  // краснеет. Эти два случая подобраны так, чтобы сам остаток был дробным
  // (0.1) или уходил в минус (−0.8) ДО округления, — они и доказывают, что
  // round/max в формуле нагружены, а не декоративны.
  it('без round формула дала бы 0.1 вместо 0 — дробный остаток меньше половины пикселя', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"><div class="ds-pivot" id="pv" style="overflow: auto; border: 0.1px solid"></div></div>'
    const pv = document.getElementById('pv')!
    stub(pv, 'getBoundingClientRect', () => rectOf(0, 0, 706.3, 400))
    stubGet(pv, 'clientWidth', () => 706)
    const jig = makeFrameJig(window, { loadSearch: '' })
    expect(jig.box('#pv').bar).toBe(0)
  })

  it('без пола 0 формула ушла бы в −1 — округление дробного остатка в минус', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"><div class="ds-pivot" id="pv" style="overflow: auto; border: 0.1px solid"></div></div>'
    const pv = document.getElementById('pv')!
    stub(pv, 'getBoundingClientRect', () => rectOf(0, 0, 705.4, 400))
    stubGet(pv, 'clientWidth', () => 706)
    const jig = makeFrameJig(window, { loadSearch: '' })
    expect(jig.box('#pv').bar).toBe(0)
  })

  it('упор прокрутки — допуск 1 px (scrollLeft дробный при dpr ≠ 1; bar переведён на rect.width)', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"><div class="ds-eventcal__grid" id="ec"></div></div>'
    const ec = document.getElementById('ec')!
    stub(ec, 'getBoundingClientRect', () => rectOf(0, 0, 693, 400))
    stubGet(ec, 'clientWidth', () => 678)
    stubGet(ec, 'scrollWidth', () => 830)
    const jig = makeFrameJig(window, { loadSearch: '' })

    stubGet(ec, 'scrollLeft', () => 151.5)
    let b = jig.box('#ec')
    expect(b.bar).toBe(15)
    expect(b.scrollMax).toBe(152)
    expect(b.endX).toBe(true)

    stubGet(ec, 'scrollLeft', () => 150)
    expect(jig.box('#ec').endX).toBe(false)

    stubGet(ec, 'scrollWidth', () => 678)
    b = jig.box('#ec')
    expect(b.scrollMax).toBe(0)
    expect(b.endX).toBe(false)
  })

  it('у корня — bar равен docBar тулбара', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"></div>'
    stubGet(document.documentElement, 'clientWidth', () => 425)
    vi.stubGlobal('innerWidth', 440)
    const jig = makeFrameJig(window, { loadSearch: '' })
    const bar = jig.box(document.documentElement).bar
    expect(bar).toBe(jig.env().docBar)
    expect(bar).toBe(15)
  })

  it('селектор без видимых узлов — бросок с именем и счётом', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"></div>'
    const jig = makeFrameJig(window, { loadSearch: '' })
    expect(() => jig.box('.nope')).toThrow('«.nope»')
    expect(() => jig.box('.nope')).toThrow('совпало 0')
  })

  it('селектор со знаком равенства не печатается — словами, без «=» (JIG-40)', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"></div>'
    const jig = makeFrameJig(window, { loadSearch: '' })
    let msg = ''
    try {
      jig.box('[data-x="1"]')
    } catch (e) {
      msg = String((e as Error).message)
    }
    expect(msg).not.toContain('=')
    expect(msg).toContain('совпало 0')
    expect(msg).toContain('знак равенства')
  })

  it('matched считает все совпавшие узлы, не только видимые', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host">'
      + '<div class="copy" id="c1"></div><div class="copy" id="c2"></div><div class="copy" id="c3"></div></div>'
    stub(document.getElementById('c1')!, 'getBoundingClientRect', () => rectOf(0, 0, 0, 0))
    stub(document.getElementById('c2')!, 'getBoundingClientRect', () => rectOf(0, 0, 0, 0))
    stub(document.getElementById('c3')!, 'getBoundingClientRect', () => rectOf(0, 0, 90, 40))
    const jig = makeFrameJig(window, { loadSearch: '' })
    expect(jig.box('.copy').matched).toBe(3)
  })
})

describe('env', () => {
  it('кадр 440 с полосой', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host" style="padding: 30px"></div>'
    stubGet(document.documentElement, 'clientWidth', () => 425)
    stubGet(document.getElementById('host')!, 'clientWidth', () => 425)
    vi.stubGlobal('innerWidth', 440)
    vi.stubGlobal('devicePixelRatio', 1.15)
    const jig = makeFrameJig(window, { loadSearch: '' })
    const e = jig.env()
    expect(e.innerWidth).toBe(440)
    expect(e.docBar).toBe(15)
    expect(e.container).toBe(365)
    expect(e.dpr).toBe(1.15)
    expect(e.belowFloor).toBe(false)
  })

  it('кадр 768 без полосы', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host" style="padding: 30px"></div>'
    stubGet(document.documentElement, 'clientWidth', () => 768)
    stubGet(document.getElementById('host')!, 'clientWidth', () => 768)
    vi.stubGlobal('innerWidth', 768)
    const jig = makeFrameJig(window, { loadSearch: '' })
    const e = jig.env()
    expect(e.docBar).toBe(0)
    expect(e.container).toBe(708)
  })

  it('пол — из того же места, что ось матрицы (WIDTH_FLOOR)', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"></div>'
    vi.stubGlobal('innerWidth', 440)
    const jig = makeFrameJig(window, { loadSearch: '' })
    expect(jig.env().floor).toBe(WIDTH_FLOOR)
  })

  it('440 — ещё не ниже пола (М3: <= вместо < дало бы true)', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"></div>'
    vi.stubGlobal('innerWidth', 440)
    const jig = makeFrameJig(window, { loadSearch: '' })
    expect(jig.env().belowFloor).toBe(false)
  })

  it('ниже ВНЕДРЁННОГО пола — true (ширина всё равно ≥ 440, закон JIG-29 не нарушен)', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"></div>'
    vi.stubGlobal('innerWidth', 767)
    const jig = makeFrameJig(window, { loadSearch: '', floor: 768 })
    expect(jig.env().belowFloor).toBe(true)
  })

  it('без хоста — container null, empty называет причину', () => {
    document.body.innerHTML = ''
    vi.stubGlobal('innerWidth', 440)
    const jig = makeFrameJig(window, { loadSearch: '' })
    const e = jig.env()
    expect(e.container).toBeNull()
    expect(e.empty).toBe('нет .wbf-host')
  })

  it('params.address — адрес ЗАГРУЗКИ кадра, аудит того же документа', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"></div>'
    vi.stubGlobal('innerWidth', 440)
    const jig = makeFrameJig(window, { loadSearch: '?c=Tabs&mode=gird' })
    const e = jig.env()
    expect(e.params.address.of).toBe('frame')
    expect(e.params.address.replaced[0]?.key).toBe('mode')
  })

  it('ни одной строки адреса в env — BLOCKED режет строку целиком (М8)', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"></div>'
    vi.stubGlobal('innerWidth', 440)
    const jig = makeFrameJig(window, { loadSearch: '?c=Tabs&mode=gird&wdth=768' })
    expect(JSON.stringify(jig.env())).not.toMatch(/[?&][\w.]+=/)
  })
})

describe('ready', () => {
  class LiveRO {
    cb: () => void
    constructor(cb: () => void) { this.cb = cb }
    observe(): void { queueMicrotask(() => this.cb()) }
    disconnect(): void {}
    unobserve(): void {}
  }
  class DeadRO {
    observe(): void {}
    disconnect(): void {}
    unobserve(): void {}
  }

  const stubFonts = (status: FontFaceSetLoadStatus, ready: Promise<void> = Promise.resolve()): void => {
    stub(document, 'fonts', { ready, status })
  }

  it('живая вкладка — RO доставляет первый вызов', async () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"><span></span></div>'
    stubFonts('loaded')
    vi.stubGlobal('ResizeObserver', LiveRO)
    vi.stubGlobal('innerWidth', 440)
    const jig = makeFrameJig(window, { loadSearch: '' })
    const r = await jig.ready()
    expect(r.live).toBe(true)
    expect(r.fonts).toBe('loaded')
    expect(r.innerWidth).toBe(440)
  })

  it('спящая вкладка: ни RO, ни rAF — ответ ЗА ТАЙМАУТ, а не зависание (М4)', async () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"><span></span></div>'
    stubFonts('loaded')
    vi.stubGlobal('ResizeObserver', DeadRO)
    vi.stubGlobal('requestAnimationFrame', () => 0)
    vi.stubGlobal('innerWidth', 440)
    const jig = makeFrameJig(window, { loadSearch: '' })
    const r = await jig.ready({ timeoutMs: 50 })
    expect(r.live).toBe(false)
    expect(r.ms).toBeLessThan(1000)
  })

  it('ждёт хост: пустой → появившийся ребёнок снимает ожидание', async () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"></div>'
    stubFonts('loaded')
    vi.stubGlobal('ResizeObserver', LiveRO)
    vi.stubGlobal('innerWidth', 440)
    setTimeout(() => document.getElementById('host')!.append(document.createElement('span')), 30)
    const jig = makeFrameJig(window, { loadSearch: '' })
    const r = await jig.ready({ timeoutMs: 500 })
    expect(r.empty).toBeNull()
  })

  it('Фикстуры нет — не ждёт весь таймаут', async () => {
    document.body.innerHTML = '<div class="wbf-empty"></div>'
    stubFonts('loaded')
    vi.stubGlobal('ResizeObserver', LiveRO)
    vi.stubGlobal('innerWidth', 440)
    const jig = makeFrameJig(window, { loadSearch: '' })
    const r = await jig.ready({ timeoutMs: 2000 })
    expect(r.ms).toBeLessThan(500)
  })
})

/**
 * Роли узлов (JIG-42): `jig.node`/`jig.nodes` через `bindJigFrame` — тот же
 * мост, что `env().params.fixture`. DOM — одна колонка недели EventCalendar
 * (`#wed` с `data-day`, как в живом компоненте), плюс узел нулевой коробки
 * (`.zero`) и три копии одного класса (`.dup`) для случая `mode=states`.
 */
describe('роли узлов', () => {
  function nodesHtml(): string {
    return `<div class="wbf-host" id="host">
      <div class="ds-eventcal__grid" id="port" style="overflow-x: auto; overflow-y: auto">
        <div class="ds-eventcal__hours" id="sticky" style="position: sticky; left: 0"></div>
        <div class="ds-eventcal__col" id="wed" data-day="2026-09-02"></div>
      </div>
      <div class="zero" id="zero"></div>
      <div class="dup" id="dup1"></div>
      <div class="dup" id="dup2"></div>
      <div class="dup" id="dup3"></div>
    </div>`
  }

  const NODES_BOXES: Record<string, Box> = {
    host: [0, 0, 440, 640],
    port: [30, 30, 380, 400],
    sticky: [30, 30, 60, 300],
    wed: [256, 70, 90, 300],
    dup2: [10, 10, 90, 300],
    dup3: [10, 10, 90, 300],
  }

  const fx = {
    name: 'EventCalendar',
    group: 'g',
    props: {},
    controls: {},
    cases: [
      {
        id: 'week',
        title: 'Неделя',
        nodes: {
          port: '.ds-eventcal__grid',
          sticky: '.ds-eventcal__hours',
          cursor: '.ds-eventcal__col[data-day="2026-09-02"]',
          'toggle-x': '.nope',
          panel: '.zero',
        },
      },
      { id: 'bare', title: 'Без ролей' },
      { id: 'dup', title: 'Копии', nodes: { port: '.dup' } },
      { id: 'bad', title: 'Битый', nodes: { port: '[[[' } },
    ],
  } as unknown as AnyFixture

  let unbind: () => void = () => {}
  afterEach(() => {
    unbind()
    unbind = () => {}
  })

  function bind(ctx: { fx: AnyFixture | null | undefined; search: string }): void {
    unbind()
    unbind = bindJigFrame(() => ({ fx: ctx.fx, state: parseFrameUrl(ctx.search) }))
  }

  it('node(роль) — узел селектора', () => {
    mount(nodesHtml(), NODES_BOXES)
    bind({ fx, search: '?c=EventCalendar&case=week' })
    const jig = makeFrameJig(window, { loadSearch: '' })
    expect(jig.node('port')).toBe(document.getElementById('port'))
    expect(jig.node('cursor')).toBe(document.getElementById('wed'))
  })

  it('nodes() — карта без селекторов', () => {
    mount(nodesHtml(), NODES_BOXES)
    bind({ fx, search: '?c=EventCalendar&case=week' })
    const jig = makeFrameJig(window, { loadSearch: '' })
    const n = jig.nodes()
    expect(Object.keys(n).sort()).toEqual(['cursor', 'panel', 'port', 'sticky', 'toggle-x'].sort())
    expect(n.port).toEqual({ found: true, matched: 1, path: 'div.ds-eventcal__grid', box: { l: 30, t: 30, r: 410, b: 430 } })
    const json = JSON.stringify(n)
    expect(json).not.toContain('=')
    expect(json).not.toContain('data-day')
  })

  it('роль в пустоту — бросок с именем роли, без селектора', () => {
    mount(nodesHtml(), NODES_BOXES)
    bind({ fx, search: '?c=EventCalendar&case=week' })
    const jig = makeFrameJig(window, { loadSearch: '' })
    expect(() => jig.node('toggle-x')).toThrow(/роль «toggle-x» \(EventCalendar\/week\) указывает в пустоту/)
    let msg = ''
    try {
      jig.node('toggle-x')
    } catch (e) {
      msg = String((e as Error).message)
    }
    expect(msg).not.toContain('=')
    expect(jig.nodes()['toggle-x']).toEqual({ found: false, matched: 0, path: null, box: null })
  })

  it('нулевая коробка — не узел', () => {
    mount(nodesHtml(), NODES_BOXES)
    bind({ fx, search: '?c=EventCalendar&case=week' })
    const jig = makeFrameJig(window, { loadSearch: '' })
    expect(jig.nodes().panel).toEqual({ found: false, matched: 1, path: null, box: null })
    expect(() => jig.node('panel')).toThrow(/совпало 1, у всех коробка 0×0/)
  })

  it('неизвестная роль — бросок со списком', () => {
    mount(nodesHtml(), NODES_BOXES)
    bind({ fx, search: '?c=EventCalendar&case=week' })
    const jig = makeFrameJig(window, { loadSearch: '' })
    expect(() => jig.node('prot')).toThrow('нет роли «prot»; есть: port, sticky, cursor, toggle-x, panel')
  })

  it('mode=states: первая копия с коробкой', () => {
    mount(nodesHtml(), NODES_BOXES)
    bind({ fx, search: '?c=EventCalendar&case=dup&mode=states' })
    const jig = makeFrameJig(window, { loadSearch: '' })
    expect(jig.node('port')).toBe(document.getElementById('dup2'))
    expect(jig.nodes().port!.matched).toBe(3)
  })

  it('случай без ролей — пустая карта', () => {
    mount(nodesHtml(), NODES_BOXES)
    bind({ fx, search: '?c=EventCalendar&case=bare' })
    const jig = makeFrameJig(window, { loadSearch: '' })
    expect(jig.nodes()).toEqual({})
  })

  it('пустой case — первый случай', () => {
    mount(nodesHtml(), NODES_BOXES)
    bind({ fx, search: '?c=EventCalendar' })
    const jig = makeFrameJig(window, { loadSearch: '' })
    expect(Object.keys(jig.nodes()).sort()).toEqual(['cursor', 'panel', 'port', 'sticky', 'toggle-x'].sort())
  })

  it('селектор не разобрался', () => {
    mount(nodesHtml(), NODES_BOXES)
    bind({ fx, search: '?c=EventCalendar&case=bad' })
    const jig = makeFrameJig(window, { loadSearch: '' })
    expect(jig.nodes().port!.error).toBeDefined()
    expect(jig.nodes().port!.found).toBe(false)
    expect(() => jig.node('port')).toThrow(/селектор фикстуры не разобрался/)
  })

  it('кадр грузится / фикстуры нет / canvas', () => {
    mount(nodesHtml(), NODES_BOXES)
    const jig = makeFrameJig(window, { loadSearch: '' })

    bind({ fx: undefined, search: '?c=EventCalendar&case=week' })
    expect(() => jig.node('port')).toThrow('кадр ещё грузится')

    bind({ fx: null, search: '?c=EventCalendar&case=week' })
    expect(() => jig.node('port')).toThrow('фикстуры EventCalendar нет')

    bind({ fx, search: '?c=EventCalendar&case=week&mode=canvas' })
    expect(() => jig.node('port')).toThrow('вид canvas')
  })
})

describe('дрейф', () => {
  it('FRAME_API — ровно методы кадра', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"></div>'
    const jig = makeFrameJig(window, { loadSearch: '' })
    const keys = Object.keys(jig).filter((k) => k !== 'help')
    expect(new Set(keys)).toEqual(new Set(FRAME_API))
  })

  it('справка называет каждый метод', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"></div>'
    const jig = makeFrameJig(window, { loadSearch: '' })
    for (const name of FRAME_API) expect(jig.help).toContain(name)
  })

  it('справка без «=» и короче 900 символов (JIG-40: инструмент агента режет длиннее и с «=» вовсе)', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"></div>'
    const jig = makeFrameJig(window, { loadSearch: '' })
    expect(jig.help).not.toContain('=')
    expect(jig.help.length).toBeLessThan(900)
  })

  it('roles() — словарь без селекторов и без «=»; каждая база NODE_ROLES в нём есть (JIG-42)', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"></div>'
    const jig = makeFrameJig(window, { loadSearch: '' })
    const json = JSON.stringify(jig.roles())
    expect(json).not.toContain('=')
    for (const role of Object.keys(NODE_ROLES)) expect(json).toContain(role)
  })

  it('norm — ТА ЖЕ функция, что у развёртки (М7 держит sweep.ts)', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"></div>'
    const jig = makeFrameJig(window, { loadSearch: '' })
    expect(jig.norm).toBe(normColour)
  })
})
