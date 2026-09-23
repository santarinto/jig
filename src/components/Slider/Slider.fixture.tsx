import { useState } from 'react'
import { defineFixture } from '../../internal/fixture.js'
import { Slider } from './Slider.js'

/**
 * Единственное поле волны БЕЗ подсказки и без ошибки, и это не пробел: ползунок
 * не может принять неверное значение — диапазон задан, промахнуться мимо него
 * нечем. Сообщать под ним нечего, потому и подвала у него нет.
 *
 * Зато у него есть то, чего нет ни у кого: значение показано ДВАЖДЫ — числом
 * справа и положением бегунка. Числа и есть предмет большинства случаев:
 * ползунок без числа отвечает «примерно столько», а с числом — «ровно столько»,
 * и выбор между этими двумя ответами делает потребитель, а не мы.
 */

interface Props {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix: string
  showValue: boolean
  disabled: boolean
}

function Live({ value, suffix, ...rest }: Props) {
  const [v, setV] = useState(value)
  return (
    <Slider
      {...rest}
      value={v}
      onChange={setV}
      suffix={suffix || undefined}
      label={rest.label || undefined}
    />
  )
}

export default defineFixture<Props>({
  name: 'Slider',
  group: 'Управление',
  kind: 'block',

  props: {
    label: 'Радиус поиска машин',
    value: 3,
    min: 1,
    max: 15,
    step: 1,
    suffix: 'км',
    showValue: true,
    disabled: false,
  },

  controls: {
    label: { kind: 'text', prop: true },
    value: { kind: 'number', min: 0, max: 100, prop: true },
    min: { kind: 'number', min: 0, max: 50, prop: true },
    max: { kind: 'number', min: 1, max: 200, prop: true },
    step: { kind: 'number', min: 0.1, max: 25, step: 0.1, prop: true },
    suffix: { kind: 'text', prop: true },
    showValue: { kind: 'bool', prop: true },
    disabled: { kind: 'bool', prop: true },
  },

  data: {
    percent: { label: 'Доля предоплаты', value: 30, min: 0, max: 100, step: 5, suffix: '%' },
    // Шаг крупнее, чем шаг пикселя: бегунок обязан ЩЁЛКАТЬ по делениям,
    // а не ехать плавно и округляться на отпускании.
    coarse: { label: 'Комиссия парка', value: 15, min: 0, max: 30, step: 5, suffix: '%' },
    bare: { showValue: false, suffix: '' },
    edge: { value: 15, min: 1, max: 15, suffix: 'км' },
  },

  cases: [
    {
      id: 'base',
      title: 'Обычный',
      note: 'Подпись слева, значение справа, полоса под ними. Заливка слева от'
        + ' бегунка — это ПРОЙДЕННАЯ часть диапазона, а не «сколько осталось».',
    },
    {
      id: 'value',
      title: 'С числом и без',
      note: 'Выбор между двумя разными вопросами. С числом ползунок отвечает'
        + ' «ровно 3 км» — тогда рядом нужен `NumberField`, если число важно'
        + ' набрать. Без числа — «примерно столько», и это честнее там, где'
        + ' точное значение никого не интересует: громкость, прозрачность,'
        + ' плотность. Показывать число «для полноты» — худший из вариантов:'
        + ' оно требует точности, которой у мыши на 200 пикселях нет.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Live {...p} label="С числом" showValue />
          <Live {...p} label="Без числа" showValue={false} suffix="" />
        </div>
      ),
    },
    {
      id: 'step',
      title: 'Крупный шаг',
      props: { label: 'Комиссия парка', value: 15, min: 0, max: 30, step: 5, suffix: '%' },
      note: 'Шаг 5 на диапазоне 30 — семь положений на всю полосу. Бегунок'
        + ' обязан ЩЁЛКАТЬ по ним при перетаскивании, а не ехать плавно и'
        + ' прыгать на отпускании: плавный ход обещает промежуточные значения,'
        + ' которых нет. Проверять мышью, не стрелками.',
    },
    {
      id: 'edges',
      title: 'На упорах',
      note: 'Оба края разом. У левого края заливки нет вовсе, у правого она'
        + ' занимает всю полосу — и в обоих случаях бегунок обязан остаться'
        + ' целиком видимым, а не наполовину уехать за торец.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Live {...p} label="Минимум" value={p.min} />
          <Live {...p} label="Максимум" value={p.max} />
        </div>
      ),
    },
    {
      id: 'target',
      title: 'Цель клика',
      note: 'Коробка ввода — 24 пикселя высотой, это ЦЕЛЬ КЛИКА (SC 2.5.8),'
        + ' а полоса внутри неё тонкая. Поэтому заливку красит переменная'
        + ' `--ds-slider-fill` и красит она ТРЕК, а не коробку: покрась она'
        + ' коробку, полоса стала бы вшестеро толще, и цель клика пришлось бы'
        + ' уменьшать обратно. Компонент отдаёт значение, лист решает, чем его'
        + ' рисовать — тот же шов, что у тона `Badge`.',
    },
    {
      id: 'disabled',
      title: 'Выключен',
      props: { disabled: true },
      note: 'Гаснут полоса, бегунок и число: у выключенного ползунка значение'
        + ' остаётся ПОКАЗАННЫМ, но приглушённым — оно всё ещё ответ на вопрос'
        + ' «сколько сейчас», и прятать его незачем. Здесь `disabled` объявлен'
        + ' своим пропом, гасит и корень (`.is-disabled`), и сам ввод.',
    },
  ],

  render: (p) => <Live {...p} />,
})
