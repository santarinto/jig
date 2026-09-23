/**
 * Слияние патча с состоянием кадра. Чистая функция — живёт отдельно, чтобы
 * порядок и границы применения проверялись без DOM и без postMessage.
 *
 * Патч НЕ МОЖЕТ сменить компонент, случай и сессию. Это не забывчивость:
 * смена компонента или случая — единственные два повода перезагрузить документ
 * (другой модуль фикстуры, другой набор пропсов от кейса), а сессия
 * принадлежит оболочке и меняется только вместе с пересозданием `<iframe>`.
 */
import type { FrameState } from './frame-url.js'
import type { Patch } from './protocol.js'

/**
 * Слияние начинок: значение — поставить, `null` — СНЯТЬ ключ.
 *
 * Пустой строкой снять нельзя намеренно: `s.cell=` в адресе читалось бы как
 * «начинка есть, но безымянная», и кадр отказал бы словами «ссылка не
 * читается» вместо того, чтобы показать пустую позицию.
 */
function mergeSlots(
  was: Record<string, string>,
  patch: Record<string, string | null>,
): Record<string, string> {
  const next = { ...was }
  for (const [id, value] of Object.entries(patch)) {
    if (value === null) delete next[id]
    else next[id] = value
  }
  return next
}

// Параметр — `Patch`, а не `Down`: вызывающая сторона (`frame-app.tsx`) уже
// отсеяла `ask-kinds` проверкой `body.type !== 'patch'` до вызова, и здесь
// это узкий тип, а не объединение — иначе каждое поле ниже требовало бы
// собственного разбора по `type`, хотя решение уже принято выше по стеку.
export function applyPatch(state: FrameState, p: Patch): FrameState {
  return {
    ...state,
    // Пропсы ДОПОЛНЯЮТСЯ: панель шлёт только то, что подвинули, а не весь набор.
    props: p.props ? { ...state.props, ...p.props } : state.props,
    slots: p.slots ? mergeSlots(state.slots, p.slots) : state.slots,
    theme: p.theme ?? state.theme,
    scale: p.scale ?? state.scale,
    mode: p.mode ?? state.mode,
    text: p.text ?? state.text,
    aim: p.aim ?? state.aim,
    // `data`/`force` умеют сниматься, поэтому null отличается от отсутствия.
    data: p.data !== undefined ? p.data : state.data,
    force: p.force !== undefined ? p.force : state.force,
    layers: p.layers ?? state.layers,
  }
}
