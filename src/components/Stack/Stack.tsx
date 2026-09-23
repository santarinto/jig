import './Stack.css'

export type StackGap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export type StackAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline'
export type StackJustify = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'

export interface StackProps extends React.ComponentPropsWithRef<'div'> {
  /** Ось. По умолчанию `column` — Stack «складывает» детей сверху вниз. */
  direction?: 'row' | 'column'
  /**
   * Промежуток между детьми: шаг шкалы `--ds-space-N`.
   *
   * БЕЗ ПРОПА ЗАЗОР НЕ НОЛЬ, А БАЗОВЫЙ ШАГ — `--ds-space-3` из листа
   * (DS-179). Раньше умолчания не было вовсе, дети слипались, и «хочу
   * вплотную» не отличалось от «не подумал». Вплотную теперь говорится словом:
   * `gap={0}`.
   */
  gap?: StackGap
  align?: StackAlign
  justify?: StackJustify
  wrap?: boolean
  /** `inline-flex` вместо `flex` — Stack встаёт в строку текста. */
  inline?: boolean
}

export function Stack({
  direction = 'column', gap, align, justify, wrap, inline,
  className, style, children, ...rest
}: StackProps) {
  return (
    <div
      className={['ds-stack', className].filter(Boolean).join(' ')}
      data-direction={direction}
      data-align={align}
      data-justify={justify}
      data-wrap={wrap ? 'true' : undefined}
      data-inline={inline ? 'true' : undefined}
      // gap — не data-атрибут: значений восемь, а токен-переменную проще
      // подставить прямо в style, чем плодить восемь CSS-правил. Умолчания
      // здесь НЕТ намеренно: базовый шаг объявлен в листе (DS-179), и
      // инлайновый стиль ставится только тогда, когда потребитель назвал число
      // сам, — иначе он перебивал бы и правило потребителя тоже.
      style={{ ...(gap != null ? { gap: `var(--ds-space-${gap})` } : null), ...style }}
      {...rest}
    >{children}</div>
  )
}
