import { LogViewer } from '@santarinto/jig'
import type { LogTone } from '@santarinto/jig'

// Диалог ИИ-воркера — сценарий, под который компонент и делался.
interface Entry {
  runId: string
  seq: number
  ts: string
  kind: string
  text: string
  stream?: string
}

const labels: Record<string, string> = {
  sys: 'Система',
  out: 'Ответ',
  tool: 'Инструмент',
  err: 'Ошибка',
  done: 'Готово',
}

const tones: Record<string, LogTone> = {
  sys: 'neutral',
  out: 'info',
  tool: 'warning',
  err: 'error',
  done: 'success',
}

// Идентичность собирает потребитель: у строк лога нет уникального ts.
const getLineId = (l: Entry) => `${l.runId}:${l.seq}`

const at = (s: number) => `2026-07-29T12:${String(4 + Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}+03:00`

const line = (seq: number, kind: string, text: string, stream = 'stdout'): Entry =>
  ({ runId: 'r8c1f2a', seq, ts: at(seq * 7), kind, text, stream })

const lines: Entry[] = [
  line(1, 'sys', 'воркер запущен, run_id=8c1f2a, модель claude-opus-5'),
  line(2, 'out', 'Читаю файл src/components/DataTable/DataTable.tsx, затем проверяю инварианты зебры и отступа по глубине. Строка нарочно длинная, чтобы упереться в обрезку до трёх строк и показать многоточие: продолжение видно только после разворота по кнопке слева, и ровно так этот экран и сканируют — глазами по колонке времени и вида, а в текст ныряют выборочно, когда нашли нужный момент прогона.'),
  line(3, 'tool', 'Read(src/internal/rowModel.ts) → 138 строк'),
  line(4, 'tool', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IndvcmtlciJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'),
  line(5, 'err', 'соединение с example.io разорвано, повтор через 2 с', 'stderr'),
  line(6, 'out', 'Повтор удался, продолжаю разбор модели строк.'),
  line(7, 'done', 'прогон завершён за 31 с'),
]

// Панель обязана иметь ограниченную высоту: без неё виртуализация вырождается —
// окно всегда равно всему списку, и тысяча строк оказывается в DOM.
export const Default = () => (
  <LogViewer lines={lines} getLineId={getLineId} labels={labels} tones={tones} height={260} />
)

/** Запрос подсвечивает вхождения, но НЕ фильтрует: строки не исчезают. */
export const WithQuery = () => (
  <LogViewer lines={lines} getLineId={getLineId} labels={labels} tones={tones} query="DataTable" height={260} />
)

/** Без обрезки строка разворачивается целиком — размен на дрожащий скролл. */
export const Unclamped = () => (
  <LogViewer lines={lines.slice(0, 4)} getLineId={getLineId} labels={labels} tones={tones} clampLines={0} height={220} />
)
