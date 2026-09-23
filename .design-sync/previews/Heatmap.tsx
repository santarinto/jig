import { Heatmap } from '@santarinto/jig'
import type { HeatmapDay } from '@santarinto/jig'

// Календарь активности коммитов — сценарий, под который компонент и делался.
//
// Данные генерируются детерминированно: карточка снимается на каждой сборке, и
// случайные числа меняли бы её хеш на ровном месте.
const DAY = 86_400_000
const FROM = '2025-08-04' // понедельник
const start = Date.UTC(2025, 7, 4)

/** Дешёвый детерминированный шум: тот же индекс — то же значение. */
function pseudo(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function series(days: number): HeatmapDay[] {
  const out: HeatmapDay[] = []
  for (let i = 0; i < days; i++) {
    const ms = start + i * DAY
    const dow = new Date(ms).getUTCDay()
    const r = pseudo(i)
    // Выходные тише буднего дня — иначе картинка выглядит синтетической.
    const value = dow === 0 || dow === 6
      ? (r < 0.68 ? 0 : Math.round(r * 3))
      : (r < 0.18 ? 0 : Math.round(r * 15))
    const date = new Date(ms).toISOString().slice(0, 10)
    const day: HeatmapDay = { date, value }
    // Праздники и переопределённые дни едут данными; обычные выходные
    // компонент вычисляет сам из даты — их 28% ячеек, гонять незачем.
    if (HOLIDAYS.has(date)) day.kind = 'holiday'
    if (WORKING_SATURDAYS.has(date)) day.kind = 'workday'
    if (i % 23 === 5) day.marked = true
    out.push(day)
  }
  return out
}

/** Российские праздники внутри диапазона превью. */
const HOLIDAYS = new Set([
  '2025-11-04', '2026-01-01', '2026-01-02', '2026-01-07',
  '2026-02-23', '2026-03-09', '2026-05-01', '2026-05-11', '2026-06-12',
])
/** Перенесённая рабочая суббота — тот случай, ради которого kind переопределяем. */
const WORKING_SATURDAYS = new Set(['2026-02-21', '2026-05-16'])

/** Громкость назначает потребитель: выходных 28% ячеек, праздников единицы. */
const kinds = {
  weekend: { shape: 'ring' } as const,
  holiday: { shape: 'bar', tone: 'error' } as const,
}

const year = series(364)
const seventeenWeeks = year.slice(0, 119)
const to = (n: number) => new Date(start + (n - 1) * DAY).toISOString().slice(0, 10)

const ru = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const plural = (n: number) => {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'коммит'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'коммита'
  return 'коммитов'
}
const formatTooltip = (date: string, value: number) =>
  `${ru.format(new Date(`${date}T00:00:00Z`))} — ${value} ${plural(value)}`

const months = new Intl.DateTimeFormat('ru-RU', { month: 'short', timeZone: 'UTC' })
const formatMonth = (date: string) => months.format(new Date(`${date}T00:00:00Z`)).replace('.', '')

// Дни недели тоже задаём явно: без formatWeekday колонка осталась бы в локали
// браузера, и в русском интерфейсе появилось бы Mon/Wed/Fri.
const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const formatWeekday = (dow: number) => WEEKDAYS[dow]!

/**
 * Теплокарта живёт НА ПОВЕРХНОСТИ, а не на фоне приложения: нулевая ступень
 * отличается от `--ds-surface` на 1.22, а от `--ds-bg-app` всего на 1.03 —
 * на фоне приложения сетка распадается на цветные точки без календаря.
 */
const Panel = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    background: 'var(--ds-surface)',
    border: '1px solid var(--ds-border)',
    borderRadius: 'var(--ds-radius)',
    padding: 'var(--ds-space-6)',
    display: 'inline-block',
  }}>{children}</div>
)

export const Year = () => (
  <Panel>
    <Heatmap data={year} from={FROM} to={to(364)} formatTooltip={formatTooltip} formatMonth={formatMonth} formatWeekday={formatWeekday} kinds={kinds} />
  </Panel>
)

export const SeventeenWeeks = () => (
  <Panel>
    <Heatmap data={seventeenWeeks} from={FROM} to={to(119)} formatTooltip={formatTooltip} formatMonth={formatMonth} formatWeekday={formatWeekday} kinds={kinds} />
  </Panel>
)

/**
 * Крупная ячейка — `cellSize`, а не `--ds-ui-scale` на обёртке.
 *
 * Ячейка здесь модуль: от неё считаются зазор, колонка дней недели, кегль
 * подписей и метки, поэтому календарь растёт целиком.
 *
 * Шкала на обёртке — про другое: это размер ВСЕГО интерфейса, и поставленная
 * ради одного календаря она заодно тащит за собой всё, что окажется внутри той
 * же обёртки, а до токенов `:root` (кегли, отступы, высоты контролов) всё равно
 * не достаёт — переопределение кастомного свойства на потомке подстановку в
 * `:root` не меняет. Размер компонента и размер интерфейса — разные величины, и
 * держать их на одной переменной значит менять одно, а получать оба.
 */
export const LargeCells = () => (
  <Panel>
    <Heatmap
      data={seventeenWeeks} from={FROM} to={to(119)}
      formatTooltip={formatTooltip} formatMonth={formatMonth} formatWeekday={formatWeekday} kinds={kinds}
      cellSize={18}
    />
  </Panel>
)

/** С onDayClick ячейки становятся кнопками с доступным именем. */
export const Clickable = () => (
  <Panel>
    <Heatmap
      data={seventeenWeeks} from={FROM} to={to(119)}
      formatTooltip={formatTooltip} formatMonth={formatMonth} formatWeekday={formatWeekday} kinds={kinds}
      onDayClick={() => {}}
    />
  </Panel>
)
