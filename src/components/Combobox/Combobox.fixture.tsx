import { useEffect, useRef, useState } from 'react'
import { defineFixture } from '../../internal/fixture.js'
import { Combobox, type ComboboxOption } from './Combobox.js'

/**
 * Единственное поле волны, у которого список рисует НЕ браузер, а мы — и потому
 * единственное, чей главный случай в статике не виден: закрытый комбобокс
 * выглядит как `Select` и ничего про себя не рассказывает.
 *
 * Поэтому случай «открыт» открывает себя сам, при монтировании. Это решение про
 * ФИКСТУРУ, а не про компонент: кадр, показывающий закрытый прямоугольник там,
 * где вся разница в выпавшем списке, — это пустая страница с подписью.
 */

const CURRENCIES: ComboboxOption[] = [
  { value: 'rub', label: 'Рубль' },
  { value: 'usd', label: 'Доллар США' },
  { value: 'eur', label: 'Евро' },
  { value: 'kzt', label: 'Тенге' },
  { value: 'byn', label: 'Белорусский рубль' },
]

const DRIVERS: ComboboxOption[] = [
  'Абдуллаев Р. К.', 'Белых И. С.', 'Ветров П. А.', 'Гаджиев М. М.',
  'Дорохов А. В.', 'Ерёменко С. Н.', 'Жуков К. Л.', 'Зайцева О. И.',
  'Иванов Д. Д.', 'Ковалёв Т. Р.', 'Латыпов Н. Х.', 'Мельник В. В.',
].map((label, i) => ({ value: `d${i}`, label }))

interface Props {
  label: string
  value: string
  options: ComboboxOption[]
  placeholder: string
  size: 'sm' | 'md'
  error: string
  disabled: boolean
  creatable: boolean
}

function Live({ value, options, creatable, ...rest }: Props) {
  const [v, setV] = useState(value)
  const [list, setList] = useState(options)
  return (
    <Combobox
      {...rest}
      options={list}
      value={v}
      onChange={setV}
      label={rest.label || undefined}
      error={rest.error || undefined}
      onCreate={creatable
        ? (label) => {
            const opt = { value: `new-${list.length}`, label }
            setList([...list, opt])
            setV(opt.value)
          }
        : undefined}
    />
  )
}

/**
 * Открывает список сразу после монтирования — кликом по триггеру, а не подменой
 * внутреннего состояния: открытость у компонента своя, и лезть в неё значило бы
 * показывать в кадре не то, что увидит потребитель.
 */
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
    box.current?.querySelector<HTMLButtonElement>('button[aria-haspopup]')?.click()
  }, [])
  return <div ref={box}><Live {...props} /></div>
}

export default defineFixture<Props>({
  name: 'Combobox',
  group: 'Управление',
  kind: 'inline',

  props: {
    label: 'Валюта',
    value: 'rub',
    options: CURRENCIES,
    placeholder: 'Выберите…',
    size: 'md',
    error: '',
    disabled: false,
    creatable: false,
  },

  controls: {
    label: { kind: 'text', prop: true },
    value: { kind: 'text', prop: true },
    placeholder: { kind: 'text', prop: true },
    size: { kind: 'enum', values: ['sm', 'md'], prop: true },
    error: { kind: 'text', prop: true },
    disabled: { kind: 'bool', prop: true },
    // Пропа `creatable` нет: включённым он даёт компоненту `onCreate`, а
    // функцию крутилкой не выразить.
    creatable: { kind: 'bool', prop: false },
    // `options` крутилки не получает — см. ту же причину у `Select`.
  },

  data: {
    // Двенадцать водителей: ради этого списка комбобокс и берут вместо
    // `Select` — искать по подстроке в пяти пунктах незачем.
    drivers: { label: 'Водитель', options: DRIVERS, value: 'd4', placeholder: 'Начните вводить фамилию' },
    empty: { label: 'Тариф', options: [], value: '', placeholder: 'Тарифов пока нет' },
    creating: { label: 'Метка', options: DRIVERS.slice(0, 3), value: '', creatable: true },
  },

  cases: [
    {
      id: 'base',
      title: 'Закрытый',
      note: 'Так он и стоит в форме: снаружи — обычное поле с выбранным значением.'
        + ' Имя у него склеенное, «Валюта Рубль»: подпись плюс текущее значение,'
        + ' и метка одна такого дать не может — это единственное поле системы,'
        + ' где `aria-labelledby` не костыль, а требование виджета.',
    },
    {
      id: 'open',
      title: 'Открыт',
      note: 'Открывается сам при монтировании, иначе весь смысл компонента'
        + ' остался бы за кадром. Сверху — поле поиска, ниже — отфильтрованный'
        + ' список; каждая строка это `<li role="option">` БЕЗ вложенной кнопки'
        + ' (гейт `no-nested-interactive` рендерит его именно открытым).'
        + ' Проверять тут надо клавиатурой: стрелки водят активную строку, Esc'
        + ' закрывает и ВОЗВРАЩАЕТ фокус на триггер, а клик мимо закрывает и'
        + ' фокус не возвращает — причина закрытия разная, поведение тоже.',
      // Раскрытость — ВЕСЬ предмет случая, и утверждается она здесь, а не
      // высотой кадра: поповер вынут из потока, схлопнувшись он оставляет те
      // же 113px (замер, DS-134).
      shows: ['[role="listbox"]', '[role="option"]', '[aria-expanded="true"]'],
      render: (p) => <Opened {...p} />,
    },
    {
      id: 'search',
      title: 'Список длиннее экрана',
      props: { label: 'Водитель', options: DRIVERS, value: 'd4', placeholder: 'Начните вводить фамилию' },
      note: 'Двенадцать пунктов — та граница, за которой комбобокс становится'
        + ' лучше `Select`: искать по подстроке в пяти пунктах незачем, а в'
        + ' сотне без поиска нельзя. Открыть и набрать «ов» — останутся'
        + ' Дорохов, Иванов, Ковалёв.',
      shows: ['[role="listbox"]', '[role="option"]'],
      render: (p) => <Opened {...p} />,
    },
    {
      id: 'create',
      title: 'Создание на лету',
      props: { label: 'Метка', options: DRIVERS.slice(0, 3), value: '', creatable: true },
      note: 'Набранное, не совпавшее ни с одним пунктом, предлагается создать'
        + ' отдельной строкой. Строка появляется ТОЛЬКО когда `onCreate` передан'
        + ' и запрос ничему не равен — иначе список предлагал бы создать то,'
        + ' что в нём уже есть.',
      shows: ['[role="listbox"]', '[role="option"]'],
      render: (p) => <Opened {...p} />,
    },
    {
      id: 'error',
      title: 'С ошибкой',
      props: { value: '', error: 'Валюта обязательна: без неё тариф не пересчитать' },
      note: 'Краснеет поверхность триггера — та же группа `field-surface.css`,'
        + ' что у `Select`, и это не совпадение, а условие: два поля рядом,'
        + ' покрасневшие по-разному, читаются как разные виды ошибки.',
    },
    {
      id: 'disabled',
      title: 'Выключен',
      props: { disabled: true },
      note: 'Выключение не только гасит триггер, но и ЗАКРЫВАЕТ список:'
        + ' поле, выключенное при открытом списке, оставило бы живой поповер'
        + ' над мёртвым полем. Проверять надо именно так — открыть, потом'
        + ' выключить крутилкой.',
    },
  ],

  render: (p) => <Live {...p} />,
})
