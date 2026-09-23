/**
 * Адрес кадра — зеркало состояния, и зеркалит он с задержкой.
 *
 * Браузеры ограничивают частоту `history.replaceState`, а текстовая крутилка
 * даёт вызов на каждое нажатие клавиши — десятки в секунду. Без дебаунса
 * адрес-зеркало превращается в источник предупреждений, а то и в проглоченные
 * обновления.
 *
 * ПАТЧ В КАДР ИДЁТ НЕМЕДЛЕННО: задерживается только запись в адрес. Иначе
 * крутилка начнёт «залипать», и инструмент станет врать про отзывчивость
 * компонента, которую им же и меряют.
 */
export const MIRROR_DELAY_MS = 250

export function makeMirror(write: (url: string) => void, delay: number = MIRROR_DELAY_MS) {
  let timer = 0
  let pending: string | null = null

  const fire = (): void => {
    timer = 0
    if (pending === null) return
    const url = pending
    pending = null
    write(url)
  }

  return {
    push(url: string): void {
      pending = url
      if (timer) return
      timer = window.setTimeout(fire, delay)
    },
    flush(): void {
      if (timer) window.clearTimeout(timer)
      fire()
    },
    stop(): void {
      if (timer) window.clearTimeout(timer)
      timer = 0
      pending = null
    },
  }
}
