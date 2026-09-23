import { Fragment } from 'react'
import { useDsLocale } from '../../dictionary/DsText.js'
import { dateFormat, safeFormatDate } from '../../internal/intl.js'
import { Badge } from '../Badge/index.js'
import type { BadgeTone } from '../Badge/index.js'
import './Timeline.css'

/**
 * Тот же словарь, что у Badge. Заводить второе перечисление с теми же шестью
 * значениями нельзя: два одинаковых enum в одном пакете расходятся при первой
 * же правке, и потребитель узнаёт об этом от тайпчекера в неудачный момент.
 */
export type TimelineTone = BadgeTone

export interface TimelineAuthor {
  name: string
  /** 'agent' — воркер; влияет только на тон бейджа. */
  kind?: 'human' | 'agent'
}

export interface TimelineEvent {
  id: string
  /** ISO 8601. */
  ts: string
  /** Словарь потребителя: note/status/block/unblock/priority. */
  kind: string
  author?: TimelineAuthor
  /** Проза потребителя; DS её не разбирает. */
  body: React.ReactNode
}

export interface TimelineProps {
  events: TimelineEvent[]
  /**
   * kind → подпись типа. Локализованная карта потребителя: его `kind` —
   * машинные токены, а придумывать за него русские названия значило бы
   * начать владеть его смыслом.
   */
  labels?: Record<string, string>
  /** kind → тон маркера; неизвестный kind даёт 'neutral'. */
  tones?: Record<string, TimelineTone>
  /** Разделители по дням. */
  groupByDay?: boolean
  dense?: boolean
  formatDay?: (ts: string) => string
  formatTime?: (ts: string) => string
  className?: string
  id?: string
}

const DAY_OPTS: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }
const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
const DATE_TIME_OPTS: Intl.DateTimeFormatOptions = {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
}

export function Timeline({
  events, labels, tones, groupByDay = true, dense = false,
  formatDay, formatTime, className, id,
}: TimelineProps) {
  const locale = useDsLocale()
  // Дефолт метки времени зависит от группировки: под заголовком дня достаточно
  // «08:24», а без него та же метка на ленте длиной в неделю двусмысленна.
  // Компонент не должен уметь показать неоднозначное время в своей же
  // конфигурации по умолчанию.
  const time = formatTime
    ?? ((ts: string) => safeFormatDate(ts, dateFormat(locale, groupByDay ? TIME_OPTS : DATE_TIME_OPTS)))
  // Ключ группировки и подпись заголовка — одна функция. Граница суток зависит
  // от часового пояса, и считать её отдельно от подписи значило бы завести две
  // ручки, которые надо не забыть повернуть согласованно: свой formatDay с
  // timeZone двигает и то, и другое разом.
  const day = formatDay ?? ((ts: string) => safeFormatDate(ts, dateFormat(locale, DAY_OPTS)))

  return (
    <ol
      id={id}
      className={['ds-timeline', dense && 'ds-timeline--dense', className].filter(Boolean).join(' ')}
    >
      {events.map((e, i) => {
        const tone: TimelineTone = tones?.[e.kind] ?? 'neutral'
        // Группа начинается там, где formatDay вернул строку, отличную от
        // предыдущей — не «по всем уникальным датам набора». Порядок событий
        // это решение потребителя (как в groupByValue), поэтому неотсортированные
        // данные дают повтор даты. Это видно сразу и это его данные; тихая
        // перестановка была бы хуже.
        const dayLabel = groupByDay ? day(e.ts) : null
        const startsDay = dayLabel !== null && (i === 0 || dayLabel !== day(events[i - 1].ts))
        return (
          <Fragment key={e.id}>
            {startsDay && <li className="ds-timeline__day">{dayLabel}</li>}
            <li className="ds-timeline__item">
              <span className={`ds-timeline__marker ds-timeline__marker--${tone}`} aria-hidden="true" />
              <div className="ds-timeline__head">
                {/* Подпись типа — текст, а не только цвет маркера: тело события у
                    потребителя описывает подробность («ждём ответа заказчика»), а
                    само событие не называет. Без подписи тип пропал бы и для
                    скринридера, и для зрячего. */}
                <span className="ds-timeline__kind">{labels?.[e.kind] ?? e.kind}</span>
                <time className="ds-timeline__time" dateTime={e.ts}>{time(e.ts)}</time>
                {e.author && (
                  <Badge
                    className="ds-timeline__author"
                    tone={e.author.kind === 'agent' ? 'accent' : 'neutral'}
                  >
                    {e.author.name}
                  </Badge>
                )}
              </div>
              <div className="ds-timeline__body">{e.body}</div>
            </li>
          </Fragment>
        )
      })}
    </ol>
  )
}
