import '../../styles/visually-hidden.css'
import { useDsText } from '../../dictionary/DsText.js'
import './MetricStrip.css'

export type MetricTone = 'neutral' | 'success' | 'warning' | 'error'

export interface Metric {
  id: string
  label: string
  /**
   * Значение. **`null` означает «данных нет»** и рисуется прочерком, а не
   * пустотой (DS-93): метрика без значения и без объяснения — сама по
   * себе дефект.
   *
   * Только `null`. Ноль и пустая строка — ЗНАЧЕНИЯ: «0 прогонов» это факт, а
   * не его отсутствие, и схлопнув их, мы объявили бы отсутствующими данные,
   * которые есть. Та же ошибка, что `!!c.width` вместо `c.width !== undefined`
   * у колонок — ложность вместо заданности.
   *
   * `Money value={null}` сюда не подставляют: это компонент СУММЫ (валюта,
   * знак, эквивалент), а метрика бывает счётчиком. Прочерк рисует сама полоса.
   */
  value: React.ReactNode
  /**
   * Small caption under the value ("за месяц", "план 1 200 000").
   *
   * Он же — место ПОВОДА, когда `value` равно `null` («прогонов не было»).
   * Отдельного пропа под причину нет намеренно: это был бы второй способ
   * сказать одно, а подпись под значением у метрики уже есть.
   */
  hint?: string
  /** Colours the value when the number itself carries a status. */
  tone?: MetricTone
}

export interface MetricStripProps {
  metrics: Metric[]
  /** Tighter padding for dense screens. */
  dense?: boolean
  /**
   * Wrap into this many columns instead of squeezing every metric onto one row
   * — on a phone four metrics came out as «9 427,5…», «Длительно…». A cell left
   * alone on the last row takes the whole row, so no grid-coloured hole is left
   * beside it. Unset, the strip stays on one row, as before.
   *
   * Только фиксированное число, НЕ `auto`: режим `auto-fit`/`minmax` отвергнут
   * сознательно (см. секцию в AGENTS) — одинокая ячейка выходит короткой с
   * дыркой сетки, а чинящее правило требует `nth-child`, не принимающий
   * переменную. Пять метрик карточки результата поэтому — `columns={5}`.
   */
  columns?: 2 | 3 | 4 | 5 | 6
  className?: string
  id?: string
}

/**
 * Row of headline figures in an accounting-system register style: cells separated by a 1px
 * grid rather than gaps, so it reads as part of the table language.
 */
export function MetricStrip({ metrics, dense = false, columns, className, id }: MetricStripProps) {
  const t = useDsText()
  return (
    <ul
      id={id}
      className={['ds-metrics', dense && 'ds-metrics--dense',
        columns && `ds-metrics--cols-${columns}`, className].filter(Boolean).join(' ')}
    >
      {metrics.map((m) => (
        <li key={m.id} className="ds-metrics__cell">
          <div className="ds-metrics__label">{m.label}</div>
          <div
            className={[
              'ds-metrics__value',
              m.value === null && 'ds-metrics__value--empty',
              m.tone && m.tone !== 'neutral' && `ds-metrics__value--${m.tone}`,
            ].filter(Boolean).join(' ')}
          >
            {m.value === null ? (
              <>
                {/* Знак — от диктора скрыт: «тире» не сообщает, что данных
                    нет. Имя даётся текстом рядом, а НЕ `aria-label`: на `<div>`
                    без роли его дикторы игнорируют, и проверка доступного
                    имени прошла бы там, где вживую не звучит ничего. */}
                <span aria-hidden="true">—</span>
                <span className="ds-visually-hidden">{t['metricStrip.noData']}</span>
              </>
            ) : m.value}
          </div>
          {m.hint && <div className="ds-metrics__hint">{m.hint}</div>}
        </li>
      ))}
    </ul>
  )
}
