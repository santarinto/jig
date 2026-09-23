import { useDsText, useDsLocale } from '../../dictionary/DsText.js'
import { dateFormat, capitalizeFirst } from '../../internal/intl.js'
import './Heatmap.css'

import type { BadgeTone } from '../Badge/index.js'
import { heatLevel, heatLevelCount, assertHeatThresholds } from '../../internal/heatLevel.js'
import type { HeatThresholds } from '../../internal/heatLevel.js'

export type { HeatThresholds }

/** Тот же словарь тонов, что у Badge, Timeline и LogViewer. */
export type HeatmapMarkTone = BadgeTone

/**
 * Как пометить тип дня. Ни один вариант не трогает заливку: рамп кодирует
 * величину, и пометить им тип значило бы соврать о количестве.
 */
export interface HeatmapKindStyle {
  /**
   * `ring` — кольцо внутрь цветом поверхности: ячейка визуально уменьшается.
   * `bar` — полоса снизу.
   */
  shape: 'ring' | 'bar'
  /**
   * Тон полосы. У кольца тона нет: оно работает формой, а не цветом, и именно
   * поэтому читается на всех ступенях рампа одинаково.
   */
  tone?: HeatmapMarkTone
}

export interface HeatmapDay {
  /** YYYY-MM-DD. */
  date: string
  value: number
  /**
   * Тип дня. Переопределяет вычисленный: суббота и воскресенье получают
   * `'weekend'`, остальные `'workday'`, и оба имени зарезервированы за
   * компонентом. Всё прочее — словарь потребителя.
   */
  kind?: string
  /** У дня есть заметка — угловая метка. */
  marked?: boolean
}

export interface HeatmapProps {
  /** Разреженные данные: отсутствующий день в диапазоне считается нулём. */
  data: HeatmapDay[]
  /** Границы диапазона включительно, YYYY-MM-DD. */
  from: string
  to: string
  /**
   * Нижние границы уровней 1…4, включительно. Значение, равное порогу, попадает
   * в верхнюю ступень.
   *
   * Кортеж, а не массив: порогов не больше ЧЕТЫРЁХ, потому что ступеней рампа
   * пять. Пятый и дальше раньше отбрасывались молча (DS-208) — теперь это
   * ошибка типа. Массив, собранный в рантайме, объявляется этим же типом:
   * `const t: HeatThresholds = [q1, q2, q3]`.
   */
  thresholds?: HeatThresholds
  /** 1 — неделя с понедельника (по умолчанию), 0 — с воскресенья. */
  weekStart?: 0 | 1
  onDayClick?: (date: string, value: number) => void
  /** Текст подсказки дня. Склонение — правило домена потребителя. */
  formatTooltip?: (date: string, value: number) => string
  /** Подпись месяца над колонкой. */
  formatMonth?: (date: string) => string
  /**
   * Подпись дня недели слева. Аргумент — день по `Date.getUTCDay()`
   * (0 — воскресенье), в порядке, заданном `weekStart`.
   *
   * Проп существует ради симметрии с `formatMonth` и `formatTooltip`: без него
   * колонка дней недели оставалась единственной подписью, которую нельзя
   * переопределить. Язык с DS-184 приезжает из `<DsText locale>` и
   * переопределения уже не требует — проп остаётся для СВОЕГО ВИДА подписи
   * («Пн» против «понедельник»), а не для смены языка.
   */
  formatWeekday?: (dayOfWeek: number) => string
  /**
   * kind → как пометить день. Тип, которого нет в карте, не помечается никак.
   *
   * Громкость назначает потребитель: компонент не знает, какая категория
   * частая. Тихий приём (`ring`) — частому типу, заметный (`bar`) — редкому;
   * зашей это дефолтом — и теплокарта, где «праздник» частый, получила бы
   * неверную раскладку, о которой её автор не догадался бы.
   */
  kinds?: Record<string, HeatmapKindStyle>
  /** Легенда «меньше → больше». */
  legend?: boolean
  /**
   * Сторона ячейки дня в px до `--ds-ui-scale` (по умолчанию 11).
   *
   * Ячейка — модуль компонента: от неё считаются зазор, колонка дней недели,
   * кегль подписей, кольцо и метка заметки. Поэтому размер меняется целиком, а
   * не одной сеткой — и поэтому же он отдельный проп, а не `--ds-ui-scale` на
   * обёртке: шкала интерфейса и размер одного компонента — разные величины, и
   * пока они на одной переменной, любое изменение размера уносит с собой
   * рассогласование с типографикой всего остального.
   */
  cellSize?: number
  className?: string
  id?: string
}

const DAY = 86_400_000

/**
 * Календарная дата, а не момент времени. Через локальные методы `Date` день
 * сдвинулся бы у пользователя западнее Гринвича (`new Date('2026-07-01')`
 * разбирается как полночь UTC), и вся сетка поехала бы на сутки.
 */
function parseDay(s: string): number {
  return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
}

function toKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Строка недели: 0 — первый день недели по `weekStart`. */
function row(ms: number, weekStart: 0 | 1): number {
  return (new Date(ms).getUTCDay() - weekStart + 7) % 7
}

// `timeZone: 'UTC'` стоит НАМЕРЕННО и локалью не отменяется: ключ дня в данных
// — календарная дата без времени, и сдвиг в пояс читателя увёл бы её на сутки.
// Пояс и локаль — разные вопросы (DS-184), и смешивать их нельзя.
const MONTH_OPTS: Intl.DateTimeFormatOptions = { month: 'short', timeZone: 'UTC' }
const DAY_OPTS: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', timeZone: 'UTC' }
const WEEKDAY_OPTS: Intl.DateTimeFormatOptions = { weekday: 'short', timeZone: 'UTC' }

export function Heatmap({
  data, from, to, thresholds = [1, 3, 6, 10], weekStart = 1,
  onDayClick, formatTooltip, formatMonth, formatWeekday, kinds, legend = true, cellSize, className, id,
}: HeatmapProps) {
  const t = useDsText()
  const locale = useDsLocale()
  const monthFmt = dateFormat(locale, MONTH_OPTS)
  const dayFmt = dateFormat(locale, DAY_OPTS)
  const weekdayFmt = dateFormat(locale, WEEKDAY_OPTS)
  // Бросок на первом же рендере, как у Badge и PivotTable: ошибка в ВЫЗОВЕ, и
  // прятать её в вид нельзя. Тип держит эту же границу на своей стороне, а сюда
  // приходят пути без типа — `any` у потребителя, JS, пороги из конфига.
  assertHeatThresholds(thresholds)
  const start = parseDay(from)
  const end = parseDay(to)

  const byDate = new Map(data.map((d) => [d.date, d]))
  const days: { key: string; ms: number; value: number; kind: string; marked: boolean }[] = []
  for (let ms = start; ms <= end; ms += DAY) {
    const key = toKey(ms)
    const d = byDate.get(key)
    // Выходные вычисляются из даты — это 28% ячеек, которые незачем гонять
    // данными. Календарный день недели берётся по UTC и не зависит от
    // weekStart: суббота остаётся субботой, с какого бы дня ни рисовалась
    // неделя. Поле kind в данных переопределяет вычисленное.
    const dow = new Date(ms).getUTCDay()
    days.push({
      key, ms,
      value: d?.value ?? 0,
      kind: d?.kind ?? (dow === 0 || dow === 6 ? 'weekend' : 'workday'),
      marked: d?.marked ?? false,
    })
  }

  const lead = days.length ? row(start, weekStart) : 0
  const columns = days.length ? Math.ceil((lead + days.length) / 7) : 0

  const tooltip = (key: string, value: number) =>
    formatTooltip ? formatTooltip(key, value) : `${dayFmt.format(new Date(parseDay(key)))} — ${value}`

  const month = (ms: number) =>
    formatMonth ? formatMonth(toKey(ms)) : capitalizeFirst(monthFmt.format(new Date(ms)), locale)

  // Подпись ставится над колонкой, в которой месяц сменился. Сравнение идёт с
  // предыдущей колонкой, а не «по всем месяцам диапазона»: год, начатый и
  // законченный июлем, иначе подписал бы июль дважды подряд на стыке.
  const monthMarks: { column: number; label: string }[] = []
  for (let c = 0; c < columns; c++) {
    const index = c * 7 - lead
    const day = days[Math.max(0, index)]
    if (!day) continue
    const label = month(day.ms)
    if (monthMarks.length === 0 || monthMarks[monthMarks.length - 1]!.label !== label) {
      monthMarks.push({ column: c, label })
    }
  }

  // Названия дней недели берутся у Intl от реального воскресенья, чтобы не
  // держать в компоненте собственный список на каждом языке. Локаль — из
  // `DsText` (DS-184), а не из браузера. Потребитель может задать свои
  // через formatWeekday — тогда Intl не участвует вовсе.
  //
  // Первая буква поднимается: `Intl` отдаёт «пн» строчной, потому что так это
  // пишется В ТЕКСТЕ, а здесь подпись стоит заголовком столбца.
  const SUNDAY = Date.UTC(2026, 0, 4)
  const weekdays = Array.from({ length: 7 }, (_, r) => {
    const dow = (r + weekStart) % 7
    return formatWeekday
      ? formatWeekday(dow)
      : capitalizeFirst(weekdayFmt.format(new Date(SUNDAY + dow * DAY)), locale)
  })

  const gridLabel = t['heatmap.grid'](dayFmt.format(new Date(start)), dayFmt.format(new Date(end)))

  return (
    <div
      id={id}
      className={['ds-heat', className].filter(Boolean).join(' ')}
      style={cellSize == null ? undefined : ({
        '--ds-heat-cell': `calc(${cellSize}px * var(--ds-ui-scale, 1))`,
      } as React.CSSProperties)}
    >
      {/* ПРОКРУЧИВАЕМАЯ ОБЛАСТЬ ФОКУСИРУЕМА (DS-192, SC 2.1.1).
          Без `onDayClick` внутри нет ни одной кнопки, и фокус в область не
          заходил вовсе — клавиатурой до сетки было не дойти. Не украшение:
          на ширине 360 сверх видимого прячется 473 px сетки, то есть данных.
          ИМЯ У ОБЛАСТИ СВОЁ, а не тот же `gridLabel`, что у `role="img"` ниже.
          Это два разных вопроса: `img` называет КАРТИНКУ и несёт даты диапазона,
          а имя области отвечает, ГДЕ стоит вошедший в неё. Повторить датированную
          подпись значило бы произнести одну и ту же строку дважды подряд — при
          входе в область и при чтении картинки. Короткое имя области ещё и
          ставит три компонента в один ряд: «Журнал», «Диалог агента», «Сетка
          активности» — так области называются везде в системе. */}
      <div className="ds-heat__scroll" tabIndex={0} aria-label={t['heatmap.region']}>
        <div className="ds-heat__months" style={{ '--ds-heat-cols': columns } as React.CSSProperties}>
          {monthMarks.map((m) => (
            <span key={`${m.column}-${m.label}`} className="ds-heat__month" style={{ gridColumn: m.column + 1 }}>
              {m.label}
            </span>
          ))}
        </div>

        <div className="ds-heat__body">
          <div className="ds-heat__weekdays" aria-hidden="true">
            {weekdays.map((w, r) => (
              // Подписаны через одну: семь подряд при такой высоте строки
              // сливаются в шум и мешают читать саму сетку.
              <span key={w + r} className="ds-heat__weekday">{r % 2 === 0 ? w : ''}</span>
            ))}
          </div>

          <div
            className="ds-heat__grid"
            role={onDayClick ? undefined : 'img'}
            aria-label={onDayClick ? undefined : gridLabel}
          >
            {Array.from({ length: lead }, (_, i) => (
              <span key={`pad-${i}`} className="ds-heat__pad" aria-hidden="true" />
            ))}
            {days.map((d) => {
              const lv = heatLevel(d.value, thresholds)
              const label = tooltip(d.key, d.value)
              const cls = `ds-heat__day ds-heat__swatch ds-heat__swatch--${lv}`
              const style = kinds?.[d.kind]
              // Метки — отдельные узлы поверх заливки, а не её изменение.
              // Скрыты от скринридера: тип дня уже назван в подсказке, а лишние
              // «точка, точка» на 365 ячейках это шум, из которого ничего не
              // собрать.
              const marks = (
                <>
                  {style && (
                    <span
                      className={[
                        'ds-heat__mark',
                        `ds-heat__mark--${style.shape}`,
                        // Тон только у полосы: кольцо цвета поверхности, и это
                        // ровно то, почему оно читается на всех ступенях.
                        style.shape === 'bar' && `ds-heat__mark--${style.tone ?? 'neutral'}`,
                      ].filter(Boolean).join(' ')}
                      aria-hidden="true"
                    />
                  )}
                  {d.marked && <span className="ds-heat__note" aria-hidden="true" />}
                </>
              )
              return onDayClick ? (
                <button
                  key={d.key}
                  type="button"
                  className={cls}
                  title={label}
                  aria-label={label}
                  onClick={() => onDayClick(d.key, d.value)}
                >{marks}</button>
              ) : (
                <span key={d.key} className={cls} title={label}>{marks}</span>
              )
            })}
          </div>
        </div>
      </div>

      {legend && (
        <div className="ds-heat__legend">
          <span className="ds-heat__legend-text">{t['heatmap.less']}</span>
          {/* Клеток столько, сколько ступеней компонент РАЗЛИЧАЕТ на ЭТИХ порогах,
              а не сколько их в рампе (DS-188). Легенда — единственный
              образец шкалы у читателя, и лишняя клетка врёт ему про величину. */}
          {Array.from({ length: heatLevelCount(thresholds) }, (_, lv) => (
            <span key={lv} className={`ds-heat__swatch ds-heat__swatch--${lv}`} aria-hidden="true" />
          ))}
          <span className="ds-heat__legend-text">{t['heatmap.more']}</span>
        </div>
      )}
    </div>
  )
}
