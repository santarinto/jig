import { useState } from 'react'
import { defineFixture } from '../../internal/fixture.js'
import { NumberField } from './NumberField.js'

/**
 * Составное поле: две кнопки и ввод в одной рамке. Отсюда почти все его
 * случаи — про ГРАНИЦУ, а не про содержимое: кнопка на упоре гаснет, значение
 * вне диапазона подтягивается по уходу фокуса, а рамка красится целиком, а не
 * один ввод внутри неё.
 *
 * Крутилки здесь — единственный способ увидеть шаг с дробями: `step={0.5}`
 * определяет ещё и округление, и ошибка в нём выглядит как «0.30000000000000004».
 */

interface Props {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix: string
  hint: string
  error: string
  size: 'sm' | 'md'
  disabled: boolean
}

function Live({ value, suffix, ...rest }: Props) {
  const [v, setV] = useState(value)
  return (
    <NumberField
      {...rest}
      value={v}
      onChange={setV}
      suffix={suffix || undefined}
      label={rest.label || undefined}
      hint={rest.hint || undefined}
      error={rest.error || undefined}
    />
  )
}

export default defineFixture<Props>({
  name: 'NumberField',
  group: 'Управление',
  kind: 'inline',

  props: {
    label: 'Машин на линии',
    value: 12,
    min: 0,
    max: 60,
    step: 1,
    suffix: '',
    hint: 'Сколько машин выпускать в смену',
    error: '',
    size: 'md',
    disabled: false,
  },

  controls: {
    label: { kind: 'text', prop: true },
    value: { kind: 'number', min: -100, max: 1000, prop: true },
    min: { kind: 'number', min: -100, max: 100, prop: true },
    max: { kind: 'number', min: 0, max: 1000, prop: true },
    step: { kind: 'number', min: 0.1, max: 10, step: 0.1, prop: true },
    suffix: { kind: 'text', prop: true },
    hint: { kind: 'text', prop: true },
    error: { kind: 'text', prop: true },
    size: { kind: 'enum', values: ['sm', 'md'], prop: true },
    disabled: { kind: 'bool', prop: true },
  },

  data: {
    // Дробный шаг: он же задаёт округление. Без него сложение даёт хвост
    // двоичной дроби, и поле показывает 0.30000000000000004.
    fractional: { label: 'Коэффициент спроса', value: 1.5, min: 0.5, max: 3, step: 0.1, suffix: '×', hint: '' },
    money: { label: 'Стоимость подачи', value: 149, min: 0, max: 5000, step: 10, suffix: '₽', hint: '' },
    'at-max': { value: 60, hint: 'Значение упёрлось в верхнюю границу' },
    negative: { label: 'Корректировка баланса', value: -250, min: -1000, max: 1000, step: 50, suffix: '₽', hint: '' },
  },

  cases: [
    { id: 'base', title: 'Обычное', note: 'Минус, значение, плюс — в одной рамке.' },
    {
      id: 'limits',
      title: 'На упорах',
      note: 'Кнопка на упоре ВЫКЛЮЧАЕТСЯ, а не тихо ничего не делает. Живая'
        + ' кнопка, которая не меняет число, читается как поломка поля;'
        + ' погашенная — как достигнутая граница, что и есть правда. Границы'
        + ' при этом объявлены и скринридеру: `aria-valuemin`/`aria-valuemax`'
        + ' на вводе, и они обязаны совпадать с тем, по чему гаснут кнопки.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <Live {...p} label="На нижней границе" value={0} hint="Минус погашен" error="" suffix="" />
          <Live {...p} label="На верхней границе" value={60} hint="Плюс погашен" error="" suffix="" />
        </div>
      ),
    },
    {
      id: 'suffix',
      title: 'С единицей',
      props: { suffix: '₽', label: 'Стоимость подачи', value: 149, step: 10, max: 5000, hint: '' },
      note: 'Единица живёт ВНУТРИ рамки, справа от числа, а не в подписи.'
        + ' В подписи она отвечает на вопрос «что это за поле», внутри — «в чём'
        + ' измерено вот это число»; второе нужнее, когда в форме десяток полей'
        + ' и подписи прочитаны один раз, а числа сверяют глазами.',
    },
    {
      id: 'fractional',
      title: 'Дробный шаг',
      props: { label: 'Коэффициент спроса', value: 1.5, min: 0.5, max: 3, step: 0.1, suffix: '×', hint: '' },
      note: 'Шаг задаёт не только прибавку, но и ОКРУГЛЕНИЕ: без него'
        + ' 1.2 + 0.1 показывает 1.3000000000000003. Проверять надо не одним'
        + ' нажатием, а десятком подряд — хвост вылезает не сразу.',
    },
    {
      id: 'error',
      title: 'С ошибкой',
      props: { value: 75, max: 60, error: 'В парке 60 машин, больше выпустить нечего', hint: '' },
      note: 'Краснеет вся рамка целиком, вместе с кнопками, а не один ввод'
        + ' внутри неё: рамка тут одна на три элемента, и подкрашенная'
        + ' серединка читалась бы как дефект вёрстки. Значение выше `max`'
        + ' показано намеренно — так выглядит поле, которому число пришло'
        + ' извне, а не набрано руками: подтянет его только уход фокуса.',
    },
    {
      id: 'disabled',
      title: 'Выключено',
      props: { disabled: true, value: 12, hint: '' },
      note: 'Гаснут обе кнопки и ввод. Отдельно проверить, что кнопки выпали из'
        + ' обхода табом: у составного поля три таб-стопа, и выключенное поле,'
        + ' оставившее два из них, ловится только клавиатурой.',
    },
  ],

  render: (p) => <Live {...p} />,
})
