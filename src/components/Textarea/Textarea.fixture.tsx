import { useState } from 'react'
import { defineFixture } from '../../internal/fixture.js'
import { Textarea } from './Textarea.js'

/**
 * Единственное поле семьи с блок-раскладкой (`.ds-field--block`, во всю ширину)
 * и с подвалом: подсказка/ошибка слева, счётчик символов справа. Подвал и есть
 * предмет большинства случаев — он появляется по трём разным причинам и должен
 * при этом остаться одной строкой, а не тремя.
 */

interface Props {
  label: string
  value: string
  placeholder: string
  hint: string
  error: string
  rows: number
  maxLength: number
  size: 'sm' | 'md'
  disabled: boolean
}

function Live({ value, maxLength, ...rest }: Props) {
  const [v, setV] = useState(value)
  return (
    <Textarea
      {...rest}
      value={v}
      label={rest.label || undefined}
      hint={rest.hint || undefined}
      error={rest.error || undefined}
      // Ноль значит «счётчика нет»: у крутилки нет способа сказать «пропа нет»,
      // а `maxLength={0}` запретил бы ввод вовсе.
      maxLength={maxLength > 0 ? maxLength : undefined}
      onChange={(e) => setV(e.currentTarget.value)}
    />
  )
}

export default defineFixture<Props>({
  name: 'Textarea',
  group: 'Управление',
  kind: 'block',

  props: {
    label: 'Комментарий к заказу',
    value: '',
    placeholder: 'Что передать водителю',
    hint: 'Виден водителю в приложении',
    error: '',
    rows: 3,
    maxLength: 0,
    size: 'md',
    disabled: false,
  },

  controls: {
    label: { kind: 'text', prop: true },
    value: { kind: 'text', prop: true },
    placeholder: { kind: 'text', prop: true },
    hint: { kind: 'text', prop: true },
    error: { kind: 'text', prop: true },
    rows: { kind: 'number', min: 1, max: 12, prop: true },
    maxLength: { kind: 'number', min: 0, max: 500, step: 10, prop: true },
    size: { kind: 'enum', values: ['sm', 'md'], prop: true },
    disabled: { kind: 'bool', prop: true },
  },

  data: {
    counted: { maxLength: 200, hint: 'Не длиннее 200 символов' },
    // Текст выше заданных строк: поле НЕ растёт само, оно прокручивается.
    overflow: {
      rows: 3,
      value: 'Клиент просил перезвонить за десять минут до подачи.'
        + ' Домофон не работает, звонить на мобильный.'
        + ' В подъезде ремонт, вход со двора.'
        + ' Груз хрупкий: две коробки, ставить только вертикально.'
        + ' Оплата картой на месте, чек не нужен.',
      hint: '',
    },
    tall: { rows: 8 },
  },

  cases: [
    { id: 'base', title: 'Обычное', note: 'Три строки, подпись, подсказка в подвале.' },
    {
      id: 'counter',
      title: 'Со счётчиком',
      props: { maxLength: 200, value: 'Домофон не работает, звонить на мобильный.' },
      note: 'Счётчик появляется вместе с `maxLength` и живёт СПРАВА в том же'
        + ' подвале, где слева подсказка. Он не предупреждение: пока лимит не'
        + ' достигнут, он такой же приглушённый, как подсказка. Считает символы'
        + ' введённого, а не оставшиеся — «180 / 200» отвечает на вопрос'
        + ' «сколько я написал», а не «сколько мне ещё дадут».',
    },
    {
      id: 'error',
      title: 'Ошибка и счётчик вместе',
      props: {
        maxLength: 60,
        value: 'Клиент просил перезвонить за десять минут до подачи, домофон не работает',
        error: 'Слишком длинно: комментарий не влезет в приложение водителя',
      },
      note: 'Ради этого случая счётчик и живёт в подвале, а не под полем.'
        + ' Ошибка замещает ПОДСКАЗКУ (контракт семьи), но не счётчик: они про'
        + ' разное и стоят в одной строке слева и справа. Если подвал в этом'
        + ' случае разъезжается на две строки — виноват подвал, а не текст.',
    },
    {
      id: 'rows',
      title: 'Высота и переполнение',
      note: 'Поле НЕ растёт под текст: `rows` задаёт высоту, дальше прокрутка.'
        + ' Растущее поле дёргает всю форму под собой при каждом слове —'
        + ' в длинной форме это дороже, чем прокрутка внутри поля.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <Textarea label="Две строки" rows={2} defaultValue={p.placeholder} />
          <Textarea
            label="Три строки, текста больше"
            rows={3}
            defaultValue={'Клиент просил перезвонить за десять минут до подачи.'
              + ' Домофон не работает, звонить на мобильный.'
              + ' В подъезде ремонт, вход со двора.'
              + ' Груз хрупкий: две коробки, ставить только вертикально.'}
          />
        </div>
      ),
    },
    {
      id: 'bare',
      title: 'Без подвала',
      props: { hint: '', error: '', maxLength: 0 },
      note: 'Ни подсказки, ни ошибки, ни лимита — подвала нет ВОВСЕ, а не пустая'
        + ' полоска под полем. Пустой подвал добавлял бы полю высоты, и два'
        + ' соседних поля — одно с подсказкой, другое без — переставали бы'
        + ' совпадать по низу без всякой причины.',
    },
  ],

  render: (p) => <Live {...p} />,
})
