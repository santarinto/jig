import { Icon, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Close, Search, Dots } from '@santarinto/jig'

// `<Icon>` — контракт значка: ЛЮБОЙ переданный SVG приводится к системному
// виду — размер `--ds-size-icon` от шкалы, толщина штриха, цвет
// `currentColor`. Пропа `size` нет намеренно: размер задаёт место стилем.
// Это не пак: системных глифов семь, всё прочее потребитель берёт из своей
// библиотеки и кладёт внутрь `<Icon>`.

const row = { display: 'flex', gap: 20, alignItems: 'center', fontSize: 'var(--ds-fs-md)' } as const

/** Все системные глифы в обёртке. */
export const SystemGlyphs = () => (
  <div style={row}>
    <Icon><ChevronDown /></Icon>
    <Icon><ChevronUp /></Icon>
    <Icon><ChevronLeft /></Icon>
    <Icon><ChevronRight /></Icon>
    <Icon><Close /></Icon>
    <Icon><Search /></Icon>
    <Icon><Dots /></Icon>
  </div>
)

/**
 * Чужой SVG со своими `width="24"`, `stroke-width="1.5"` и `stroke="#999"`:
 * слева как пришёл, справа в `<Icon>` — размер, штрих и цвет системные.
 */
export const ForeignSvg = () => {
  const bell = (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2-3v-3a7 7 0 0 1 4-6" />
      <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
    </svg>
  )
  return (
    <div style={{ ...row, color: 'var(--ds-accent)' }}>
      {bell}
      <span style={{ color: 'var(--ds-text-secondary)' }}>→</span>
      <Icon>{bell}</Icon>
      <Icon><Search /></Icon>
    </div>
  )
}
