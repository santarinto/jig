import { useCallback, useMemo, useState } from 'react'
import type { BadgeTone } from '../Badge/Badge.js'
import { Caret } from '../../internal/caret.js'
import { Badge } from '../Badge/Badge.js'
import { Avatar } from '../Avatar/Avatar.js'
import { CodeBlock } from '../CodeBlock/CodeBlock.js'
import { MetricStrip } from '../MetricStrip/MetricStrip.js'
import type { Metric } from '../MetricStrip/MetricStrip.js'
import { highlight } from '../../internal/highlight.js'
import { useVirtualList } from '../../internal/useVirtualList.js'
import { useDsText, useDsLocale } from '../../dictionary/DsText.js'
import { dateFormat, safeFormatDate } from '../../internal/intl.js'
import type { DsTextDict } from '../../dictionary/text.js'
import './AgentTranscript.css'

export type TranscriptRole = 'assistant' | 'user' | 'system' | 'tool'

export interface ToolCall {
  /** tool_use_id — по нему коррелируется результат, который может приехать позже. */
  id: string
  /** 'Read', 'Bash', 'Edit', … */
  name: string
  /** Короткая суть: путь к файлу, паттерн, команда. */
  summary?: string
  /** Готовый к показу текст параметров (обычно pretty-JSON). Рендерится в CodeBlock. */
  input: string
  /** Коррелированный результат; отсутствует, пока не пришёл. */
  result?: { text: string; isError?: boolean; pending?: boolean }
}

export interface MessageTurn {
  kind: 'message'
  id: string
  /** ISO 8601. */
  ts: string
  role: TranscriptRole
  /** Модель/имя автора; kind:'agent' → агентский тон, 'human' — человек. */
  author?: { name: string; kind?: 'human' | 'agent' }
  /** Основной текст (markdown-строка — см. решение 1). */
  text?: string
  /** Блок размышлений; показан, но свёрнут по умолчанию. */
  thinking?: string
  toolCalls?: ToolCall[]
  /** Реплика ещё дописывается (live-хвост). */
  streaming?: boolean
}

export interface EventTurn {
  kind: 'event'
  id: string
  ts: string
  variant: 'result' | 'system'
  title?: string
  tone?: BadgeTone
  /** Метрики карточки результата. Реиспользует Metric из MetricStrip (решение 9). */
  metrics?: Metric[]
  /** Сводка результата. */
  text?: string
}

export interface RawTurn {
  kind: 'raw'
  id: string
  ts: string
  /** Моноширинные строки терминала. */
  text: string
}

export type TranscriptTurn = MessageTurn | EventTurn | RawTurn

export interface AgentTranscriptShow {
  thinking: boolean
  toolCalls: boolean
  raw: boolean
}

export interface AgentTranscriptProps<T extends TranscriptTurn = TranscriptTurn> {
  turns: T[]
  /**
   * Идентичность реплики. Обязателен намеренно (прецедент `LogViewer.getLineId`):
   * у опционального пропа был бы дефолт — индекс, а индекс ломается ровно там, где
   * проп и нужен, — при подгрузке старых реплик вверх всё «сдвигается», окно теряет
   * опору. У потребителя ключ реальный: `run_id:seq`.
   */
  getTurnId: (turn: T) => string
  /** Окно/виртуализация. Без ограниченной высоты окно вырождается во весь список. */
  height?: number | string
  /** Локализованные словари потребителя (как Timeline/LogViewer). */
  roleLabels?: Partial<Record<TranscriptRole, string>>
  roleTones?: Partial<Record<TranscriptRole, BadgeTone>>
  toolLabel?: string
  /**
   * Видимость блоков — **скрывает, не удаляет** (философия `LogViewer.query`).
   * Дефолт `{ thinking: true, toolCalls: true, raw: false }`: сырьё скрыто, пока не
   * попросят. Глобальное «свернуть всё размышления/параметры» = соответствующий
   * рычаг в `false` (тулбар потребителя).
   *
   * `onShowChange` зарезервирован: v1 не имеет внутри-компонентных рычагов `show`
   * (они у потребителя), поэтому компонент их не дёргает; хук останется для Future,
   * когда появится встроенный тулбар.
   */
  show?: AgentTranscriptShow
  onShowChange?: (next: AgentTranscriptShow) => void
  /** Подсветка вхождений. **Не фильтрует** и ничего не прячет. */
  query?: string
  /**
   * Markdown для `text`/`thinking`. В DS нет md-парсера (`Prose` ест уже HTML/children),
   * тащить зависимость неуместно. Дефолт — plain text (`pre-wrap`); хук позволяет
   * потребителю подключить свой рендер. Решение 1.
   */
  renderMarkdown?: (md: string) => React.ReactNode
  /** Прилипание к низу для идущего прогона; снимается ручным скроллом вверх. Дефолт true. */
  autoscroll?: boolean
  /** Прокрутка до верха — потребителю пора догрузить старые реплики. */
  onReachTop?: () => void
  /**
   * Клик по реплике (прыжок к строке в сыром логе). Вешается на заголовок, не на
   * всю карточку — иначе nested-interactive с кнопками внутри (решение 5).
   */
  onTurnClick?: (turn: T) => void
  formatTime?: (ts: string) => string
  formatDay?: (ts: string) => string
  /** Разделитель `formatDay` на первой реплике нового дня (инлайн, решение 7). Дефолт false. */
  groupByDay?: boolean
  dense?: boolean
  emptyState?: React.ReactNode
  className?: string
  id?: string
}

const DEFAULT_SHOW: AgentTranscriptShow = { thinking: true, toolCalls: true, raw: false }
/** Оценка до первого измерения; дальше компонент считает среднее измеренных. */
const FALLBACK_ESTIMATE = 48


const TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}
const DAY_OPTS: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long', year: 'numeric' }


interface CollapsibleProps {
  open: boolean
  onToggle: () => void
  label: string
  summary?: React.ReactNode
  children: React.ReactNode
}

/** Свёртываемый блок (размышления / параметры инструмента). Кнопка отделена от тела —
 *  не вкладывается в другие интерактивы. */
function Collapsible({ open, onToggle, label, summary, children }: CollapsibleProps) {
  return (
    <div className="ds-transcript__block">
      <button
        type="button"
        className="ds-transcript__block-toggle"
        aria-expanded={open}
        onClick={onToggle}
      >
        <Caret kind="branch" open={open} />
        <span className="ds-transcript__block-label">{label}</span>
        {summary != null && <span className="ds-transcript__block-summary">{summary}</span>}
      </button>
      {open && <div className="ds-transcript__block-body">{children}</div>}
    </div>
  )
}

/** MetricStrip.columns требует 2..6; один/ноль — без columns (одна строка). */
function metricColumns(n: number): 2 | 3 | 4 | 5 | 6 | undefined {
  if (n < 2) return undefined
  return (Math.min(6, n) as 2 | 3 | 4 | 5 | 6)
}

export function AgentTranscript<T extends TranscriptTurn = TranscriptTurn>({
  turns, getTurnId, height = 320, roleLabels, roleTones, toolLabel,
  show: showProp, query, renderMarkdown, autoscroll = true, onReachTop, onTurnClick,
  formatTime, formatDay, groupByDay = false, dense = false, emptyState, className, id,
}: AgentTranscriptProps<T>) {
  const text = useDsText()
  const locale = useDsLocale()
  const time = formatTime ?? ((ts: string) => safeFormatDate(ts, dateFormat(locale, TIME_OPTS)))
  const day = formatDay ?? ((ts: string) => safeFormatDate(ts, dateFormat(locale, DAY_OPTS)))
  const show = showProp ?? DEFAULT_SHOW
  const auto = autoscroll !== false

  // Сырьё скрыто — не участвует в окне (иначе даст строки нулевой высоты и сломает
  // инвариант раскладки). Данные из props.turns не удаляются — просто не рисуются.
  //
  // Мемоизация здесь не про экономию на данных, а про то, что рендеры тут
  // частые НЕ от данных: `setScrollTop` из обработчика прокрутки, `setMeasured`
  // из измеряющего эффекта, `setViewport` из `ResizeObserver`. Без неё каждый
  // кадр прокрутки проходил по ВСЕМУ транскрипту — замер до правки: 3992 чтения
  // `kind` на кадр при 2000 ходах, то есть два полных прохода. Ради этого
  // виртуализация и стоит: окно рисует десятки строк, а полный проход сводит
  // выигрыш на нет (DS-121).
  const viewTurns = useMemo(
    () => (show.raw ? turns : turns.filter((t) => (t as TranscriptTurn).kind !== 'raw')),
    [turns, show.raw],
  )
  // `getTurnId` в зависимостях честно: инлайновая стрелка у потребителя даёт
  // новую функцию каждый рендер, и тогда мемо промахивается — `keys`
  // пересобираются, как и раньше. Держать функцию в ref, чтобы «починить» это,
  // нельзя: идентичность реплики стала бы считаться по УСТАРЕВШЕЙ функции, а
  // проп ровно про идентичность. Кто хочет экономии и на этом проходе — держит
  // `getTurnId` стабильным (`useCallback` или функция вне компонента); фильтр
  // по всему транскрипту мемоизирован в любом случае, и он дороже.
  const keys = useMemo(() => viewTurns.map(getTurnId), [viewTurns, getTurnId])

  const [openBlocks, setOpenBlocks] = useState<ReadonlySet<string>>(() => new Set())

  const { scrollRef, rowRefs, slice, following, onScroll, toTail, dropHeight, remeasure } =
    useVirtualList({ keys, fallbackEstimate: FALLBACK_ESTIMATE, onReachTop, auto })

  const toggleBlock = useCallback((turnId: string, suffix: string) => {
    const k = `${turnId}/${suffix}`
    setOpenBlocks((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
    // Высота реплики изменилась — старое измерение больше не годится.
    dropHeight(turnId)
    remeasure()
  }, [dropHeight, remeasure])

  const renderText = useCallback(
    (md?: string): React.ReactNode => {
      if (md == null) return null
      return renderMarkdown
        ? renderMarkdown(md)
        : <span className="ds-transcript__plain">{highlight(md, query, 'ds-transcript__hit')}</span>
    },
    [renderMarkdown, query],
  )

  if (viewTurns.length === 0) {
    return (
      <div
        id={id}
        className={['ds-transcript', 'ds-transcript--empty', dense && 'ds-transcript--dense', className]
          .filter(Boolean).join(' ')}
        style={{
          height: typeof height === 'number' ? `calc(${height}px * var(--ds-ui-scale, 1))` : height,
        }}
      >
        <div className="ds-transcript__empty">{emptyState}</div>
      </div>
    )
  }

  const visible = viewTurns.slice(slice.start, slice.end)
  const roleLabel = (r: TranscriptRole) => roleLabels?.[r] ?? r
  const roleTone = (r: TranscriptRole): BadgeTone => roleTones?.[r] ?? defaultRoleTone(r)

  return (
    <div
      id={id}
      className={['ds-transcript', dense && 'ds-transcript--dense', className].filter(Boolean).join(' ')}
      style={{
        height: typeof height === 'number' ? `calc(${height}px * var(--ds-ui-scale, 1))` : height,
      }}
    >
      {/* ПРОКРУЧИВАЕМАЯ ОБЛАСТЬ ФОКУСИРУЕМА (DS-192, SC 2.1.1).
          Здесь это было хуже всего в системе: на скроллере висит `role="log"`
          с `aria-live="polite"`, то есть пользователь скринридера получал
          объявления о новых репликах и не мог вернуться к прочитанному. Живая
          область, в которую нельзя войти, — не «неудобно», а односторонний
          канал. `tabIndex` безусловный по той же причине, что у `LogViewer`:
          список виртуализирован, и число фокусируемых потомков меняется от
          прокрутки. Имя своё, а не от `role="log"`: роль говорит ЧТО это,
          имя — какой именно из логов на экране. */}
      <div
        className="ds-transcript__scroll"
        ref={scrollRef}
        onScroll={onScroll}
        tabIndex={0}
        role="log"
        aria-label={text['agentTranscript.region']}
        aria-live="polite"
        aria-relevant="additions"
      >
        <div className="ds-transcript__pad" style={{ height: slice.padTop }} aria-hidden="true" />
        {visible.map((turn, i) => {
          const ai = slice.start + i
          const t = turn as TranscriptTurn
          const key = keys[ai]!
          const showDay = !!groupByDay && (ai === 0 || day(t.ts) !== day((viewTurns[ai - 1] as TranscriptTurn).ts))
          return (
            <div
              key={key}
              className="ds-transcript__turn"
              ref={(el) => {
                if (el) rowRefs.current.set(key, el)
                else rowRefs.current.delete(key)
              }}
            >
              {showDay && <div className="ds-transcript__day" role="heading" aria-level={3}>{day(t.ts)}</div>}
              {renderTurn(t, {
                time: time(t.ts), roleLabel: roleLabel, roleTone: roleTone,
                show, openBlocks, toggleBlock: (suffix) => toggleBlock(key, suffix),
                toolLabel: toolLabel ?? text['agentTranscript.tool'], renderText, query, text,
                onTurnClick: onTurnClick ? () => onTurnClick(turn) : undefined,
              })}
            </div>
          )
        })}
        <div className="ds-transcript__pad" style={{ height: slice.padBottom }} aria-hidden="true" />
      </div>
      {auto && !following && (
        <button type="button" className="ds-transcript__tail" onClick={toTail}>
          {text['agentTranscript.toLatest']}
        </button>
      )}
    </div>
  )
}

/** Тон роли по умолчанию — ассистент акцентный, ошибка/система — нейтрально. */
function defaultRoleTone(r: TranscriptRole): BadgeTone {
  if (r === 'assistant') return 'accent'
  if (r === 'tool') return 'info'
  if (r === 'system') return 'neutral'
  return 'neutral'
}

interface TurnRenderCtx {
  time: string
  roleLabel: (r: TranscriptRole) => string
  roleTone: (r: TranscriptRole) => BadgeTone
  show: AgentTranscriptShow
  openBlocks: ReadonlySet<string>
  toggleBlock: (suffix: string) => void
  toolLabel: string
  /**
   * Словарь едет ПОЛЕМ контекста, а не хуком на месте: `renderMessage` и
   * соседи — обычные функции, а не компоненты, и `useDsText` в них был бы
   * нарушением правил хуков. Разворачивать их в компоненты ради одной строки
   * значило бы переписать раскладку окна (DS-139).
   */
  text: DsTextDict
  renderText: (md?: string) => React.ReactNode
  query?: string
  onTurnClick?: () => void
}

/**
 * Узкий вариант t.kind здесь безопасен: параметр типизирован как объединение
 * `TranscriptTurn`, а не как родовой `T`. Родовой `T` нужен только для `getTurnId`
 * и `onTurnClick` на границе компонента.
 */
function renderTurn(t: TranscriptTurn, ctx: TurnRenderCtx): React.ReactNode {
  if (t.kind === 'message') return renderMessage(t, ctx)
  if (t.kind === 'event') return renderEvent(t, ctx)
  return renderRaw(t, ctx)
}

function renderMessage(t: MessageTurn, ctx: TurnRenderCtx): React.ReactNode {
  const name = t.author?.name ?? ctx.roleLabel(t.role)
  const isAgent = t.author?.kind === 'agent' || t.role === 'assistant'
  const role = ctx.roleLabel(t.role)
  /**
   * Доступное имя кнопки перекрывает её содержимое, поэтому роль называется в
   * нём явно — бейдж, видимый глазами, экранному диктору не слышен. Повтора
   * нет, когда имя И ЕСТЬ роль: без `author.name` `name` в неё и вырождается.
   */
  const headLabel = `${name}${name === role ? '' : `, ${role}`}, ${ctx.time}`
    + `${t.streaming ? `, ${ctx.text['agentTranscript.streaming']}` : ''}`

  /**
   * Содержимое заголовка собирается ОДИН РАЗ, ветвится только обёртка
   * (DS-186).
   *
   * Раньше ветки писались целиком каждая, и в кнопочной потерялся `Badge`: стоило
   * потребителю передать `onTurnClick`, и роль пропадала из видимого заголовка у
   * ВСЕХ реплик разом. Замерено в chromium на одних и тех же семи ходах — 5
   * заголовков-div и 5 бейджей против 5 кнопок и НУЛЯ бейджей. Зрячий читатель
   * терял роль целиком, а `roleTones` переставал значить что-либо: красить
   * нечего.
   *
   * Технической причины у пропажи не было — `Badge` это `span`, и вкладывать его
   * в кнопку законно (`no-nested-interactive` молчит правильно). То есть цена за
   * клик платилась не автором, а читателем, и нигде не была объявлена.
   *
   * Общий фрагмент здесь не ради краткости: две ветки, написанные порознь, УЖЕ
   * разъехались один раз молча. Теперь разъехаться нечему.
   */
  const headInner = (
    <>
      <Avatar name={name} size="sm" tone={isAgent ? 'accent' : 'neutral'} />
      <span className="ds-transcript__author">{name}</span>
      <Badge tone={ctx.roleTone(t.role)}>{role}</Badge>
      <time className="ds-transcript__time" dateTime={t.ts}>{ctx.time}</time>
    </>
  )

  const head = ctx.onTurnClick ? (
    <button
      type="button"
      className="ds-transcript__head ds-transcript__head--btn"
      onClick={ctx.onTurnClick}
      aria-label={headLabel}
    >
      {headInner}
    </button>
  ) : (
    <div className="ds-transcript__head" aria-label={headLabel}>{headInner}</div>
  )

  const showThinking = ctx.show.thinking && t.thinking != null
  const showTools = ctx.show.toolCalls && t.toolCalls && t.toolCalls.length > 0

  return (
    <article className="ds-transcript__msg">
      {head}
      <div className="ds-transcript__body">
        {showThinking && (
          <Collapsible
            open={ctx.openBlocks.has(`${t.id}/thinking`)}
            onToggle={() => ctx.toggleBlock('thinking')}
            label={ctx.text['agentTranscript.thinking']}
          >
            <div className="ds-transcript__thinking">{ctx.renderText(t.thinking)}</div>
          </Collapsible>
        )}
        {(t.text != null || t.streaming) && (
          <div className="ds-transcript__text">
            {ctx.renderText(t.text)}
            {/* Каретка стоит В ПОТОКЕ текста, а не рядом с ним (DS-235).
                Прямым ребёнком `.ds-transcript__body` она была флекс-элементом
                колоночного флекса, то есть отдельным РЯДОМ под абзацем, ещё и
                отделённым `gap`: `display: inline-block` к флекс-элементу не
                применяется вовсе. Смысл от этого менялся — каретка читается
                как «здесь появится следующий символ» ровно потому, что стоит
                на месте следующего символа, а прямоугольником под абзацем она
                говорит «идёт работа», и для этого в компоненте уже есть
                спиннер. `align-self` не помог бы: он оставил бы тот же
                отдельный ряд, просто иначе выровненным.
                Контейнер строки рисуется и когда текста ещё нет: иначе каретка
                первого мига снова оказалась бы соседом абзаца.
                Чего приём не гарантирует: потребительский `renderMarkdown`
                может закончить разметку БЛОЧНЫМ узлом (`<p>`), и тогда каретка
                встанет на следующую строку — это его каскад, не наш. */}
            {t.streaming && <span className="ds-transcript__streaming" aria-hidden="true" />}
          </div>
        )}
        {showTools && (
          <div className="ds-transcript__tools">
            {t.toolCalls!.map((tc) => (
              <ToolCard
                key={tc.id}
                call={tc}
                toolLabel={ctx.toolLabel}
                open={ctx.openBlocks.has(`${t.id}/tool/${tc.id}`)}
                onToggle={() => ctx.toggleBlock(`tool/${tc.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

function ToolCard({ call, toolLabel, open, onToggle }: {
  call: ToolCall
  toolLabel: string
  open: boolean
  onToggle: () => void
}) {
  // `ToolCard` — настоящий компонент (рисуется как `<ToolCard />`), поэтому
  // словарь берётся хуком прямо здесь, а не едет через `ctx`, как у соседей-
  // функций.
  const text = useDsText()
  const result = call.result
  return (
    <div className="ds-transcript__tool">
      <div className="ds-transcript__tool-head">
        <Badge tone="info">{call.name}</Badge>
        {call.summary != null && <code className="ds-transcript__tool-summary">{call.summary}</code>}
      </div>
      {call.input && (
        <Collapsible open={open} onToggle={onToggle} label={toolLabel}>
          <CodeBlock code={call.input} maxHeight={240} />
        </Collapsible>
      )}
      {result && (
        <div
          className={[
            'ds-transcript__tool-result',
            result.isError && 'ds-transcript__tool-result--error',
          ].filter(Boolean).join(' ')}
        >
          {result.pending ? (
            <span className="ds-transcript__pending" aria-label={text['agentTranscript.pending']}>
              <span className="ds-transcript__spinner" aria-hidden="true" />
              {text['agentTranscript.pending']}
            </span>
          ) : (
            <CodeBlock code={result.text} label={text['agentTranscript.result']} maxHeight={240} />
          )}
        </div>
      )}
    </div>
  )
}

function renderEvent(t: EventTurn, ctx: TurnRenderCtx): React.ReactNode {
  const cols = t.metrics ? metricColumns(t.metrics.length) : undefined
  return (
    <article className="ds-transcript__event" data-variant={t.variant}>
      <div className="ds-transcript__event-head">
        {t.title && <Badge tone={t.tone ?? 'neutral'}>{t.title}</Badge>}
        <time className="ds-transcript__time" dateTime={t.ts}>{ctx.time}</time>
      </div>
      {t.metrics && t.metrics.length > 0 && (
        <MetricStrip metrics={t.metrics} columns={cols} />
      )}
      {t.text != null && <div className="ds-transcript__event-text">{ctx.renderText(t.text)}</div>}
    </article>
  )
}

function renderRaw(t: RawTurn, ctx: TurnRenderCtx): React.ReactNode {
  return (
    <div className="ds-transcript__raw">
      <time className="ds-transcript__time" dateTime={t.ts}>{ctx.time}</time>
      <pre className="ds-transcript__raw-text">{highlight(t.text, ctx.query, 'ds-transcript__hit')}</pre>
    </div>
  )
}
