/**
 * Аватар. `kind: 'inline'` — он стоит в ячейке строки рядом с именем.
 *
 * Ради чего фикстура вообще нужна: кольцо присутствия рисуется `box-shadow`, а
 * не `border`, и увидеть разницу можно ТОЛЬКО сравнением. Внешний размер рамка
 * бы не изменила (в системе `box-sizing: border-box`) — она съела бы
 * содержимое: при кольце 4px фотография ужимается с 26×26 до 20×20, теряя почти
 * четверть площади лица, а сам аватар выглядит прежним. Это замерено, и это
 * ровно тот дефект, который проходит любую проверку «размер элемента не
 * изменился».
 *
 * Поэтому случай «кольцо» ставит аватар с присутствием рядом с аватаром без
 * него: утверждается не «кольцо есть», а «содержимое не сжалось».
 */
import { defineFixture } from '../../internal/fixture.js'
import { Avatar, type AvatarPresence, type AvatarSize, type AvatarTone } from './Avatar.js'

const SIZES: AvatarSize[] = ['sm', 'md', 'lg']
const TONES: AvatarTone[] = ['neutral', 'accent']
const PRESENCE: AvatarPresence[] = ['online', 'busy', 'away', 'offline']

/**
 * Фото — data-URI, а не сеть: фикстура обязана рисовать одно и то же без
 * интернета, иначе случай «фото не загрузилось» станет случайным, а не
 * объявленным.
 *
 * Цвета здесь названы словами, а не токенами `--ds-*`, и это не обход правила
 * системы: `<img>` изолирован от каскада, `var(--ds-*)` внутри `data:`-URI не
 * резолвится в принципе. То есть цвет тут — часть СОДЕРЖИМОГО картинки, ровно
 * как в настоящей фотографии, которая в тёмной теме тоже не перекрашивается.
 * Именно поэтому подстановка токена была бы не строже, а сломана.
 */
const PHOTO =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">' +
      '<rect width="64" height="64" fill="seagreen"/>' +
      '<circle cx="32" cy="24" r="12" fill="white"/>' +
      '<path d="M8 64c4-16 14-24 24-24s20 8 24 24z" fill="white"/>' +
      '</svg>',
  )

const row = { display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' } as const
const col = { display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'center' } as const

interface Props {
  name: string
  withPhoto: boolean
  size: AvatarSize
  tone: AvatarTone
  presence: AvatarPresence | ''
}

export default defineFixture<Props>({
  name: 'Avatar',
  group: 'Данные',
  kind: 'inline',

  props: { name: 'Пётр Иванов', withPhoto: false, size: 'md', tone: 'neutral', presence: '' },

  controls: {
    name: { kind: 'text', prop: true },
    withPhoto: { kind: 'bool', prop: false },
    size: { kind: 'enum', values: SIZES, prop: true },
    tone: { kind: 'enum', values: TONES, prop: true },
    presence: { kind: 'enum', values: ['', ...PRESENCE], prop: true },
  },

  data: {
    // Одно слово: инициал ровно один, и центрировать его надо так же.
    single: { name: 'Иванов' },
    // Три слова: инициалов всё равно два — иначе метка перестанет читаться.
    triple: { name: 'Иванов Пётр Аполлинарьевич' },
    // Битый адрес: `onError` обязан вернуть инициалы, а не пустой круг.
    broken: { withPhoto: true, name: 'Пётр Иванов' },
  },

  cases: [
    { id: 'base', title: 'Инициалы', note: 'Без фото — две буквы из имени.' },
    {
      id: 'ring',
      title: 'Кольцо не ест содержимое',
      note:
        'Слева аватар с кольцом присутствия, справа — без него, тот же размер и ' +
        'то же фото. Кольцо — box-shadow: внешний размер у обоих одинаков, и ' +
        'лицо тоже одного размера. Будь оно border, правый и левый снаружи ' +
        'совпали бы всё равно (box-sizing: border-box), а вот фото слева ужалось ' +
        'бы с 26 до 20 — замеряно. Одиночный аватар с кольцом этот дефект ' +
        'скрывает: он выглядит нормальным.',
      render: (p) => (
        <span style={row}>
          <span style={col}>
            <Avatar name={p.name} src={PHOTO} size={p.size} presence="online" />
            <small>с кольцом</small>
          </span>
          <span style={col}>
            <Avatar name={p.name} src={PHOTO} size={p.size} />
            <small>без кольца</small>
          </span>
        </span>
      ),
    },
    {
      id: 'presence',
      title: 'Все состояния присутствия',
      note:
        'Четыре кольца рядом: цвет кодирует состояние, а не величину. offline — ' +
        'нейтральное кольцо, а не отсутствие кольца: «не в сети» это известное ' +
        'состояние, а отсутствие означало бы «неизвестно». Подпись уходит в ' +
        'доступное имя («Пётр Иванов, в сети»), потому что цвет читает не каждый.',
      render: (p) => (
        <span style={row}>
          {PRESENCE.map((pr) => (
            <span key={pr} style={col}>
              <Avatar name={p.name} src={PHOTO} size={p.size} presence={pr} />
              <small>{pr}</small>
            </span>
          ))}
        </span>
      ),
    },
    {
      id: 'fallback',
      title: 'Фото не загрузилось',
      note:
        'Слева адрес битый — сработал onError и вернул инициалы; справа то же ' +
        'имя с живым фото. Пустой круг здесь был бы худшим исходом: он выглядит ' +
        'как аватар без имени, а не как «фото не приехало».',
      render: (p) => (
        <span style={row}>
          <Avatar name={p.name} src="/нет-такого-файла.png" size={p.size} />
          <Avatar name={p.name} src={PHOTO} size={p.size} />
        </span>
      ),
    },
    {
      id: 'sizes',
      title: 'Размеры',
      note: 'sm/md/lg с кольцом: кольцо масштабируется вместе с аватаром, а не остаётся 4px.',
      render: (p) => (
        <span style={row}>
          {SIZES.map((s) => (
            <Avatar key={s} name={p.name} src={PHOTO} size={s} presence="busy" />
          ))}
        </span>
      ),
    },
  ],

  render: (p) => (
    <Avatar
      name={p.name}
      src={p.withPhoto ? PHOTO : undefined}
      size={p.size}
      tone={p.tone}
      presence={p.presence === '' ? undefined : p.presence}
    />
  ),
})
