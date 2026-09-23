import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { windowSlice, prependShift, offsetOf, type WindowSlice } from './virtualWindow.js'

/**
 * Оконный рендер длинного списка: измерение строк, следование за низом,
 * компенсация подгрузки сверху.
 *
 * Общий для `LogViewer` и `AgentTranscript`. Блок совпадал построчно, но копия
 * в транскрипте приехала БЕЗ КОММЕНТАРИЕВ — то есть инвариант, который держит
 * поведение, был объяснён в одном экземпляре из двух, и правка пошла бы по
 * тому файлу, где объяснения нет. Это и есть цена дубля, уплаченная заранее
 * (DS-112).
 *
 * Чистая математика окна живёт рядом, в `virtualWindow.ts`, и проверяется
 * отдельно. Здесь только React: состояние, рефы, порядок эффектов.
 */

/** Насколько близко к низу считается «пользователь у низа». */
const TAIL_EPS = 4
/** Насколько близко к верху зовём за старыми записями. */
const HEAD_EPS = 8

export interface VirtualListInput {
  /** Ключи ВИДИМОГО списка, по одному на строку, в порядке отрисовки. */
  keys: string[]
  /**
   * Оценка высоты строки до первого измерения. У лога и у транскрипта она
   * разная (строка лога против реплики), дальше обе самокалибруются.
   */
  fallbackEstimate: number
  /** Упор в верх: попросить у потребителя старые записи. Раз на упор. */
  onReachTop?: () => void
  /**
   * Следовать за низом вообще. `false` — прокрутка живёт своей жизнью, и
   * приход новых строк пользователя с места не сдвигает.
   */
  auto?: boolean
}

export interface VirtualList {
  scrollRef: React.RefObject<HTMLDivElement | null>
  rowRefs: React.RefObject<Map<string, HTMLElement>>
  slice: WindowSlice
  following: boolean
  onScroll: () => void
  /** К последним: прокрутить вниз и снова следовать. */
  toTail: () => void
  /**
   * К элементу списка по индексу — вне окна через сумму высот до него.
   * `inset` — сколько px сверху окна занято тем, что плавает поверх (навигатор
   * совпадений `LogViewer`): строка встаёт НИЖЕ этой полосы, а не под неё. По
   * умолчанию 0 — к верхней кромке, как было. У самого начала списка
   * `scrollTop` ниже нуля не уходит, и строка с `offsetOf < inset` остаётся
   * там, где лежит: прокруткой её из-под плашки не вывести.
   */
  scrollToIndex: (index: number, inset?: number) => void
  /** Высота ЭТОГО элемента изменилась — старое измерение больше не годится. */
  dropHeight: (key: string) => void
  /** Пересобрать окно: высоты изменились не по одному ключу. */
  remeasure: () => void
}

export function useVirtualList({
  keys,
  fallbackEstimate,
  onReachTop,
  auto = true,
}: VirtualListInput): VirtualList {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef(new Map<string, HTMLElement>())
  const heights = useRef(new Map<string, number>())
  const prevKeys = useRef<string[]>([])
  const askedTop = useRef(false)

  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(0)
  const [following, setFollowing] = useState(auto)
  /** Счётчик, которым измерение просит пересчитать окно. */
  const [measured, setMeasured] = useState(0)

  /**
   * Следование и последняя позиция — ЕЩЁ И рефами, для колбэков
   * ResizeObserver и `onScroll`: те живут между рендерами и читали бы
   * замыкание устаревшего кадра (DS-340).
   */
  const followingRef = useRef(following)
  followingRef.current = following
  const autoRef = useRef(auto)
  autoRef.current = auto
  /** Позиция, в которую прокрутку поставили мы или пользователь, — последняя известная. */
  const lastTop = useRef(0)
  const rowObserver = useRef<ResizeObserver | null>(null)
  const observedRows = useRef(new Set<HTMLElement>())

  // Оценка неизмеренной строки — среднее уже измеренных, а не константа.
  // У обрезанной строки высот мало, поэтому среднее почти точно; вдобавок оно
  // самокалибруется под --ds-ui-scale, которого константа не знает.
  const estimate = (() => {
    let sum = 0
    let n = 0
    for (const h of heights.current.values()) { sum += h; n++ }
    return n ? sum / n : fallbackEstimate
  })()

  const slice = windowSlice({
    keys, heights: heights.current, estimate, scrollTop, viewportHeight: viewport,
  })

  /**
   * Сверить следование с геометрией БЕЗ события прокрутки (DS-340).
   * Раньше флаг пересчитывался только в `onScroll`, и всё, что меняет
   * геометрию молча, оставляло его устаревшим:
   *  - S1: панель выросла под отмотавшим вверх — он уже у низа, а «к
   *    последним» висит, и колесо вниз событий не даёт: дальше некуда;
   *  - S2: содержимое стало помещаться — прокручивать нечего, кнопка висит;
   *  - S3: строки выросли без рендера (шрифт догрузился ~240 мс после
   *    измерения, перенос сменился) — следующая лента не у низа.
   * Следует — доматываем к низу; не следует, но у низа — включаем.
   */
  const resync = () => {
    const el = scrollRef.current
    if (!el || !autoRef.current) return
    const max = el.scrollHeight - el.clientHeight
    if (followingRef.current) {
      if (el.scrollTop < max) {
        el.scrollTop = max
        lastTop.current = el.scrollTop
        setScrollTop(el.scrollTop)
      }
    } else if (el.scrollTop >= max - TAIL_EPS) {
      setFollowing(true)
    }
  }
  const resyncRef = useRef(resync)
  resyncRef.current = resync

  // Высоты видимых строк. Возвращает, изменилось ли что-нибудь.
  const measureRows = () => {
    let changed = false
    for (const [key, el] of rowRefs.current) {
      const h = el.getBoundingClientRect().height
      if (h > 0 && heights.current.get(key) !== h) {
        heights.current.set(key, h)
        changed = true
      }
    }
    return changed
  }
  const measureRowsRef = useRef(measureRows)
  measureRowsRef.current = measureRows

  // Измерение после каждого рендера: строк в окне десятки, обход дешёвый.
  // Состояние трогаем только при реальном расхождении — иначе бесконечный цикл.
  //
  // Заодно строки окна ставятся под ResizeObserver (DS-340): строка,
  // выросшая БЕЗ рендера, этим эффектом не видна вовсе — он бежит только
  // после рендера. Наблюдатель заводится здесь, а не в `useEffect`: тот
  // отработал бы после первой раскладки, и строки первого кадра — ровно те,
  // что растут от догрузки шрифта, — остались бы без присмотра.
  useLayoutEffect(() => {
    if (measureRows()) setMeasured((n) => n + 1)

    if (!rowObserver.current && typeof ResizeObserver !== 'undefined') {
      rowObserver.current = new ResizeObserver(() => {
        if (measureRowsRef.current()) setMeasured((n) => n + 1)
        resyncRef.current()
      })
    }
    const ro = rowObserver.current
    if (!ro) return
    const live = new Set(rowRefs.current.values())
    for (const el of observedRows.current) {
      if (!live.has(el)) { ro.unobserve(el); observedRows.current.delete(el) }
    }
    for (const el of live) {
      if (!observedRows.current.has(el)) { ro.observe(el); observedRows.current.add(el) }
    }
  })
  useEffect(() => () => {
    rowObserver.current?.disconnect()
    rowObserver.current = null
    observedRows.current.clear()
  }, [])

  // Порядок здесь и есть вся суть: сначала удержать позицию при подгрузке
  // сверху, потом следование за низом. В обратном порядке следование затёрло бы
  // компенсацию, и подгрузка утаскивала бы пользователя вниз.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const shift = prependShift(prevKeys.current, keys, heights.current, estimate)
    if (shift > 0) {
      el.scrollTop += shift
      lastTop.current = el.scrollTop
      setScrollTop(el.scrollTop)
    }
    // Новый массив — новый повод спросить старые записи, если снова упрёмся в
    // верх. Без сброса второй запрос не ушёл бы никогда.
    if (prevKeys.current[0] !== keys[0] || prevKeys.current.length !== keys.length) {
      askedTop.current = false
    }
    prevKeys.current = keys

    if (following) {
      el.scrollTop = el.scrollHeight - el.clientHeight
      lastTop.current = el.scrollTop
      setScrollTop(el.scrollTop)
    }
    // `keys` пересобирается каждый рендер, поэтому в зависимостях его
    // СОДЕРЖИМОЕ, а не сам массив. Мемоизировать массив здесь не выход:
    // идентичность строки даёт проп-функция потребителя (`getLineId`,
    // `getTurnId`), инлайновая стрелка промахивается мимо `useMemo` каждый
    // рендер, и эффект, двигающий `scrollTop`, отрабатывал бы на каждом
    // рендере. Разделитель NUL безопасен: идентификатор его не содержит, и
    // склейка через него не даёт ложных совпадений. Записан ЭКРАНИРОВАНИЕМ —
    // литеральный байт в исходнике ломает индексацию, гейт `no-nul-bytes`.
  }, [keys.join('\u0000'), following, measured, estimate])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setViewport(el.clientHeight)

    if (typeof ResizeObserver === 'undefined') return
    let lastWidth = el.getBoundingClientRect().width
    const ro = new ResizeObserver(() => {
      setViewport(el.clientHeight)
      const width = el.getBoundingClientRect().width
      // Ширина перевёрстывает текст и меняет ВСЕ высоты разом. Высота панели
      // текст не трогает, и ронять из-за неё кэш значило бы мерить заново на
      // каждое перетаскивание нижней границы.
      if (width !== lastWidth) {
        lastWidth = width
        heights.current.clear()
        setMeasured((n) => n + 1)
      }
      resyncRef.current()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    let top = el.scrollTop
    if (auto) {
      const max = el.scrollHeight - el.clientHeight
      const atBottom = top >= max - TAIL_EPS
      // Событие СВОЕЙ прокрутки следование не выключает (DS-340). Оно
      // приходит асинхронно, и если содержимое успело вырасти (на 1.15: top
      // 842 при max 867), «не у низа» читалось как «пользователь ушёл» —
      // лента теряла следование сама. Своё событие узнаётся по позиции: она
      // та же, что мы поставили; пользователь позицию меняет всегда, а рост
      // содержимого события не даёт вовсе. Допуск 1 px — дробный scrollTop.
      // Отвергнуто «не выше последней» (движение вниз — не пользователь):
      // позиция, которую мы не ставили (0 на монтировании), делала любое
      // первое движение пользователя «ростом».
      const kept = followingRef.current && Math.abs(top - lastTop.current) < 1
      if (kept && !atBottom) {
        el.scrollTop = max
        top = el.scrollTop
      }
      setFollowing(atBottom || kept)
    }
    lastTop.current = top
    setScrollTop(top)
    setViewport(el.clientHeight)

    if (top <= HEAD_EPS && onReachTop && !askedTop.current) {
      askedTop.current = true
      onReachTop()
    }
  }, [onReachTop, auto])

  const toTail = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight - el.clientHeight
    lastTop.current = el.scrollTop
    setScrollTop(el.scrollTop)
    setFollowing(true)
  }, [])

  /** Прокрутка к строке видимым подсписком (вне окна — через сумму высот до неё). */
  const scrollToIndex = (index: number, inset = 0) => {
    const el = scrollRef.current
    if (!el || index < 0 || index >= keys.length) return
    const top = Math.max(0, offsetOf(keys, heights.current, estimate, index) - inset)
    el.scrollTop = top
    lastTop.current = top
    setScrollTop(top)
    setFollowing(false)
  }

  const dropHeight = useCallback((key: string) => {
    heights.current.delete(key)
  }, [])

  const remeasure = useCallback(() => {
    setMeasured((n) => n + 1)
  }, [])

  return {
    scrollRef, rowRefs, slice, following,
    onScroll, toTail, scrollToIndex, dropHeight, remeasure,
  }
}
