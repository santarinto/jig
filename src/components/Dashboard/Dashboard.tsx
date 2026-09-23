import './Dashboard.css'
import { Icon } from '../../icons/index.js'

/**
 * Атрибуты, которые есть у `<button>` и которых нет у `<div>`. Статичной
 * плитке они ЗАПРЕЩЕНЫ — и типом (`never`), и броском в рантайме. `value` в
 * списке нет: у плитки это её собственный проп, а не атрибут кнопки.
 *
 * Список один на тип и на проверку: тип выведен из массива, поэтому атрибут,
 * добавленный в запрет, не может оказаться запрещённым только наполовину.
 */
const BUTTON_ONLY = [
  'disabled', 'type', 'form', 'formAction', 'formEncType', 'formMethod',
  'formNoValidate', 'formTarget', 'name',
] as const
type ButtonOnly = typeof BUTTON_ONLY[number]

interface TileOwnProps {
  title: string
  value?: React.ReactNode
  icon?: React.ReactNode
  tone?: 'neutral' | 'accent'
}

/**
 * Плитка без `onClick` — показатель, а не действие: `<div>`, без таб-стопа,
 * без пальца и без подсветки рамки. Атрибуты кнопки здесь — ошибка типов:
 * `disabled` на плитке, которую нечем нажать, означает «автор думал, что это
 * кнопка», и молча выкинуть его значило бы спрятать ровно это недоразумение.
 */
export type StaticTileProps = TileOwnProps
  & Omit<React.ComponentPropsWithRef<'div'>, 'title' | 'onClick'>
  & { onClick?: never }
  & { [K in ButtonOnly]?: never }

/** Плитка с `onClick` — действие: `<button type="button">`, как было до DS-272. */
export type PressableTileProps = TileOwnProps
  & Omit<React.ComponentPropsWithRef<'button'>, 'title' | 'value' | 'onClick'>
  & { onClick: React.MouseEventHandler<HTMLButtonElement> }

/**
 * Форма выбирается ПРИСУТСТВИЕМ `onClick`, отдельного пропа кликабельности нет:
 * второй проп — это второй источник правды, и `clickable` без обработчика
 * снова дал бы кнопку, которая ничего не делает (DS-272).
 */
export type TileProps = StaticTileProps | PressableTileProps

export function Tile(props: TileProps) {
  const body = (
    <>
      {props.icon && <Icon className="ds-tile__icon" aria-hidden="true">{props.icon}</Icon>}
      <span className="ds-tile__title">{props.title}</span>
      {props.value != null && <span className="ds-tile__value">{props.value}</span>}
    </>
  )

  if (props.onClick == null) {
    const { title: _title, value: _value, icon: _icon, tone = 'neutral', className, onClick: _onClick, ...rest } =
      props as StaticTileProps
    // Рантайм-половина запрета: через `any` тип не держит ничего, а тихо
    // выкинутый `disabled` выглядит как работающий.
    for (const k of BUTTON_ONLY) {
      if ((rest as Record<string, unknown>)[k] !== undefined) {
        throw new Error(
          `jig: Tile — \`${k}\` без \`onClick\`. Плитка без обработчика `
          + 'рендерится `<div>` и атрибутов кнопки не принимает. Передайте '
          + `\`onClick\`, если плитка — действие, или уберите \`${k}\` (DS-272).`,
        )
      }
    }
    return (
      <div className={['ds-tile', 'ds-tile--static', `ds-tile--${tone}`, className].filter(Boolean).join(' ')} {...rest}>
        {body}
      </div>
    )
  }

  const { title: _title, value: _value, icon: _icon, tone = 'neutral', className, ...rest } = props
  return (
    <button type="button" className={['ds-tile', `ds-tile--${tone}`, className].filter(Boolean).join(' ')} {...rest}>
      {body}
    </button>
  )
}

export interface DashboardProps { children: React.ReactNode }
export function Dashboard({ children }: DashboardProps) {
  return <div className="ds-dashboard">{children}</div>
}
