/**
 * Руки санитаров оболочки. Не тест и не рантайм — вспомогательный модуль,
 * которым пользуются пять проверок фазы 2.
 *
 * Кадр ищется по разметке, а `sid` читается из адреса кадра, а не из внутренних
 * полей компонента: адрес — публичная поверхность верстака (его открывают
 * отдельной вкладкой), и санитар должен опираться на неё, а не на устройство.
 */
import { act } from '@testing-library/react'
import { vi } from 'vitest'
import { pack, type CanvasSpot, type Envelope, type Patch, type Up } from './protocol.js'

export const frameEl = (): HTMLIFrameElement => {
  const el = document.querySelector<HTMLIFrameElement>('iframe.wb__frame')
  if (!el) throw new Error('кадра нет в разметке оболочки')
  return el
}

export const frameSrc = (): string => frameEl().getAttribute('src') ?? ''

export const frameQuery = (): URLSearchParams => new URLSearchParams(frameSrc().split('?')[1] ?? '')

export const frameSid = (): number => Number(frameQuery().get('sid'))

/**
 * Окно кадра, который живёт под этим `sid`.
 *
 * По АДРЕСУ, а не «первый в разметке»: в сетке кадров шесть, и у каждого свой
 * `sid`. Отдав всем один и тот же `frameEl()`, санитар слал бы `ready` ячейки
 * от чужого окна — оболочка его теперь режет (DS-148), и проверка
 * ячейки молча превращалась бы в проверку тишины.
 */
const frameWinOf = (sid: number): Window | null => {
  const all = [...document.querySelectorAll<HTMLIFrameElement>('iframe.wb__frame')]
  const mine = all.find(
    (el) => new URLSearchParams((el.getAttribute('src') ?? '').split('?')[1] ?? '').get('sid') === String(sid),
  )
  return (mine ?? all[0])?.contentWindow ?? null
}

/**
 * Сообщение снизу вверх — как его увидит слушатель оболочки.
 *
 * `source` — окно СВОЕГО кадра, потому что оболочка с DS-148 сверяет
 * отправителя. Санитар без `source` проверял бы протокол, которого нет:
 * сообщение ниоткуда оболочка теперь режет, и любой такой тест позеленел бы
 * на пустом месте — «дока не обновилась» вместо «дока обновилась правильно».
 */
export const sendUp = (sid: number, body: Up): void => {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: pack(sid, body),
        origin: window.location.origin,
        source: frameWinOf(sid),
      }),
    )
  })
}

/**
 * То же сообщение, но из ЧУЖОГО окна той же страницы — скрытого зонда.
 *
 * Ровно то, что делает приём из CLAUDE.md: `<iframe>` заводится из страницы
 * оболочки и крутит в себе случаи другого компонента, а его кадр честно
 * говорит наверх с тем же `sid`. Санитар нужен для РАЗЛИЧЕНИЯ: «док не
 * сломался» ничего не доказывает, доказывает «док показал СВОЁ».
 */
export const sendUpFromStranger = (sid: number, body: Up): void => {
  const probe = document.createElement('iframe')
  document.body.appendChild(probe)
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: pack(sid, body),
        origin: window.location.origin,
        source: probe.contentWindow,
      }),
    )
  })
  probe.remove()
}

/**
 * Перехват того, что оболочка шлёт ВНИЗ, в `contentWindow` кадра.
 *
 * Живёт здесь, а не в первом тесте, которому понадобился: им пользуются
 * четыре санитара фазы 3, и разъехавшиеся копии перехвата — верный способ
 * получить два разных представления о том, что такое «оболочка послала патч».
 */
export const downSpy = () => vi.spyOn(frameEl().contentWindow as Window, 'postMessage')

/**
 * Последняя раскладка и последнее выделение, ушедшие ВНИЗ.
 *
 * Именно последние: патч копится одним объектом, и вниз за одно действие
 * уезжает несколько его редакций. Живут здесь, а не в первом тесте, которому
 * понадобились, — по тому же доводу, что и `downSpy`: две копии «что значит
 * оболочка послала раскладку» разъедутся, и один набор проверок начнёт
 * утверждать не то, что другой.
 *
 * Поле проверяется на `undefined`, а не на истинность: пустая раскладка (`[]`)
 * и снятое выделение (`null`) — законные значения, и фильтр по истинности
 * пропустил бы ровно тот случай, ради которого написан разбор мусора.
 */
export const lastCanvas = (spy: ReturnType<typeof downSpy>): CanvasSpot[] | null => {
  const all = spy.mock.calls
    .map((c) => (c[0] as Envelope<Patch>).body)
    .filter((b) => b?.canvas !== undefined)
  const last = all[all.length - 1]
  return last ? (last.canvas as CanvasSpot[]) : null
}

export const lastSelected = (spy: ReturnType<typeof downSpy>): string | null | undefined => {
  const all = spy.mock.calls
    .map((c) => (c[0] as Envelope<Patch>).body)
    .filter((b) => b?.canvasSelected !== undefined)
  return all[all.length - 1]?.canvasSelected
}
