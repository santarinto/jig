import type { ReactNode } from 'react'
import { OrgBadge } from '@santarinto/jig'

// Логотип инлайном (data:), а не ссылкой на сеть: карточка обязана рисоваться
// без внешних запросов, и это ровно тот случай, ради которого у OrgBadge нет
// отката по onError — на статической странице чинить обрыв всё равно нечем.
const logo =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' +
      '<rect width="48" height="48" rx="10" fill="#0A5C5C"/>' +
      '<path d="M11 32 L24 14 L37 32 Z" fill="#F2C94C"/>' +
      '</svg>',
  )

const Cell = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: 'grid', gap: 'var(--ds-space-2)', justifyItems: 'center' }}>
    {children}
    <span style={{ color: 'var(--ds-text-muted)', fontSize: 'var(--ds-fs-sm)' }}>{label}</span>
  </div>
)

/**
 * Монограмма **задаётся**, а не выводится из названия: «ОЗОН Банк» → «О».
 * `Avatar` вывел бы «ОБ» по двум первым словам — он про людей, где это верно.
 */
export const Default = () => (
  <div style={{ display: 'flex', gap: 'var(--ds-space-5)', alignItems: 'flex-end' }}>
    <Cell label="sm">
      <OrgBadge name="ОЗОН Банк" letter="О" size="sm" />
    </Cell>
    <Cell label="md">
      <OrgBadge name="Тинькофф" letter="Т" />
    </Cell>
    <Cell label="lg">
      <OrgBadge name="Сбербанк" letter="С" size="lg" />
    </Cell>
  </div>
)

/**
 * С логотипом. Форма — квадрат (организация, не человек), скругление —
 * системное.
 */
export const WithLogo = () => (
  <div style={{ display: 'flex', gap: 'var(--ds-space-5)', alignItems: 'flex-end' }}>
    <Cell label="sm">
      <OrgBadge name="Казначейство" src={logo} size="sm" />
    </Cell>
    <Cell label="md">
      <OrgBadge name="Казначейство" src={logo} />
    </Cell>
    <Cell label="lg">
      <OrgBadge name="Казначейство" src={logo} size="lg" />
    </Cell>
  </div>
)

/**
 * Организация без логотипа и без буквы: заглушка отличима **пунктиром** —
 * по списку видно, у кого реквизиты не приехали.
 */
export const Unknown = () => (
  <div style={{ display: 'flex', gap: 'var(--ds-space-5)', alignItems: 'flex-end' }}>
    <Cell label="есть буква">
      <OrgBadge name="Райффайзен" letter="Р" />
    </Cell>
    <Cell label="неизвестен">
      <OrgBadge name="Организация не определена" />
    </Cell>
  </div>
)

/**
 * Рядом с названием значок **декоративен**: имя организации уже стоит текстом,
 * и повторять его скринридеру незачем — плитка уходит из дерева доступности.
 */
export const InList = () => (
  <div style={{ display: 'grid', gap: 'var(--ds-space-3)' }}>
    {[
      { name: 'ОЗОН Банк', letter: 'О', account: '40702810…4417' },
      { name: 'Казначейство', src: logo, account: '03100643…0001' },
      { name: 'Организация не определена', account: '40802810…9930' },
    ].map((org) => (
      <div key={org.account} style={{ display: 'flex', gap: 'var(--ds-space-3)', alignItems: 'center' }}>
        <OrgBadge name={org.name} letter={org.letter} src={org.src} size="sm" decorative />
        <span style={{ display: 'grid' }}>
          <span>{org.name}</span>
          <span style={{ color: 'var(--ds-text-muted)', fontSize: 'var(--ds-fs-sm)' }}>{org.account}</span>
        </span>
      </div>
    ))}
  </div>
)
