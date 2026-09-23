import { useState } from 'react'
import { defineFixture } from '../../internal/fixture.js'
import { Checkbox } from './Checkbox.js'
import { Radio } from './Radio.js'
import { Switch } from './Switch.js'

/**
 * Каталог держит ТРИ переключателя в одном каталоге, и фикстура тоже одна —
 * файл именуется по каталогу, а не по экспорту (`registry.ts`, `kinds-plugin`).
 *
 * Это не компромисс с инструментом, а верное описание предмета: выбор между
 * флажком, радио и тумблером — это ОДИН вопрос («сколько из скольких и когда
 * применяется»), и отвечать на него надо, видя все три рядом. Разложенные по
 * трём страницам, они сравниваются по памяти, а память тут врёт.
 */

type Kind = 'checkbox' | 'radio' | 'switch'

interface Props {
  kind: Kind
  label: string
  checked: boolean
  disabled: boolean
  indeterminate: boolean
}

function Live({ kind, label, disabled, indeterminate, checked: init }: {
  kind: Kind
  label: string
  disabled: boolean
  indeterminate: boolean
  checked: boolean
}) {
  const [on, setOn] = useState(init)
  const common = {
    label,
    disabled,
    checked: on,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setOn(e.currentTarget.checked),
  }
  if (kind === 'radio') return <Radio {...common} name="fixture" />
  if (kind === 'switch') return <Switch {...common} />
  return <Checkbox {...common} indeterminate={indeterminate} />
}

export default defineFixture<Props>({
  name: 'Toggle',
  group: 'Управление',
  kind: 'inline',

  props: {
    kind: 'checkbox',
    label: 'Только свободные машины',
    checked: false,
    disabled: false,
    indeterminate: false,
  },

  controls: {
    kind: { kind: 'enum', values: ['checkbox', 'radio', 'switch'], prop: false },
    label: { kind: 'text', prop: true },
    checked: { kind: 'bool', prop: true },
    disabled: { kind: 'bool', prop: true },
    indeterminate: { kind: 'bool', prop: true },
  },

  data: {
    // Третье состояние флажка. Оно НЕ «выключено» и не «включено», и путать их
    // нельзя: «часть выбрана» — ответ на другой вопрос.
    mixed: { kind: 'checkbox', indeterminate: true, label: 'Выбрано 3 из 12' },
    // Длинная подпись: предмет — выравнивание квадратика по ПЕРВОЙ строке,
    // а не по центру абзаца.
    long: {
      label: 'Присылать уведомление, когда водитель отклоняется от маршрута'
        + ' больше чем на два километра или стоит дольше пятнадцати минут',
    },
    off: { disabled: true, checked: true },
  },

  cases: [
    { id: 'base', title: 'Флажок', note: 'Обычный флажок с подписью.' },
    {
      id: 'three',
      title: 'Три переключателя рядом',
      note: 'Ради этого случая фикстура одна на каталог. Флажок — «да/нет» для'
        + ' каждого пункта; радио — «один из»; тумблер — «применяется немедленно».'
        + ' Разница в СМЫСЛЕ, а не в виде, и её надо видеть рядом.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <Live kind="checkbox" label="Флажок: включать отменённые" checked={p.checked} disabled={false} indeterminate={false} />
          <Live kind="radio" label="Радио: один из вариантов" checked={p.checked} disabled={false} indeterminate={false} />
          <Live kind="switch" label="Тумблер: применяется сразу" checked={p.checked} disabled={false} indeterminate={false} />
        </div>
      ),
    },
    {
      id: 'indeterminate',
      title: 'Частичный выбор',
      props: { kind: 'checkbox', indeterminate: true, label: 'Выбрано 3 из 12' },
      note: 'Третье состояние флажка. Оно живёт ТОЛЬКО в свойстве DOM-узла —'
        + ' атрибута для него нет, и разметка о нём не расскажет. Проверять надо'
        + ' на живом узле, картинка тут не свидетель.',
    },
    {
      id: 'radio-group',
      title: 'Группа радио',
      note: 'Радио в одиночку бессмысленно: смысл ему даёт группа с общим `name`.'
        + ' Одно радио на экране — почти всегда ошибка выбора компонента, там нужен'
        + ' флажок или тумблер.',
      render: () => (
        <fieldset style={{ border: '1px solid var(--ds-border)', borderRadius: '4px', padding: '0.75rem' }}>
          <legend style={{ padding: '0 0.375rem' }}>Тип оплаты</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Radio name="pay" label="Наличные" defaultChecked />
            <Radio name="pay" label="Карта" />
            <Radio name="pay" label="Корпоративный счёт" />
            <Radio name="pay" label="Бонусы" disabled />
          </div>
        </fieldset>
      ),
    },
    {
      id: 'disabled',
      title: 'Выключенные',
      note: 'Выключенное состояние обязано читаться и во включённом положении:'
        + ' серый квадратик без галочки и серый с галочкой — разные ответы, и'
        + ' приглушение не должно их слить.',
      render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <Checkbox label="Выключен, снят" disabled />
          <Checkbox label="Выключен, стоит" disabled defaultChecked />
          <Switch label="Тумблер выключен, включён" disabled defaultChecked />
        </div>
      ),
    },
  ],

  render: (p) => (
    <Live
      kind={p.kind}
      label={p.label}
      checked={p.checked}
      disabled={p.disabled}
      indeterminate={p.indeterminate}
    />
  ),
})
