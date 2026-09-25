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
import { makeFrameJig } from './jig.js'
import { FRAME_API } from './jig-api.js'
import { normColour } from './probe.js'
import { WIDTH_FLOOR } from '../scripts/width-surface.mjs'

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
  it('рамка ds-pivot не читается полосой (М2: без вычета рамок дало бы 2)', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"><div class="ds-pivot" id="pv" style="overflow: auto; border: 1px solid"></div></div>'
    stub(document.getElementById('pv')!, 'getBoundingClientRect', () => rectOf(0, 0, 380, 400))
    stubGet(document.getElementById('pv')!, 'offsetWidth', () => 382)
    stubGet(document.getElementById('pv')!, 'clientWidth', () => 380)
    const jig = makeFrameJig(window, { loadSearch: '' })
    expect(jig.box('#pv').bar).toBe(0)
  })

  it('полоса читается, когда она правда есть', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"><div class="ds-pivot" id="pv" style="overflow: auto; border: 1px solid"></div></div>'
    const pv = document.getElementById('pv')!
    stub(pv, 'getBoundingClientRect', () => rectOf(0, 0, 365, 400))
    stubGet(pv, 'offsetWidth', () => 382)
    stubGet(pv, 'clientWidth', () => 365)
    const jig = makeFrameJig(window, { loadSearch: '' })
    expect(jig.box('#pv').bar).toBe(15)
  })

  it('упор прокрутки — допуск 1 px (scrollLeft дробный при dpr ≠ 1)', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"><div class="ds-eventcal__grid" id="ec"></div></div>'
    const ec = document.getElementById('ec')!
    stub(ec, 'getBoundingClientRect', () => rectOf(0, 0, 678, 400))
    stubGet(ec, 'offsetWidth', () => 693)
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

  it('norm — ТА ЖЕ функция, что у развёртки (М7 держит sweep.ts)', () => {
    document.body.innerHTML = '<div class="wbf-host" id="host"></div>'
    const jig = makeFrameJig(window, { loadSearch: '' })
    expect(jig.norm).toBe(normColour)
  })
})
