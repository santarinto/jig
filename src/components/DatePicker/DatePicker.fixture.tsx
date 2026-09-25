import { useEffect, useRef, useState } from 'react'
import { defineFixture } from '../../internal/fixture.js'
import { DatePicker } from './DatePicker.js'

/**
 * Поле даты — ДВА способа ввода в одном контроле: печатают ДД.ММ.ГГГГ руками
 * или выбирают в календаре. Отсюда все его нетривиальные случаи: они про то,
 * что происходит на СТЫКЕ — набранное руками нормализуется по уходу фокуса,
 * а не по каждому символу, и вне диапазона откатывается к прежнему значению.
 *
 * Значение снаружи — всегда ISO (`ГГГГ-ММ-ДД`), на экране — всегда точки.
 * Путать их дорого: `min`/`max` тоже ISO, и записанные точками они молча
 * перестают ограничивать.
 */

interface Props {
  label: string
  value: string
  hint: string
  error: string
  min: string
  max: string
  size: 'sm' | 'md'
  disabled: boolean
}

function Live({ value, min, max, ...rest }: Props) {
  const [v, setV] = useState(value)
  return (
    <DatePicker
      {...rest}
      value={v}
      onChange={setV}
      min={min || undefined}
      max={max || undefined}
      label={rest.label || undefined}
      hint={rest.hint || undefined}
      error={rest.error || undefined}
    />
  )
}

/** Открывает календарь при монтировании — см. ту же оснастку у `Combobox`. */
function Opened(props: Props) {
  const box = useRef<HTMLDivElement>(null)
  // Открывается РОВНО ОДИН РАЗ, и сторож обязателен. Кадр верстака работает
  // под `StrictMode`, а он в разработке прогоняет эффект дважды — два клика по
  // триггеру это открыть и тут же закрыть. Поймано глазами в chromium: jsdom
  // `StrictMode` не включает, и `fixtures-render` был зелёным на обеих версиях.
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current) return
    opened.current = true
    box.current?.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')?.click()
  }, [])
  return <div ref={box}><Live {...props} /></div>
}

export default defineFixture<Props>({
  name: 'DatePicker',
  group: 'Управление',
  kind: 'block',

  props: {
    label: 'Дата подачи',
    value: '2026-08-30',
    hint: 'Формат ДД.ММ.ГГГГ',
    error: '',
    min: '',
    max: '',
    size: 'md',
    disabled: false,
  },

  controls: {
    label: { kind: 'text', prop: true },
    value: { kind: 'text', prop: true },
    hint: { kind: 'text', prop: true },
    error: { kind: 'text', prop: true },
    min: { kind: 'text', prop: true },
    max: { kind: 'text', prop: true },
    size: { kind: 'enum', values: ['sm', 'md'], prop: true },
    disabled: { kind: 'bool', prop: true },
  },

  data: {
    empty: { value: '', hint: 'Дата не выбрана — крестика нет' },
    // Диапазон: числа за границей в календаре погашены, а набранное руками
    // за границей ОТКАТЫВАЕТСЯ, а не подтягивается к краю.
    bounded: { value: '2026-08-30', min: '2026-08-24', max: '2026-09-06', hint: 'Только текущая неделя и следующая' },
    past: { label: 'Дата закрытия смены', value: '2026-08-29', max: '2026-08-30', hint: 'Задним числом не позже вчерашнего' },
  },

  cases: [
    {
      id: 'base',
      title: 'Закрытое',
      note: 'Так поле и живёт в форме: текст с точками, крестик и кнопка'
        + ' календаря справа. Крестик появляется только при непустом значении.',
      // Роли узлов (JIG-42, decisions 1.9): крестик у `base` есть — значение
      // непустое умолчанием фикстуры (`props.value`).
      nodes: { toggle: '.ds-datepicker__btn', clear: '.ds-datepicker__clear', input: '.ds-datepicker__input' },
    },
    {
      id: 'open',
      title: 'С календарём',
      note: 'Календарь открывает себя при монтировании: закрытое поле про'
        + ' половину компонента молчит. Поповер — `role="dialog"` с именем'
        + ' «Выбор даты», а не безымянный слой; закрывается Esc с возвратом'
        + ' фокуса на ввод. Внутри — обычный `Calendar`, тот же, что стоит'
        + ' сам по себе.',
      // Открытость календаря — весь предмет случая; без объявления кадр,
      // показывающий закрытое поле, ничем не отличался бы от `base`.
      shows: ['[role="dialog"]', '[aria-expanded="true"]'],
      render: (p) => <Opened {...p} />,
      // Роли узлов: те же, что у `base`, плюс открытая панель (JIG-42, decisions 1.9).
      nodes: {
        toggle: '.ds-datepicker__btn',
        clear: '.ds-datepicker__clear',
        input: '.ds-datepicker__input',
        panel: '.ds-datepicker__popup',
      },
    },
    {
      id: 'range',
      title: 'Диапазон',
      props: { value: '2026-08-30', min: '2026-08-24', max: '2026-09-06', hint: 'Только текущая неделя и следующая' },
      note: 'Границы — ISO, как и значение. Числа вне диапазона в календаре'
        + ' погашены, а вот НАБРАННОЕ РУКАМИ вне диапазона ведёт себя иначе:'
        + ' оно не кламплется к краю, а откатывается к прежнему значению по'
        + ' уходу фокуса. Это намеренно — подтянутая к границе дата выглядит'
        + ' как принятая, и человек уходит из формы с чужим числом.',
      shows: ['[role="dialog"]'],
      render: (p) => <Opened {...p} />,
    },
    {
      id: 'typing',
      title: 'Ввод руками',
      props: { value: '', hint: 'Наберите 30.08.2026 — значение примется, как только строка станет датой' },
      note: 'Печатать в поле можно, и это главный путь для тех, кто вводит'
        + ' десятки дат подряд. Значение наружу уходит, как только строка'
        + ' разобралась в дату И попала в диапазон; недобранное состояние'
        + ' («30.08.20») наружу не уезжает вовсе. Мусор чинится по уходу'
        + ' фокуса — возвращается прежнее, поле не остаётся с «фывфыв».',
    },
    {
      id: 'error',
      title: 'С ошибкой',
      props: { value: '2026-07-01', error: 'Смена за июль уже закрыта, дату изменить нельзя', hint: '' },
      note: 'Краснеет ввод, а не вся коробка: рамка тут на вводе, кнопки стоят'
        + ' рядом со своей поверхностью. Ошибка вытесняет подсказку — контракт'
        + ' семьи.',
    },
    {
      id: 'disabled',
      title: 'Выключено',
      props: { disabled: true, value: '2026-08-30' },
      // Дата непустая намеренно: крестик рисуется только при непустой, и
      // случай без значения показывал бы одну кнопку из двух.
      shows: ['button[aria-label="Очистить"]:disabled', 'button[aria-label="Открыть календарь"]:disabled'],
      note: 'Выключено ВСЁ поле: и крестик, и кнопка календаря — `disabled`,'
        + ' таб перескакивает поле целиком, календарь не открыть. До'
        + ' DS-133 `disabled` уезжал в `...rest` и садился на один ввод:'
        + ' крестик очищал дату, менять которую запрещено. Выключение ещё и'
        + ' ЗАКРЫВАЕТ открытый календарь — как у `Combobox`, иначе на экране'
        + ' остался бы рабочий выбор даты. Держит гейт `field-disabled`.',
    },
  ],

  render: (p) => <Live {...p} />,
})
