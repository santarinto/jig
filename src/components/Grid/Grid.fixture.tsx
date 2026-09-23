import { defineFixture } from '../../internal/fixture.js'
import { Grid } from './Grid.js'
import type { StackGap } from '../Stack/Stack.js'

const cell = (n: number) => (
  <div
    key={n}
    style={{
      padding: '0.5rem',
      background: 'var(--ds-surface-subtle)',
      border: '1px solid var(--ds-border)',
      borderRadius: '4px',
      fontSize: 'var(--ds-fs-sm)',
      textAlign: 'center',
    }}
  >
    {n}
  </div>
)

const cells = (n: number) => Array.from({ length: n }, (_, i) => cell(i + 1))

interface Props {
  columns: number
  minColumnWidth: string
  gap: number
  count: number
}

export default defineFixture<Props>({
  name: 'Grid',
  group: 'Раскладка',
  kind: 'block',

  props: { columns: 4, minColumnWidth: '', gap: 3, count: 8 },

  controls: {
    columns: { kind: 'number', min: 1, max: 12, prop: true },
    // Строка, а не число: проп принимает любую CSS-длину (`12rem`, `160px`,
    // `20ch`), и крутилка со стрелками навязала бы пиксели.
    minColumnWidth: { kind: 'text', prop: true },
    gap: { kind: 'number', min: 0, max: 8, prop: true },
    count: { kind: 'number', min: 1, max: 24, prop: false },
  },

  data: {
    // Адаптивные колонки: число считает браузер. Перекрывает `columns` — и
    // это надо УВИДЕТЬ, иначе выставленные разом оба выглядят работающими оба.
    auto: { minColumnWidth: '12rem', count: 9 },
    // Одна колонка: вырожденная сетка. Отличить её от стопки нельзя глазом,
    // и это нормально — разница в том, что будет при следующей ширине.
    single: { columns: 1, count: 4 },
    dense: { count: 24, gap: 1 },
  },

  cases: [
    {
      id: 'base',
      title: 'Четыре колонки',
      note: 'Равные колонки: `repeat(4, minmax(0, 1fr))`. `minmax(0, …)`, а не'
        + ' просто `1fr`, — иначе длинное содержимое одной ячейки распирает колонку'
        + ' и ломает равенство, которое сетка обещала.',
    },
    {
      id: 'adaptive',
      title: 'Адаптивные колонки',
      props: { minColumnWidth: '12rem', count: 9 },
      note: 'Задана минимальная ширина ЯЧЕЙКИ, число колонок считает браузер.'
        + ' Смотреть надо в виде «Сетка» (четыре ширины разом) или тянуть ширину'
        + ' кадра: на одной ширине этот режим неотличим от фиксированных колонок.',
    },
    {
      id: 'keep-empty-tracks',
      title: 'auto-fit против auto-fill',
      note: 'Два ребёнка в ряду, куда влезает шесть треков. Сверху умолчание'
        + ' (`auto-fit`): пустые треки схлопываются, дети занимают ряд. Снизу'
        + ' `keepEmptyTracks` (`auto-fill`): треки стоят, дети остаются шириной в'
        + ' шестую часть, остальное — воздух. Разница видна ТОЛЬКО когда детей'
        + ' меньше, чем влезает треков: на полном ряду оба режима неотличимы, и'
        + ' именно поэтому дефект жил незамеченным (DS-136).',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <code style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-muted)' }}>
              minColumnWidth=8rem
            </code>
            <Grid minColumnWidth="8rem" gap={p.gap as StackGap}>{cells(2)}</Grid>
          </div>
          <div>
            <code style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-muted)' }}>
              minColumnWidth=8rem + keepEmptyTracks
            </code>
            <Grid minColumnWidth="8rem" keepEmptyTracks gap={p.gap as StackGap}>{cells(2)}</Grid>
          </div>
        </div>
      ),
    },
    {
      id: 'overrides',
      title: 'minColumnWidth перекрывает columns',
      note: 'Оба пропа заданы одновременно — это законно и молча решается в пользу'
        + ' адаптивных. Случай заведён потому, что «задал и не сработало» выглядит'
        + ' как поломка компонента, а на самом деле это его правило.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <code style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-muted)' }}>columns=6</code>
            <Grid columns={6} gap={p.gap as StackGap}>{cells(6)}</Grid>
          </div>
          <div>
            <code style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-muted)' }}>
              columns=6 + minColumnWidth=12rem
            </code>
            <Grid columns={6} minColumnWidth="12rem" gap={p.gap as StackGap}>{cells(6)}</Grid>
          </div>
        </div>
      ),
    },
    {
      id: 'template',
      title: 'Явный шаблон',
      note: '`columns` принимает и строку — тогда это дословный'
        + ' `grid-template-columns`. Так делают несимметричные раскладки: боковая'
        + ' колонка фиксированной ширины плюс тянущаяся основная.',
      render: (p) => (
        <Grid columns="minmax(0, 16rem) 1fr" gap={p.gap as StackGap}>
          <div style={{ padding: '0.5rem', border: '1px solid var(--ds-border)', borderRadius: '4px' }}>
            боковая, 16rem
          </div>
          <div style={{ padding: '0.5rem', border: '1px solid var(--ds-border)', borderRadius: '4px' }}>
            основная, остаток
          </div>
        </Grid>
      ),
    },
    {
      id: 'ragged',
      title: 'Неполный последний ряд',
      props: { count: 7, columns: 4 },
      note: 'Семь ячеек на четыре колонки. Последний ряд неполон — и не должен'
        + ' растягивать оставшиеся: сетка держит колонки, а не заполняет строку.',
    },
  ],

  render: (p) => (
    <Grid
      columns={p.minColumnWidth ? undefined : p.columns}
      minColumnWidth={p.minColumnWidth || undefined}
      gap={p.gap as StackGap}
    >
      {cells(Math.max(1, p.count))}
    </Grid>
  ),
})
