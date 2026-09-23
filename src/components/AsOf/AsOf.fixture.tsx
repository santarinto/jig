import { defineFixture } from '../../internal/fixture.js'
import { AsOf } from './AsOf.js'

/**
 * «Сегодня» здесь — КОНСТАНТА, а не `new Date()`. Компонент нарочно не носит
 * часов внутри (см. `AsOfStale.today`), и фикстура обязана держать тот же
 * договор: часы в примере сделали бы кадр разным в разные дни, а значит
 * несравнимым со вчерашним снимком и бесполезным в споре о том, что изменилось.
 */
const TODAY = '2026-08-29'

interface Props {
  date: string
  label: string
  afterDays: number
  stale: boolean
  staleLabel: string
}

export default defineFixture<Props>({
  name: 'AsOf',
  group: 'Данные',
  kind: 'inline',

  props: {
    date: '2026-08-28',
    label: 'на',
    afterDays: 7,
    stale: true,
    staleLabel: 'устарело',
  },

  controls: {
    date: { kind: 'text', prop: true },
    label: { kind: 'text', prop: true },
    afterDays: { kind: 'number', min: 1, max: 365, prop: false },
    stale: { kind: 'bool', prop: false },
    staleLabel: { kind: 'text', prop: true },
  },

  data: {
    // Пустая дата: компонент МОЛЧИТ. Это нужно при встраивании в Money, где
    // значения может не быть, и отличается от «дата есть, но нечитаемая».
    empty: { date: '' },
    // Нечитаемая строка показывается КАК ЕСТЬ и возраст по ней не считается:
    // подменить её пустотой значило бы соврать, что даты и не было.
    broken: { date: 'вчера вечером' },
    fresh: { date: TODAY },
    old: { date: '2026-06-01' },
  },

  cases: [
    {
      id: 'base',
      title: 'Обычная',
      note: `Вчерашняя дата при пороге 7 дней. «Сегодня» задано ${TODAY} — часов внутри компонента нет.`,
    },
    {
      id: 'ladder',
      title: 'Лестница возрастов',
      note: 'Одна дата ничего не утверждает: свежесть — это СРАВНЕНИЕ. Пять подписей'
        + ' разного возраста при одном пороге; переход в предупреждающий тон должен'
        + ' быть виден ровно между четвёртой и пятой.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {['2026-08-29', '2026-08-27', '2026-08-24', '2026-08-22', '2026-07-30'].map((d) => (
            <AsOf key={d} date={d} label={p.label} stale={{ afterDays: p.afterDays, today: TODAY }} />
          ))}
        </div>
      ),
    },
    {
      id: 'not-only-colour',
      title: 'Устарело — словом, не только цветом',
      props: { date: '2026-07-30' },
      note: 'Признак устаревания говорится СЛОВОМ и числом дней. Одним цветом его'
        + ' выразить нельзя: в монохромной печати и при дальтонизме предупреждение'
        + ' исчезло бы, а подпись осталась бы выглядеть обычной.',
    },
    {
      id: 'no-threshold',
      title: 'Без порога',
      props: { stale: false },
      note: 'Порога нет — компонент просто показывает дату и НИКОГДА не предупреждает.'
        + ' Порог и «сегодня» приходят одним объектом именно поэтому: «задал порог,'
        + ' забыл дату» молча значило бы то же самое, но выглядело бы как работа.',
    },
    {
      id: 'broken-date',
      title: 'Нечитаемая дата',
      props: { date: 'вчера вечером' },
      note: 'Строка, не разобравшаяся как ISO, показывается как есть, и возраст по'
        + ' ней не считается. Пустота на её месте была бы хуже: пустоту принимают'
        + ' за «даты и не было», а не за «дата пришла кривой».',
    },
    {
      id: 'in-line',
      title: 'Рядом с величиной',
      note: 'Так подпись и живёт — хвостом к числу. Проверка кегля и базовой линии:'
        + ' подпись не должна спорить с величиной за внимание.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div>
            <strong style={{ fontSize: 'var(--ds-fs-xl)' }}>284 900,00 ₽</strong>{' '}
            <AsOf date="2026-08-28" label="остаток на" stale={{ afterDays: p.afterDays, today: TODAY }} />
          </div>
          <div>
            <strong style={{ fontSize: 'var(--ds-fs-xl)' }}>92,4517</strong>{' '}
            <AsOf date="2026-07-30" label="курс от" stale={{ afterDays: p.afterDays, today: TODAY }} />
          </div>
        </div>
      ),
    },
  ],

  render: (p) => (
    <AsOf
      date={p.date}
      label={p.label || undefined}
      staleLabel={p.staleLabel || undefined}
      stale={p.stale ? { afterDays: p.afterDays, today: TODAY } : undefined}
    />
  ),
})
