import './KeyValueList.css'

export interface KeyValueItem {
  id: string
  label: string
  /** A node, so a Badge or a link can sit in the value slot. */
  value: React.ReactNode
}

export interface KeyValueListProps {
  items: KeyValueItem[]
  /** 1 (default) or 2 columns of pairs. */
  columns?: 1 | 2
  /** Hairline between rows, like a register listing. */
  dividers?: boolean
  /** Tighter rows for sidebars and cards. */
  dense?: boolean
  className?: string
  id?: string
}

/**
 * Compact label → value pairs (document summaries, last measurements).
 * A real <dl>, so the pairing survives for screen readers.
 */
export function KeyValueList({
  items, columns = 1, dividers = false, dense = false, className, id,
}: KeyValueListProps) {
  return (
    <dl
      id={id}
      className={[
        'ds-kv', `ds-kv--cols-${columns}`,
        dividers && 'ds-kv--dividers', dense && 'ds-kv--dense', className,
      ].filter(Boolean).join(' ')}
    >
      {items.map((it) => (
        <div key={it.id} className="ds-kv__row">
          <dt className="ds-kv__label">{it.label}</dt>
          <dd className="ds-kv__value">{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}
