import { defineFixture } from '../../internal/fixture.js'
import { KeyValueList, type KeyValueItem } from './KeyValueList.js'
import { Badge } from '../Badge/Badge.js'

const ITEMS: KeyValueItem[] = [
  { id: 'num', label: 'Номер заказа', value: '4412-08' },
  { id: 'driver', label: 'Водитель', value: 'Иванов И. И.' },
  { id: 'car', label: 'Машина', value: 'Hyundai Solaris, А123ВС77' },
  { id: 'from', label: 'Подача', value: 'Москва, Тверская, 12' },
  { id: 'to', label: 'Назначение', value: 'Шереметьево, терминал D' },
  { id: 'sum', label: 'Сумма', value: '2 480,00 ₽' },
  { id: 'status', label: 'Статус', value: <Badge tone="success">проведён</Badge> },
  {
    id: 'note',
    label: 'Комментарий диспетчера',
    value: 'Клиент просил не звонить, писать в мессенджер. Багаж — два чемодана'
      + ' и детское кресло, кресло везёт водитель.',
  },
]

interface Props {
  columns: 1 | 2
  dividers: boolean
  dense: boolean
  count: number
}

export default defineFixture<Props>({
  name: 'KeyValueList',
  group: 'Данные',
  kind: 'block',

  props: { columns: 1, dividers: false, dense: false, count: 6 },

  controls: {
    // Числа перечислением, а не `number`: колонок ровно две возможные, и
    // крутилка со стрелками предлагала бы третью.
    columns: { kind: 'enum', values: ['1', '2'], numeric: true, prop: true },
    dividers: { kind: 'bool', prop: true },
    dense: { kind: 'bool', prop: true },
    count: { kind: 'number', min: 1, max: 8, prop: false },
  },

  data: {
    // Одна пара: карточка из одной строки. Список не должен выглядеть обрезанным.
    single: { count: 1 },
    // Всё вместе: узел в значении и длинный текст. Проверка, что колонка меток
    // не поедет от одного длинного значения.
    full: { count: 8, dividers: true },
    dense: { dense: true, count: 8, dividers: true },
  },

  slots: {
    value: {
      title: 'Значение первой пары',
      accepts: 'inline',
      prop: 'items[0].value',
      note: 'Значение — узел, а не строка, и это его контракт: сюда кладут Badge,'
        + ' ссылку, Money. Опасность в том, что вложенный компонент несёт свой'
        + ' кегль и свою высоту строки — пара перестаёт выравниваться с соседями.',
    },
  },

  cases: [
    { id: 'base', title: 'Обычный', note: 'Шесть пар в одну колонку.' },
    {
      id: 'columns',
      title: 'Одна колонка против двух',
      note: 'Две колонки экономят высоту и ломают чтение сверху вниз: глаз идёт'
        + ' по строке, а пары читаются парами. Выбор про то, СРАВНИВАЮТ значения'
        + ' или просто смотрят.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <KeyValueList items={ITEMS.slice(0, 6)} columns={1} dividers={p.dividers} />
          <KeyValueList items={ITEMS.slice(0, 6)} columns={2} dividers={p.dividers} />
        </div>
      ),
    },
    {
      id: 'dividers',
      title: 'С линейками',
      props: { dividers: true },
      note: 'Линейка между парами — вид реестра. Нужна, когда значений много и'
        + ' они разной высоты: без неё длинный комментарий склеивает соседние пары.',
    },
    {
      id: 'node-value',
      title: 'Узел в значении',
      note: 'Badge на месте значения. Смотреть надо не на бейдж, а на СОСЕДНЮЮ'
        + ' строку: не подскочила ли она относительно текстовых значений.',
      tinyTargets:
        'Ссылка «Открыть в новой вкладке» — значение строки «Чек», и её высота —'
        + ' межстрочный интервал этой строки, а не размер отдельной кнопки. Вырастить'
        + ' ссылку до 24 значило бы поднять строку «Чек» над соседними парами —'
        + ' SC 2.5.8 «inline».',
      render: (p) => (
        <KeyValueList
          items={[
            ITEMS[0]!,
            ITEMS[6]!,
            ITEMS[5]!,
            { id: 'link', label: 'Чек', value: <a href="#chk">Открыть в новой вкладке</a> },
          ]}
          dividers={p.dividers}
          dense={p.dense}
        />
      ),
    },
    {
      id: 'long-value',
      title: 'Длинное значение',
      props: { count: 8 },
      note: 'Комментарий диспетчера на три строки. Метка обязана остаться у ВЕРХА'
        + ' значения, а не уехать к его середине — иначе непонятно, к чему она.',
    },
  ],

  render: (p, slots) => {
    const items = ITEMS.slice(0, Math.max(1, p.count))
    const withSlot = slots.value
      ? [{ ...items[0]!, value: slots.value }, ...items.slice(1)]
      : items
    return (
      <KeyValueList
        items={withSlot}
        columns={Number(p.columns) === 2 ? 2 : 1}
        dividers={p.dividers}
        dense={p.dense}
      />
    )
  },
})
