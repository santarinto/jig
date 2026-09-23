import { defineFixture } from '../../internal/fixture.js'
import { Breadcrumbs, type Crumb } from './Breadcrumbs.js'

const PATH: Crumb[] = [
  { id: 'root', label: 'Парк' },
  { id: 'drivers', label: 'Водители' },
  { id: 'ivanov', label: 'Иванов И. И.' },
  { id: 'shifts', label: 'Смены' },
  { id: 'shift-4412', label: 'Смена 4412 от 28.08.2026' },
]

interface Props {
  depth: number
}

export default defineFixture<Props>({
  name: 'Breadcrumbs',
  group: 'Навигация',
  kind: 'block',

  props: { depth: 4 },

  controls: {
    depth: { kind: 'number', min: 1, max: 5, prop: false },
  },

  data: {
    // Одна крошка — это текущая страница и больше ничего. Она НЕ ссылка, и
    // проверять надо именно это: путь из одного звена не должен выглядеть
    // кликабельным.
    single: { depth: 1 },
    two: { depth: 2 },
    full: { depth: 5 },
  },

  cases: [
    { id: 'base', title: 'Обычный', note: 'Четыре звена, последнее — текущая страница.' },
    {
      id: 'current-not-link',
      title: 'Последняя не ссылка',
      note: 'Главное утверждение компонента. Последняя крошка — страница, на которой'
        + ' пользователь УЖЕ стоит; ссылка на неё вела бы в никуда и занимала лишний'
        + ' таб-стоп. Включите слой таб-стопов: их на одну меньше, чем крошек.',
    },
    {
      id: 'single',
      title: 'Одно звено',
      props: { depth: 1 },
      note: 'Корень и он же текущая страница. Разделителя нет, ссылки нет —'
        + ' остаётся подпись. Полоса при этом не исчезает: пропавший путь читается'
        + ' как «навигация сломалась».',
    },
    {
      id: 'long',
      title: 'Длинное имя в конце',
      props: { depth: 5 },
      note: 'Последнее звено длиннее остальных вместе взятых — обычное дело, когда'
        + ' в имени дата. Предмет: переносится путь или уезжает за край.',
    },
    {
      id: 'narrow',
      title: 'В узкой колонке',
      note: 'Тот же путь в 280px. Крошки живут в шапке страницы, а шапка на телефоне'
        + ' узкая: посмотрите, что происходит раньше — перенос или обрезка.',
      render: (p) => (
        <div style={{ inlineSize: '280px', outline: '1px dashed var(--ds-border)', padding: '0.5rem' }}>
          <Breadcrumbs items={PATH.slice(0, p.depth)} />
        </div>
      ),
    },
  ],

  render: (p) => <Breadcrumbs items={PATH.slice(0, Math.max(1, p.depth))} />,
})
