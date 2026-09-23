/**
 * Лента событий. `kind: 'block'`.
 *
 * Что здесь нельзя увидеть поодиночке:
 *  - **компонент НЕ СОРТИРУЕТ.** Порядок на экране — это порядок массива, и
 *    больше ничего. Перепутанные времена он покажет перепутанными, а с
 *    разделителями по дням это выглядит как испорченная лента, хотя испорчены
 *    данные. Случай `unsorted` показывает именно это.
 *  - **`formatDay` — ОДНА ручка на подпись разделителя И на границу дня.**
 *    Разъехаться они не могут по построению: если бы группировку считали по
 *    ISO-строке, а подпись рисовали через `Intl`, то в часовом поясе восточнее
 *    UTC событие ночью попадало бы под вчерашний заголовок.
 *  - **пустого состояния нет вовсе.** Лента без событий рисует пустоту, а не
 *    `EmptyState`: что показать вместо ленты — вопрос экрана, а не ленты.
 *  - **`labels` — словарь ПОТРЕБИТЕЛЯ.** Его `kind` это машинные токены, и
 *    придумывать за него русские названия значило бы начать владеть его
 *    смыслом. Нет ключа — на экране сырой `kind`, и случай `raw` показывает,
 *    как это выглядит.
 */
import { defineFixture } from '../../internal/fixture.js'
import { Timeline, type TimelineEvent, type TimelineTone } from './Timeline.js'

const LABELS: Record<string, string> = {
  status: 'Статус',
  note: 'Заметка',
  block: 'Блокировка',
  priority: 'Приоритет',
}

const TONES: Record<string, TimelineTone> = {
  status: 'accent',
  note: 'neutral',
  block: 'error',
  priority: 'warning',
}

/** Один день работы над задачей: то, ради чего лента и существует. */
const DAY: TimelineEvent[] = [
  {
    id: '1', ts: '2026-09-02T09:14:00+03:00', kind: 'status',
    author: { name: 'Соколов А.' },
    body: 'Взял в работу: backlog → in progress',
  },
  {
    id: '2', ts: '2026-09-02T11:02:00+03:00', kind: 'note',
    author: { name: 'Соколов А.' },
    body: 'Замерил на живых данных: выгрузка по парку Юг идёт 41 секунду, из них 38 — один запрос без индекса.',
  },
  {
    id: '3', ts: '2026-09-02T13:30:00+03:00', kind: 'block',
    author: { name: 'jig', kind: 'agent' },
    body: 'Заблокировано: ждём миграцию OPS-418',
  },
  {
    id: '4', ts: '2026-09-02T17:45:00+03:00', kind: 'priority',
    author: { name: 'Морозова Е.' },
    body: 'Приоритет: middle → high',
  },
]

/** Три дня: разделители начинают работать. */
const THREE_DAYS: TimelineEvent[] = [
  ...DAY,
  {
    id: '5', ts: '2026-09-03T10:20:00+03:00', kind: 'note',
    author: { name: 'jig', kind: 'agent' },
    body: 'Миграция приехала, снимаю блокировку.',
  },
  {
    id: '6', ts: '2026-09-03T10:21:00+03:00', kind: 'status',
    author: { name: 'jig', kind: 'agent' },
    body: 'blocked → in progress',
  },
  {
    id: '7', ts: '2026-09-04T08:05:00+03:00', kind: 'status',
    author: { name: 'Соколов А.' },
    body: 'in progress → review',
  },
]

/** Тот же набор, порядок массива нарушен намеренно. */
const UNSORTED: TimelineEvent[] = [THREE_DAYS[2]!, THREE_DAYS[6]!, THREE_DAYS[0]!, THREE_DAYS[4]!]

/** Типы, которых нет в словаре подписей. */
const RAW: TimelineEvent[] = [
  { id: 'r1', ts: '2026-09-02T09:00:00+03:00', kind: 'status', body: 'Известный тип' },
  { id: 'r2', ts: '2026-09-02T09:30:00+03:00', kind: 'sla_breach', body: 'Тип, которого нет в словаре' },
  { id: 'r3', ts: '2026-09-02T10:00:00+03:00', kind: 'webhook.delivery.failed', body: 'И длинный машинный тоже' },
]

interface Props {
  events: TimelineEvent[]
  groupByDay: boolean
  dense: boolean
}

export default defineFixture<Props>({
  name: 'Timeline',
  group: 'Данные',
  kind: 'block',

  props: { events: THREE_DAYS, groupByDay: true, dense: false },

  controls: {
    groupByDay: { kind: 'bool', prop: true },
    dense: { kind: 'bool', prop: true },
  },

  data: {
    day: { events: DAY, groupByDay: false },
    unsorted: { events: UNSORTED },
    raw: { events: RAW, groupByDay: false },
    // Одно событие: лента перестаёт быть лентой, рельс не с чем соединять.
    single: { events: [DAY[0]!], groupByDay: false },
  },

  cases: [
    {
      id: 'base',
      title: 'Три дня работы',
      note:
        'Разделители по дням, маркер по типу, автор у каждого события. Маркер '
        + '`aria-hidden`: смысл несёт подпись типа, а не цвет кружка, — на '
        + 'чёрно-белом экране лента обязана остаться читаемой. Бейдж автора '
        + 'различает человека и воркера тоном, но имя стоит рядом словом.',
    },
    {
      id: 'flat',
      title: 'Без разделителей',
      props: { events: DAY, groupByDay: false },
      note:
        'Один день, разделители выключены — и формат времени МЕНЯЕТСЯ вместе с '
        + 'ними: без заголовка дня время обязано нести дату, иначе «13:30» ни о '
        + 'чём. Умолчание `formatTime` поэтому зависит от `groupByDay`, а не '
        + 'стоит константой. Переключите крутилку и сравните подписи.',
    },
    {
      id: 'unsorted',
      title: 'Лента не сортирует',
      props: { events: UNSORTED },
      note:
        'ДАННЫЕ ИСПОРЧЕНЫ НАМЕРЕННО: порядок массива не совпадает с порядком '
        + 'времён. Лента показывает как есть — 2 сентября, потом 4-е, потом '
        + 'снова 2-е, — и разделители по дням честно повторяют один и тот же '
        + 'день дважды. Это не дефект компонента: сортировать за потребителя '
        + 'значило бы решать за него, что «правильный» порядок — хронологический, '
        + 'а ленты бывают и обратными. Но выглядит это как поломка вёрстки, и '
        + 'знать, что смотреть надо в данные, дешевле один раз здесь.',
    },
    {
      id: 'raw',
      title: 'Тип не из словаря',
      props: { events: RAW, groupByDay: false },
      note:
        'Первое событие есть в `labels`, второе и третье — нет, и на экране '
        + 'встают сырые токены: `sla_breach`, `webhook.delivery.failed`. Тон '
        + 'таких — `neutral`. Это ПРАВИЛЬНОЕ поведение: подписи типов — словарь '
        + 'потребителя, и подставить вместо пропуска «Событие» значило бы '
        + 'спрятать неполный словарь вместо того, чтобы показать его. Смотреть '
        + 'надо на длинный токен: он не должен ломать колонку.',
    },
    {
      id: 'dense',
      title: 'Плотный и обычный',
      note:
        'Сверху обычная лента, снизу плотная. Плотность — это про то, сколько '
        + 'событий помещается в поле зрения, а не про экономию места: в журнале '
        + 'на сотню записей обычный шаг превращает чтение в прокрутку. Рельс и '
        + 'маркеры при этом не уменьшаются — уменьшается воздух.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Timeline events={DAY} labels={LABELS} tones={TONES} groupByDay={p.groupByDay} />
          <Timeline events={DAY} labels={LABELS} tones={TONES} groupByDay={p.groupByDay} dense />
        </div>
      ),
    },
  ],

  render: (p) => (
    <Timeline
      events={p.events}
      labels={LABELS}
      tones={TONES}
      groupByDay={p.groupByDay}
      dense={p.dense}
    />
  ),
})
