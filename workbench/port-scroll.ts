/**
 * Прокрутка узла роли `port` — чистые помощники, без React и без `postMessage`
 * (JIG-42). Кадр (`frame-app.tsx`) собирает их в эффект; здесь — то, что можно
 * проверить без монтирования кадра.
 *
 * БЕЗ `hand` (decisions 1.7, отменяет варианты B/C спецификации). Эвристика
 * «ввод за ≤ 1 с до `scroll` — значит рука» ловила ложным плюсом клик
 * «Следующая неделя» с последующим якорем компонента: тогда позиция,
 * выбранная якорем, читалась бы как рука и уезжала в адрес. Живая позиция
 * идёт ТОЛЬКО в `Up 'scroll'` (тулбар), в адрес она не пишется никогда;
 * ссылку с текущей прокруткой собирает `CopyChip` из последнего такого
 * сообщения — не это поле.
 */
import { pick } from './probe.js'

/** Сколько ждать узел роли `port`, если он появляется не в первом кадре. */
export const PORT_FIND_MS = 3000

/**
 * Throttle-окно печати живой прокрутки в оболочку. Не чаще раза в это время,
 * плюс ОДИН хвостовой замер после паузы — иначе последняя позиция серии
 * `scroll` (например, конец инерции колеса) никогда бы не долетела.
 */
export const SCROLL_SEND_MS = 100

export interface PortScroll {
  x: number
  xMax: number
  y: number
  yMax: number
}

const r2 = (n: number): number => Math.round(n * 100) / 100

/** `x`/`y` — `scrollLeft`/`scrollTop`; `xMax`/`yMax` — `max(0, scrollWidth − clientWidth)` и по высоте. */
export function scrollOf(el: Element): PortScroll {
  return {
    x: r2(el.scrollLeft),
    xMax: r2(Math.max(0, el.scrollWidth - el.clientWidth)),
    y: r2(el.scrollTop),
    yMax: r2(Math.max(0, el.scrollHeight - el.clientHeight)),
  }
}

/**
 * Ставит оси, которые не `null`; возвращает, что встало ПОСЛЕ зажима.
 * Зажим — дело самого узла (браузер клампит присвоение `scrollLeft`/`scrollTop`
 * к своему пределу сам), здесь его не считают повторно.
 */
export function applyScroll(el: Element, want: { x: number | null; y: number | null }): PortScroll {
  if (want.x !== null) el.scrollLeft = want.x
  if (want.y !== null) el.scrollTop = want.y
  return scrollOf(el)
}

/** Ждёт `pick(doc, sel)` (первый узел с ненулевой коробкой) опросом по 50 мс; не дождался за `ms` — `null`. */
export function findPort(doc: Document, sel: string, ms = PORT_FIND_MS): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const deadline = Date.now() + ms
    const tick = (): void => {
      const el = pick(doc, sel)
      if (el) { resolve(el); return }
      if (Date.now() > deadline) { resolve(null); return }
      setTimeout(tick, 50)
    }
    tick()
  })
}

/** Все совпадения селектора с ненулевой коробкой — копии `mode=states`. */
export function portCopies(doc: Document, sel: string): HTMLElement[] {
  return [...doc.querySelectorAll<HTMLElement>(sel)].filter((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  })
}

/**
 * Следит за прокруткой и за её пределом: `scroll` (passive) на `el`,
 * `ResizeObserver` на `el` и его прямых детей — предел меняется не только от
 * самого узла, но и от трека внутри него (JIG-9, `EventCalendar` условие А).
 *
 * ПЕЧАТЬ: throttle с ведущим И хвостовым замером. Первое срабатывание после
 * покоя шлёт СРАЗУ (ведущий), дальнейшие в течение `SCROLL_SEND_MS`
 * копятся в один хвостовой замер СВЕЖИМ состоянием на момент отправки — не
 * тем, что было на срабатывании события. Отдельно, при вызове самой функции,
 * — один немедленный замер текущей позиции: тулбару есть что печатать до
 * первого движения.
 *
 * `ResizeObserver` — БЕЗ проверки на `undefined`: это браузер, а тесты
 * подменяют глобал (тот же довод, что у заглушки `scrollIntoView` в других
 * тестах кадра).
 *
 * Возвращает отписку.
 */
export function watchScroll(el: Element, send: (s: PortScroll) => void): () => void {
  let cooldownUntil = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const fire = (): void => {
    timer = null
    cooldownUntil = Date.now() + SCROLL_SEND_MS
    send(scrollOf(el))
  }

  const onScroll = (): void => {
    const now = Date.now()
    if (now >= cooldownUntil) {
      fire()
      return
    }
    if (timer === null) timer = setTimeout(fire, cooldownUntil - now)
  }

  el.addEventListener('scroll', onScroll, { passive: true })
  const ro = new ResizeObserver(onScroll)
  ro.observe(el)
  for (const child of el.children) ro.observe(child)

  // Немедленный замер при подписке — независим от throttle-окна выше: до
  // первого `scroll`/`resize` тулбару нужна текущая позиция, а не тишина.
  send(scrollOf(el))

  return () => {
    el.removeEventListener('scroll', onScroll)
    ro.disconnect()
    if (timer !== null) clearTimeout(timer)
  }
}
