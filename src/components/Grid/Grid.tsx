import type { StackGap } from '../Stack/index.js'
import './Grid.css'

export interface GridProps extends React.ComponentPropsWithRef<'div'> {
  /** Число колонок (равные) или явный CSS-шаблон `grid-template-columns`. */
  columns?: number | string
  /**
   * Адаптивные колонки: `repeat(auto-fit, minmax(<val>, 1fr))`. Перекрывает
   * `columns` — задаёшь минимальную ширину ячейки, число колонок считает браузер.
   */
  minColumnWidth?: string
  /**
   * Держать пустые треки (`auto-fill` вместо `auto-fit`). Нужно ровно тогда,
   * когда колонки должны стоять на месте независимо от числа детей — сравнение
   * рядов между собой, сетка, в которую доложат позже. Во всех остальных случаях
   * это скрытый дефект: два ребёнка в ряду на шесть треков остаются шириной в
   * шестую часть, а четыре трека — воздух (DS-136).
   */
  keepEmptyTracks?: boolean
  /**
   * Промежуток между ячейками: шаг шкалы `--ds-space-N`. Без пропа — базовый
   * шаг системы `--ds-space-3` из листа, а не ноль (DS-179). Вплотную —
   * `gap={0}`.
   */
  gap?: StackGap
}

function template(
  columns?: number | string, minColumnWidth?: string, keepEmptyTracks?: boolean,
): string | undefined {
  if (minColumnWidth) {
    return `repeat(${keepEmptyTracks ? 'auto-fill' : 'auto-fit'}, minmax(${minColumnWidth}, 1fr))`
  }
  if (typeof columns === 'number') return `repeat(${columns}, minmax(0, 1fr))`
  return columns
}

export function Grid({
  columns, minColumnWidth, keepEmptyTracks, gap, className, style, children, ...rest
}: GridProps) {
  return (
    <div
      className={['ds-grid', className].filter(Boolean).join(' ')}
      style={{
        gridTemplateColumns: template(columns, minColumnWidth, keepEmptyTracks),
        ...(gap != null ? { gap: `var(--ds-space-${gap})` } : null),
        ...style,
      }}
      {...rest}
    >{children}</div>
  )
}
