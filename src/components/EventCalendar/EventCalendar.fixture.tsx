import { useEffect, useState } from 'react'
import { defineFixture } from '../../internal/fixture.js'
import { EventCalendar, type EventCalendarSource, type EventCalendarView } from './EventCalendar.js'
import type { EventCalendarEvent } from './layout.js'

/**
 * Календарь-планировщик. `kind: 'block'`.
 *
 * Случаи подобраны по одному правилу: сюда идёт то, чего jsdom не видит в
 * принципе. Раскладка, пересечения и snap уже проверены таблицей в
 * `layout.test.ts` и в повторе не нуждаются — а вот схлопывание плотного
 * кластера, наезд лесенкой, подъём под курсором и высота пояса существуют
 * только там, где считается layout.
 *
 * Компонент КОНТРОЛИРУЕМЫЙ целиком, поэтому фикстура держит своё состояние:
 * без него ни перенос, ни создание не доводятся до конца — ручка сработает, а
 * сетка останется прежней, и кадр покажет, что жест «не работает».
 */

const CALENDARS: EventCalendarSource[] = [
  { id: 'work', title: 'Работа' },
  { id: 'duty', title: 'Дежурства' },
  { id: 'personal', title: 'Личное' },
]

const WEEK: EventCalendarEvent[] = [
  { id: 'plan', title: 'Планёрка', start: '2026-09-02T09:30', end: '2026-09-02T11:00', calendarId: 'work' },
  { id: 'call', title: 'Созвон с парком', start: '2026-09-02T10:00', end: '2026-09-02T12:00', calendarId: 'duty' },
  { id: 'shift', title: 'Приём смены', start: '2026-09-01T08:00', end: '2026-09-01T09:30', calendarId: 'work' },
  { id: 'night', title: 'Ночной разбор', start: '2026-09-03T23:00', end: '2026-09-04T01:30', calendarId: 'duty' },
  { id: 'trip', title: 'Командировка', start: '2026-09-03T00:00', end: '2026-09-05T00:00', allDay: true, calendarId: 'personal' },
  { id: 'audit', title: 'Ревизия', start: '2026-09-04T14:00', end: '2026-09-04T15:00', calendarId: 'work', readOnly: true },
]

/**
 * Шесть событий, пересекающихся ОДНОВРЕМЕННО, — и случай живёт в виде НЕДЕЛИ.
 *
 * Первая редакция ставила его в вид дня и цепочкой со сдвигом: колонка дня
 * шириной под тысячу пикселей делила её на четыре по 242 px, и случай не
 * упирался ни во что. В неделе шесть колонок рядом требуют от трека среды
 * `6 × min-w` — он шире соседних дней, а на узком контейнере неделя уходит в
 * горизонтальную прокрутку (DS-328). Лесенки с наездом больше нет.
 */
const DENSE: EventCalendarEvent[] = Array.from({ length: 6 }, (_, i) => ({
  id: `d${i}`,
  title: `Встреча ${i + 1}`,
  start: `2026-09-02T${String(9 + Math.floor(i / 4)).padStart(2, '0')}:${['00', '15', '30', '45'][i % 4]}`,
  end: `2026-09-02T13:00`,
  calendarId: CALENDARS[i % 3]!.id,
}))

/**
 * Пять суточных событий на ОДИН И ТОТ ЖЕ диапазон: только так пояс упирается в
 * потолок. Со сдвигом по дню — как было в первой редакции — они укладываются в
 * две дорожки, потолок в три не достигается, и случай показывает пять спокойных
 * полос вместо переполнения, ради которого заведён.
 */
const CROWDED_BAND: EventCalendarEvent[] = Array.from({ length: 5 }, (_, i) => ({
  id: `b${i}`,
  title: `Отпуск ${i + 1}`,
  start: '2026-09-02T00:00',
  end: '2026-09-05T00:00',
  allDay: true,
  calendarId: CALENDARS[i % 3]!.id,
}))

interface Props {
  events: EventCalendarEvent[]
  view: EventCalendarView
  slot: 15 | 30 | 60
  allDayRows: number
  monthChips: number
  withCalendars: boolean
  readOnly: boolean
  pending: boolean
}

/**
 * Состояние держит фикстура: компонент контролируемый, и без хозяина состояния
 * перенос выглядел бы сломанным — ручка звучит, положение не меняется.
 */
function Live({ events, withCalendars, pending, ...rest }: Props) {
  const [list, setList] = useState(events)
  const [view, setView] = useState<EventCalendarView>(rest.view)
  // Крутилка `view` до компонента не доходила: вид держит эта обёртка, и её
  // состояние, взятое из пропа один раз, дальше жило само по себе. Стенд, где
  // крутилка ничего не делает, врёт о компоненте, а не о себе.
  useEffect(() => setView(rest.view), [rest.view])
  const [date, setDate] = useState('2026-09-02')
  const [hidden, setHidden] = useState<string[]>([])

  return (
    <EventCalendar
      events={list}
      view={view}
      date={date}
      slot={rest.slot}
      allDayRows={rest.allDayRows}
      monthChips={rest.monthChips}
      readOnly={rest.readOnly}
      pendingIds={pending ? ['plan'] : undefined}
      calendars={withCalendars ? CALENDARS : undefined}
      hiddenCalendars={hidden}
      onToggleCalendar={(id) =>
        setHidden((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
      workHours={['08:00', '20:00']}
      onViewChange={setView}
      onDateChange={setDate}
      onToday={() => setDate('2026-09-02')}
      onEventChange={(id, next) =>
        setList((prev) => prev.map((e) => (e.id === id ? { ...e, ...next } : e)))}
      onEventCreate={(draft) =>
        setList((prev) => [...prev, { id: `new-${prev.length}`, title: 'Новое событие', ...draft, calendarId: 'work' }])}
    />
  )
}

export default defineFixture<Props>({
  name: 'EventCalendar',
  group: 'Данные',
  kind: 'block',

  props: {
    events: WEEK,
    view: 'week',
    slot: 30,
    allDayRows: 3,
    monthChips: 3,
    withCalendars: true,
    readOnly: false,
    pending: false,
  },

  controls: {
    view: { kind: 'enum', values: ['day', 'week', 'month'], prop: true },
    slot: { kind: 'enum', values: ['15', '30', '60'], numeric: true, prop: true },
    allDayRows: { kind: 'number', min: 1, max: 6, prop: true },
    monthChips: { kind: 'number', min: 1, max: 6, prop: true },
    readOnly: { kind: 'bool', prop: true },
    // Пропа `pending` нет: у компонента это `pendingIds`, список, а не флаг.
    pending: { kind: 'bool', prop: false },
    // `events` и `calendars` крутилок не получают — данные, а не настройки.
    withCalendars: { kind: 'bool', prop: false },
  },

  cases: [
    {
      id: 'week',
      title: 'Неделя',
      note:
        'Основной вид. Ночной разбор пересекает полночь и потому лежит в поясе, ' +
        'а не в сетке: сегментами по колонкам он конкурировал бы за ширину с ' +
        'обычными встречами дня. Сетка всегда полные сутки, приглушены только ' +
        'нерабочие часы — обрезанный день молча терял бы ночные события.',
      props: { view: 'week' },
      tinyTargets:
        'Высота слота сетки — шаг временной шкалы; раздуть слот до пола 24 '
        + 'значило бы изменить саму шкалу времени, а не размер кнопки — SC 2.5.8 «essential».',
    },
    {
      id: 'dense',
      title: 'Плотный кластер: колонки рядом',
      note:
        'Шесть событий цепочкой — шесть колонок РЯДОМ, без наезда: у каждого ' +
        'вся коробка своя, клик по любому углу открывает именно его. Пол ' +
        'ширины держит трек дня — он не уже шести минимумов события, поэтому ' +
        'среда шире соседних дней, а на узком экране неделя листается вбок. ' +
        'Наведите курсор — название раскрывается вправо поверх соседа.',
      props: { events: DENSE, view: 'week' },
      tinyTargets:
        'Высота слота сетки — шаг временной шкалы; раздуть слот до пола 24 '
        + 'значило бы изменить саму шкалу времени, а не размер кнопки — SC 2.5.8 «essential».',
    },
    {
      id: 'band',
      title: 'Пояс сверх потолка',
      note:
        'Пять суточных событий при allDayRows=3. Последняя строка отдана ' +
        'счётчику, то есть видимых полос на одну меньше, чем строк — цена ' +
        'честного «есть ещё». Без потолка пояс вытолкнул бы сетку за экран. ' +
        'Крутилка allDayRows меняет потолок: на 5 счётчик исчезает.',
      props: { events: CROWDED_BAND, view: 'week' },
      tinyTargets:
        'Высота слота сетки — шаг временной шкалы; раздуть слот до пола 24 '
        + 'значило бы изменить саму шкалу времени, а не размер кнопки — SC 2.5.8 «essential».',
    },
    {
      id: 'month',
      title: 'Месяц',
      note:
        'Многодневное событие идёт полосой через недели, а не чипом в каждой ' +
        'клетке: иначе трёхдневная командировка читалась бы как три разных ' +
        'дела. Порог чипов — число, а не замер высоты клетки: ResizeObserver в ' +
        'фоновой вкладке не приходит вовсе и оставляет числа монтажными.',
      props: { view: 'month' },
    },
    {
      id: 'pending',
      title: 'Событие в полёте',
      note:
        '«Планёрка» помечена pendingIds: изменение ушло на сервер и не ' +
        'вернулось. Приглушена, aria-busy, жест на ней не начинается — ни ' +
        'мышью, ни Space. Попробуйте взять её с клавиатуры: отказ ГОВОРИТ ' +
        'через role=status, потому что молчание неотличимо от сломанной клавиши.',
      props: { pending: true },
      shows: ['[aria-busy="true"]'],
      tinyTargets:
        'Высота слота сетки — шаг временной шкалы; раздуть слот до пола 24 '
        + 'значило бы изменить саму шкалу времени, а не размер кнопки — SC 2.5.8 «essential».',
    },
    {
      id: 'readonly',
      title: 'Только чтение',
      note:
        'readOnly гасит все жесты разом. Ручки при этом остаются: клик по ' +
        'событию работает, потому что выбор — не изменение.',
      props: { readOnly: true },
      tinyTargets:
        'Высота слота сетки — шаг временной шкалы; раздуть слот до пола 24 '
        + 'значило бы изменить саму шкалу времени, а не размер кнопки — SC 2.5.8 «essential».',
    },
  ],

  render: (p) => <Live {...p} />,
})
