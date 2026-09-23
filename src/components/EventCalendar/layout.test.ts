import { describe, it, expect } from 'vitest'
import { allDayBand, autoScrollStep, dayChips, dayColumns, daySegments, monthGrid, placeDay, segmentStyle, shiftDay, snapMinutes, type EventCalendarEvent } from './layout.js'

/**
 * Табличные кейсы модели раскладки. Ради них и делался вынос из компонента:
 * пересечения, сегменты суток и snap иначе проверялись бы только через рендер
 * и pointer-события, где утверждение про арифметику неотличимо от утверждения
 * про jsdom (DS-29, спека — ревизия 2).
 */

const ev = (id: string, start: string, end: string, rest: Partial<EventCalendarEvent> = {}): EventCalendarEvent =>
  ({ id, title: id, start, end, ...rest })

describe('daySegments', () => {
  it('событие внутри суток даёт один сегмент в минутах от полуночи', () => {
    expect(daySegments(ev('a', '2026-09-02T09:30', '2026-09-02T11:00'))).toEqual([
      { eventId: 'a', day: '2026-09-02', from: 570, to: 660, continuesBefore: false, continuesAfter: false },
    ])
  })

  it('многодневное режется по границам суток с флагами продолжения', () => {
    expect(daySegments(ev('a', '2026-09-02T22:00', '2026-09-04T03:00'))).toEqual([
      { eventId: 'a', day: '2026-09-02', from: 1320, to: 1440, continuesBefore: false, continuesAfter: true },
      { eventId: 'a', day: '2026-09-03', from: 0, to: 1440, continuesBefore: true, continuesAfter: true },
      { eventId: 'a', day: '2026-09-04', from: 0, to: 180, continuesBefore: true, continuesAfter: false },
    ])
  })

  it('событие, кончающееся ровно в полночь, не порождает пустой сегмент', () => {
    expect(daySegments(ev('a', '2026-09-02T22:00', '2026-09-03T00:00'))).toEqual([
      { eventId: 'a', day: '2026-09-02', from: 1320, to: 1440, continuesBefore: false, continuesAfter: false },
    ])
  })
})

describe('placeDay — колонки внутри кластера', () => {
  const cols = (evs: EventCalendarEvent[], day = '2026-09-02') =>
    placeDay(evs, day).map((p) => [p.eventId, p.column, p.columns])

  it('стык не считается пересечением: конец исключающий', () => {
    expect(cols([
      ev('a', '2026-09-02T09:00', '2026-09-02T10:00'),
      ev('b', '2026-09-02T10:00', '2026-09-02T11:00'),
    ])).toEqual([['a', 0, 1], ['b', 0, 1]])
  })

  it('пересечение делит ширину пополам', () => {
    expect(cols([
      ev('a', '2026-09-02T09:00', '2026-09-02T11:00'),
      ev('b', '2026-09-02T10:00', '2026-09-02T12:00'),
    ])).toEqual([['a', 0, 2], ['b', 1, 2]])
  })

  it('цепочка из трёх укладывается в две колонки: c встаёт на место a', () => {
    expect(cols([
      ev('a', '2026-09-02T09:00', '2026-09-02T11:00'),
      ev('b', '2026-09-02T10:00', '2026-09-02T12:00'),
      ev('c', '2026-09-02T11:00', '2026-09-02T13:00'),
    ])).toEqual([['a', 0, 2], ['b', 1, 2], ['c', 0, 2]])
  })

  it('порядок входа не влияет: третий ключ сортировки — id', () => {
    const evs = [
      ev('b', '2026-09-02T09:00', '2026-09-02T10:00'),
      ev('a', '2026-09-02T09:00', '2026-09-02T10:00'),
    ]
    expect(cols(evs)).toEqual([['a', 0, 2], ['b', 1, 2]])
    expect(cols([...evs].reverse())).toEqual([['a', 0, 2], ['b', 1, 2]])
  })

  it('длинное событие идёт первым при равном начале', () => {
    expect(cols([
      ev('short', '2026-09-02T09:00', '2026-09-02T10:00'),
      ev('long', '2026-09-02T09:00', '2026-09-02T12:00'),
    ])).toEqual([['long', 0, 2], ['short', 1, 2]])
  })
})

/**
 * Даты перехода на летнее/зимнее время. Под `TZ=UTC` этот блок ничего не
 * проверяет — он для второго прогона (`npm run test:tz`, `TZ=America/New_York`),
 * где 2026-03-08 длится 23 часа, а 2026-11-01 — 25.
 *
 * Краснеет ровно на одном классе правок: миллисекундной арифметике вместо
 * календарной. `+86400000` в 25-часовые сутки не доводит до следующего дня —
 * сегмент дублируется, а под мутацию в другую сторону день теряется.
 */
describe('переход на летнее время не виден модели', () => {
  it('сдвиг дня переваливает через 25-часовые сутки', () => {
    expect(shiftDay('2026-11-01', 1)).toBe('2026-11-02')
  })

  it('сдвиг дня переваливает через 23-часовые сутки', () => {
    expect(shiftDay('2026-03-08', 1)).toBe('2026-03-09')
  })

  it('сдвиг назад переходит через границу года', () => {
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('событие через 25-часовые сутки режется на три дня', () => {
    expect(daySegments(ev('a', '2026-10-31T22:00', '2026-11-02T03:00')).map((s) => s.day))
      .toEqual(['2026-10-31', '2026-11-01', '2026-11-02'])
  })

  it('событие через 23-часовые сутки режется на три дня', () => {
    expect(daySegments(ev('a', '2026-03-07T22:00', '2026-03-09T03:00')).map((s) => s.day))
      .toEqual(['2026-03-07', '2026-03-08', '2026-03-09'])
  })
})

describe('segmentStyle — геометрия в процентах от суток', () => {
  it('час с половиной от 09:30 в одной колонке из двух', () => {
    expect(segmentStyle({ from: 570, to: 660, column: 0, columns: 2 })).toEqual({
      top: '39.5833%', height: '6.25%', left: '0%', width: '50%',
    })
  })

  it('колонки кластера стоят РЯДОМ: левый край каждой — ровно правый край предыдущей', () => {
    // Лесенки нет (DS-328): прежний `min(доля, шаг)` клал события
    // внахлёст, и угол одного лежал под соседом. Пол ширины держит трек дня.
    const boxes = [0, 1, 2].map((column) => segmentStyle({ from: 0, to: 1440, column, columns: 3 }))
    expect(boxes.map((b) => b.left)).toEqual(['0%', '33.3333%', '66.6667%'])
    expect(boxes.every((b) => b.width === '33.3333%')).toBe(true)
  })

  it('единственная колонка остаётся долей, без деления на ноль', () => {
    expect(segmentStyle({ from: 0, to: 1440, column: 0, columns: 1 }).left).toBe('0%')
  })
})

describe('dayColumns — пол трека дня', () => {
  it('наибольшее число колонок среди кластеров дня, а не сумма и не последнее', () => {
    const placed = placeDay([
      { id: 'a', title: 'a', start: '2026-09-02T09:00', end: '2026-09-02T10:00' },
      { id: 'b', title: 'b', start: '2026-09-02T09:30', end: '2026-09-02T10:30' },
      { id: 'c', title: 'c', start: '2026-09-02T09:45', end: '2026-09-02T10:15' },
      { id: 'd', title: 'd', start: '2026-09-02T14:00', end: '2026-09-02T15:00' },
    ], '2026-09-02')
    expect(dayColumns(placed)).toBe(3)
  })

  it('пустой день — одна колонка: трек не схлопывается', () => {
    expect(dayColumns([])).toBe(1)
  })
})

describe('snapMinutes', () => {
  it('тянет к ближайшему шагу, а не вниз', () => {
    expect(snapMinutes(586, 30)).toBe(600)
  })

  it('ровно половина шага уходит вверх', () => {
    expect(snapMinutes(585, 30)).toBe(600)
  })

  it('чуть меньше половины остаётся внизу', () => {
    expect(snapMinutes(584, 30)).toBe(570)
  })
})

describe('allDayBand — пояс суточных и многодневных', () => {
  const week = ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']
  const bars = (evs: EventCalendarEvent[], rows = 3) =>
    allDayBand(evs, week, rows).bars.map((b) => [b.eventId, b.fromIndex, b.toIndex, b.lane])

  it('суточное событие занимает одну колонку', () => {
    expect(bars([ev('a', '2026-09-02T00:00', '2026-09-03T00:00', { allDay: true })]))
      .toEqual([['a', 2, 2, 0]])
  })

  it('многодневное тянется через колонки без allDay', () => {
    expect(bars([ev('a', '2026-09-02T22:00', '2026-09-04T03:00')]))
      .toEqual([['a', 2, 4, 0]])
  })

  it('пересекающиеся полосы встают в разные строки', () => {
    expect(bars([
      ev('a', '2026-09-01T00:00', '2026-09-04T00:00', { allDay: true }),
      ev('b', '2026-09-03T00:00', '2026-09-06T00:00', { allDay: true }),
    ])).toEqual([['a', 1, 3, 0], ['b', 3, 5, 1]])
  })

  it('непересекающиеся полосы делят одну строку', () => {
    expect(bars([
      ev('a', '2026-08-31T00:00', '2026-09-02T00:00', { allDay: true }),
      ev('b', '2026-09-03T00:00', '2026-09-05T00:00', { allDay: true }),
    ])).toEqual([['a', 0, 1, 0], ['b', 3, 4, 0]])
  })

  it('событие, начавшееся до диапазона, обрезается и помечается', () => {
    const band = allDayBand([ev('a', '2026-08-28T00:00', '2026-09-02T00:00', { allDay: true })], week, 3)
    expect(band.bars).toEqual([
      { eventId: 'a', fromIndex: 0, toIndex: 1, lane: 0, continuesBefore: true, continuesAfter: false },
    ])
  })

  it('сверх потолка последняя строка отдаётся счётчику', () => {
    const many = [1, 2, 3, 4, 5].map((n) =>
      ev(`e${n}`, '2026-09-02T00:00', '2026-09-03T00:00', { allDay: true }))
    const band = allDayBand(many, week, 3)
    expect(band.bars.map((b) => b.eventId)).toEqual(['e1', 'e2'])
    expect(band.hidden[2]).toBe(3)
  })

  it('ровно потолок показывается целиком, без счётчика', () => {
    const three = [1, 2, 3].map((n) =>
      ev(`e${n}`, '2026-09-02T00:00', '2026-09-03T00:00', { allDay: true }))
    const band = allDayBand(three, week, 3)
    expect(band.bars.map((b) => b.eventId)).toEqual(['e1', 'e2', 'e3'])
    expect(band.hidden[2]).toBe(0)
  })
})

describe('placeDay не берёт то, что ушло в пояс', () => {
  it('многодневное событие в сетку не попадает', () => {
    expect(placeDay([ev('a', '2026-09-02T22:00', '2026-09-04T03:00')], '2026-09-02')).toEqual([])
  })
})

describe('monthGrid — недели месяца с понедельника', () => {
  it('сентябрь 2026 начинается со вторника, значит первая неделя тянет 31 августа', () => {
    const weeks = monthGrid('2026-09-15')
    expect(weeks[0]![0]).toBe('2026-08-31')
    expect(weeks[0]![1]).toBe('2026-09-01')
  })

  it('последняя неделя добирается до воскресенья, захватывая октябрь', () => {
    const weeks = monthGrid('2026-09-15')
    expect(weeks[weeks.length - 1]![6]).toBe('2026-10-04')
  })

  it('каждая неделя ровно из семи дней', () => {
    expect(monthGrid('2026-09-15').every((w) => w.length === 7)).toBe(true)
  })
})

describe('dayChips — чипы в клетке месяца', () => {
  const at = (id: string, time: string) => ev(id, `2026-09-02T${time}`, `2026-09-02T23:00`)

  it('чипы идут по времени, а не по порядку входа', () => {
    const { chips } = dayChips([at('late', '18:00'), at('early', '09:00')], '2026-09-02', 3)
    expect(chips).toEqual(['early', 'late'])
  })

  it('сверх потолка остальное уходит в счётчик', () => {
    const many = ['09:00', '10:00', '11:00', '12:00', '13:00'].map((t, i) => at(`e${i}`, t))
    const { chips, hidden } = dayChips(many, '2026-09-02', 3)
    expect(chips).toHaveLength(3)
    expect(hidden).toBe(2)
  })

  it('ровно потолок обходится без счётчика', () => {
    const three = ['09:00', '10:00', '11:00'].map((t, i) => at(`e${i}`, t))
    expect(dayChips(three, '2026-09-02', 3).hidden).toBe(0)
  })
})

describe('autoScrollStep — шаг автопрокрутки у края', () => {
  const rect = { top: 100, bottom: 500 }

  it('в середине не прокручивает', () => {
    expect(autoScrollStep(300, rect)).toBe(0)
  })

  it('у нижнего края тянет вниз тем сильнее, чем ближе', () => {
    expect(autoScrollStep(495, rect)).toBeGreaterThan(autoScrollStep(480, rect))
  })

  it('у верхнего края тянет вверх', () => {
    expect(autoScrollStep(105, rect)).toBeLessThan(0)
  })

  it('за границей не разгоняется сверх предела', () => {
    expect(autoScrollStep(9999, rect)).toBe(autoScrollStep(500, rect))
  })
})
