import { EstimateMark, Money } from '@santarinto/jig'

/**
 * Знак оценочности — один на все величины системы: и на деньги, и на ставки.
 * Звёздочка декоративна, пояснение уходит в дерево доступности текстом
 * (`.ds-visually-hidden`), а не в `title` — `title` недостижим и с клавиатуры,
 * и со скринридера.
 */
export const Default = () => (
  <div style={{ display: 'grid', gap: 'var(--ds-space-3)' }}>
    <span>
      Ставка 12,5 %<EstimateMark />
    </span>
    <span>
      Срок окупаемости 14 мес.<EstimateMark hint="оценка по текущей выручке" />
    </span>
  </div>
)

/**
 * На ставке и на сумме — одна и та же звёздочка: `Money` зовёт `EstimateMark`
 * своим пропом `estimated`, отдельный компонент нужен там, где величина не
 * деньги. Легенда страницы («* — оценочная величина») — работа потребителя.
 */
export const AcrossValues = () => (
  <div style={{ display: 'grid', gap: 'var(--ds-space-3)' }}>
    <div style={{ display: 'flex', gap: 'var(--ds-space-4)', alignItems: 'baseline' }}>
      <span style={{ minWidth: 150, color: 'var(--ds-text-muted)' }}>Платёж</span>
      <Money value="45318.20" currency="RUB" estimated />
    </div>
    <div style={{ display: 'flex', gap: 'var(--ds-space-4)', alignItems: 'baseline' }}>
      <span style={{ minWidth: 150, color: 'var(--ds-text-muted)' }}>Эффективная ставка</span>
      <span>
        13,9 %<EstimateMark hint="рассчитана по графику, не из договора" />
      </span>
    </div>
    <p style={{ margin: 0, color: 'var(--ds-text-muted)', fontSize: 'var(--ds-fs-sm)' }}>
      <EstimateMark /> — величина оценочная
    </p>
  </div>
)
