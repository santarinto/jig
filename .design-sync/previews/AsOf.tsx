import type { ReactNode } from 'react'
import { AsOf, Money } from '@santarinto/jig'

// «Сегодня» — проп, а не часы: карточка обязана выглядеть одинаково в любой
// день прогона, и ровно по той же причине проп существует у потребителя.
const TODAY = '2026-08-13'

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: 'flex', gap: 'var(--ds-space-4)', alignItems: 'baseline' }}>
    <span style={{ minWidth: 130, color: 'var(--ds-text-muted)' }}>{label}</span>
    {children}
  </div>
)

/**
 * Возраст числа: ведущее слово задаёт вызов («остаток на», «курс от»), дату
 * компонент форматирует сам из ISO — без `Date` и без сдвига часовых поясов.
 */
export const Default = () => (
  <div style={{ display: 'grid', gap: 'var(--ds-space-3)' }}>
    <AsOf date="2026-08-13" label="остаток на" />
    <AsOf date="2026-08-11" label="курс от" />
  </div>
)

/**
 * Устаревание. Порог и «сегодня» приходят **одним объектом**: задать половину
 * нельзя по типу, иначе «порог задал, дату забыл» скомпилируется и молча
 * перестанет устаревать. Признак помечен **словом**, а не только тоном — в
 * монохромной печати и при дальтонизме цвет не доезжает.
 */
export const Stale = () => (
  <div style={{ display: 'grid', gap: 'var(--ds-space-3)' }}>
    <Row label="Свежее">
      <AsOf date="2026-08-08" label="остаток на" stale={{ afterDays: 14, today: TODAY }} />
    </Row>
    <Row label="Устарело">
      <AsOf date="2026-06-30" label="остаток на" stale={{ afterDays: 14, today: TODAY }} />
    </Row>
    <Row label="Свой порог">
      <AsOf
        date="2026-08-06"
        label="курс от"
        stale={{ afterDays: 3, today: TODAY }}
        staleLabel="курс мог измениться"
      />
    </Row>
  </div>
)

/**
 * Даты нет. Без `unknownLabel` компонент **молчит** (у несуществующего числа
 * нет возраста); с ним — подпись видима. Два исхода различимы намеренно.
 */
export const Unknown = () => (
  <div style={{ display: 'grid', gap: 'var(--ds-space-3)' }}>
    <Row label="Молчит">
      <AsOf date="" />
    </Row>
    <Row label="Названо">
      <AsOf date="" unknownLabel="дата выписки неизвестна" />
    </Row>
  </div>
)

/**
 * Рабочая пара: величина и её возраст. Подпись живёт под числом, а не в
 * подсказке — читателю нужно видеть, на какой момент снят остаток.
 */
export const WithMoney = () => (
  <div style={{ display: 'grid', gap: 'var(--ds-space-1)', justifyItems: 'start' }}>
    <Money value="6900000.00" currency="RUB" size="lg" />
    <AsOf date="2026-06-30" label="остаток на" stale={{ afterDays: 14, today: TODAY }} />
  </div>
)
