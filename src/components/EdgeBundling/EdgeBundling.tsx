import { useMemo, useState } from 'react'
import {
  layoutEdgeBundling,
  bundlingAriaLabel,
  type EdgeBundlingItem,
} from './buildHierarchy.js'
import { useDsText } from '../../dictionary/DsText.js'
import './EdgeBundling.css'

export type { EdgeBundlingItem } from './buildHierarchy.js'

export interface EdgeBundlingProps {
  /** Плоский список узлов; id с `delimiter` задаёт иерархию. */
  items: EdgeBundlingItem[]
  /** Разделитель уровней в id. По умолчанию `.`. */
  delimiter?: string
  /** Диаметр графа в px до `--ds-ui-scale`. */
  size?: number
  /** Отступ подписей от дуги, px до scale. */
  innerPadding?: number
  /** Сила сглаживания bundle 0…1. По умолчанию 0.85 — как у D3. */
  tension?: number
  ariaLabel?: string
  className?: string
}

type Hover =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; a: string; b: string }
  | null

function labelTransform(x: number, y: number): { transform: string; anchor: 'start' | 'end' } {
  const deg = (x * 180) / Math.PI - 90
  const flip = x >= Math.PI
  return {
    transform: `rotate(${deg}) translate(${y + 6},0)${flip ? ' rotate(180)' : ''}`,
    anchor: flip ? 'end' : 'start',
  }
}

function edgeMatches(hover: Hover, a: string, b: string): boolean {
  if (!hover) return false
  if (hover.kind === 'node') return hover.id === a || hover.id === b
  return (hover.a === a && hover.b === b) || (hover.a === b && hover.b === a)
}

function nodeMatches(hover: Hover, id: string): boolean {
  if (!hover) return false
  if (hover.kind === 'node') return hover.id === id
  return hover.a === id || hover.b === id
}

export function EdgeBundling({
  items,
  delimiter = '.',
  size = 640,
  innerPadding = 80,
  tension = 0.85,
  ariaLabel,
  className,
}: EdgeBundlingProps) {
  const t = useDsText()
  const [hover, setHover] = useState<Hover>(null)

  const { nodes, edges, viewSize } = useMemo(
    () => layoutEdgeBundling(items, { size, innerPadding, delimiter, tension }),
    [items, size, innerPadding, delimiter, tension],
  )

  const name = bundlingAriaLabel(ariaLabel, t['edgeBundling.summary'](nodes.length, edges.length))

  const linkClass = (a: string, b: string) => {
    if (!hover) return 'ds-edge-bundle__link'
    return ['ds-edge-bundle__link', edgeMatches(hover, a, b) ? 'is-highlight' : 'is-dim'].join(' ')
  }

  const cx = viewSize / 2
  const cy = viewSize / 2

  return (
    <div
      className={['ds-edge-bundle', className].filter(Boolean).join(' ')}
      style={{ width: `calc(${viewSize}px * var(--ds-ui-scale, 1))` }}
    >
      <svg
        className="ds-edge-bundle__svg"
        width="100%"
        viewBox={`0 0 ${viewSize} ${viewSize}`}
        role="img"
        aria-label={name}
        onMouseLeave={() => setHover(null)}
      >
        <g transform={`translate(${cx},${cy})`}>
          {edges.map((e) => {
            const [a, b] = e.endpoints
            return (
              <path
                key={e.id}
                className={linkClass(a, b)}
                d={e.d}
                onMouseEnter={() => setHover({ kind: 'edge', a, b })}
              />
            )
          })}
          {nodes.map((n) => {
            const { transform, anchor } = labelTransform(n.x, n.y)
            const active = nodeMatches(hover, n.id)
            return (
              <text
                key={n.id}
                className={['ds-edge-bundle__label', active ? 'is-hover' : ''].filter(Boolean).join(' ')}
                transform={transform}
                textAnchor={anchor}
                dy="0.31em"
                onMouseEnter={() => setHover({ kind: 'node', id: n.id })}
              >
                {n.label}
              </text>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
