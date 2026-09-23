import { defineFixture } from '../../internal/fixture.js'
import { Stat } from './Stat.js'

interface Props {
  label: string
  value: string
  unit: string
  delta: string
  direction: 'up' | 'down'
  tone: 'positive' | 'negative' | 'neutral' | ''
  hint: string
}

export default defineFixture<Props>({
  name: 'Stat',
  group: 'Данные',
  kind: 'block',

  props: {
    label: 'Заказов за смену',
    value: '347',
    unit: '',
    delta: '12',
    direction: 'up',
    tone: '',
    hint: '',
  },

  controls: {
    label: { kind: 'text', prop: true },
    value: { kind: 'text', prop: true },
    unit: { kind: 'text', prop: true },
    delta: { kind: 'text', prop: false },
    direction: { kind: 'enum', values: ['up', 'down'], prop: false },
    // Пустая строка первой — это «тон не задан», то есть штатное поведение
    // (up=positive, down=negative). Отдельного `auto` не заводим: пустое
    // значение уже значит «компонент решает сам».
    tone: { kind: 'enum', values: ['', 'positive', 'negative', 'neutral'], prop: false },
    hint: { kind: 'text', prop: true },
  },

  data: {
    // Величина, которой нет. Плитка обязана остаться плиткой, а не схлопнуться
    // в подпись: пустое место на месте числа читается как «не загрузилось».
    'no-value': { value: '—', delta: '' },
    // Длинная подпись при коротком числе — типичный перекос у потребителя.
    'long-label': {
      label: 'Среднее время подачи по парку за последние семь смен',
      value: '4,2',
      unit: 'мин',
    },
    // Число, которое не влезает: проверка, что подпись не уезжает под него.
    huge: { value: '1 284 906', unit: '₽', delta: '128 400' },
  },

  slots: {
    adornment: {
      title: 'Значок статуса',
      accepts: 'inline',
      prop: 'adornment',
      note: 'Слот ПОД СТАТУС, не под действие. Он читается вместе с подписью'
        + ' («за смену, live»), поэтому фокусируемая кнопка здесь попадёт в имя'
        + ' величины — и станет её частью для скринридера.',
    },
  },

  cases: [
    { id: 'base', title: 'Обычная', note: 'Подпись, значение, рост.' },
    {
      id: 'row',
      title: 'Четыре в ряд',
      note: 'Так плитки и живут — рядом. Проверка выравнивания: числа разной длины'
        + ' обязаны стоять на одной базовой линии, иначе ряд читается ступенькой.',
      render: () => (
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <Stat label="Заказов за смену" value="347" delta={{ value: 12, direction: 'up' }} />
          <Stat label="Средний чек" value="1 284" unit="₽" delta={{ value: '3%', direction: 'down' }} />
          <Stat label="Отмен" value="9" delta={{ value: 2, direction: 'up', tone: 'negative' }} />
          <Stat label="Свободных машин" value="—" />
        </div>
      ),
    },
    {
      id: 'delta-tone',
      title: 'Рост, который плох',
      note: 'Направление и тон — РАЗНЫЕ вещи, и это главное утверждение компонента.'
        + ' Отмены выросли: стрелка вверх, тон отрицательный. Умолчание «вверх значит'
        + ' хорошо» врало бы ровно на тех величинах, где ошибка дороже всего.',
      render: () => (
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <Stat label="Выручка" value="284 900" unit="₽" delta={{ value: '7%', direction: 'up' }} />
          <Stat label="Отмен" value="9" delta={{ value: 2, direction: 'up', tone: 'negative' }} />
          <Stat label="Время подачи" value="4,2" unit="мин" delta={{ value: '11%', direction: 'down', tone: 'positive' }} />
        </div>
      ),
    },
    {
      id: 'no-delta',
      title: 'Без дельты',
      props: { delta: '' },
      note: 'Сравнивать не с чем — строка значения остаётся одна. Плитка не должна'
        + ' резервировать под дельту место: пустая строка выглядит как потерянное число.',
    },
    {
      id: 'hint',
      title: 'С пояснением',
      props: { hint: 'Считается по закрытым заказам, отменённые не входят.' },
      note: 'Пояснение объясняет, ЧТО посчитано. Оно звучит для скринридера, а не'
        + ' живёт в `title`: `title` недостижим ни с клавиатуры, ни с озвучкой.',
    },
  ],

  render: (p, slots) => (
    <Stat
      label={p.label}
      value={p.value}
      unit={p.unit || undefined}
      hint={p.hint || undefined}
      adornment={slots.adornment}
      delta={
        p.delta
          ? { value: p.delta, direction: p.direction, tone: p.tone || undefined }
          : undefined
      }
    />
  ),
})
