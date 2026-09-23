import { EventCalendar } from '@santarinto/jig'
import type { EventCalendarEvent, EventCalendarSource } from '@santarinto/jig'

// Расписание диспетчерской за неделю — сценарий из фикстуры компонента.
//
// Компонент контролируемый целиком: `view`, `date` и список событий держит
// приложение. В карточке жесты ничего не меняют — ручки пустые, — но в
// настоящем экране без `onEventChange`/`onEventCreate` перенос и создание
// «не работают»: ручка срабатывает, а сетка остаётся прежней.

const CALENDARS: EventCalendarSource[] = [
  { id: 'work', title: 'Работа' },
  { id: 'duty', title: 'Дежурства' },
  { id: 'personal', title: 'Личное' },
]

// Время — локальная строка без зоны, конец исключающий.
const WEEK: EventCalendarEvent[] = [
  { id: 'plan', title: 'Планёрка', start: '2026-09-02T09:30', end: '2026-09-02T11:00', calendarId: 'work' },
  { id: 'call', title: 'Созвон с парком', start: '2026-09-02T10:00', end: '2026-09-02T12:00', calendarId: 'duty' },
  { id: 'shift', title: 'Приём смены', start: '2026-09-01T08:00', end: '2026-09-01T09:30', calendarId: 'work' },
  { id: 'night', title: 'Ночной разбор', start: '2026-09-03T23:00', end: '2026-09-04T01:30', calendarId: 'duty' },
  { id: 'trip', title: 'Командировка', start: '2026-09-03T00:00', end: '2026-09-05T00:00', allDay: true, calendarId: 'personal' },
  { id: 'audit', title: 'Ревизия', start: '2026-09-04T14:00', end: '2026-09-04T15:00', calendarId: 'work', readOnly: true },
  { id: 'brief', title: 'Инструктаж водителей', start: '2026-09-05T12:00', end: '2026-09-05T13:30', calendarId: 'duty' },
]

const noop = () => {}
const handlers = {
  onViewChange: noop, onDateChange: noop, onToday: noop,
  onEventChange: noop, onEventCreate: noop, onToggleCalendar: noop,
}

/** Основной вид. Ночной разбор пересекает полночь и потому лежит в поясе сверху. */
export const Week = () => (
  <EventCalendar
    events={WEEK} view="week" date="2026-09-02"
    calendars={CALENDARS} workHours={['08:00', '20:00']}
    {...handlers}
  />
)

/** Многодневное событие идёт полосой через дни, а не чипом в каждой клетке. */
export const Month = () => (
  <EventCalendar
    events={WEEK} view="month" date="2026-09-02"
    calendars={CALENDARS}
    {...handlers}
  />
)

/**
 * «Планёрка» ушла на сервер и не вернулась (`pendingIds`): приглушена, жест на
 * ней не начинается. Один календарь скрыт — его события с сетки убраны.
 */
export const PendingAndHidden = () => (
  <EventCalendar
    events={WEEK} view="week" date="2026-09-02"
    calendars={CALENDARS} hiddenCalendars={['personal']}
    pendingIds={['plan']} workHours={['08:00', '20:00']}
    {...handlers}
  />
)
