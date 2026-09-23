import { useDsText } from '../../dictionary/DsText.js'
import './Skeleton.css'

export type SkeletonAnim = 'sweep' | 'pulse' | 'retro'

export interface SkeletonProps {
  variant?: 'text' | 'rect' | 'circle'
  width?: number | string
  height?: number | string
  /** Number of lines for variant="text" (last line is rendered shorter). */
  lines?: number
  /** Loading animation style. */
  anim?: SkeletonAnim
  className?: string
}

/**
 * Числовой размер — это размер интерфейса, поэтому он живёт по `--ds-ui-scale`,
 * как `height` у BarChart, `size` у DonutChart и `width` у SideNav. Иначе при
 * увеличенном интерфейсе заглушка перестаёт совпадать с содержимым, которое
 * изображает. Строка идёт дословно — это выход для фиксированного размера.
 */
const dim = (v: number | string | undefined) =>
  (typeof v === 'number' ? `calc(${v}px * var(--ds-ui-scale, 1))` : v)

export function Skeleton({
  variant = 'text',
  width,
  height,
  lines = 1,
  anim = 'sweep',
  className,
}: SkeletonProps) {
  const t = useDsText()
  const base = ['ds-skel', `ds-skel--${anim}`]

  if (variant === 'text' && lines > 1) {
    return (
      <div
        className={['ds-skel-lines', className].filter(Boolean).join(' ')}
        role="status"
        aria-busy="true"
        aria-live="polite"
        aria-label={t['skeleton.loading']}
      >
        {Array.from({ length: lines }, (_, i) => (
          <span
            key={i}
            className={[...base, 'ds-skel--text'].join(' ')}
            style={{ width: i === lines - 1 ? '60%' : dim(width) }}
          />
        ))}
      </div>
    )
  }

  return (
    <span
      className={[...base, `ds-skel--${variant}`, className].filter(Boolean).join(' ')}
      style={{ width: dim(width), height: dim(height) }}
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={t['skeleton.loading']}
    />
  )
}
