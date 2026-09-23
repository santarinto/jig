import type { SVGProps } from 'react'

/**
 * Иконки-глифы для собственной «хромировки» компонентов (шеврон, крестик, «⋯»).
 *
 * ПУБЛИЧНЫ с DS-145 — через `icons/index.ts`. Жили в `internal/`, пока
 * потребителю приходилось рисовать копию нашего шеврона, собирая своё
 * раскрытие; это ровно то, что гейт `inline-icons` запрещает нам самим.
 *
 * `GlyphProps.size` остаётся АТРИБУТОМ и потому мимо `--ds-ui-scale`: он для
 * внутренних мест, знающих, что делают. Публичная дорога — `<Icon>`, где размер
 * задаётся стилем; поэтому `size` в `IconProps` нет вовсе.
 *
 * Inline-SVG, а не `@tabler/icons-react`: последний у нас devDependency и в
 * тарбол не попадает — шиппящийся компонент, импортящий его, ломает сборку
 * потребителя (rollup «failed to resolve @tabler/icons-react»). Стережёт smoke.
 * Пути — простые геометрические (24×24, как у tabler), чтобы визуально совпадать
 * с иконками, которые потребитель кладёт пропсом.
 */
export interface GlyphProps extends SVGProps<SVGSVGElement> {
  /** Сторона квадрата, px. */
  size?: number
}

function Glyph({ size = 16, children, ...rest }: GlyphProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round"
      {...rest}
    >{children}</svg>
  )
}

export const ChevronDown = (p: GlyphProps) => <Glyph {...p}><path d="m6 9 6 6 6-6" /></Glyph>
export const ChevronRight = (p: GlyphProps) => <Glyph {...p}><path d="m9 6 6 6-6 6" /></Glyph>
export const ChevronLeft = (p: GlyphProps) => <Glyph {...p}><path d="m15 6-6 6 6 6" /></Glyph>
export const ChevronUp = (p: GlyphProps) => <Glyph {...p}><path d="m6 15 6-6 6 6" /></Glyph>
export const Close = (p: GlyphProps) => <Glyph {...p}><path d="M18 6 6 18M6 6l12 12" /></Glyph>
/**
 * Лупа. Нарисована примитивами, а не путём, — как и была в `SearchBar`,
 * откуда переехала (DS-119). Переезд не про дубль: второго экземпляра не
 * было. Про то, что лупа — часть визуального словаря системы наравне с
 * шевроном, и её геометрия обязана лежать там же, где остальные; следующий
 * поиск возьмёт этот же глиф, а не нарисует свой.
 *
 * Размеры в единицах viewBox 24×24 — как у соседей; прежняя разметка была в
 * 16×16 (r=5 при cx=7), пересчитана вдвое.
 */
export const Search = (p: GlyphProps) => (
  <Glyph {...p}>
    <circle cx="10.5" cy="10.5" r="7.5" />
    <line x1="16.5" y1="16.5" x2="21.75" y2="21.75" />
  </Glyph>
)

export const Dots = (p: GlyphProps) => (
  <Glyph {...p}>
    <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
  </Glyph>
)

/**
 * ЗНАК ТОНА — success / warning / error / info (DS-157).
 *
 * Один компонент вместо четырёх экспортов, и это про смысл, а не про
 * экономию: наружу отдаётся «знак ЭТОГО тона», а не «галочка» и «треугольник».
 * Потребитель, показывающий свой тон, обязан показать его тем же знаком —
 * иначе в одном интерфейсе окажется два разных знака ошибки, что ровно тот
 * дефект, ради которого шеврон стал одним на систему (DS-144).
 *
 * Геометрия переехала из `Alert`, где лежала единственной копией. Переезд не
 * про дубль — второго экземпляра не было; про то, что `Toast` и
 * `NotificationCenter` собирались завести ВТОРОЙ, и разошлись бы они молча:
 * гейт `inline-icons` сверяет пути с этим файлом, а копия внутри `Alert` в
 * сверку не входила.
 */
export type ToneName = 'info' | 'success' | 'warning' | 'error'

const TONE_PATHS: Record<ToneName, React.ReactNode> = {
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
  success: <path d="M20 6 9 17l-5-5" />,
  warning: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></>,
  error: <><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></>,
}

export interface ToneIconProps extends GlyphProps {
  tone: ToneName
}

export const ToneIcon = ({ tone, ...p }: ToneIconProps) => <Glyph {...p}>{TONE_PATHS[tone]}</Glyph>
