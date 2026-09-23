import { AgentTranscript } from '@santarinto/jig'
import type { TranscriptTurn } from '@santarinto/jig'

// Форматтеры всегда явные ru-RU: среда захвата карточек живёт в en-US, и
// Intl.DateTimeFormat(undefined) нарисовал бы «09:15 AM» посреди русской ДС.
const time = (ts: string) =>
  new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
const day = (ts: string) =>
  new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

// Подписи ролей — словарь потребителя (как у Timeline и LogViewer): по
// умолчанию компонент называет роли по протоколу («user», «assistant»), и в
// русском интерфейсе их задают явно.
const ROLES = { user: 'Пользователь', assistant: 'Агент', tool: 'Инструмент', system: 'Система' }

const TURNS: TranscriptTurn[] = [
  {
    kind: 'message',
    id: 't1',
    ts: '2026-08-12T09:14:00Z',
    role: 'user',
    author: { name: 'Илья', kind: 'human' },
    text: 'Сверь остатки по счетам за июль и покажи, где расходится с выпиской.',
  },
  {
    kind: 'message',
    id: 't2',
    ts: '2026-08-12T09:14:20Z',
    role: 'assistant',
    author: { name: 'claude-opus-5', kind: 'agent' },
    thinking:
      'Выписка приходит одной таблицей, остатки — помесячно. Сначала свести к общему ключу (счёт + дата), потом искать расхождения больше копейки.',
    text: 'Беру выписку за июль и остатки на 31.07. Сверяю по паре «счёт + дата».',
    toolCalls: [
      {
        id: 'call_1',
        name: 'sql.query',
        input: '{\n  "query": "select account_id, balance from ledger where d = \'2026-07-31\'"\n}',
        result: { text: '14 строк · 240 мс' },
      },
    ],
  },
  {
    kind: 'event',
    id: 't3',
    ts: '2026-08-12T09:15:02Z',
    variant: 'result',
    title: 'Сверка завершена',
    tone: 'warning',
    text: 'Расхождение на двух счетах из четырнадцати.',
    metrics: [
      { id: 'checked', label: 'Проверено', value: '14' },
      { id: 'diff', label: 'Расходится', value: '2', tone: 'warning' },
      { id: 'sum', label: 'На сумму', value: '18 430,50 ₽' },
    ],
  },
  {
    kind: 'message',
    id: 't4',
    ts: '2026-08-12T09:15:40Z',
    role: 'assistant',
    author: { name: 'claude-opus-5', kind: 'agent' },
    text: 'Оба расхождения — комиссии эквайринга, проведённые следующим днём. Свести их?',
    streaming: true,
  },
]

const RAW: TranscriptTurn[] = [
  ...TURNS.slice(0, 2),
  {
    kind: 'raw',
    id: 't-raw',
    ts: '2026-08-12T09:14:31Z',
    text: '$ psql -c "select count(*) from ledger"\n count\n-------\n    14\n(1 row)',
  },
  ...TURNS.slice(2),
]

/**
 * Диалог прогона: реплики, размышления, вызовы инструментов и карточка итога в
 * одной ленте. Высота обязательна — без неё окно вырождается во весь список и
 * виртуализация теряет смысл. `getTurnId` тоже обязателен намеренно: у
 * опционального пропа был бы дефолт по индексу, а индекс не идентичность.
 */
export const Default = () => (
  <AgentTranscript
    turns={TURNS}
    getTurnId={(t) => t.id}
    height={420}
    formatTime={time}
    roleLabels={ROLES}
    autoscroll={false}
  />
)

/**
 * Блоки **скрываются, а не удаляются** (философия `LogViewer.query`): свернув
 * размышления и вызовы инструментов, читатель видит только реплики — данные при
 * этом те же.
 */
export const MessagesOnly = () => (
  <AgentTranscript
    turns={TURNS}
    getTurnId={(t) => t.id}
    height={420}
    formatTime={time}
    roleLabels={ROLES}
    show={{ thinking: false, toolCalls: false, raw: false }}
    autoscroll={false}
  />
)

/**
 * Сырой хвост терминала (`kind: 'raw'`) показывается только когда его попросили:
 * `show.raw` — единственное, что делает такие реплики видимыми.
 */
export const WithRaw = () => (
  <AgentTranscript
    turns={RAW}
    getTurnId={(t) => t.id}
    height={420}
    formatTime={time}
    roleLabels={ROLES}
    show={{ thinking: true, toolCalls: true, raw: true }}
    autoscroll={false}
  />
)

/**
 * Подсветка вхождений `query` **ничего не прячет** — в отличие от фильтра, лента
 * остаётся целой, и видно, где найденное стоит относительно остального.
 */
export const Query = () => (
  <AgentTranscript
    turns={TURNS}
    getTurnId={(t) => t.id}
    height={420}
    formatTime={time}
    roleLabels={ROLES}
    query="комисси"
    autoscroll={false}
  />
)

/**
 * Плотная раскладка с разделителем дней и своими подписями ролей — словари
 * локализует потребитель, как у `Timeline` и `LogViewer`.
 */
export const DenseWithDays = () => (
  <AgentTranscript
    turns={TURNS}
    getTurnId={(t) => t.id}
    height={380}
    dense
    groupByDay
    formatTime={time}
    formatDay={day}
    roleLabels={ROLES}
    autoscroll={false}
  />
)
