import type { ReactNode } from 'react'
import { ToggleGroup } from '@santarinto/jig'
import type { ToggleItem } from '@santarinto/jig'

const KINDS: ToggleItem[] = [
  { id: 'all', label: 'Все', count: 42 },
  { id: 'message', label: 'Сообщения', count: 30 },
  { id: 'pane', label: 'Панели', count: 8 },
  { id: 'result', label: 'Итоги', count: 4 },
]

const FEATURES: ToggleItem[] = [
  { id: 'bold', label: 'Жирный' },
  { id: 'italic', label: 'Курсив' },
  { id: 'under', label: 'Подчёркнутый' },
]

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: 'grid', gap: 'var(--ds-space-2)', justifyItems: 'start' }}>
    <span style={{ color: 'var(--ds-text-muted)', fontSize: 'var(--ds-fs-sm)' }}>{label}</span>
    {children}
  </div>
)

/**
 * Одиночный выбор — `radiogroup` с roving-фокусом: в группу один таб-стоп,
 * дальше стрелки. `value` — строка, `count` озвучивается вместе с подписью и
 * показывается даже нулевым.
 */
export const Single = () => (
  <ToggleGroup mode="single" value="all" onChange={() => {}} items={KINDS} aria-label="Тип записи" />
)

/**
 * Множественный выбор — `group` из кнопок с `aria-pressed`; `value` массив.
 * Форма `value` и форма `onChange` связаны с `mode` типом: перепутать их
 * нельзя — не скомпилируется.
 */
export const Multiple = () => (
  <ToggleGroup
    mode="multiple"
    value={['bold', 'under']}
    onChange={() => {}}
    items={FEATURES}
    aria-label="Начертание"
  />
)

/**
 * Два вида: `framed` (по умолчанию) — сегменты в общей рамке, самостоятельный
 * элемент управления; `plain` — без рамки, для плотных панелей и шапок.
 */
export const Variants = () => (
  <div style={{ display: 'grid', gap: 'var(--ds-space-4)' }}>
    <Field label="framed">
      <ToggleGroup mode="single" value="message" onChange={() => {}} items={KINDS} aria-label="Тип записи" />
    </Field>
    <Field label="plain">
      <ToggleGroup
        mode="single"
        value="message"
        onChange={() => {}}
        items={KINDS}
        variant="plain"
        aria-label="Тип записи"
      />
    </Field>
  </div>
)

/**
 * Размер `sm` — для панелей инструментов; выключенный сегмент не выбирается и
 * пропускается roving-фокусом.
 */
export const SizesAndDisabled = () => (
  <div style={{ display: 'grid', gap: 'var(--ds-space-4)' }}>
    <Field label="sm">
      <ToggleGroup mode="single" value="all" onChange={() => {}} items={KINDS} size="sm" aria-label="Тип записи" />
    </Field>
    <Field label="выключенный сегмент">
      <ToggleGroup
        mode="single"
        value="week"
        onChange={() => {}}
        items={[
          { id: 'day', label: 'День' },
          { id: 'week', label: 'Неделя' },
          { id: 'month', label: 'Месяц' },
          { id: 'year', label: 'Год', disabled: true },
        ]}
        aria-label="Период"
      />
    </Field>
  </div>
)
