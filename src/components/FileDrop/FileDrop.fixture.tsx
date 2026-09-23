import { useState } from 'react'
import { defineFixture } from '../../internal/fixture.js'
import { FileDrop } from './FileDrop.js'

/**
 * Из общей семьи полей берёт только типографику подписи: корень у него свой
 * (`.ds-filedrop`), потому что `.ds-field` объявляет `display` и два правила
 * одного веса на одном узле сделали бы раскладку зависимой от порядка листов.
 *
 * ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ. Состояния «файл над зоной» (`.is-dragover`) отдельным
 * случаем нет: оно живёт ровно столько, сколько курсор с файлом висит над
 * зоной, и кадр, который его «показывает», показывал бы подделку. Смотреть его
 * надо перетаскиванием настоящего файла — руками, в этой же странице.
 */

/** Файлы для стенда: содержимое не важно, важны имя и размер. */
const file = (name: string, kb: number) =>
  new File([new Uint8Array(kb * 1024)], name, { type: 'application/octet-stream' })

const ONE = [file('Путевой лист 30.08.pdf', 240)]
const MANY = [
  file('Путевой лист 30.08.pdf', 240),
  file('Скан ПТС.jpg', 1830),
  file('Договор аренды автомобиля с правом выкупа — приложение 2.docx', 96),
]

interface Props {
  label: string
  hint: string
  accept: string
  multiple: boolean
  disabled: boolean
  files: File[]
}

function Live({ files, accept, hint, ...rest }: Props) {
  const [list, setList] = useState(files)
  return (
    <FileDrop
      {...rest}
      files={list}
      onFiles={setList}
      accept={accept || undefined}
      hint={hint || undefined}
      label={rest.label || undefined}
    />
  )
}

export default defineFixture<Props>({
  name: 'FileDrop',
  group: 'Управление',
  kind: 'block',

  props: {
    label: 'Документы по рейсу',
    hint: 'PDF или фото, до 10 МБ',
    accept: '',
    multiple: true,
    disabled: false,
    files: [],
  },

  controls: {
    label: { kind: 'text', prop: true },
    hint: { kind: 'text', prop: true },
    accept: { kind: 'text', prop: true },
    multiple: { kind: 'bool', prop: true },
    disabled: { kind: 'bool', prop: true },
    // `files` крутилки не получает: `File[]` не выражается ни одним из четырёх
    // видов. Подменяется наборами данных.
  },

  data: {
    loaded: { files: MANY },
    single: { multiple: false, files: ONE, label: 'Скан паспорта', hint: 'Один файл' },
    images: { accept: 'image/*', hint: 'Только изображения', files: [] },
  },

  cases: [
    {
      id: 'base',
      title: 'Пустая зона',
      note: 'Зона — `role="button"`, и имя ей даёт подпись через'
        + ' `aria-labelledby`: до DS-109 диктор объявлял её просто'
        + ' «кнопка». Настоящий `<input type="file">` при этом СОСЕД зоны, а не'
        + ' её потомок — внутри он был бы интерактивным элементом внутри'
        + ' интерактивного, и безвредным его делало одно `display: none` в'
        + ' чужом листе. Клик по подписи открывает диалог: `htmlFor` смотрит на'
        + ' ввод, и это его родное поведение.',
    },
    {
      id: 'files',
      title: 'С файлами',
      props: { files: MANY },
      note: 'Список под зоной, а не вместо неё: добавить ещё один файл можно и'
        + ' когда три уже лежат. Имя длиннее строки обрезается, но целиком'
        + ' остаётся в `title` — в списке вложений имена часто отличаются'
        + ' только хвостом, и обрезанное без подсказки не различить.',
    },
    {
      id: 'single',
      title: 'Один файл',
      props: { multiple: false, files: ONE, label: 'Скан паспорта', hint: 'Один файл' },
      note: 'Без `multiple` новый файл ЗАМЕЩАЕТ прежний, а не встаёт вторым.'
        + ' Проверять надо именно этим: бросить второй файл в непустую'
        + ' одиночную зону — в списке обязан остаться один.',
    },
    {
      id: 'accept',
      title: 'Ограничение по типу',
      props: { accept: 'image/*', hint: 'Только изображения', files: [] },
      note: '`accept` фильтрует диалог выбора — и ТОЛЬКО его. Перетаскиванием'
        + ' в зону кладётся что угодно: браузер тут ничего не проверяет, и'
        + ' компонент тоже. Значит проверка типа — на потребителе, а подсказка'
        + ' под зоной это не гарантия, а обещание.',
    },
    {
      id: 'disabled',
      title: 'Выключено',
      props: { disabled: true, files: MANY },
      // Список файлов, а не зона: зона гасилась правильно с самого начала,
      // и ровно поэтому дефект в кнопках списка был тише, чем у соседей.
      shows: ['[aria-disabled="true"]', 'button[aria-label^="Удалить"]:disabled'],
      note: 'Выключено ВСЁ поле, вместе со списком. Зона гасится своим'
        + ' способом — `tabIndex={-1}`, `aria-disabled`, диалог не открывается:'
        + ' `<div role="button">` не контрол, `disabled` к нему не применим.'
        + ' Крестики в списке — настоящие кнопки, у них `disabled`. До'
        + ' DS-133 они оставались живыми, и это был самый тихий из трёх'
        + ' одинаковых дефектов: поле выглядело аккуратно выключенным, а'
        + ' добавить файл было нельзя при том, что удалить — можно.'
        + ' Держит гейт `field-disabled`.',
    },
  ],

  render: (p) => <Live {...p} />,
})
