import { defineFixture } from '../internal/fixture.js'
import { Icon } from './Icon.js'
import { ChevronDown } from './glyphs.js'

/**
 * Фикстура контракта `<Icon>` (DS-260).
 *
 * Лежит в `src/icons/`, а не в `src/components/Icon/`: перенос сломал бы путь
 * импорта у потребителя, а папка в каталоге подняла бы релиз до minor. Верстак
 * видит её через второй шаблон `FIXTURE_GLOBS` (`workbench/kinds-plugin.ts`),
 * требует — `fixture-coverage` («вне каталога»).
 *
 * ЧУЖОЙ ГЛИФ — БУКВАЛЬНО TABLER, а не импорт `@tabler/icons-react`: разметка
 * `IconTruck` из 3.45.0 с атрибутами по умолчанию (`width="24"`) и толщиной,
 * которую потребитель выставил сам (`stroke-width="1.5"`). Импорт был бы
 * честнее, но `shipped-imports` читает фикстуры как поставляемый код, а пакет у
 * нас devDependency. Разметка та же, что у случая `measure` «Icon: чужой глиф
 * приведён к нашему», — там механика доказана числом, здесь её смотрят глазами.
 *
 * ШКАЛЫ — КНОПКАМИ ОБОЛОЧКИ, как у `Split/scale`: с DS-164 набор кнопок
 * (`SCALE_PRESETS`) и есть линейка системы 0.875 / 1 / 1.15 / 1.5, так что все
 * четыре выбираются из шапки; в кадре — `&scale=` в адресе.
 */

interface Props {
  large: boolean
}

/** `IconTruck` из @tabler/icons-react 3.45.0, атрибуты — как их отдаёт библиотека. */
const TablerTruck = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round"
  >
    <path d="M5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <path d="M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <path d="M5 17h-2v-11a1 1 0 0 1 1 -1h9v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5" />
  </svg>
)

const SCALES_NOTE =
  '\n\nШКАЛЫ: кнопки оболочки — 0.875, 1, 1.15, 1.5, это вся линейка системы. '
  + 'Смотреть на всех четырёх: знак обязан расти вместе с текстом, иначе на 1.5 он '
  + 'соринка, а на 0.875 — клякса.'

const row = { display: 'flex', alignItems: 'center', gap: 'var(--ds-space-2)' } as const
const line = { margin: 0, fontSize: 'var(--ds-fs-base)' } as const

export default defineFixture<Props>({
  name: 'Icon',
  group: 'Отображение',
  kind: 'inline',

  props: { large: false },

  controls: {
    // Модификатор `.ds-icon--lg`, а не проп: размера пропом у контракта НЕТ
    // (AGENTS.md, «значок»), крупный знак ставится классом.
    large: { kind: 'bool', prop: false },
  },

  cases: [
    {
      id: 'base',
      title: 'Чужой глиф рядом с нашим шевроном и строкой текста',
      note:
        'Слева наш `ChevronDown`, справа `IconTruck` tabler со своими `width="24"` и '
        + '`stroke-width="1.5"` — оба в `<Icon>`. Контракт обязан сделать их ОДНИМ '
        + 'знаком: одна сторона (`--ds-size-icon`), одна толщина (`--ds-icon-stroke`), '
        + 'цвет места (`currentColor`; во второй строке место красит в акцент).\n\n'
        + 'ГЛАВНОЕ, РАДИ ЧЕГО СЛУЧАЙ, — БАЗОВАЯ ЛИНИЯ. В третьей строке пара стоит '
        + 'ВНУТРИ текста, без флекса вокруг. `.ds-icon` — `inline-flex`, у SVG своей '
        + 'базовой линии нет, и по устройству низ знака садится на базовую линию '
        + 'строки, а не по центру строчных. Смотреть, где сидит знак относительно '
        + 'букв, и одинаково ли у нашего и у чужого — разойтись они не должны, '
        + 'коробка у обоих одна.'
        + SCALES_NOTE,
    },
    {
      id: 'raw',
      title: 'Тот же глиф без контракта',
      note:
        'Контрольный: чужой глиф ГОЛЫМ, без `<Icon>`, рядом с нашим шевроном в '
        + '`<Icon>`. Здесь он обязан ОТЛИЧАТЬСЯ — 24 px против `--ds-size-icon`, '
        + 'штрих 1.5 против 2, на шкале не растёт. Если случаи `base` и `raw` '
        + 'выглядят одинаково, контракт не работает, а не «всё хорошо». '
        + 'Размер различается на 0.875, 1 и 1.15 (14, 16, 18.4 px против 24); на 1.5 '
        + 'оба 24 px — арифметика (16 × 1.5 = 24), а не поломка. Толщина штриха '
        + '(2 против 1.5) различается на всех шкалах.'
        + SCALES_NOTE,
      render: (p) => (
        <div style={{ display: 'grid', gap: 'var(--ds-space-3)' }}>
          <div style={row}>
            <Icon className={p.large ? 'ds-icon--lg' : undefined}><ChevronDown /></Icon>
            <TablerTruck />
            <span>Заказ №4812 · в пути</span>
          </div>
        </div>
      ),
    },
  ],

  render: (p) => {
    const cls = p.large ? 'ds-icon--lg' : undefined
    return (
      <div style={{ display: 'grid', gap: 'var(--ds-space-3)' }}>
        <div style={row}>
          <Icon className={cls}><ChevronDown /></Icon>
          <Icon className={cls}><TablerTruck /></Icon>
          <span>Заказ №4812 · в пути</span>
        </div>
        <div style={{ ...row, color: 'var(--ds-accent)' }}>
          <Icon className={cls}><ChevronDown /></Icon>
          <Icon className={cls}><TablerTruck /></Icon>
          <span>Цвет места — акцент</span>
        </div>
        <p style={line}>
          Водитель <Icon className={cls}><ChevronDown /></Icon>
          {' '}принял заказ <Icon className={cls}><TablerTruck /></Icon> и выехал к подаче.
        </p>
      </div>
    )
  },
})
