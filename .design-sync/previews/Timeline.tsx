import { Timeline } from '@santarinto/jig'
import type { TimelineEvent, TimelineTone } from '@santarinto/jig'

// Журнал активности задачи трекера — сценарий, под который компонент и делался.
const labels: Record<string, string> = {
  note: 'Заметка',
  status: 'Статус',
  block: 'Заблокирована задачей',
  unblock: 'Разблокирована от',
  priority: 'Приоритет',
}

const tones: Record<string, TimelineTone> = {
  note: 'neutral',
  status: 'info',
  block: 'error',
  unblock: 'success',
  priority: 'accent',
}

// Часовой пояс фиксирован, чтобы карточка не зависела от машины, на которой её снимают.
const msk = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow',
})
const mskTime = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
})
const formatDay = (ts: string) => msk.format(new Date(ts))
const formatTime = (ts: string) => mskTime.format(new Date(ts))

const events: TimelineEvent[] = [
  {
    id: '1', ts: '2026-07-27T09:15:00+03:00', kind: 'status',
    author: { name: 'Пётр Соколов' }, body: 'В работе',
  },
  {
    id: '2', ts: '2026-07-27T11:40:00+03:00', kind: 'block',
    author: { name: 'worker-3', kind: 'agent' },
    body: 'TK-418 — ждём ответа заказчика по формату выгрузки',
  },
  {
    id: '3', ts: '2026-07-27T18:02:00+03:00', kind: 'note',
    author: { name: 'Пётр Соколов' },
    body: 'Созвонились: заказчик вернётся с ответом к пятнице. Пока переношу срок на следующую неделю.',
  },
  {
    id: '4', ts: '2026-07-28T09:02:00+03:00', kind: 'unblock',
    author: { name: 'worker-3', kind: 'agent' }, body: 'TK-418',
  },
  {
    id: '5', ts: '2026-07-28T10:30:00+03:00', kind: 'priority',
    author: { name: 'Анна Круглова' }, body: 'Высокий',
  },
]

const box = { width: 460 }

export const Default = () => (
  <div style={box}>
    <Timeline events={events} labels={labels} tones={tones} formatDay={formatDay} formatTime={formatTime} />
  </div>
)

export const Dense = () => (
  <div style={box}>
    <Timeline events={events} labels={labels} tones={tones} formatDay={formatDay} formatTime={formatTime} dense />
  </div>
)

// Без разделителей по дням дефолтный formatTime сам начинает нести дату — иначе
// метка двусмысленна на ленте длиной в неделю. Здесь дата задана явно, чтобы
// карточка не зависела от локали машины, на которой её снимают; поведение
// компонента по умолчанию ровно такое же, только в локали браузера.
const mskDateTime = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
})

/** Без разделителей по дням метка времени сама несёт дату. */
export const WithoutDayGroups = () => (
  <div style={box}>
    <Timeline
      events={events.slice(0, 3)} labels={labels} tones={tones}
      groupByDay={false} formatTime={(ts) => mskDateTime.format(new Date(ts))}
    />
  </div>
)
