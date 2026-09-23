/**
 * Обёртка одного кадра: жизненный цикл `<iframe>`, сессия, состояния ожидания.
 *
 * Каждое монтирование получает свой `sid` — монотонный счётчик. Он едет
 * в адрес кадра и в каждое сообщение, и по нему `unpack` отбрасывает чужое.
 * Без этого быстрое переключение компонентов даёт применённый `size` от
 * предыдущего кадра к следующему.
 *
 * `sid` отбрасывает ПРОШЛЫЙ кадр, но не СОСЕДНЕЕ окно с тем же номером: зонд
 * из CLAUDE.md заводится с `sid=1` и совпадает с первым настоящим кадром.
 * Различает их проверка окна-отправителя в `unpack` — DS-148.
 *
 * UUID не берём: кадры разных вкладок между собой не разговаривают,
 * уникальности в пределах оболочки достаточно, а короткое число проще читать
 * в логе и в адресе.
 */
import { useEffect, useRef, useState } from 'react'
import { pack, unpack, type Down, type Patch, type Up } from './protocol.js'
import { buildFrameUrl, type FrameState } from './frame-url.js'

/** Сколько ждём `ready`, прежде чем признать кадр молчащим. */
export const READY_TIMEOUT_MS = 5000

let seq = 0

export function nextSid(): number {
  seq += 1
  return seq
}

type Phase = 'wait' | 'ok' | 'stalled'

interface Props {
  state: FrameState
  width: number
  // Тип — `Patch`, а не `Down`: канал у этого пропа один-единственный —
  // эффект ниже пересылает его на каждое изменение (см. комментарий там).
  // `Down` пропустил бы сюда и `AskKinds`, а он уехал бы вниз по каналу,
  // предназначенному для повторной рассылки, — ровно та путаница, ради
  // ухода от которой заведён отдельный проп `ask` со своим одноразовым
  // эффектом.
  patch?: Patch | null
  /** Запрос карты видов — одноразовый, не патч. См. эффект ниже. */
  ask?: boolean
  /**
   * Счётчик повторов запроса карты видов (Задача 5). `ask` сам по себе не
   * годится для «повторить»: эффект ниже реагирует на СМЕНУ значения в
   * зависимостях, а не на то, что `ask` истинен, — выставить `true` поверх
   * уже `true` не меняет зависимость, React не перезапустит эффект, и повтор
   * не отправился бы. `askRetry` — независимая зависимость, которая меняется
   * на каждое «повторить», пока `ask` остаётся тем же `true`.
   */
  askRetry?: number
  onUp?: (m: Up) => void
}

export function ShellFrame({ state, width, patch, ask, askRetry, onUp }: Props) {
  const ref = useRef<HTMLIFrameElement | null>(null)
  const [phase, setPhase] = useState<Phase>('wait')
  // Адрес считается ОДИН раз, при монтировании. Пересчитывать src здесь —
  // на каждый патч (тема, масштаб) — нельзя: React перепишет атрибут, и
  // браузер уйдёт по новому адресу. Патч превратится в перезагрузку, ради
  // ухода от которой всё и затевалось. Пересоздание кадра делает key={sid}
  // у родителя, а не смена src.
  //
  // Оболочка задаёт адрес только на старте. Кадр зеркалит своё состояние
  // в собственный адрес через history.replaceState — заморозке здесь это не
  // мешает, потому что replaceState меняет адрес окна кадра изнутри его
  // документа, а не атрибут src у родителя.
  const [src] = useState(() => `./frame.html${buildFrameUrl(state)}`)
  // Счётчик перезагрузок в зависимостях эффекта — иначе «перезагрузить» вернёт
  // фазу в ожидание, но НОВЫЙ таймер не заведётся, и молчащий кадр повиснет под
  // скелетом навсегда. Ровно то состояние, ради ухода от которого нажимали.
  const [nonce, setNonce] = useState(0)

  /**
   * `onUp` держится в ref и НЕ стоит в зависимостях эффекта.
   *
   * Пока он там стоял, оболочке достаточно было передать стрелку инлайном —
   * новая функция на каждой перерисовке, — и эффект пересоздавался бы вместе
   * с таймером `ready`. Кадр, который молчит, но при этом заставляет оболочку
   * перерисовываться (а он заставляет — хотя бы `size`), никогда бы не дожил
   * до состояния «не ответил за 5 с»: таймер сбрасывался бы раньше.
   *
   * Санитар на это — в shell-frame.test.tsx, случай «таймер не перезапускается
   * от перерисовки родителя».
   */
  const onUpRef = useRef(onUp)
  useEffect(() => {
    onUpRef.current = onUp
  })

  useEffect(() => {
    setPhase('wait')

    /**
     * ЧТО ЛОВИТ этот таймер: медленный рендер, зависшую загрузку модуля
     * фикстуры, не пришедший `ready` из-за расхождения `sid`.
     *
     * ЧЕГО НЕ ЛОВИТ — и обещать это нельзя: синхронное зависание фикстуры
     * (`while (true)` в render). Кадр same-origin делит с оболочкой ОДИН
     * главный поток, поэтому такой цикл вешает и сам таймер тоже. Изнутри
     * страницы это неизлечимо; спасает закрытие вкладки — либо отдельный
     * origin для кадра (спека, раздел «Живучесть кадра»).
     */
    const timer = window.setTimeout(() => {
      setPhase((p) => (p === 'wait' ? 'stalled' : p))
    }, READY_TIMEOUT_MS)

    const onMessage = (e: MessageEvent) => {
      // Третьим — окно СВОЕГО кадра. `state.sid` его не заменяет: скрытый зонд
      // из CLAUDE.md ходит с `sid=1`, то есть с тем же номером, что и первый
      // настоящий кадр, и без этой проверки его списки случаев приезжали
      // в док (DS-148).
      const body = unpack<Up>(e, state.sid, ref.current?.contentWindow ?? null)
      if (!body) return
      if (body.type === 'ready') setPhase('ok')
      onUpRef.current?.(body)
    }

    window.addEventListener('message', onMessage)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('message', onMessage)
    }
  }, [state.sid, nonce])

  /**
   * Уборка кадра — отдельным эффектом с пустыми зависимостями, чтобы она
   * срабатывала ТОЛЬКО при размонтировании, а не на каждой смене `sid`
   * или перезагрузке: там увод в `about:blank` убил бы живой кадр.
   *
   * Проверка `isConnected` обязательна из-за StrictMode: в разработке React
   * прогоняет эффекты дважды (setup → cleanup → setup), и на этом ложном
   * размонтировании узел ещё в документе. Без проверки кадр уезжал бы
   * в `about:blank` и больше не возвращался — src в разметке не меняется,
   * и React его не переставит.
   *
   * Занулить `contentWindow` нельзя: это свойство браузера, а не наше поле.
   * Отпускаем свою ссылку.
   */
  useEffect(() => {
    const el = ref.current
    return () => {
      if (!el || el.isConnected) return
      try {
        el.contentWindow?.location.replace('about:blank')
      } catch {
        // кадр мог уже уйти — это не ошибка
      }
      ref.current = null
    }
  }, [])

  // Патч уходит вниз, как только кадр сказал `ready`: до этого слушателя в кадре
  // нет, и сообщение просто пропало бы. Поэтому фаза кадра — в зависимостях.
  useEffect(() => {
    if (phase !== 'ok' || !patch) return
    const win = ref.current?.contentWindow
    if (!win) return
    win.postMessage(pack(state.sid, patch), window.location.origin)
  }, [patch, phase, state.sid])

  // Запрос карты видов — ОДНОРАЗОВЫЙ, поэтому свой эффект, а не поле в патче:
  // патч пересылается на каждое изменение, и запрос уезжал бы вместе с каждым
  // поворотом крутилки. Зависимость от `phase` намеренна: до `ready` слушателя
  // в кадре нет. Зависимость от `sid` — тоже: перезагруженный кадр про прошлый
  // запрос ничего не знает.
  useEffect(() => {
    if (!ask || phase !== 'ok') return
    const win = ref.current?.contentWindow
    if (!win) return
    win.postMessage(pack(state.sid, { type: 'ask-kinds' } satisfies Down), window.location.origin)
  }, [ask, phase, state.sid, askRetry])

  const reload = (): void => {
    setNonce((n) => n + 1)
    const el = ref.current
    if (el) el.src = el.src
  }

  return (
    <div className="wb__frame-wrap" style={{ width }}>
      <iframe
        ref={ref}
        className="wb__frame"
        title={`${state.c} / ${state.caseId}`}
        src={src}
      />
      {phase === 'wait' && <div className="wb__skeleton" aria-hidden="true" />}
      {phase === 'stalled' && (
        <div className="wb__stall">
          <div>Кадр не ответил за {READY_TIMEOUT_MS / 1000} с</div>
          <button type="button" className="wb__btn" onClick={reload}>
            перезагрузить
          </button>
        </div>
      )}
    </div>
  )
}
