import { useState } from 'react'
import { defineFixture } from '../../internal/fixture.js'
import { TextField } from './TextField.js'

/**
 * Владелец канонического `.ds-input`: его геометрию (`field-frame.css`) носят
 * ещё `DatePicker`, `Combobox` и `GlobalSearch`. Поэтому случаи здесь — не
 * только про это поле: высота, паддинги и кегль, снятые тут, обязаны сойтись
 * у тех троих, и расходятся они молча.
 */

interface Props {
  label: string
  value: string
  placeholder: string
  hint: string
  error: string
  size: 'sm' | 'md'
  disabled: boolean
  readOnly: boolean
}

/** Поле контролируемое: без состояния крутилка `value` печатала бы в пустоту. */
function Live({ value, ...rest }: Props) {
  const [v, setV] = useState(value)
  return (
    <TextField
      {...rest}
      value={v}
      hint={rest.hint || undefined}
      error={rest.error || undefined}
      label={rest.label || undefined}
      onChange={(e) => setV(e.currentTarget.value)}
    />
  )
}

export default defineFixture<Props>({
  name: 'TextField',
  group: 'Управление',
  kind: 'inline',

  props: {
    label: 'Номер машины',
    value: '',
    placeholder: 'А123БВ 96',
    hint: 'Госномер в формате «А123БВ 96»',
    error: '',
    size: 'md',
    disabled: false,
    readOnly: false,
  },

  controls: {
    label: { kind: 'text', prop: true },
    value: { kind: 'text', prop: true },
    placeholder: { kind: 'text', prop: true },
    hint: { kind: 'text', prop: true },
    error: { kind: 'text', prop: true },
    size: { kind: 'enum', values: ['sm', 'md'], prop: true },
    disabled: { kind: 'bool', prop: true },
    readOnly: { kind: 'bool', prop: true },
  },

  data: {
    // Значение длиннее поля. Предмет — что происходит с хвостом: поле не
    // растягивается и не переносит, оно прокручивается.
    long: {
      label: 'Адрес подачи',
      value: 'Екатеринбург, улица Крестинского, дом 46, корпус 2, подъезд 3, домофон 214К',
      hint: '',
    },
    // Подпись в две строки при узком кадре — проверка, что зазор между
    // подписью и контролом остаётся один, а не удваивается.
    'long-label': {
      label: 'Комментарий диспетчера к последнему отменённому заказу',
      hint: 'Виден водителю в приложении',
    },
    filled: { value: 'Х777ХХ 96', hint: '' },
  },

  cases: [
    { id: 'base', title: 'Обычное', note: 'Подпись, поле, подсказка под ним.' },
    {
      id: 'error',
      title: 'С ошибкой',
      props: { value: 'АБВ', error: 'Не похоже на госномер: не хватает цифр' },
      note: 'Контракт семьи полей: ошибка ЗАМЕЩАЕТ подсказку, а не встаёт рядом.'
        + ' Два текста под полем читаются как одно сообщение, и подсказка,'
        + ' пережившая ошибку, спорит с ней. На контроле при этом появляется'
        + ' `aria-invalid`, а `aria-describedby` переезжает с подсказки на ошибку —'
        + ' видно это только в дереве доступности, картинка о связи молчит.',
    },
    {
      id: 'sizes',
      title: 'Два размера',
      note: 'Компактное и обычное рядом. `sm` — для тулбара, где поле стоит в'
        + ' строку с кнопками; в форме уменьшать поле нечем оправдать.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <TextField label="Компактное (sm)" size="sm" defaultValue={p.value} placeholder={p.placeholder} />
          <TextField label="Обычное (md)" size="md" defaultValue={p.value} placeholder={p.placeholder} />
        </div>
      ),
    },
    {
      id: 'disabled',
      title: 'Выключено и только чтение',
      note: 'Это РАЗНЫЕ ответы, и путать их дорого. Выключенное поле —'
        + ' «сейчас нельзя, вернитесь позже»: оно приглушено и выпадает из'
        + ' обхода табом. Только чтение — «значение окончательное»: оно'
        + ' читается обычным текстом, фокусируется и КОПИРУЕТСЯ. Номер счёта,'
        + ' выданный системой, обязан быть вторым, иначе его нельзя выделить.',
      render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <TextField label="Выключено" defaultValue="А123БВ 96" disabled />
          <TextField label="Только чтение" value="40817810099910004312" readOnly />
        </div>
      ),
    },
    {
      id: 'no-label',
      title: 'Без подписи',
      props: { label: '', hint: '' },
      note: 'Подписи нет — значит имени у поля нет ВООБЩЕ: `placeholder` именем'
        + ' не является и исчезает с первым введённым символом. Так поле ставят'
        + ' только в тулбаре и только с `aria-label` от потребителя; здесь его'
        + ' нет намеренно, чтобы дефект было видно в проверке доступности.',
    },
  ],

  render: (p) => <Live {...p} />,
})
