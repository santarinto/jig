/**
 * Развёртка: браузерная половина (DS-219). Разбор задания и оценка — в
 * `sweep-plan.ts`; здесь только то, что без живого документа не снять.
 *
 * Вызов из консоли вкладки `sweep.html` (или `javascript_tool`):
 *
 *   await __dsSweep.run({ c: 'Pagination', cases: ['base'], widths: [440, 900],
 *     scales: [1, 1.5], targets: [{ name: 'next', selector: '.ds-pagination__next' }],
 *     invariants: [{ metric: 'h', min: 24 }, { metric: 'h', grows: 'scale' }, { fits: true }] })
 *
 * Результат лежит и в `__dsSweep.last`: вызов длиннее 45 с роняет
 * `javascript_tool` по таймауту CDP, а прогон при этом доходит до конца —
 * ответ дочитывается вторым вызовом, а не перезапуском.
 *
 * ТРИ РЕШЕНИЯ, каждое из замера, а не из вкуса.
 *
 * 1. Кадр ВИДИМЫЙ, на экране. Скрытый зонд врёт на ширине текста около 5 %
 *    (`CommandBar/base` 611 против 642), и `fonts.ready` этого не лечит.
 *
 * 2. Одна загрузка на случай; тема и шкала ставятся тем же `applyFrameEnv`,
 *    которым их ставит живой кадр по патчу оболочки, — то есть ровно тот путь,
 *    который видит владелец, щёлкая чипы. Ширина меняется стилем iframe, и
 *    `offsetWidth` форсирует раскладку синхронно: сотня ширин проходит без
 *    ожиданий (DS-282). `settleMs` — только для раскладки, которую
 *    считает JS по `ResizeObserver`.
 *
 * 3. Живость вкладки — СВОИМ наблюдателем, в каждом отчёте. Фоновая вкладка
 *    не доставляет `ResizeObserver` и `requestAnimationFrame` и молчит об
 *    этом; числа при этом внутренне непротиворечивы. Отчёт с `live: false`
 *    говорит об этом первой строкой сводки, а не оставляет догадываться.
 */
import { applyFrameEnv } from './frame-scale.js'
import { buildFrameUrl, parseFrameUrl } from './frame-url.js'
import { unpack, type Up } from './protocol.js'
import {
  DEFAULT_SCALES,
  DEFAULT_THEMES,
  evaluate,
  summarize,
  validateSpec,
  type Cell,
  type SweepSpec,
  type Target,
  type Violation,
} from './sweep-plan.js'

export interface SweepResult {
  live: boolean
  summary: string
  violations: Violation[]
  cells: Cell[]
  ms: number
}

const READY_MS = 8000
const APPEAR_MS = 3000
/** `sid` зонда — вне диапазона оболочки, чтобы чужой `ready` не сошёл за свой. */
let nextSid = 90_000

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
/**
 * Два кадра отрисовки — но не дольше секунды: в спящей вкладке
 * `requestAnimationFrame` не приходит вовсе, и голое ожидание повесило бы
 * прогон навсегда вместо того, чтобы доложить `live: false`.
 */
const frames = () =>
  Promise.race([new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))), sleep(1000)])

/** Цвет к `rgba(...)` через canvas: `color(srgb …)` и `color-mix` читаются как есть. */
const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
function normColour(css: string): string {
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = '#000'
  ctx.fillStyle = css
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return `rgba(${r}, ${g}, ${b}, ${Math.round((a! / 255) * 100) / 100})`
}

function backgroundOf(el: Element, win: Window): string {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const bg = win.getComputedStyle(n).backgroundColor
    if (normColour(bg).endsWith(', 0)') === false) return normColour(bg)
  }
  return normColour(win.getComputedStyle(win.document.body).backgroundColor)
}

/** Первый узел селектора с ненулевой коробкой: скрытые копии не меряются. */
function pick(doc: Document, selector: string): HTMLElement | null {
  for (const el of doc.querySelectorAll<HTMLElement>(selector)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

/**
 * Четыре угла цели попадают в неё саму. Точка отступает от угла НА РАДИУС
 * скругления, а не на 1 px: первая редакция брала 1 px и на `Pagination` при
 * шкале 1.5 докладывала «угол перекрыт» у каждой кнопки — точка лежала за
 * дугой `border-radius`, и `elementFromPoint` честно отдавал родителя. Точка
 * (r, r) от угла лежит внутри скруглённой коробки при любом r.
 */
function corners(el: Element, doc: Document): boolean {
  const r = el.getBoundingClientRect()
  const cs = doc.defaultView!.getComputedStyle(el)
  const radius = Math.max(
    ...[cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius].map((v) => parseFloat(v) || 0),
  )
  const d = Math.max(1, Math.min(radius, r.width / 2, r.height / 2))
  const pts: Array<[number, number]> = [
    [r.left + d, r.top + d], [r.right - d, r.top + d], [r.left + d, r.bottom - d], [r.right - d, r.bottom - d],
  ]
  return pts.every(([x, y]) => {
    const hitEl = doc.elementFromPoint(x, y)
    return !!hitEl && (hitEl === el || el.contains(hitEl))
  })
}

async function waitFor(doc: Document, selector: string): Promise<void> {
  const t0 = performance.now()
  while (performance.now() - t0 < APPEAR_MS) {
    if (pick(doc, selector)) return
    await sleep(50)
  }
}

function loadInto(f: HTMLIFrameElement, url: string, sid: number | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error(`кадр не ответил за ${READY_MS} мс: ${url}`)) }, READY_MS)
    const onMsg = (e: MessageEvent) => {
      if (sid === null) return
      const up = unpack<Up>(e, sid, f.contentWindow)
      if (up?.type === 'ready') { cleanup(); resolve() }
    }
    const onLoad = () => { if (sid === null) { cleanup(); resolve() } }
    const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', onMsg); f.removeEventListener('load', onLoad) }
    window.addEventListener('message', onMsg)
    f.addEventListener('load', onLoad)
    f.src = url
  })
}

/** Ширина кадра и синхронный лэйаут; ожидание — только если задание просит. */
async function setWidth(f: HTMLIFrameElement, w: number, settleMs: number): Promise<void> {
  f.style.width = `${w}px`
  void f.offsetWidth
  void f.contentDocument?.documentElement.offsetWidth
  if (settleMs > 0) { await frames(); await sleep(settleMs) }
}

function measure(doc: Document, t: Target): Partial<Cell> & { found: boolean } {
  const win = doc.defaultView!
  const el = pick(doc, t.selector)
  if (!el) return { found: false }
  const r = el.getBoundingClientRect()
  const out: Partial<Cell> & { found: boolean } = {
    found: true, w: r.width, h: r.height, hit: corners(el, doc),
    fg: normColour(win.getComputedStyle(el).color), bg: backgroundOf(el, win),
  }
  if (t.before) {
    const prev = el.getAttribute('style')
    el.setAttribute('style', `${prev ?? ''};${t.before}`)
    const b = el.getBoundingClientRect()
    out.wBefore = b.width
    out.hBefore = b.height
    if (prev === null) el.removeAttribute('style')
    else el.setAttribute('style', prev)
    void el.offsetWidth
  }
  return out
}

const overflowOf = (doc: Document) => doc.documentElement.scrollWidth > doc.documentElement.clientWidth

export async function run(spec: SweepSpec, stage: HTMLElement): Promise<SweepResult> {
  const errs = validateSpec(spec)
  if (errs.length) throw new Error(`задание: ${errs.join('; ')}`)
  const t0 = performance.now()
  const themes = spec.themes ?? DEFAULT_THEMES
  const scales = spec.scales ?? DEFAULT_SCALES
  const settle = spec.settleMs ?? 0

  const f = document.createElement('iframe')
  f.className = 'sw__frame'
  f.style.height = '600px'
  stage.replaceChildren(f)

  // Живость: свой наблюдатель на СВОЁМ кадре. Меняем ширину и ждём вызова;
  // ноль вызовов значит спящую вкладку, а не сломанный компонент.
  let fired = 0
  const ro = new ResizeObserver(() => { fired++ })
  ro.observe(f)
  await frames()
  const base = fired
  // Ширина ОТЛИЧНАЯ от текущей: та же ширина наблюдателя не будит, и спящей
  // объявилась бы живая вкладка (первая редакция ставила 321 поверх 321 из CSS).
  f.style.width = `${f.offsetWidth + 17}px`
  await frames()
  const live = fired > base

  const cells: Cell[] = []
  try {
    for (const caseId of spec.cases) {
      const sid = nextSid++
      const url = `/frame.html${buildFrameUrl({ ...parseFrameUrl(''), c: spec.c, caseId, sid })}`
      await loadInto(f, url, sid)
      const doc = f.contentDocument!
      await doc.fonts.ready
      for (const t of spec.targets) await waitFor(doc, t.selector)
      for (const theme of themes) {
        for (const scale of scales) {
          applyFrameEnv(doc, { theme, scale })
          for (const width of spec.widths) {
            await setWidth(f, width, settle)
            const overflow = overflowOf(doc)
            for (const t of spec.targets) {
              cells.push({ c: spec.c, caseId, theme, scale, width, target: t.name, overflow, ...measure(doc, t) })
            }
          }
        }
      }
    }
    // Превью: тот же селектор, те же оси, свой документ. Тема и шкала — на
    // корень превью тем же `applyFrameEnv`: превью грузит токены тем же листом.
    for (const t of spec.targets.filter((x) => x.preview)) {
      await loadInto(f, t.preview!, null)
      const doc = f.contentDocument!
      await doc.fonts.ready
      for (const theme of themes) {
        for (const scale of scales) {
          applyFrameEnv(doc, { theme, scale })
          for (const width of spec.widths) {
            await setWidth(f, width, settle)
            const m = measure(doc, t)
            for (const x of cells) {
              if (x.target === t.name && x.theme === theme && x.scale === scale && x.width === width) {
                x.wPreview = m.w
                x.hPreview = m.h
              }
            }
          }
        }
      }
    }
  } finally {
    ro.disconnect()
  }
  const violations = evaluate(cells, spec.invariants ?? [])
  return { live, summary: summarize(cells, violations, live), violations, cells, ms: Math.round(performance.now() - t0) }
}
