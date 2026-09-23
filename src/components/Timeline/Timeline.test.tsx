import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Timeline } from './Timeline.js'
import type { TimelineEvent } from './Timeline.js'

const events: TimelineEvent[] = [
  { id: 'e1', ts: '2026-07-27T09:15:00+03:00', kind: 'status', body: 'В работе' },
  { id: 'e2', ts: '2026-07-27T11:40:00+03:00', kind: 'block', author: { name: 'worker-3', kind: 'agent' }, body: 'ждём ответа заказчика' },
  { id: 'e3', ts: '2026-07-27T18:02:00+03:00', kind: 'note', author: { name: 'Пётр' }, body: 'созвонились' },
]

const labels = { status: 'Статус', block: 'Заблокирована задачей', note: 'Заметка' }

describe('Timeline', () => {
  it('рисует упорядоченный список и сохраняет порядок событий', () => {
    const { container } = render(<Timeline events={events} labels={labels} groupByDay={false} />)
    expect(container.querySelector('ol')).toBeInTheDocument()
    const items = container.querySelectorAll('.ds-timeline__item')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('В работе')
    expect(items[2]).toHaveTextContent('созвонились')
  })

  it('берёт подпись типа из labels, а не придумывает её', () => {
    render(<Timeline events={events} labels={labels} groupByDay={false} />)
    expect(screen.getByText('Заблокирована задачей')).toBeInTheDocument()
  })

  it('показывает сырой kind, когда ключа в labels нет — дырку видно, а не спрятано', () => {
    render(<Timeline events={events} labels={{ status: 'Статус' }} groupByDay={false} />)
    expect(screen.getByText('block')).toBeInTheDocument()
  })

  it('красит маркер по карте тонов, неизвестный kind даёт neutral', () => {
    const { container } = render(
      <Timeline events={events} labels={labels} tones={{ status: 'info' }} groupByDay={false} />,
    )
    const markers = container.querySelectorAll('.ds-timeline__marker')
    expect(markers[0]).toHaveClass('ds-timeline__marker--info')
    expect(markers[1]).toHaveClass('ds-timeline__marker--neutral')
  })

  it('прячет маркер от скринридера — тип уже назван текстом', () => {
    const { container } = render(<Timeline events={events} labels={labels} groupByDay={false} />)
    expect(container.querySelector('.ds-timeline__marker')).toHaveAttribute('aria-hidden', 'true')
  })

  it('различает воркера и человека тоном бейджа', () => {
    const { container } = render(<Timeline events={events} labels={labels} groupByDay={false} />)
    const badges = container.querySelectorAll('.ds-timeline__author')
    expect(badges[0]).toHaveClass('ds-badge--accent')
    expect(badges[1]).toHaveClass('ds-badge--neutral')
  })

  it('даёт машиночитаемую метку времени', () => {
    const { container } = render(<Timeline events={events} labels={labels} groupByDay={false} />)
    expect(container.querySelector('time')).toHaveAttribute('dateTime', '2026-07-27T09:15:00+03:00')
  })

  it('рендерит тело как узел — там проза потребителя', () => {
    render(
      <Timeline
        events={[{ id: 'x', ts: '2026-07-27T09:15:00+03:00', kind: 'note', body: <em>курсив</em> }]}
        labels={{ note: 'Заметка' }}
        groupByDay={false}
      />,
    )
    expect(screen.getByText('курсив').tagName).toBe('EM')
  })

  it('не падает на неразбираемой дате — показывает сырое значение', () => {
    render(
      <Timeline
        events={[{ id: 'x', ts: 'не-дата', kind: 'note', body: 'тело' }]}
        labels={{ note: 'Заметка' }}
        groupByDay={false}
      />,
    )
    expect(screen.getByText('не-дата')).toBeInTheDocument()
  })

  it('dense вешает модификатор на корень', () => {
    const { container } = render(<Timeline events={events} labels={labels} dense groupByDay={false} />)
    expect(container.querySelector('ol')).toHaveClass('ds-timeline--dense')
  })

  const twoDays: TimelineEvent[] = [
    { id: 'a', ts: '2026-07-27T09:15:00+03:00', kind: 'note', body: 'первый день' },
    { id: 'b', ts: '2026-07-27T18:02:00+03:00', kind: 'note', body: 'тот же день' },
    { id: 'c', ts: '2026-07-28T10:00:00+03:00', kind: 'note', body: 'следующий день' },
  ]

  it('ставит разделитель на смене дня и не ставит внутри дня', () => {
    const { container } = render(
      <Timeline events={twoDays} labels={{ note: 'Заметка' }} formatDay={(ts) => ts.slice(0, 10)} />,
    )
    const days = container.querySelectorAll('.ds-timeline__day')
    expect(days).toHaveLength(2)
    expect(days[0]).toHaveTextContent('2026-07-27')
    expect(days[1]).toHaveTextContent('2026-07-28')
  })

  it('разделитель стоит перед своей группой, а не после неё', () => {
    const { container } = render(
      <Timeline events={twoDays} labels={{ note: 'Заметка' }} formatDay={(ts) => ts.slice(0, 10)} />,
    )
    const rows = Array.from(container.querySelectorAll('li'))
    expect(rows[0]).toHaveClass('ds-timeline__day')
    expect(rows[1]).toHaveTextContent('первый день')
  })

  it('groupByDay=false не рисует ни одного разделителя', () => {
    const { container } = render(
      <Timeline events={twoDays} labels={{ note: 'Заметка' }} groupByDay={false} />,
    )
    expect(container.querySelectorAll('.ds-timeline__day')).toHaveLength(0)
  })

  it('не сортирует: неупорядоченные данные дают повтор даты, а не тихую перестановку', () => {
    const shuffled = [twoDays[0], twoDays[2], twoDays[1]]
    const { container } = render(
      <Timeline events={shuffled} labels={{ note: 'Заметка' }} formatDay={(ts) => ts.slice(0, 10)} />,
    )
    const days = Array.from(container.querySelectorAll('.ds-timeline__day')).map((d) => d.textContent)
    expect(days).toEqual(['2026-07-27', '2026-07-28', '2026-07-27'])
    const bodies = Array.from(container.querySelectorAll('.ds-timeline__body')).map((b) => b.textContent)
    expect(bodies).toEqual(['первый день', 'следующий день', 'тот же день'])
  })

  it('ключ группировки — результат formatDay: своя зона двигает границу суток вместе с подписью', () => {
    const lateNight: TimelineEvent[] = [
      { id: 'a', ts: '2026-07-27T23:40:00+03:00', kind: 'note', body: 'поздно' },
      { id: 'b', ts: '2026-07-28T00:20:00+03:00', kind: 'note', body: 'за полночь' },
    ]
    // Формат, который считает сутки начинающимися в полдень: два события
    // оказываются в одной группе, и заголовок совпадает с этой группировкой.
    const noonToNoon = (ts: string) => {
      const d = new Date(ts)
      d.setUTCHours(d.getUTCHours() - 12)
      return d.toISOString().slice(0, 10)
    }
    const { container } = render(
      <Timeline events={lateNight} labels={{ note: 'Заметка' }} formatDay={noonToNoon} />,
    )
    const days = container.querySelectorAll('.ds-timeline__day')
    expect(days).toHaveLength(1)
    expect(days[0]).toHaveTextContent(noonToNoon(lateNight[0].ts))
  })

  it('дефолт времени меняется вместе с groupByDay', () => {
    const one: TimelineEvent[] = [{ id: 'a', ts: '2026-07-27T09:15:00+03:00', kind: 'note', body: 'тело' }]
    const grouped = render(<Timeline events={one} labels={{ note: 'Заметка' }} />)
    const groupedTime = grouped.container.querySelector('.ds-timeline__time')!.textContent!
    grouped.unmount()
    const flat = render(<Timeline events={one} labels={{ note: 'Заметка' }} groupByDay={false} />)
    const flatTime = flat.container.querySelector('.ds-timeline__time')!.textContent!
    // Без заголовка дня метка обязана нести дату, иначе она двусмысленна.
    expect(flatTime.length).toBeGreaterThan(groupedTime.length)
    expect(flatTime).toContain('2026')
    expect(groupedTime).not.toContain('2026')
  })
})
