import { useState } from 'react'
import { defineFixture } from '../../internal/fixture.js'
import { ToggleGroup, type ToggleItem, type SwatchItem } from './ToggleGroup.js'

const PERIOD: ToggleItem[] = [
  { id: 'day', label: 'День' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'quarter', label: 'Квартал' },
]

const FILTERS: ToggleItem[] = [
  { id: 'new', label: 'Новые', count: 12 },
  { id: 'work', label: 'В работе', count: 4 },
  { id: 'done', label: 'Закрытые', count: 208 },
  { id: 'archive', label: 'Архив', disabled: true },
]

/**
 * Восемь цветов метки — это ВСЯ категориальная палитра системы, и берётся она
 * целиком не для красоты: про `--ds-chart-*` доказано, что любые два различимы,
 * в том числе при трёх видах дальтонизма (`tokens/chartPalette.test.ts`).
 * Восемь хексов в коде страницы такого свойства не имеют и вдобавок не
 * переключаются вместе с темой.
 *
 * Имена — человеческие, а не хексы: имя пункта попадает диктору, а значение
 * цвета именем не является.
 */
const COLOURS: SwatchItem[] = [
  { id: 'c1', label: 'Бирюзовый', swatch: 'var(--ds-chart-1)' },
  { id: 'c2', label: 'Оливковый', swatch: 'var(--ds-chart-2)' },
  { id: 'c3', label: 'Малиновый', swatch: 'var(--ds-chart-3)' },
  { id: 'c4', label: 'Лиловый', swatch: 'var(--ds-chart-4)' },
  { id: 'c5', label: 'Охра', swatch: 'var(--ds-chart-5)' },
  { id: 'c6', label: 'Небесный', swatch: 'var(--ds-chart-6)' },
  { id: 'c7', label: 'Фиалковый', swatch: 'var(--ds-chart-7)' },
  { id: 'c8', label: 'Терракота', swatch: 'var(--ds-chart-8)' },
]

/**
 * Крайние случаи признака выбора: плашка цвета САМОГО ФОНА и плашка предельной
 * светлоты. Ровно на них ломается рамка снаружи — приём, с которого началась
 * DS-245, — потому что она берёт контраст от плашки. Стоят в фикстуре
 * намеренно: приёмка, где все восемь цветов средней светлоты, доказывает
 * меньше, чем кажется.
 *
 * Экстремумы выражены ТОКЕНАМИ, а не литералами `#FFFFFF` / `#0B0B0B`, и это не
 * уступка гейту no-raw-hex, а более сильный случай: литерал остаётся белым в
 * обеих темах и проверяет один экстремум из двух, тогда как `--ds-text-primary`
 * почти чёрен на светлой теме и почти бел на тёмной. Один и тот же случай
 * покрывает оба края, и переключение темы в верстаке их меняет местами.
 */
const EXTREMES: SwatchItem[] = [
  { id: 'ink', label: 'Предельно тёмный', swatch: 'var(--ds-text-primary)' },
  { id: 'surface', label: 'Цвет поверхности', swatch: 'var(--ds-surface)' },
  { id: 'subtle', label: 'Приглушённая поверхность', swatch: 'var(--ds-surface-subtle)' },
  { id: 'accent', label: 'Акцент', swatch: 'var(--ds-accent)' },
]

interface Props {
  mode: 'single' | 'multiple'
  size: 'sm' | 'md'
  variant: 'framed' | 'plain'
  set: 'period' | 'filters'
}

/** Свотч управляем отдельно: у него свой набор и свой смысл выбора. */
function LiveSwatch({ items, label }: { items: SwatchItem[], label: string }) {
  const [value, setValue] = useState(items[0]!.id)
  return (
    <ToggleGroup
      mode="single"
      variant="swatch"
      items={items}
      value={value}
      onChange={setValue}
      aria-label={label}
    />
  )
}

/**
 * Живая обёртка: группа управляемая, и без состояния щелчок ничего не меняет.
 * Неотличимо от «переключатель сломан», хотя сломан пример.
 */
function Live({ mode, items, ...rest }: {
  mode: 'single' | 'multiple'
  items: ToggleItem[]
  size: 'sm' | 'md'
  variant: 'framed' | 'plain'
}) {
  const [one, setOne] = useState(items[0]!.id)
  const [many, setMany] = useState<string[]>([items[0]!.id])
  return mode === 'single' ? (
    <ToggleGroup {...rest} items={items} mode="single" value={one} onChange={setOne} aria-label="Период" />
  ) : (
    <ToggleGroup {...rest} items={items} mode="multiple" value={many} onChange={setMany} aria-label="Фильтры" />
  )
}

export default defineFixture<Props>({
  name: 'ToggleGroup',
  group: 'Управление',
  kind: 'inline',

  props: { mode: 'single', size: 'md', variant: 'framed', set: 'period' },

  controls: {
    mode: { kind: 'enum', values: ['single', 'multiple'], prop: true },
    size: { kind: 'enum', values: ['sm', 'md'], prop: true },
    variant: { kind: 'enum', values: ['framed', 'plain'], prop: true },
    set: { kind: 'enum', values: ['period', 'filters'], prop: false },
  },

  data: {
    // Счётчики и выключенный сегмент разом: у полосы фильтров это норма, а не
    // редкость. Ноль в счётчике показывается — «0» это ответ, а пустота нет.
    filters: { set: 'filters', mode: 'multiple' },
    // Два сегмента: вырожденная группа, которую легко перепутать с тумблером.
    plain: { variant: 'plain' },
  },

  cases: [
    { id: 'base', title: 'Период', note: 'Один выбранный из четырёх, обрамлённый вид.' },
    {
      id: 'multiple',
      title: 'Множественный выбор',
      props: { mode: 'multiple', set: 'filters' },
      note: 'Тот же вид, ДРУГОЙ смысл: здесь выбранных может быть несколько.'
        + ' Отличить их можно только ролью в дереве доступности — посмотрите'
        + ' вкладку axe и слой таб-стопов, а не картинку.',
    },
    {
      id: 'roving',
      title: 'Один таб-стоп на группу',
      note: 'Главное утверждение компонента. Вся группа — ОДИН таб-стоп, внутри'
        + ' ходят стрелками. Включите слой таб-стопов: их столько же, сколько групп,'
        + ' а не сколько сегментов. Выключенный сегмент стрелки пропускают.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-start' }}>
          <Live mode="single" items={PERIOD} size={p.size} variant={p.variant} />
          <Live mode="multiple" items={FILTERS} size={p.size} variant={p.variant} />
        </div>
      ),
    },
    {
      id: 'sizes',
      title: 'Два размера рядом',
      note: 'sm и md вместе. Порознь оба выглядят правильными — разница видна'
        + ' только в паре, и это тот случай, ради которого верстак и заведён.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-start' }}>
          <Live mode="single" items={PERIOD} size="sm" variant={p.variant} />
          <Live mode="single" items={PERIOD} size="md" variant={p.variant} />
        </div>
      ),
    },
    {
      id: 'variants',
      title: 'Рамка и без рамки',
      note: 'framed стоит сам по себе, plain — внутри чужой панели, где рамка была'
        + ' бы второй линией подряд. Выбор между ними — про соседей, а не про вкус.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-start' }}>
          <Live mode="single" items={PERIOD} size={p.size} variant="framed" />
          <Live mode="single" items={PERIOD} size={p.size} variant="plain" />
        </div>
      ),
    },
    {
      id: 'swatch',
      title: 'Выбор цвета метки',
      note: 'Восемь цветов системной палитры. Выбранный помечен НЕ рамкой вокруг'
        + ' плашки: она берёт контраст от самой плашки, то есть от данных, и на'
        + ' тёмном цвете исчезает. Здесь кольцо отбито зазором цвета поверхности,'
        + ' а внутри — медальон с галочкой, поэтому признак читается одинаково на'
        + ' любом цвете. Проверять под grayscale(1): выбор обязан остаться видимым.',
      render: () => <LiveSwatch items={COLOURS} label="Цвет метки" />,
    },
    {
      id: 'swatch-extremes',
      title: 'Плашка цвета фона и почти чёрная',
      note: 'Случай, ради которого признак и переделан. Белая плашка на светлой'
        + ' теме и почти чёрная на тёмной — там, где прежний приём (рамка снаружи)'
        + ' пропадал. Плашку цвета поверхности видно по внутренней волосяной'
        + ' обводке, а выбор — по кольцу и медальону.',
      render: () => <LiveSwatch items={EXTREMES} label="Цвет метки, крайние случаи" />,
    },
  ],

  render: (p) => (
    <Live
      mode={p.mode}
      items={p.set === 'filters' ? FILTERS : PERIOD}
      size={p.size}
      variant={p.variant}
    />
  ),
})
