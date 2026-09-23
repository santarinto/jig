import type { ReactNode } from 'react'
import { Money } from '@santarinto/jig'

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: 'flex', gap: 'var(--ds-space-4)', alignItems: 'baseline' }}>
    <span style={{ minWidth: 150, color: 'var(--ds-text-muted)' }}>{label}</span>
    {children}
  </div>
)

/**
 * Канонический вызов: сумма приходит из БД **строкой** (NUMERIC), а не числом —
 * копейки на больших суммах не переживают float64. Форматирование строковое.
 */
export const Default = () => (
  <div style={{ display: 'grid', gap: 'var(--ds-space-3)' }}>
    <Row label="Остаток">
      <Money value="6900000.00" currency="RUB" size="lg" />
    </Row>
    <Row label="Списание">
      <Money value="-1234.56" currency="RUB" />
    </Row>
    <Row label="Комиссия">
      <Money value="0.00" currency="RUB" size="sm" />
    </Row>
  </div>
)

/**
 * Три исхода различимы **текстом**, а не только цветом: значение, ноль и
 * «данных нет». Ноль не приглушается — это факт, а не отсутствие; причина
 * прочерка идёт видимой строкой, а не в `title` (с клавиатуры недостижим).
 */
export const States = () => (
  <div style={{ display: 'grid', gap: 'var(--ds-space-3)' }}>
    <Row label="Значение">
      <Money value="128400.50" currency="RUB" />
    </Row>
    <Row label="Ноль">
      <Money value="0.00" currency="RUB" />
    </Row>
    <Row label="Нет данных">
      <Money value="" currency="RUB" unknownHint="выписка за август не загружена" />
    </Row>
  </div>
)

/**
 * Цвет по знаку — состояние, а не величина (закон системы: величина живёт в
 * позиции и высоте). `signed` показывает «+» у положительных; у отрицательных
 * «−» стоит всегда, а у нуля знака нет никогда.
 */
export const Tones = () => (
  <div style={{ display: 'grid', gap: 'var(--ds-space-3)' }}>
    <Row label="Поступление">
      <Money value="120000.00" currency="RUB" signed tone="positive" />
    </Row>
    <Row label="Списание">
      <Money value="-8000.00" currency="KZT" tone="negative" />
    </Row>
    <Row label="Шумный ноль">
      <Money value="0.00" currency="RUB" tone="muted" />
    </Row>
  </div>
)

/**
 * Оценочная величина — посчитана по графику, а не взята из договора. Звёздочку
 * рисует `EstimateMark`; пояснение уходит в дерево доступности текстом.
 */
export const Estimated = () => (
  <div style={{ display: 'grid', gap: 'var(--ds-space-3)' }}>
    <Row label="Платёж по графику">
      <Money value="45318.20" currency="RUB" estimated estimatedHint="оценка по графику платежей" />
    </Row>
    <Row label="Факт">
      <Money value="45318.20" currency="RUB" />
    </Row>
  </div>
)

/**
 * Вторая валюта — три исхода: пересчёт с датой курса, честное «курса нет» и
 * отсутствие второй строки вовсе.
 */
export const Secondary = () => (
  <div style={{ display: 'grid', gap: 'var(--ds-space-4)' }}>
    <Row label="Пересчёт">
      <Money
        value="1250000.00"
        currency="RUB"
        secondary={{ value: '12658.23', currency: 'EUR', rateDate: '2026-08-11' }}
      />
    </Row>
    <Row label="Курса нет">
      <Money value="480000.00" currency="KZT" secondary={{ unavailable: 'курс на дату не найден' }} />
    </Row>
  </div>
)
