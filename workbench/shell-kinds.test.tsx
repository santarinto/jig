/**
 * Карта видов (Задача 5): запрос по требованию, ответ гарантирован, молчание
 * объяснено. Пять санитаров, как в брифе:
 *
 * 1. до открытия выбора начинки `ask-kinds` вниз не уходит;
 * 2. два открытия выбора → ровно ОДИН `ask-kinds` (канал одноразовый —
 *    Задача 4 — но РЕШЕНИЕ спросить принимает `Shell`, и это решение тоже
 *    обязано быть идемпотентным, не только сам канал);
 * 3. второй `ready` с тем же `sid` (кадр перезагрузился документом — Vite
 *    делает так на правку фикстуры, она не может быть границей HMR) гасит
 *    карту; следующее открытие выбора спрашивает СНОВА;
 * 4. кадр молчит на `ask-kinds` дольше READY_TIMEOUT_MS → в блоке позиций
 *    слова «карта видов не приехала» и кнопка «повторить»;
 * 5. кадр отвечает картой ЦЕЛИКОМ и НЕ ГРУЗИТ при этом ни одного модуля
 *    фикстуры (DS-67).
 *
 * Тесты 1–4 идут через `Shell` (решение «спрашивать или нет» — её): позиция
 * `cell` открывается кликом по чипу «пусто», ответ на `ask-kinds` — тем же
 * `sendUp`, которым сюда прилетает и `ready`. Тест 5 — про ответ самого кадра
 * в `frame-app.tsx`, и его нельзя проверить через `Shell`: `<iframe>` в jsdom
 * не исполняет документ кадра. Поэтому тест 5 рисует `Frame` напрямую — тем
 * же приёмом, что frame-slots.test.tsx.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent, within, waitFor } from '@testing-library/react'
import { Shell } from './shell-app.js'
import { Frame } from './frame-app.js'
import { loadFixture } from './registry.js'
import { READY_TIMEOUT_MS } from './shell-frame.js'
import { downSpy, frameSid, sendUp } from './test-kit.js'
import { pack } from './protocol.js'
import type { AnyFixture } from '../src/internal/fixture.js'
import type { Down, Envelope, FixtureMeta, KindRow, Up } from './protocol.js'

// Общий на весь файл, а не только на describe теста 5: `Shell` тоже читает
// `fixtureNames()` (список слева), и он обязан отдавать что-то стабильное.
vi.mock('./registry.js', () => ({
  fixtureNames: () => ['A', 'B', 'C'],
  // Карта видов приезжает в кадр отсюда же (DS-67) — виртуальным
  // модулем, собранным разбором исходников. В тесте она заглушена вместе с
  // остальным реестром: предмет здесь — что кадр отдаёт КАРТУ КАК ЕСТЬ и
  // ничего не грузит, а не какие виды у настоящих фикстур (это `kinds-truth`).
  fixtureKinds: () => KINDS_STUB,
  loadFixture: vi.fn(),
}))

/** «Вид есть», «вида нет» и «вид не прочитан» — все три формы разом. */
const KINDS_STUB: KindRow[] = [
  { name: 'A' },
  { name: 'B', kind: 'inline' },
  { name: 'C', unread: true },
]

/** Одна позиция `cell`, принимает `inline` — годится проверять фильтр `fitsSlot`. */
const META: FixtureMeta = {
  name: 'A',
  group: 'G',
  cases: [{ id: 'base', title: 'Обычная', values: {}, slots: {} }],
  controls: {},
  unexpressed: [],
  data: [],
  slots: { cell: { title: 'Ячейка', accepts: 'inline', prop: 'columns[3].render' } },
}

// `Frame` (тест 5) наблюдает размер хоста через ResizeObserver, а jsdom его
// не знает — заглушка нужна только чтобы эффект не падал (тот же приём, что
// в frame-slots.test.tsx).
class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.mocked(loadFixture).mockReset()
})

const slots = () => screen.getByRole('group', { name: 'Позиции' })
const openCell = () => fireEvent.click(within(slots()).getByRole('button', { name: 'пусто' }))
const asksOf = (spy: ReturnType<typeof downSpy>): number =>
  spy.mock.calls.map(([m]) => m as Envelope<Down>).filter((m) => m.body.type === 'ask-kinds').length

describe('карта видов — запрос по требованию (через Shell)', () => {
  it('до открытия выбора начинки ask-kinds вниз не уходит', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: META })
    const spy = downSpy()

    expect(asksOf(spy)).toBe(0)
    spy.mockRestore()
  })

  it('два открытия выбора → ровно один ask-kinds', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: META })
    const spy = downSpy()

    openCell() // открыли
    openCell() // закрыли (toggle) — попытка спросить снова здесь тоже есть
    openCell() // открыли снова

    expect(asksOf(spy)).toBe(1)
    spy.mockRestore()
  })

  const compatibleCount = () =>
    within(slots()).getByRole('status', { name: 'совместимых начинок' }).textContent

  it('второй ready с тем же sid (выбор ЗАКРЫТ) гасит карту — следующее открытие спрашивает снова', () => {
    render(<Shell />)
    const sid = frameSid()
    sendUp(sid, { type: 'ready', meta: META })

    openCell()
    sendUp(sid, { type: 'kinds', list: [{ name: 'Badge', kind: 'inline' }] })
    expect(compatibleCount()).toBe('1')
    openCell() // закрыли — иначе Ruling 13 (ниже) сам перезапросит на ready

    // Кадр перезагрузил документ (HMR), sid не изменился.
    sendUp(sid, { type: 'ready', meta: META })
    expect(compatibleCount()).toBe('—')

    const spy = downSpy()
    openCell()
    expect(asksOf(spy)).toBe(1)
    spy.mockRestore()
  })

  /**
   * Ruling 13 (ревью Task 5+6): Vite перезагружает документ кадра на КАЖДУЮ
   * правку фикстуры — это основной рабочий цикл инструмента, не редкий
   * случай. Если в этот момент выбор открыт, а `ready` просто гасит карту в
   * «ещё не спрашивали» — таймер таймаута не заводится (эффект видит
   * `askSeq === 0` и выходит сразу), и панель виснет на «грузим карту
   * видов…» НАВСЕГДА, без слов и без «повторить». Лечится только
   * закрыть-открыть чип руками — то самое молчание, ради ухода от которого
   * писался таймаут.
   */
  it('второй ready при ОТКРЫТОМ выборе перезапрашивает карту сам, без участия человека', () => {
    render(<Shell />)
    const sid = frameSid()
    sendUp(sid, { type: 'ready', meta: META })

    openCell() // открыли — ask #1 ушёл
    const spy = downSpy()

    // Кадр перезагрузился (Vite на правку фикстуры), выбор всё ещё открыт.
    sendUp(sid, { type: 'ready', meta: META })

    expect(asksOf(spy)).toBe(1)
    spy.mockRestore()
  })

  it('кадр молчит READY_TIMEOUT_MS → в блоке позиций слова и «повторить»', () => {
    vi.useFakeTimers()
    try {
      render(<Shell />)
      sendUp(frameSid(), { type: 'ready', meta: META })
      act(() => openCell())

      act(() => vi.advanceTimersByTime(READY_TIMEOUT_MS))

      expect(within(slots()).getByText(/карта видов не приехала/i)).toBeTruthy()
      expect(within(slots()).getByRole('button', { name: 'повторить' })).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  /**
   * Финальное ревью фазы 4, Important 2: комментарий у `openPicker`
   * (shell-app.tsx) раньше утверждал, что проверка `askSeq === 0` перед
   * ростом — ЕДИНСТВЕННАЯ защита от повторного `ask-kinds`. Измерено —
   * неверно на ПЕРВОМ цикле открыть-закрыть-открыть (там повтор гасит само
   * React по Object.is, тест выше это не различает: снятая защита и без неё
   * даёт ровно 1 запрос). Защита при этом НЕ мёртвая — она несущая на пути
   * ПОВТОРА, которого не касался ни один тест файла: после «повторить»
   * `askSeq` уже ≥ 2, и безусловный `setAskSeq(1)` записал бы значение
   * МЕНЬШЕ текущего — реальное изменение по Object.is, лишний `ask-kinds`.
   */
  it('открыли → таймаут → «повторить» → закрыли → открыли: защита нужна именно здесь', () => {
    vi.useFakeTimers()
    try {
      render(<Shell />)
      sendUp(frameSid(), { type: 'ready', meta: META })
      act(() => openCell()) // открыли — ask #1, askSeq: 0 → 1

      act(() => vi.advanceTimersByTime(READY_TIMEOUT_MS))
      act(() => {
        fireEvent.click(within(slots()).getByRole('button', { name: 'повторить' }))
      }) // повторили — ask #2, askSeq: 1 → 2

      // Спай ставим ПОСЛЕ повтора: считаем только то, что уходит на пути
      // закрыть-открыть, когда askSeq уже не 0.
      const spy = downSpy()
      act(() => openCell()) // закрыли (toggle)
      act(() => openCell()) // открыли снова

      expect(asksOf(spy)).toBe(0)
      spy.mockRestore()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('карта видов — ответ кадра (через Frame)', () => {
  const HOST: AnyFixture = {
    name: 'A',
    group: 'G',
    props: {},
    controls: {},
    cases: [{ id: 'base', title: 'B' }],
    render: () => <div data-testid="a-ready" />,
  }

  beforeEach(() => {
    vi.mocked(loadFixture).mockImplementation(async (name: string) => (name === 'A' ? HOST : null))
  })

  /**
   * ДВЕ ПОЛОВИНЫ ОДНОГО УТВЕРЖДЕНИЯ, и вторая — весь смысл DS-67.
   *
   * Половина первая: карта уезжает ЦЕЛОЙ и как есть — три записи, включая ту,
   * у которой вид не прочитан. Она обязана остаться в списке: исчезнувшая
   * читается как «такой фикстуры нет», а она есть.
   *
   * Половина вторая: за время ответа `loadFixture` не позван НИ РАЗУ. Раньше
   * карта строилась ровно им — по динамическому импорту на фикстуру, с
   * исполнением модуля компонента и его стресс-данных, в тот момент, когда
   * человек открыл выбор начинки. Мутация, которая обязана красить: вернуть
   * прежний `loadKinds` (`Promise.all` по `fixtureNames`) — счётчик вызовов
   * вырастет, и на этой же карте.
   *
   * Счётчик снимается ПОСЛЕ загрузки самой фикстуры кадра: `loadFixture('A')`
   * законен, кадр рисует «A», и считать его в цену карты было бы враньём в
   * пользу проверки.
   */
  it('карта уезжает целиком и не грузит ни одного модуля фикстуры', async () => {
    window.history.pushState({}, '', '/frame.html?c=A&sid=41')
    render(<Frame />)
    await screen.findByTestId('a-ready')

    const loadsBefore = vi.mocked(loadFixture).mock.calls.length
    const spy = vi.spyOn(window, 'postMessage')
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: pack<Down>(41, { type: 'ask-kinds' }),
          origin: window.location.origin,
          source: window.parent,
        }),
      )
    })

    await waitFor(() => {
      const sent = spy.mock.calls.map(([m]) => m as Envelope<Up>)
      expect(sent.some((m) => m.body.type === 'kinds')).toBe(true)
    })

    const sent = spy.mock.calls.map(([m]) => m as Envelope<Up>)
    const kindsMsg = sent.find((m) => m.body.type === 'kinds')!.body as { type: 'kinds'; list: KindRow[] }

    expect(kindsMsg.list).toEqual(KINDS_STUB)
    expect(vi.mocked(loadFixture).mock.calls.length).toBe(loadsBefore)

    spy.mockRestore()
  })
})
