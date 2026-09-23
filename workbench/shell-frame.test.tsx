/**
 * Санитар на жизненный цикл кадра.
 *
 * Проверяет ровно одно: после десяти пересозданий не остаётся лишних
 * слушателей `message`. Гарантий «V8-хип очищен» дать нельзя ни в одном
 * браузерном приложении — GC не обещает сроков; проверяемое следствие —
 * баланс подписок.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { ShellFrame, nextSid, READY_TIMEOUT_MS } from './shell-frame.js'
import { downSpy, sendUp, sendUpFromStranger } from './test-kit.js'
import type { FrameState } from './frame-url.js'
import type { Down, Envelope, Up } from './protocol.js'

const st = (): FrameState => ({
  c: 'DataTable',
  caseId: 'base',
  sid: nextSid(),
  w: null,
  theme: 'light',
  mode: 'frame',
  text: 'ru',
  aim: false,
  scale: 1,
  data: null,
  force: null,
  layers: [],
  props: {},
  slots: {},
})

const countMessageListeners = () => {
  const add = vi.spyOn(window, 'addEventListener')
  const remove = vi.spyOn(window, 'removeEventListener')
  return {
    balance: () =>
      add.mock.calls.filter(([t]) => t === 'message').length -
      remove.mock.calls.filter(([t]) => t === 'message').length,
    restore: () => {
      add.mockRestore()
      remove.mockRestore()
    },
  }
}

afterEach(cleanup)

describe('жизненный цикл кадра', () => {
  it('после десяти пересозданий не остаётся лишних слушателей', () => {
    const spy = countMessageListeners()

    for (let i = 0; i < 10; i += 1) {
      const view = render(<ShellFrame state={st()} width={320} />)
      view.unmount()
    }

    expect(spy.balance()).toBe(0)
    spy.restore()
  })

  it('пока кадр смонтирован, слушатель ровно один', () => {
    const spy = countMessageListeners()

    const view = render(<ShellFrame state={st()} width={320} />)
    expect(spy.balance()).toBe(1)

    view.unmount()
    expect(spy.balance()).toBe(0)
    spy.restore()
  })
})

describe('ожидание ready', () => {
  it('таймер не перезапускается от перерисовки родителя', () => {
    vi.useFakeTimers()
    try {
      // Состояние ОДНО и то же: сессия не менялась, значит и эффект
      // пересоздаваться не должен. Меняется только функция onUp — ровно так
      // ведёт себя родитель, передающий стрелку инлайном.
      const state = st()
      const view = render(<ShellFrame state={state} width={320} onUp={() => {}} />)

      act(() => vi.advanceTimersByTime(READY_TIMEOUT_MS - 1000))
      view.rerender(<ShellFrame state={state} width={320} onUp={() => {}} />)
      act(() => vi.advanceTimersByTime(2000))

      expect(screen.getByText(/не ответил/)).toBeTruthy()
      view.unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})

/**
 * `ask` — второй канал вниз (Task 4, задел под карту видов Task 5).
 * Отдельный от `patch` эффект: патч уходит на КАЖДОЕ изменение, а
 * `ask-kinds` — только когда `ask` истинен, и не на каждый рендер (иначе
 * каждый поворот крутилки слал бы повторный запрос).
 *
 * ИСПРАВЛЕНО (ревью Task 5+6): раньше здесь было написано «ask-kinds обязан
 * уйти ровно один раз за жизнь кадра» — с появлением «повторить» (Task 5,
 * Ruling 13) это перестало быть правдой. `askRetry` — отдельная зависимость
 * эффекта именно ради повтора: `Shell` умеет попросить карту заново на ТОМ
 * ЖЕ живом кадре (после таймаута или после перезагрузки документа кадра при
 * открытом выборе), не пересоздавая `<iframe>`.
 */
describe('запрос карты видов (ask) — одноразовый канал', () => {
  const asksSent = (spy: ReturnType<typeof downSpy>): number =>
    spy.mock.calls
      .map(([m]) => m as Envelope<Down>)
      .filter((m) => m.body.type === 'ask-kinds').length

  it('ask={false} — вниз ничего не уходит, даже после ready', () => {
    const state = st()
    render(<ShellFrame state={state} width={320} ask={false} />)
    const spy = downSpy()

    sendUp(state.sid, { type: 'ready', meta: null })

    expect(asksSent(spy)).toBe(0)
    spy.mockRestore()
  })

  it('ask={true} до ready — вниз ничего не уходит: слушателя в кадре ещё нет', () => {
    const state = st()
    render(<ShellFrame state={state} width={320} ask={true} />)
    const spy = downSpy()

    expect(asksSent(spy)).toBe(0)
    spy.mockRestore()
  })

  it('ask={true} после ready — уходит ровно один ask-kinds', () => {
    const state = st()
    render(<ShellFrame state={state} width={320} ask={true} />)
    const spy = downSpy()

    sendUp(state.sid, { type: 'ready', meta: null })

    expect(asksSent(spy)).toBe(1)
    spy.mockRestore()
  })

  it('последующее изменение патча не шлёт второй ask-kinds', () => {
    const state = st()
    const view = render(<ShellFrame state={state} width={320} ask={true} patch={null} />)
    sendUp(state.sid, { type: 'ready', meta: null })
    const spy = downSpy()

    view.rerender(
      <ShellFrame state={state} width={320} ask={true} patch={{ type: 'patch', theme: 'dark' }} />,
    )

    expect(asksSent(spy)).toBe(0)
    spy.mockRestore()
  })

  /**
   * Санитар на «повторить» (Ruling 13): без него `askRetry` в коде есть, но
   * ничем не выращен — ни один тест не проверяет, что его РОСТ действительно
   * шлёт второй запрос. Дыра ровно та же, что закрывал предыдущий тест для
   * `patch`: убери `askRetry` из зависимостей эффекта в shell-frame.tsx — и
   * это МОЛЧА вернёт неопровержимость санитару «два открытия → один запрос»
   * (`shell-kinds.test.tsx`), потому что единственный канал, которым вообще
   * можно послать `ask-kinds` второй раз без пересоздания кадра, — этот.
   */
  it('рост askRetry при неизменном ask={true} шлёт повторный ask-kinds — тот же живой кадр, новый запрос', () => {
    const state = st()
    const view = render(<ShellFrame state={state} width={320} ask={true} askRetry={1} />)
    sendUp(state.sid, { type: 'ready', meta: null })
    const spy = downSpy()

    view.rerender(<ShellFrame state={state} width={320} ask={true} askRetry={2} />)

    expect(asksSent(spy)).toBe(1)
    spy.mockRestore()
  })
})

/**
 * DS-148. Скрытый зонд — приём из CLAUDE.md: `<iframe>` заводится из
 * страницы ОБОЛОЧКИ и в цикле крутит `frame.html?c=<другой компонент>&sid=1`.
 * Его кадр честно говорит наверх `window.parent.postMessage`, и наверху сидит
 * та же оболочка.
 *
 * Проверяется РАЗЛИЧЕНИЕМ, как требует задача: мало показать, что что-то
 * отсеклось, — надо показать, что СВОЁ при этом дошло. Санитар, проверяющий
 * только отказ, зеленеет и на `unpack`, который режет вообще всё.
 */
describe('чужое окно с тем же sid — скрытый зонд (DS-148)', () => {
  const capture = () => {
    const seen: Up[] = []
    const state = st()
    render(<ShellFrame state={state} width={320} onUp={(m) => seen.push(m)} />)
    return { state, seen }
  }

  it('список случаев от зонда до оболочки не доходит', () => {
    const { state, seen } = capture()

    sendUpFromStranger(state.sid, {
      type: 'ready',
      meta: { name: 'Tree', group: 'Данные', cases: [], controls: {}, slots: {}, data: [], unexpressed: [] },
    })

    expect(seen).toHaveLength(0)
  })

  it('свой кадр с тем же sid доходит — иначе резалось бы всё подряд', () => {
    const { state, seen } = capture()

    sendUp(state.sid, {
      type: 'ready',
      meta: { name: 'DataTable', group: 'Данные', cases: [], controls: {}, slots: {}, data: [], unexpressed: [] },
    })

    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ type: 'ready' })
  })

  it('зонд не перебивает своего: наверх приезжает имя СВОЕГО компонента', () => {
    const { state, seen } = capture()

    sendUp(state.sid, {
      type: 'ready',
      meta: { name: 'DataTable', group: 'Данные', cases: [], controls: {}, slots: {}, data: [], unexpressed: [] },
    })
    sendUpFromStranger(state.sid, {
      type: 'ready',
      meta: { name: 'Tree', group: 'Данные', cases: [], controls: {}, slots: {}, data: [], unexpressed: [] },
    })

    const names = seen.map((m) => (m.type === 'ready' ? m.meta?.name : null))
    expect(names).toEqual(['DataTable'])
  })
})
