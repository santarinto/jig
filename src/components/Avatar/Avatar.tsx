import { useState } from 'react'
import { useDsText } from '../../dictionary/DsText.js'
import './Avatar.css'

export type AvatarSize = 'sm' | 'md' | 'lg'
export type AvatarTone = 'neutral' | 'accent'

/** Присутствие: доступен, занят, отошёл, не в сети. */
export type AvatarPresence = 'online' | 'busy' | 'away' | 'offline'

/**
 * Ключ словаря на каждое присутствие. Подпись попадает в доступное имя, а не
 * только в цвет, поэтому живёт в словаре, а не литералом здесь (DS-139).
 */
const PRESENCE_KEY = {
  online: 'avatar.online',
  busy: 'avatar.busy',
  away: 'avatar.away',
  offline: 'avatar.offline',
} as const satisfies Record<AvatarPresence, string>

export interface AvatarProps {
  /** Full name — the accessible label, and the source of the initials. */
  name: string
  /** Photo; falls back to initials if it fails to load. */
  src?: string
  size?: AvatarSize
  tone?: AvatarTone
  /**
   * Кольцо присутствия вокруг аватара.
   *
   * Рисуется тенью, а не рамкой. Внешний размер рамка бы не изменила — в
   * системе `box-sizing: border-box`, — но она **съела бы содержимое**: при
   * кольце 4px фотография ужимается с 26×26 до 20×20, теряя почти четверть
   * площади лица, а аватар при этом выглядит прежним. Замерено.
   *
   * `overflow: hidden` тень не срезает: overflow отсекает детей, а собственная
   * тень элемента ему не ребёнок. Тоже проверено, а не выведено из спеки.
   */
  presence?: AvatarPresence
  /**
   * Чем присутствие названо в доступном имени. По умолчанию «в сети», «занят»,
   * «отошёл», «не в сети».
   *
   * Подпись обязательна по смыслу: кольцо кодирует состояние цветом, а цвет
   * читает не каждый. Имя аватара становится «Пётр Иванов, в сети».
   */
  presenceLabel?: string
  className?: string
  id?: string
}

/** «Иванов Пётр Сергеевич» → «ИП»: surname + given name, patronymic dropped. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')
}

export function Avatar({ name, src, size = 'md', tone = 'neutral', presence, presenceLabel, className, id }: AvatarProps) {
  const t = useDsText()
  const [broken, setBroken] = useState(false)
  const showImage = !!src && !broken
  const label = presence
    ? `${name}, ${presenceLabel ?? t[PRESENCE_KEY[presence]]}`
    : name

  return (
    <span
      id={id}
      className={['ds-avatar', `ds-avatar--${size}`, `ds-avatar--${tone}`,
        presence && `ds-avatar--presence-${presence}`, className]
        .filter(Boolean).join(' ')}
      // The initials are decoration; the name is what should be announced.
      role="img"
      aria-label={label}
      title={label}
    >
      {showImage
        ? <img className="ds-avatar__img" src={src} alt="" onError={() => setBroken(true)} />
        : <span className="ds-avatar__initials" aria-hidden="true">{initialsOf(name)}</span>}
    </span>
  )
}
