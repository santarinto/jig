/**
 * `window.jig` — сторона кадра (JIG-40).
 *
 * Меряет ровно тем, чем гейт и развёртка: `visiblePart`/`stickyBox`/
 * `stickySides` из `gate-predicates.ts` (клип и липкие соседи — тот же ответ,
 * что и гейту «Цель клика»), `normColour`/`pick` из `probe.ts` (тот же цвет,
 * что и `/sweep.html`), `docBarOf`/`roomOf` из `frame-size.ts` (та же полоса и
 * тот же контейнер, что печатает тулбар). Своей копии ни одного определения
 * здесь нет — расхождение с гейтом и развёрткой было бы молчаливым и решалось
 * бы неверно на первой же правке любого из них.
 */
import { readablePath } from './culprit-path.js'
import { frameFacts } from './frame-facts.js'
import { auditAddress } from './frame-url.js'
import type { FrameState } from './frame-url.js'
import { docBarOf, roomOf } from './frame-size.js'
import { MIN_WIDTH } from './frame-width.js'
import { empty, stickyBox, stickySides, visiblePart, type Rect } from './gate-predicates.js'
import { normColour, pick } from './probe.js'
import { auditCase, caseOf } from './resolve-case.js'
import type { Box, Env, FrameJig, NodeInfo, Ready, Target, Visible } from './jig-api.js'
import { NODE_ROLES } from '../src/internal/fixture.js'
import type { AnyFixture } from '../src/internal/fixture.js'

/** Что `bindJigFrame` читает у `Frame`: фикстура текущего кадра и его состояние. */
export interface FrameCtx {
  fx: AnyFixture | null | undefined
  state: FrameState
}

/**
 * Ссылка на текущий контекст кадра — МОДУЛЬНАЯ, не React-состояние: `jig`
 * живёт вне дерева React, и `env()` вызывается синхронно, в любой момент, а
 * не только во время рендера. Один кадр — один документ — один модуль этого
 * файла (браузер изолирует реалм `<iframe>`), так что делить эту ссылку
 * между разными компонентами нечему.
 */
let ctxGetter: (() => FrameCtx) | null = null

/** Привязка моста `Frame → jig`: тот же мост питает `node`/`nodes` (JIG-42) через `Case.nodes`. Возвращает отвязку. */
export function bindJigFrame(get: () => FrameCtx): () => void {
  ctxGetter = get
  return () => {
    if (ctxGetter === get) ctxGetter = null
  }
}

const r2 = (n: number): number => Math.round(n * 100) / 100

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect()
  return { l: r.left, t: r.top, r: r.right, b: r.bottom }
}

const sleep = (win: Window, ms: number): Promise<void> => new Promise((res) => win.setTimeout(res, ms))

/**
 * Разрешение цели: строка идёт через `pick` (первый узел с ненулевой
 * коробкой, скрытые копии не меряются) в переданном документе кадра; узел —
 * он сам, а вычисления берутся от ЕГО документа (`el.ownerDocument`), не от
 * документа кадра, — агент передаёт узлы из своих собственных `<iframe>`.
 */
function resolve(t: Target, doc: Document): { el: Element; doc: Document; matched: number } {
  if (typeof t === 'string') {
    const matched = doc.querySelectorAll(t).length
    const el = pick(doc, t)
    if (!el) throw new Error(`jig: «${t}» — ни одного узла с ненулевой коробкой (совпало ${matched})`)
    return { el, doc: el.ownerDocument, matched }
  }
  return { el: t, doc: t.ownerDocument, matched: 1 }
}

/**
 * Роли текущего случая. Бросает словами, а не отдаёт `null` (в отличие от
 * `resolve` для селектора): «случая нет» и «случай без ролей» — РАЗНЫЕ
 * отказы, и агент без файлов различает их только по тексту.
 */
function rolesOf(): { at: string; roles: Record<string, string>; doc: Document } {
  const ctx = ctxGetter?.()
  if (!ctx || ctx.fx === undefined) throw new Error('jig: кадр ещё грузится — await jig.ready()')
  if (ctx.fx === null) throw new Error(`jig: фикстуры ${ctx.state.c} нет — ролей нет`)
  if (ctx.state.mode === 'canvas') throw new Error('jig: вид canvas — у мест свои фикстуры, роли случая не определены')
  const fx = ctx.fx
  const k = caseOf(fx, ctx.state.caseId)
  const at = `${fx.name}/${k?.id ?? '—'}`
  const roles = (k?.nodes ?? {}) as Record<string, string>
  // Глобальный `document`, не аргумент: один кадр — один документ — один
  // модуль этого файла (докблок `ctxGetter` выше), `node`/`nodes` живут вне
  // конкретного вызова `makeFrameJig` тем же доводом.
  return { at, roles, doc: document }
}

/** Один селектор роли: узел (`pick`, первый с ненулевой коробкой) плюс сколько совпало всего. */
function look(dc: Document, sel: string): { el: HTMLElement | null; matched: number; error?: string } {
  try {
    const matched = dc.querySelectorAll(sel).length
    const el = pick(dc, sel)
    return { el, matched }
  } catch {
    return { el: null, matched: 0, error: 'селектор фикстуры не разобрался' }
  }
}

const boxOf = (el: Element): { l: number; t: number; r: number; b: number } => {
  const r = rectOf(el)
  return { l: r2(r.l), t: r2(r.t), r: r2(r.r), b: r2(r.b) }
}

function node(role: string): HTMLElement {
  const { at, roles, doc: dc } = rolesOf()
  const sel = roles[role]
  if (sel === undefined) {
    const keys = Object.keys(roles)
    throw new Error(`jig: у случая ${at} нет роли «${role}»; есть: ${keys.join(', ') || 'ни одной'}`)
  }
  const { el, matched, error } = look(dc, sel)
  if (error) throw new Error(`jig: роль «${role}» (${at}) — селектор фикстуры не разобрался`)
  if (matched === 0) throw new Error(`jig: роль «${role}» (${at}) указывает в пустоту — ни одного узла`)
  if (el === null) throw new Error(`jig: роль «${role}» (${at}) — совпало ${matched}, у всех коробка 0×0`)
  return el
}

function nodes(): Record<string, NodeInfo> {
  const { roles, doc: dc } = rolesOf()
  const host = dc.querySelector('.wbf-host')
  const out: Record<string, NodeInfo> = {}
  for (const [role, sel] of Object.entries(roles)) {
    const { el, matched, error } = look(dc, sel)
    out[role] = {
      found: !!el,
      matched,
      path: el ? readablePath(el, host) : null,
      box: el ? boxOf(el) : null,
      ...(error ? { error } : {}),
    }
  }
  return out
}

/**
 * Шаги 1-3 `ready()`, вынесены отдельно: `scroll-to` кадра (JIG-42,
 * `frame-app.tsx`) обязан ждать той же готовности, а не своей копии условия
 * «хост устоялся». Поведение и тесты `ready()` (JIG-40) без изменений.
 */
export async function settle(doc: Document, timeoutMs: number): Promise<{ live: boolean }> {
  const win = doc.defaultView!

  // 1) Хост устоялся: «нет .wbf-host» во время загрузки и «Фикстуры нет»
  // после неё выглядят для `frameFacts` одинаково (`empty` — строка в обоих
  // случаях), поэтому конец ожидания — появление `.wbf-empty`/`.wbf-error`
  // ИЛИ хост с содержимым, а не сам факт «есть непустая строка».
  const settled = (): boolean => frameFacts(doc).empty === null || !!doc.querySelector('.wbf-empty, .wbf-error')
  const t0 = win.performance.now()
  while (!settled() && win.performance.now() - t0 < timeoutMs) {
    await sleep(win, 50)
  }

  // 2) Шрифты — гонка с таймером, не `requestAnimationFrame`.
  await Promise.race([doc.fonts.ready, sleep(win, timeoutMs)])

  // 3) Живость вкладки: первый вызов СВЕЖЕГО `ResizeObserver` на
  // `documentElement`. Спящая вкладка его не доставляет — таймер решает
  // за неё, а не голое ожидание, которое повесило бы прогон навсегда.
  const live = await new Promise<boolean>((res) => {
    let settled2 = false
    const finish = (v: boolean): void => {
      if (settled2) return
      settled2 = true
      win.clearTimeout(timer)
      ro.disconnect()
      res(v)
    }
    const ro = new ResizeObserver(() => finish(true))
    ro.observe(doc.documentElement)
    const timer = win.setTimeout(() => finish(false), Math.min(timeoutMs, 1000))
  })

  return { live }
}

const HELP = [
  "jig.ready({timeoutMs?}) → Promise<{live, fonts, ms, ...env()}> — хост устоялся, шрифты, живость вкладки",
  'jig.env() → {theme, scale, clientWidth, empty, innerWidth, innerHeight, dpr, docBar, container, floor, belowFloor, params}',
  'jig.box(target) → {width, height, clientWidth, clientHeight, bar, barX, scrollLeft, scrollMax, scrollTop, scrollTopMax, endX, endY, matched} — target: селектор или узел',
  'jig.visible(target) → {state, width, height, hiddenX, hiddenY, box, seen, cutBy, matched} — cutBy называет предков и липких соседей, срезавших коробку',
  "jig.norm(css) → 'rgba(r, g, b, a)' — тот же формат, что fg/bg развёртки",
  "jig.node(роль) → HTMLElement — узел роли текущего случая; бросает словами (без селектора, без «=»), если роли нет, она указывает в пустоту или у всех совпадений коробка 0×0",
  'jig.nodes() → Record<роль, {found, matched, path, box, error?}> — карта ролей случая, без селекторов; случай без ролей — {}',
  'роли (Case.nodes): ' + Object.entries(NODE_ROLES).map(([k, v]) => `${k} — ${v}`).join('; '),
  'уточнитель роли через дефис: toggle-date, sticky-top',
  'числа печатай рядом с innerWidth и dpr из ready()/env()',
].join('\n')

/**
 * `makeFrameJig(win, opts)` — фабрика, не синглтон: `installFrameJig` ставит
 * её результат на `win.jig`, а тесты зовут её напрямую на подставном `window`.
 * `opts.floor` — только для теста границы пола (закон JIG-29 не позволяет
 * измерять НИЖЕ 440, но переставить сам пол числом, который проверка не
 * трогает физической шириной, можно).
 */
export function makeFrameJig(win: Window, opts: { loadSearch: string; floor?: number }): FrameJig {
  const floor = opts.floor ?? MIN_WIDTH
  const doc = win.document

  function env(): Env {
    const host = doc.querySelector('.wbf-host')
    const ctx = ctxGetter?.()
    return {
      ...frameFacts(doc),
      innerWidth: win.innerWidth,
      innerHeight: win.innerHeight,
      dpr: win.devicePixelRatio,
      docBar: docBarOf(doc),
      container: host ? roomOf(host).cw : null,
      floor,
      belowFloor: win.innerWidth < floor,
      params: {
        address: auditAddress(opts.loadSearch, 'frame'),
        fixture: ctx && ctx.fx ? auditCase(ctx.fx, ctx.state) : null,
      },
    }
  }

  async function ready(o: { timeoutMs?: number } = {}): Promise<Ready> {
    const timeoutMs = o.timeoutMs ?? 3000
    const t0 = win.performance.now()

    // ПРЕДЕЛ: первый вызов наблюдателя (шаг 3 `settle`) не значит, что
    // перерисовка React по чужим `ResizeObserver` уже закоммичена — для семи
    // компонентов на JS-раскладке после `live: true` число снимать ВТОРЫМ
    // вызовом.
    const { live } = await settle(doc, timeoutMs)

    return { ...env(), live, fonts: doc.fonts.status, ms: Math.round(win.performance.now() - t0) }
  }

  function box(t: Target): Box {
    const { el, doc: elDoc, matched } = resolve(t, doc)
    const view = elDoc.defaultView!
    const cs = view.getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const px = (s: string): number => parseFloat(s) || 0
    const bl = px(cs.borderLeftWidth)
    const br = px(cs.borderRightWidth)
    const bt = px(cs.borderTopWidth)
    const bb = px(cs.borderBottomWidth)
    const he = el as HTMLElement
    const isRoot = el === elDoc.documentElement

    const bar = isRoot ? docBarOf(elDoc) : he.offsetWidth - he.clientWidth - bl - br
    const barX = isRoot
      ? Math.max(0, Math.round(view.innerHeight - elDoc.documentElement.clientHeight))
      : he.offsetHeight - he.clientHeight - bt - bb

    const scrollMax = he.scrollWidth - he.clientWidth
    const scrollTopMax = he.scrollHeight - he.clientHeight
    const endX = scrollMax > 0 && he.scrollLeft >= scrollMax - 1
    const endY = scrollTopMax > 0 && he.scrollTop >= scrollTopMax - 1

    return {
      width: r2(r.width),
      height: r2(r.height),
      clientWidth: r2(he.clientWidth),
      clientHeight: r2(he.clientHeight),
      bar: r2(bar),
      barX: r2(barX),
      scrollLeft: r2(he.scrollLeft),
      scrollMax: r2(scrollMax),
      scrollTop: r2(he.scrollTop),
      scrollTopMax: r2(scrollTopMax),
      endX,
      endY,
      matched,
    }
  }

  function visible(t: Target): Visible {
    const { el, doc: elDoc, matched } = resolve(t, doc)
    const view = elDoc.defaultView!
    const de = elDoc.documentElement
    const host = elDoc.querySelector('.wbf-host')
    const box0 = rectOf(el)
    const cutBy: string[] = []

    let v = visiblePart(el, elDoc, false, box0, (a) => cutBy.push(readablePath(a, host)))

    // Вьюпорт кадра — последний клип, БЕЗ полос документа (спорное решение
    // п.6: гейт вьюпорт не режет вовсе, он сначала `scrollIntoView`; агенту
    // «видно» значит «на экране»).
    const vpR = de.clientWidth
    const vpB = de.clientHeight
    const beforeVp = { l: v.l, t: v.t, r: v.r, b: v.b }
    v = { ...v, l: Math.max(v.l, 0), t: Math.max(v.t, 0), r: Math.min(v.r, vpR), b: Math.min(v.b, vpB) }
    if (v.l !== beforeVp.l || v.t !== beforeVp.t || v.r !== beforeVp.r || v.b !== beforeVp.b) {
      cutBy.push('вьюпорт кадра')
    }

    for (const s of elDoc.querySelectorAll('*')) {
      if (empty(v)) break
      const cs = view.getComputedStyle(s)
      if (cs.position !== 'sticky') continue
      if (s === el || s.contains(el) || el.contains(s)) continue
      const sb = stickyBox(s, elDoc)
      if (sb && !sb.contains(el)) continue
      const sRect = rectOf(s)
      if (empty(sRect)) continue
      const sides = stickySides(cs)
      let cut = false

      if ((sides.left || sides.right) && sRect.t <= v.t + 0.5 && sRect.b >= v.b - 0.5 && sRect.l < v.r && sRect.r > v.l) {
        if (sRect.l <= v.l) { v.l = sRect.r; cut = true } else if (sRect.r >= v.r) { v.r = sRect.l; cut = true } else {
          // S лежит внутри цели по этой оси — оставляем БОЛЬШИЙ кусок.
          const left = sRect.l - v.l
          const right = v.r - sRect.r
          if (left >= right) v.r = sRect.l
          else v.l = sRect.r
          cut = true
        }
      }
      if ((sides.top || sides.bottom) && sRect.l <= v.l + 0.5 && sRect.r >= v.r - 0.5 && sRect.t < v.b && sRect.b > v.t) {
        if (sRect.t <= v.t) { v.t = sRect.b; cut = true } else if (sRect.b >= v.b) { v.b = sRect.t; cut = true } else {
          const top = sRect.t - v.t
          const bottom = v.b - sRect.b
          if (top >= bottom) v.b = sRect.t
          else v.t = sRect.b
          cut = true
        }
      }
      if (cut) cutBy.push(readablePath(s, host))
    }

    const isEmpty = empty(v)
    const width = Math.max(0, v.r - v.l)
    const height = Math.max(0, v.b - v.t)
    const boxW = box0.r - box0.l
    const boxH = box0.b - box0.t
    const state: Visible['state'] = isEmpty ? 'none' : boxW - width <= 0.5 && boxH - height <= 0.5 ? 'full' : 'partial'

    return {
      state,
      width: r2(width),
      height: r2(height),
      hiddenX: r2(boxW - width),
      hiddenY: r2(boxH - height),
      box: { l: r2(box0.l), t: r2(box0.t), r: r2(box0.r), b: r2(box0.b) },
      seen: isEmpty ? null : { l: r2(v.l), t: r2(v.t), r: r2(v.r), b: r2(v.b) },
      cutBy,
      matched,
    }
  }

  return { help: HELP, ready, env, box, visible, norm: normColour, node, nodes }
}

export function installFrameJig(win: Window = window): FrameJig {
  const jig = makeFrameJig(win, { loadSearch: win.location.search })
  win.jig = jig
  return jig
}
