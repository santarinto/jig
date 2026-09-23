import { useState } from 'react'
import { defineFixture } from '../../internal/fixture.js'
import { Select, type SelectOption } from './Select.js'

/**
 * Нативный `<select>` в обвязке поля: список раскрывает браузер, и это решение,
 * а не упущение — системный список умеет то, чего не умеет ни один рисованный
 * (клавиатура, набор первых букв, экран телефона). Всё, что фикстура может
 * показать, — обвязку: подпись, её место, подсказку, ошибку и выключение.
 *
 * `labelPosition` — единственная крутилка, которая меняет РАСКЛАДКУ, и потому
 * главный случай здесь: у трёх её значений разные способы дать полю имя.
 */

const STATUSES: SelectOption[] = [
  { value: 'free', label: 'Свободен' },
  { value: 'busy', label: 'На заказе' },
  { value: 'break', label: 'Перерыв' },
  { value: 'off', label: 'Не на смене' },
]

const PARKS: SelectOption[] = Array.from({ length: 24 }, (_, i) => ({
  value: `p${i + 1}`,
  label: `Парк №${i + 1} — ${['Уралмаш', 'Ботаника', 'Академический', 'Пионерский'][i % 4]}`,
}))

interface Props {
  label: string
  value: string
  options: SelectOption[]
  labelPosition: 'top' | 'inline' | 'hidden'
  hint: string
  error: string
  size: 'sm' | 'md'
  disabled: boolean
}

function Live({ value, options, ...rest }: Props) {
  const [v, setV] = useState(value)
  return (
    <Select
      {...rest}
      options={options}
      value={v}
      label={rest.label || undefined}
      hint={rest.hint || undefined}
      error={rest.error || undefined}
      onChange={(e) => setV(e.currentTarget.value)}
    />
  )
}

export default defineFixture<Props>({
  name: 'Select',
  group: 'Управление',
  kind: 'inline',

  props: {
    label: 'Статус водителя',
    value: 'free',
    options: STATUSES,
    labelPosition: 'top',
    hint: 'Меняется диспетчером вручную',
    error: '',
    size: 'md',
    disabled: false,
  },

  controls: {
    label: { kind: 'text', prop: true },
    value: { kind: 'text', prop: true },
    labelPosition: { kind: 'enum', values: ['top', 'inline', 'hidden'], prop: true },
    hint: { kind: 'text', prop: true },
    error: { kind: 'text', prop: true },
    size: { kind: 'enum', values: ['sm', 'md'], prop: true },
    disabled: { kind: 'bool', prop: true },
    // `options` крутилки НЕ ПОЛУЧАЕТ: `SelectOption[]` не выражается ни одним
    // из четырёх видов, а объявленная текстом она печатала бы в панели
    // «[object Object],[object Object]» — поле, которое нельзя ни прочесть, ни
    // покрутить. Список подменяется наборами данных, для этого они и есть.
  },

  data: {
    // Двадцать четыре пункта с длинными подписями: предмет — что ширину поля
    // задаёт САМЫЙ ДЛИННЫЙ пункт, а не выбранный.
    many: { label: 'Парк', options: PARKS, value: 'p13', hint: '' },
    toolbar: { labelPosition: 'inline', hint: '', label: 'Статус' },
    compact: { labelPosition: 'hidden', size: 'sm', hint: '' },
  },

  cases: [
    { id: 'base', title: 'Обычный', note: 'Подпись сверху, подсказка под контролом.' },
    {
      id: 'label-position',
      title: 'Три места подписи',
      note: 'Имя у поля есть во ВСЕХ трёх режимах, но даётся по-разному:'
        + ' `top` и `inline` — разметкой, `<label htmlFor>`; `hidden` —'
        + ' атрибутом `aria-label`, потому что разметки там нет вовсе.'
        + ' Разница видна не глазами, а в дереве доступности, и «подпись'
        + ' спрятали» здесь НЕ означает «имя потеряли». `inline` заведён ради'
        + ' тулбара: поле в строку с подписью не выше соседних кнопок.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-start' }}>
          <Select label="Сверху (top)" options={p.options} defaultValue={p.value} labelPosition="top" />
          <Select label="В строку (inline)" options={p.options} defaultValue={p.value} labelPosition="inline" />
          <Select label="Скрыта (hidden)" options={p.options} defaultValue={p.value} labelPosition="hidden" />
        </div>
      ),
    },
    {
      id: 'error',
      title: 'С ошибкой',
      props: { value: 'off', error: 'Водитель не на смене — заказ назначить нельзя', hint: '' },
      note: 'Рамку `.is-error` общий лист умел красить и до того, как у `Select`'
        + ' появился проп: краснеть было чем, СКАЗАТЬ было нечем. Форма со'
        + ' смешанными полями уносила ошибку списка в общий `Alert` наверху,'
        + ' и связь «ошибка ↔ поле» для диктора терялась (DS-56).'
        + ' Ошибка, как у всей семьи, вытесняет подсказку.',
    },
    {
      id: 'long-options',
      title: 'Длинные пункты',
      props: { label: 'Парк', options: PARKS, value: 'p13', hint: '' },
      note: 'Ширину поля задаёт самый длинный пункт СПИСКА, а не выбранный.'
        + ' Поэтому список с одним длинным названием раздвигает поле навсегда,'
        + ' и в тулбаре это ломает соседей — там такому списку нужна ширина'
        + ' от потребителя.',
    },
    {
      id: 'disabled',
      title: 'Выключен',
      props: { disabled: true, hint: '' },
      note: 'До 1.42.0 у выключенного списка не было ВИДА: атрибут стоял,'
        + ' сообщения не было — поле выглядело обычным и не отвечало на клик.'
        + ' Проверяется это `make measure`, а не jsdom: разницу поверхностей'
        + ' из теста не увидеть.',
    },
  ],

  render: (p) => <Live {...p} />,
})
