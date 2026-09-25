/**
 * `window.jig` — типы, список делегируемого, глобал (JIG-40).
 *
 * ЗАЧЕМ ВООБЩЕ. Браузерный агент (Claude in Chrome) читает верстак только
 * через DOM и `javascript_tool`, у него нет ни файлов, ни чекаута. До этой
 * задачи числа про клип, полосу прокрутки и адрес он либо пересказывал по
 * промту (расходится молча, когда код уходит вперёд промта — тот же класс
 * ошибки, что решала `/api/gate/predicate/*`, DS-222), либо не мог снять
 * вовсе (аудит адреса, живость вкладки). `window.jig` — общий модуль на
 * обоих потребителей: тот же ответ, что и гейту, не пересказ его словами.
 *
 * ДЕЛЕГИРОВАНИЕ, А НЕ PROXY. Оболочка ставит СВОЙ `jig` (`frame()`,
 * `scratch`, `clearScratch()`) и делегирует методы измерения главному кадру
 * явным списком `FRAME_API`, а не `Proxy`: список — обычный код, у него
 * тест дрейфа («каждое имя `FRAME_API` делегировано»), и он не подставляет
 * молчаливо метод, которого в `FrameJig` нет.
 */
import type { FrameFacts } from './frame-facts.js'
import type { AddressAudit } from './frame-url.js'
import type { CaseAudit } from './resolve-case.js'

export const SCRATCH_ID = 'jig-scratch'

/** Методы кадра, которые оболочка делегирует главному кадру. JIG-42 допишет `node`/`nodes`. */
export const FRAME_API = ['ready', 'env', 'box', 'visible', 'norm'] as const

export type Target = string | Element

export interface Env extends FrameFacts {
  innerWidth: number
  innerHeight: number
  dpr: number
  /** `docBarOf` — «полоса −N» тулбара. */
  docBar: number
  /** `roomOf(.wbf-host).cw` — «контейнер N» тулбара; `null` без хоста. */
  container: number | null
  /** `MIN_WIDTH` (= `WIDTH_FLOOR`, тождество держит `frame-width.test.ts`). */
  floor: number
  belowFloor: boolean
  params: { address: AddressAudit; fixture: CaseAudit | null }
}

export interface Ready extends Env {
  live: boolean
  fonts: FontFaceSetLoadStatus
  ms: number
}

export interface Box {
  /** `getBoundingClientRect`. */
  width: number
  height: number
  clientWidth: number
  clientHeight: number
  /** `offsetWidth − clientWidth − рамки L/R`; у корня — `docBar`. */
  bar: number
  /** `offsetHeight − clientHeight − рамки T/B`. */
  barX: number
  scrollLeft: number
  /** `scrollWidth − clientWidth`. */
  scrollMax: number
  scrollTop: number
  /** `scrollHeight − clientHeight`. */
  scrollTopMax: number
  /** `max > 0 && pos >= max − 1` — допуск 1 px (`scrollLeft` дробный при dpr ≠ 1). */
  endX: boolean
  endY: boolean
  /** Сколько узлов совпало с селектором всего (1 — для узла). */
  matched: number
}

export interface Visible {
  state: 'full' | 'partial' | 'none'
  /** Видимая часть, px; 0 при `none`. */
  width: number
  height: number
  /** Коробка минус видимое по этой оси. */
  hiddenX: number
  hiddenY: number
  box: { l: number; t: number; r: number; b: number }
  seen: { l: number; t: number; r: number; b: number } | null
  /** Читаемые пути срезавших предков/липких соседей по порядку; `'вьюпорт кадра'` — отдельно. */
  cutBy: string[]
  matched: number
}

export interface FrameJig {
  /** Список методов и форм ответа — агент без файлов, прочитать некому кроме него самого. */
  help: string
  ready(opts?: { timeoutMs?: number }): Promise<Ready>
  env(): Env
  box(t: Target): Box
  visible(t: Target): Visible
  norm(css: string): string
}

export interface ShellJig extends FrameJig {
  /** `iframe.wb__frame` по индексу (умолчание 0) или переданный элемент. */
  frame(which?: number | HTMLIFrameElement): FrameJig
  readonly scratch: HTMLElement
  clearScratch(): number
}

declare global {
  interface Window {
    jig?: FrameJig | ShellJig
  }
}
