import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { BadgeTone } from '../Badge/index.js'
import { Caret } from '../../internal/caret.js'
import { escapeRe, highlight } from '../../internal/highlight.js'
import { useVirtualList } from '../../internal/useVirtualList.js'
import { useDsText, useDsLocale } from '../../dictionary/DsText.js'
import { dateFormat, safeFormatDate } from '../../internal/intl.js'
import './LogViewer.css'

/** Тот же словарь тонов, что у Badge и Timeline — третьего перечисления не заводим. */
export type LogTone = BadgeTone

export interface LogLine {
  /** ISO 8601. */
  ts: string
  /** Словарь потребителя. */
  kind: string
  text: string
  /** Метка источника/стрима. */
  stream?: string
}

export interface LogViewerProps<T extends LogLine> {
  lines: T[]
  /**
   * Идентичность строки. Обязателен намеренно: у опционального пропа был бы
   * дефолт, а единственный доступный компоненту — индекс в массиве. Индекс
   * ломается ровно там, где проп и нужен: при подгрузке старых записей вверх
   * строки «сдвигаются», ключи разъезжаются, окно теряет опору. Дефолт молча
   * включал бы тот самый дефект, от которого проп защищает.
   */
  getLineId: (line: T) => string
  /** kind → подпись. Локализованная карта потребителя. */
  labels?: Record<string, string>
  /** kind → тон; неизвестный kind даёт 'neutral'. */
  tones?: Record<string, LogTone>
  /**
   * Какие `kind` скрыть. **Видимость, а не фильтрация данных**: массив `lines`
   * остаётся нетронутым — компонент не отрисовывает строки скрытых видов, но
   * данные потребителя не теряются (не как с `query`, где «не фильтрует» —
   * потому что сервер уже отфильтровал и счёт важен). Здесь вид прячет сам
   * пользователь, и обманывать его нечем. Окно и прокрутка пересобираются по
   * видимому подсписку; смена `hiddenKinds` трактуется как новый список.
   * Пусто/отсутствует — видны все виды.
   */
  hiddenKinds?: ReadonlySet<string>
  /**
   * Подсветка вхождений. **Не фильтрует**: что показывать, решил серверный
   * запрос потребителя, и прятать от него что-то ещё компонент не вправе —
   * иначе три найденных совпадения означали бы «их три», когда в
   * непрогруженном хвосте их сорок.
   */
  query?: string
  /** Строк текста до обрезки; 0 — без обрезки. */
  clampLines?: number
  /**
   * Высота панели. Число — размер интерфейса, растёт вместе с `--ds-ui-scale`;
   * строка передаётся как есть и служит отдушиной для `100%`, `60vh` и прочего.
   *
   * Проп существует потому, что виртуализация без ограниченной высоты
   * вырождается молча: панель растёт под содержимое, окно всегда равно всему
   * списку, и тысяча строк оказывается в DOM без единой ошибки.
   */
  height?: number | string
  /** Прокрутка дошла до верха — потребителю пора догрузить старые записи. */
  onReachTop?: () => void
  formatTime?: (ts: string) => string
  /**
   * Что показать, когда показывать нечего (DS-190).
   *
   * Симметрично `AgentTranscript.emptyState`, и симметрия здесь не ради
   * стройности типов. Пустая панель заданной высоты — это первое, что видит
   * потребитель, и три разных состояния выглядят в ней одинаково: прогон ещё не
   * начался, прогон не дал вывода, соединение оборвалось. Различить их может
   * только тот, кто их и знает, то есть вызывающий; система обязана дать ему
   * место, а не решать за него формулировку.
   *
   * Отдать объяснение ШАПКЕ потребителя было вторым возможным решением и
   * отвергнуто: шапка не наша, гарантировать её наличие мы не можем, а компонент
   * с ограниченной высотой уже занял место на экране — объяснять пустоту обязан
   * тот, кто это место занял.
   *
   * Считается по `shown`, а не по `lines`: лог, целиком спрятанный `hiddenKinds`,
   * пуст ровно так же, и разница «строк нет» против «строки есть, но все
   * отфильтрованы» — тоже разница, которую называет потребитель. Тот же выбор
   * сделан у транскрипта, где `show.raw: false` опустошает окно при непустых
   * `turns`.
   */
  emptyState?: React.ReactNode
  className?: string
  id?: string
}

/** Лог читают по секундам: две строки в одну минуту иначе неразличимы. */
const TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}


/** До первого измерения оценка неизвестна; дальше компонент считает её сам. */
const FALLBACK_ESTIMATE = 20

export function LogViewer<T extends LogLine>({
  lines, getLineId, labels, tones, query, hiddenKinds, clampLines = 3,
  height = 320, onReachTop, formatTime, emptyState, className, id,
}: LogViewerProps<T>) {
  const text = useDsText()
  const locale = useDsLocale()
  const time = formatTime ?? ((ts: string) => safeFormatDate(ts, dateFormat(locale, TIME_OPTS)))
  const clamped = clampLines > 0

  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  /**
   * Ключи строк, которые ДЕЙСТВИТЕЛЬНО не влезли в потолок (DS-194).
   *
   * Раньше кнопку раскрытия рисовал один панельный флаг `clamped`, то есть
   * одно значение пропа на весь список: при дефолтном `clampLines={3}` кнопка
   * «Развернуть строку» стояла на КАЖДОЙ строке, включая те, что укладываются
   * целиком. Замерено на приёмке волны 6: ширина 900 — 10 строк в окне, из них
   * переполненных 0, кнопок 10; 768 — 10 и 1; 360 — 8 и 8. Нажатие такой кнопки
   * не меняло ничего (высота строки 27.99 → 27.99, соседняя сдвинулась на
   * 0.00 px), но `aria-expanded` честно переключался — диктор подтверждал
   * действие, которого не было, и каждая ложная кнопка стоила таб-стопа.
   */
  const [overflowing, setOverflowing] = useState<ReadonlySet<string>>(() => new Set())
  /** Текущее совпадение (индекс в `matchIdxs`); -1 — нет/не выбрано. */
  const [matchIdx, setMatchIdx] = useState(-1)

  // Видимый подсписок и совпадения запроса считаются вместе и мемоизируются:
  // оба зависят только от lines/hiddenKinds/query. Совпадения — по ВИДИМОМУ
  // подсписку (скрытого вида в навигации нет); единица — строка (≥1 хита уже
  // считается, до одного хита прыгать нет смысла). Регэксп без флага `g`:
  // `test` с `g` Advances `lastIndex` и через цикл пропускает совпадения.
  const { shown, matchIdxs } = useMemo(() => {
    const s = hiddenKinds && hiddenKinds.size
      ? lines.filter((l) => !hiddenKinds.has(l.kind))
      : lines
    const m: number[] = []
    if (query) {
      const re = new RegExp(escapeRe(query), 'i')
      for (let i = 0; i < s.length; i++) if (re.test(s[i].text)) m.push(i)
    }
    return { shown: s, matchIdxs: m }
  }, [lines, hiddenKinds, query])
  // Ключи — тем же приёмом, что и подсписок: рендеры здесь частые НЕ от данных
  // (прокрутка, измерение, ResizeObserver), а проход идёт по всему логу.
  // `getLineId` в зависимостях честно: инлайновая стрелка у потребителя
  // промахивается мимо мемо каждый рендер, и тогда ключи пересобираются, как
  // раньше. Прятать функцию в ref нельзя — идентичность строки считалась бы по
  // устаревшей функции, а проп ровно про идентичность (DS-121).
  const shownKeys = useMemo(() => shown.map(getLineId), [shown, getLineId])

  const { scrollRef, rowRefs, slice, following, onScroll, toTail, scrollToIndex, dropHeight } =
    useVirtualList({ keys: shownKeys, fallbackEstimate: FALLBACK_ESTIMATE, onReachTop })

  const N = matchIdxs.length

  const navRef = useRef<HTMLDivElement>(null)

  /**
   * Сколько px сверху окна прокрутки занимает плашка навигатора ВМЕСТЕ с
   * воздухом под ней (DS-325). Прыжок к совпадению ставил строку на
   * верхнюю кромку — ровно под плашку в правом верхнем углу, и после того как
   * кнопки встали на пол цели (плашка 26px на любой шкале), текущее совпадение
   * пряталось под ней на 9 шагах из 15 (замер 360×1). Теперь строка встаёт
   * сразу под плашкой: воздух снизу равен воздуху сверху (`top` плашки), чтобы
   * не заводить ещё один литерал. Не по центру окна — прыжок был и остаётся
   * «к верху», положение совпадения у кромки и есть единственный признак
   * «какое из подсвеченных текущее»: отдельной подсветки текущего нет.
   * Геометрия, а не токен: высота плашки складывается из пола кнопок и
   * кегля счётчика и на 1.5 уже выше пола.
   */
  const navInset = () => {
    const nav = navRef.current
    const el = scrollRef.current
    if (!nav || !el) return 0
    const box = el.getBoundingClientRect()
    const r = nav.getBoundingClientRect()
    return Math.max(0, r.bottom - box.top + (r.top - box.top))
  }

  const goMatch = (target: number) => {
    const lineIndex = matchIdxs[target]
    if (lineIndex === undefined) return
    setMatchIdx(target)
    scrollToIndex(lineIndex, navInset())
  }

  // Смена запроса сбрасывает позицию: к совпадениям ЭТОГО запроса ещё не
  // прыгали. Отдельный эффект, потому что это единственное место, которому
  // нужен момент смены `query`, а не его текущее значение.
  useEffect(() => {
    setMatchIdx(-1)
  }, [query])

  // К первому совпадению — как в поисковой строке браузера: иначе «0/N» висело
  // бы, пока не кликнут ›. Прыжок ОДИН НА ЗАПРОС, и это не то же самое, что
  // «на смену query»: строки приходят асинхронно, и в момент смены запроса
  // совпадений может не быть ни одного — тогда прыгать надо, когда они
  // приедут. Признаком «ещё не прыгали» служит сам `matchIdx < 0`, поэтому
  // догрузка строк после того, как пользователь ушёл на третье совпадение, его
  // не уносит: `matchIdx` там уже неотрицателен.
  //
  // Зависимости полные, включая нестабильный `goMatch`, — то есть эффект
  // отрабатывает каждый рендер и выходит на первом же условии. Это дешевле
  // неполного списка, который держался на комментарии и молча ломался бы при
  // рефакторинге: краснеть ему было нечем, линтера в проекте нет.
  useEffect(() => {
    if (!query || matchIdx >= 0 || matchIdxs.length === 0) return
    goMatch(0)
  }, [query, matchIdx, matchIdxs, goMatch])

  // Совпадений стало меньше текущего индекса (догрузили/сменили фильтр) — подтянуть без прокрутки.
  // При нуле совпадений — именно -1 («не выбрано»), а не 0: ноль означал бы, что
  // к первому совпадению уже прыгнули, и эффект выше не прыгнул бы, когда строки
  // приедут. Счётчик при N === 0 печатает «0/0» и на `matchIdx` не смотрит.
  useEffect(() => {
    if (matchIdx > N - 1) setMatchIdx(N > 0 ? N - 1 : -1)
  }, [N, matchIdx])

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      // Высота этой строки изменилась — старое измерение больше не годится.
      dropHeight(key)
      return next
    })

  /**
   * Замер переполнения — ПОСТРОЧНЫЙ, после каждого рендера, по тем же
   * `rowRefs`, которые виртуализатор уже ведёт ради высот: нового прохода по
   * логу не появляется, в окне лежат только видимые строки.
   *
   * Без списка зависимостей намеренно, тем же приёмом, что замер высот в
   * `useVirtualList`: пересчитать надо всегда, когда что-то перерисовалось, —
   * и ШИРИНА сюда входит бесплатно. Смена ширины перевёрстывает текст, её ловит
   * `ResizeObserver` виртуализатора и роняет кэш высот, а это рендер, за
   * которым идёт этот замер. Состояние трогается только при расхождении, иначе
   * был бы бесконечный цикл.
   *
   * `useLayoutEffect`, а не `useEffect`: замер до отрисовки кадра. Мигание
   * «кадр без кнопки, потом с кнопкой» этим не лечится полностью — строка,
   * въехавшая в окно, меряется уже после того, как встала, — и это принятая
   * цена, а не недосмотр.
   *
   * РАСКРЫТУЮ СТРОКУ ЗАМЕР ОБЪЯВЛЯЕТ НЕВЛЕЗАЮЩЕЙ, и это не дефект: потолка на
   * ней нет, `scrollHeight` равен `clientHeight`. Кнопку у раскрытой держит
   * `isOpen` в разметке, и ТОЛЬКО он — иначе её было бы нечем свернуть.
   * Отдельной ветки «не мерить раскрытую» здесь стояла, и она снята как
   * мёртвая: мутация её убирала, а все 53 случая оставались зелёными, потому
   * что на видимый результат она не влияет вовсе. Свернули — следующий же
   * замер идёт по обрезанному тексту и возвращает строку в множество, до
   * отрисовки кадра.
   *
   * Допуск в 1px, а не строгое `>`: `scrollHeight` и `clientHeight` округляются
   * до целого каждый по-своему, и на дробной высоте строки невлезающей
   * оказалась бы любая.
   */
  useLayoutEffect(() => {
    if (!clamped) {
      if (overflowing.size) setOverflowing(new Set())
      return
    }
    const next = new Set(overflowing)
    let changed = false
    for (const [key, el] of rowRefs.current) {
      const textEl = el.querySelector('.ds-log__text')
      if (!textEl) continue
      const over = textEl.scrollHeight - textEl.clientHeight > 1
      if (over !== next.has(key)) {
        if (over) next.add(key)
        else next.delete(key)
        changed = true
      }
    }
    if (changed) setOverflowing(next)
  })

  const windowed = shown.slice(slice.start, slice.end)
  const empty = shown.length === 0

  return (
    <div
      id={id}
      className={['ds-log', empty && 'ds-log--empty', className].filter(Boolean).join(' ')}
      style={{
        height: typeof height === 'number'
          ? `calc(${height}px * var(--ds-ui-scale, 1))`
          : height,
      }}
    >
      {/* Заглушка стоит ВНУТРИ панели, а не вместо неё (DS-190).
          Ранний выход из компонента был первой редакцией и уносил вместе со
          строками навигатор по совпадениям: при `query` и пустых `lines` он
          показывает «0/0», то есть отвечает на вопрос «нашлось ли что-нибудь»
          — а это ровно тот случай, когда строк ещё нет (ответ сервера в пути).
          Навигатор принадлежит ПАНЕЛИ, а не строкам, и вместе со строками
          исчезать не должен. `AgentTranscript` может позволить себе ранний
          выход потому, что у него никакой обвязки вокруг окна нет. */}
      {/* ПРОКРУЧИВАЕМАЯ ОБЛАСТЬ ФОКУСИРУЕМА (DS-192, SC 2.1.1).
          В состояниях без кнопок внутри (`clampLines` не задан) у неё не было
          ни одного фокусируемого потомка, и фокус в контейнер не заходил вовсе
          — ни Tab, ни стрелками. То есть клавиатурой до содержимого было не
          дойти: на ширине 360 у соседней теплокарты так пряталось 473 px
          данных. Замерено правилом axe `scrollable-region-focusable`.
          `tabIndex` БЕЗУСЛОВНЫЙ, а не «когда фокусируемых потомков нет». Список
          виртуализирован: в окне лежат только видимые строки, и число кнопок
          внутри меняется от прокрутки — условный tabIndex то появлялся бы, то
          исчезал по мере скролла. Таб-стоп, мигающий от положения прокрутки,
          хуже лишнего таб-стопа. Цена решения — ровно одна остановка на панель.
          Имя обязательно: без него скринридер объявит «группа» и ничего больше.
          РОЛИ не добавлено намеренно — `role="log"`/`region` меняли бы то, КАК
          область объявляется и живёт, а вопрос был про достижимость. */}
      <div
        className="ds-log__scroll"
        ref={scrollRef}
        onScroll={onScroll}
        tabIndex={0}
        aria-label={text['logViewer.region']}
      >
        {empty && <div className="ds-log__empty">{emptyState}</div>}
        <div className="ds-log__pad" style={{ height: slice.padTop }} aria-hidden="true" />
        {windowed.map((l, i) => {
          const key = shownKeys[slice.start + i]!
          const tone: LogTone = tones?.[l.kind] ?? 'neutral'
          const isOpen = open.has(key)
          return (
            <div
              key={key}
              className="ds-log__line"
              ref={(el) => {
                if (el) rowRefs.current.set(key, el)
                else rowRefs.current.delete(key)
              }}
            >
              {/* Кнопка — обещание действия, поэтому она стоит только там, где
                  действие есть (DS-194). На месте отсутствующей —
                  ТА ЖЕ распорка, что при `clampLines={0}`: без неё колонки
                  разъезжаются между строками. Раскрытая строка кнопку держит
                  всегда — иначе её нечем свернуть. */}
              {clamped && (isOpen || overflowing.has(key)) ? (
                <button
                  type="button"
                  className="ds-log__toggle"
                  aria-expanded={isOpen}
                  aria-label={text[isOpen ? 'logViewer.collapseRow' : 'logViewer.expandRow']}
                  onClick={() => toggle(key)}
                >
                  <Caret kind="branch" open={isOpen} />
                </button>
              ) : (
                <span className="ds-log__toggle ds-log__toggle--empty" aria-hidden="true" />
              )}
              <time className="ds-log__time" dateTime={l.ts}>{time(l.ts)}</time>
              <span className={`ds-log__kind ds-log__kind--${tone}`}>{labels?.[l.kind] ?? l.kind}</span>
              {l.stream != null && <span className="ds-log__stream">{l.stream}</span>}
              <span
                className={[
                  'ds-log__text',
                  !clamped && 'ds-log__text--free',
                  isOpen && 'ds-log__text--open',
                ].filter(Boolean).join(' ')}
                style={clamped && !isOpen ? ({ '--ds-log-clamp': clampLines } as React.CSSProperties) : undefined}
              >
                {highlight(l.text, query, 'ds-log__hit')}
              </span>
            </div>
          )
        })}
        <div className="ds-log__pad" style={{ height: slice.padBottom }} aria-hidden="true" />
      </div>
      {!following && (
        <button type="button" className="ds-log__tail" onClick={toTail}>
          {text['logViewer.toLatest']}
        </button>
      )}
      {query && (
        <div className="ds-log__nav" ref={navRef} role="group" aria-label={text['logViewer.matchNav']}>
          <button
            type="button"
            className="ds-log__nav-btn"
            onClick={() => { if (N > 0) goMatch((matchIdx - 1 + N) % N) }}
            disabled={N === 0}
            aria-label={text['logViewer.prevMatch']}
          >‹</button>
          <span className="ds-log__nav-count" aria-live="polite" title={text['logViewer.matchCountHint']}>
            {N > 0 ? `${matchIdx + 1}/${N}` : '0/0'}
          </span>
          <button
            type="button"
            className="ds-log__nav-btn"
            onClick={() => { if (N > 0) goMatch((matchIdx + 1) % N) }}
            disabled={N === 0}
            aria-label={text['logViewer.nextMatch']}
          >›</button>
        </div>
      )}
    </div>
  )
}
