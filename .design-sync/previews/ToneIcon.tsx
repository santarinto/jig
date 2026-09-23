import { ToneIcon, Icon } from '@santarinto/jig'
import type { ToneName } from '@santarinto/jig'

// Знак тона — один на систему: тот же, что рисуют `Alert`, `Toast` и
// `NotificationCenter`. Свой тон потребитель показывает ЭТИМ знаком, иначе в
// одном интерфейсе окажутся два разных знака ошибки.
//
// Цвет тон подтверждает и никогда не несёт: рядом со знаком всегда слово.

const TONES: { tone: ToneName; word: string }[] = [
  { tone: 'info', word: 'Сведения' },
  { tone: 'success', word: 'Готово' },
  { tone: 'warning', word: 'Внимание' },
  { tone: 'error', word: 'Ошибка' },
]

/** Четыре тона: знак, цвет тона и слово. */
export const Tones = () => (
  <div style={{ display: 'grid', gap: 10, fontSize: 'var(--ds-fs-md)' }}>
    {TONES.map(({ tone, word }) => (
      <div key={tone} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: `var(--ds-${tone})` }}><Icon><ToneIcon tone={tone} /></Icon></span>
        <span style={{ color: 'var(--ds-text-primary)' }}>{word}</span>
      </div>
    ))}
  </div>
)

/** В строке статуса: знак наследует цвет текста места. */
export const Inline = () => (
  <p style={{ margin: 0, color: 'var(--ds-text-secondary)', display: 'flex', gap: 6, alignItems: 'center' }}>
    <Icon><ToneIcon tone="warning" /></Icon>
    Выгрузка за 18.09 не пришла — показаны данные на 17.09
  </p>
)
