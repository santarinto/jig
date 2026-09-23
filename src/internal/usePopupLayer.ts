import { useEffect, useState } from 'react'

// Модульное состояние: слой — порядок открытия среди ВСЕХ попапов ДС,
// а не внутри одного компонента, поэтому счётчик общий.
let seq = 0
let active = 0

/**
 * «Последний открытый попап — сверху»: инлайновая надбавка поверх --ds-z-popup.
 * Соседние панели в статичном CSS сравнялись бы по z (один слот у всех),
 * и побеждал бы поздний в DOM, а не в открытии — см. соседский кейс в спеке
 * оверлеев. Портал попапов не вариант: contains() в useDismiss считал бы
 * клик по списку «кликом мимо». Когда открытых попапов не остаётся,
 * счётчик сбрасывается — за долгую сессию слой не дорастает до --ds-z-tooltip.
 */
export function usePopupLayer(open: boolean): string | undefined {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!open) return
    active += 1
    setN(++seq)
    return () => {
      active -= 1
      if (active === 0) seq = 0
    }
  }, [open])
  return open && n > 0 ? `calc(var(--ds-z-popup) + ${n})` : undefined
}
