/**
 * Форма виртуального модуля карты видов (DS-67). Тип — тот же `KindRow`,
 * что едет в протоколе: два описания одной формы разъехались бы при первой
 * правке, а расхождение здесь тихое — карта просто начнёт врать про совместимость.
 */
declare module 'virtual:ds-wb/kinds' {
  import type { KindRow } from './protocol.js'
  export const KINDS: KindRow[]
}
