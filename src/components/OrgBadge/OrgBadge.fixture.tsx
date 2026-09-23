/**
 * Значок организации. `kind: 'inline'` — его место в ячейке рядом с названием
 * банка.
 *
 * Предмет фикстуры — ТРИ разных состояния, которые легко принять за одно
 * «нет логотипа»:
 *  - логотип приехал;
 *  - организация известна, картинки нет → монограмма в плитке с ПУНКТИРОМ;
 *  - организация не опознана вовсе → «?» в плитке со СПЛОШНОЙ рамкой.
 *
 * Пунктир — не украшение, а инструмент инвентаризации: по нему видно, у кого
 * логотип не приехал, и отличить это от «мы не знаем, что это за организация».
 * Порознь второе и третье состояния выглядят одинаково — серая плитка с
 * символом, — поэтому случай ставит все три в один ряд.
 *
 * Третье состояние потребитель нашёл рендером: до этого оно жило только в
 * AGENTS.md и в тесте. Здесь оно видно.
 */
import { defineFixture } from '../../internal/fixture.js'
import { OrgBadge, type OrgBadgeSize } from './OrgBadge.js'

const SIZES: OrgBadgeSize[] = ['sm', 'md', 'lg']

/**
 * Логотип инлайном, а не ссылкой: значок обязан рисоваться без сети — у него
 * НЕТ отката по `onError` (на статической странице чинить обрыв нечем), и
 * сетевой адрес превратил бы случай «логотип приехал» в лотерею.
 *
 * Цвета названы словами, а не токенами: `<img>` изолирован от каскада, и
 * `var(--ds-*)` внутри `data:`-URI не резолвится вовсе — цвет здесь часть
 * содержимого картинки, как в настоящем логотипе, который в тёмной теме тоже
 * не перекрашивается.
 */
const LOGO =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' +
      '<rect width="48" height="48" rx="10" fill="teal"/>' +
      '<path d="M11 32 L24 14 L37 32 Z" fill="gold"/>' +
      '</svg>',
  )

const row = { display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' } as const
const col = { display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'center' } as const

interface Props {
  name: string
  letter: string
  withLogo: boolean
  decorative: boolean
  size: OrgBadgeSize
}

export default defineFixture<Props>({
  name: 'OrgBadge',
  group: 'Данные',
  kind: 'inline',

  props: { name: 'ОЗОН Банк', letter: 'О', withLogo: false, decorative: false, size: 'md' },

  controls: {
    name: { kind: 'text', prop: true },
    letter: { kind: 'text', prop: true },
    withLogo: { kind: 'bool', prop: false },
    decorative: { kind: 'bool', prop: true },
    size: { kind: 'enum', values: SIZES, prop: true },
  },

  data: {
    // Буква задаётся, а не выводится: «ОЗОН Банк» → «О», тогда как Avatar на
    // том же названии дал бы «ОБ». Разное происхождение буквы — причина, по
    // которой это отдельный компонент, а не размер аватара.
    unnamed: { letter: '' },
    long: { name: 'Акционерное общество «Российский Сельскохозяйственный банк»', letter: 'Р' },
  },

  cases: [
    { id: 'base', title: 'Монограмма', note: 'Организация известна, логотипа нет.' },
    {
      id: 'three-states',
      title: 'Логотип, пунктир, «не опознана»',
      note:
        'Три состояния в одном ряду. Пунктир означает «организация известна, ' +
        'картинка не приехала» — по нему делают инвентаризацию логотипов. ' +
        'Сплошная рамка с «?» означает другое: организацию не опознали вовсе. ' +
        'Порознь второе и третье — просто серая плитка с символом, и различие ' +
        'между «нет картинки» и «нет организации» пропадает.',
      render: (p) => (
        <span style={row}>
          <span style={col}>
            <OrgBadge name={p.name} letter={p.letter} src={LOGO} size={p.size} />
            <small>логотип</small>
          </span>
          <span style={col}>
            <OrgBadge name={p.name} letter={p.letter} size={p.size} />
            <small>пунктир</small>
          </span>
          <span style={col}>
            <OrgBadge name="Неизвестная организация" size={p.size} />
            <small>не опознана</small>
          </span>
        </span>
      ),
    },
    {
      id: 'broken',
      title: 'Битый адрес логотипа',
      note:
        'Отката по onError у значка НЕТ намеренно: страница статическая, ' +
        'гидрации нет, обработчик не подключится — и «починка» была бы обещанием, ' +
        'которого компонент не выполняет. Слева битый src: плитка остаётся ' +
        'пустой, и это честнее подменённой буквы. Выбор «логотип или буква» ' +
        'делает сервер, эмитя src только тем, у кого файл есть. Справа — как ' +
        'должно выглядеть, когда сервер решил не давать картинку.',
      render: (p) => (
        <span style={row}>
          <OrgBadge name={p.name} letter={p.letter} src="/нет-такого-логотипа.svg" size={p.size} />
          <OrgBadge name={p.name} letter={p.letter} size={p.size} />
        </span>
      ),
    },
    {
      id: 'decorative',
      title: 'Рядом с названием',
      note:
        'Значок плюс название текстом — самая частая связка, и умолчание в ней ' +
        'даёт дубль: скринридер называет банк дважды. decorative убирает плитку ' +
        'из дерева доступности целиком. Глазами оба ряда одинаковы — разница ' +
        'видна во вкладке axe и в дереве доступности, а не в кадре.',
      render: (p) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={row}>
            <OrgBadge name={p.name} letter={p.letter} src={LOGO} size={p.size} decorative />
            <span>{p.name} — с decorative</span>
          </span>
          <span style={row}>
            <OrgBadge name={p.name} letter={p.letter} src={LOGO} size={p.size} />
            <span>{p.name} — без него, имя звучит дважды</span>
          </span>
        </span>
      ),
    },
    {
      id: 'sizes',
      title: 'Размеры',
      note: 'sm/md/lg: плитка квадратная во всех — форма отличает организацию от человека.',
      render: (p) => (
        <span style={row}>
          {SIZES.map((s) => (
            <OrgBadge key={s} name={p.name} letter={p.letter} src={LOGO} size={s} />
          ))}
        </span>
      ),
    },
  ],

  render: (p) => (
    <OrgBadge
      name={p.name}
      letter={p.letter || undefined}
      src={p.withLogo ? LOGO : undefined}
      decorative={p.decorative}
      size={p.size}
    />
  ),
})
