import type { ButtonSize } from '../src/components/Button/index.js'

// DS-360: `top`/`bottom` ушли вместе с `is-stacked` — демо-выдумкой без
// API в системе (решение координатора: демо не учит классам, которых нет).
// `left`/`right` теперь реальные пропы Button — `icon`/`iconEnd`, не свой CSS.
type Layout = 'text' | 'icon' | 'left' | 'right'

const SIZE_LABEL: Record<ButtonSize, string> = { sm: 'Small', md: 'Medium', lg: 'Large' }

const ROW_LABEL: Record<Layout, string> = {
  text: 'Text Only',
  icon: 'Icon Only',
  left: 'Icon and Text (left)',
  right: 'Icon and Text (right)',
}

export function buttonMatrixName(layout: Layout, size: ButtonSize): string {
  return `Button · ${ROW_LABEL[layout]} · ${SIZE_LABEL[size]}`
}

export function buttonMatrixCode(layout: Layout, size: ButtonSize, disabled: boolean): string {
  const text = SIZE_LABEL[size]
  const dis = disabled ? ' disabled' : ''
  const sizeAttr = ` size="${size}"`
  if (layout === 'icon') {
    return `<Button variant="primary"${sizeAttr} iconOnly icon={<IconHome />} aria-label="Home"${dis} />`
  }
  if (layout === 'text') {
    return `<Button variant="primary"${sizeAttr}${dis}>${text}</Button>`
  }
  if (layout === 'right') {
    return `<Button variant="primary"${sizeAttr} iconEnd={<IconHome />}${dis}>${text}</Button>`
  }
  return `<Button variant="primary"${sizeAttr} icon={<IconHome />}${dis}>${text}</Button>`
}

export function buttonVariantCode(
  variant: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success',
  label: string,
  size?: ButtonSize,
): string {
  const sizeAttr = size ? ` size="${size}"` : ''
  return `<Button variant="${variant}"${sizeAttr}>${label}</Button>`
}
