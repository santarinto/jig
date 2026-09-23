/**
 * Слой таб-стопов в кадре (Задача 33).
 *
 * jsdom здесь честен ровно в том, про что слой: он держит разметку, а слой
 * считается ИЗ РАЗМЕТКИ (см. шапку tabstops.ts — раскладку этот расчёт не
 * смотрит и не обещает). Координаты номеров в jsdom нулевые, и утверждать про
 * них нечего; утверждается состав, порядок и то, что список уехал наверх.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPortal } from 'react-dom'
import { render, screen, cleanup, act, waitFor } from '@testing-library/react'
import { Frame } from './frame-app.js'
import { loadFixture } from './registry.js'
import { pack } from './protocol.js'
import { resetForceCache, FORCE_STYLE_ID } from './force-states.js'
import type { AnyFixture } from '../src/internal/fixture.js'

vi.mock('./registry.js', () => ({
  fixtureNames: () => ['Host', 'Portal'],
  loadFixture: vi.fn(),
}))

/** Пункт списка портальной формы: ссылка, а внутри кнопка. Два стопа на пункт. */
const HOST: AnyFixture = {
  name: 'Host',
  group: 'G',
  props: {},
  controls: {},
  cases: [{ id: 'base', title: 'B' }],
  render: () => (
    <ul data-testid="host">
      <li>
        <a href="#row">
          Строка
          <button type="button">Открыть</button>
        </a>
      </li>
    </ul>
  ),
}

/**
 * Открытое окно, как его строит Modal: оверлей ПОРТАЛОМ в `body`, фон под ним
 * `inert` — ровно то, что вешает `useOverlayIsolation`. Обе половины нужны,
 * чтобы утверждать про номера: корни дают оверлей, `inert` убирает фон.
 */
const PORTAL: AnyFixture = {
  name: 'Portal',
  group: 'G',
  props: {},
  controls: {},
  cases: [{ id: 'base', title: 'B' }],
  render: () => (
    <div data-testid="host">
      <div inert>
        <button type="button">Фон</button>
      </div>
      {createPortal(
        <div className="ds-modal__overlay" role="dialog" aria-modal="true">
          <button type="button">Отмена</button>
          <button type="button">Провести</button>
        </div>,
        document.body,
      )}
    </div>
  ),
}

class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

const badges = (): string[] =>
  Array.from(document.querySelectorAll('.wbf-stop')).map((e) => e.textContent ?? '')

const settle = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  resetForceCache()
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.mocked(loadFixture).mockImplementation(async (name: string) =>
    name === 'Host' ? HOST : name === 'Portal' ? PORTAL : null,
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.mocked(loadFixture).mockReset()
  document.getElementById(FORCE_STYLE_ID)?.remove()
})

describe('слой таб-стопов', () => {
  it('без слоя номеров нет вовсе', async () => {
    window.history.pushState({}, '', '/frame.html?c=Host&sid=61')
    render(<Frame />)
    await screen.findByTestId('host')
    await settle()

    expect(badges()).toEqual([])
  })

  it('со слоем номера идут по порядку обхода — и их два на один пункт', async () => {
    // Тот самый дефект, ради которого слой заведён: глазами пункт один,
    // клавиатурой два (портальный `<a><button>`).
    window.history.pushState({}, '', '/frame.html?c=Host&sid=62&layers=tabstops')
    render(<Frame />)
    await screen.findByTestId('host')
    await settle()

    // `waitFor`: номера — результат эффекта, а `findByTestId` ждёт узла.
    await waitFor(() => expect(badges()).toEqual(['1', '2']))
  })

  it('список уходит наверх, а снятие слоя шлёт пустой — не молчание', async () => {
    // Молчание оболочка не отличит от «ещё не посчитали», и вкладка осталась
    // бы со списком от выключенного слоя.
    const spy = vi.spyOn(window.parent, 'postMessage')
    window.history.pushState({}, '', '/frame.html?c=Host&sid=63&layers=tabstops')
    render(<Frame />)
    await screen.findByTestId('host')
    await settle()

    const sent = (): { node: string; label: string }[][] =>
      spy.mock.calls
        .map((c) => (c[0] as { body?: { type?: string; stops?: { node: string; label: string }[] } }).body)
        .filter((b) => b?.type === 'tabstops')
        .map((b) => b?.stops ?? [])

    await waitFor(() => expect(sent().length).toBeGreaterThan(0))
    const first = sent()[0]
    expect(first?.map((s) => s.node)).toEqual(['a', 'button'])
    // У ссылки подпись включает текст вложенной кнопки — так её и прочитает
    // диктор, и это ровно то, что делает дефект видимым: две строки списка
    // про один пункт, причём вторая целиком содержится в первой.
    expect(first?.map((s) => s.label)).toEqual(['СтрокаОткрыть', 'Открыть'])

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: pack(63, { type: 'patch', layers: [] }),
          origin: window.location.origin,
          source: window.parent,
        }),
      )
    })
    await settle()

    const all = sent()
    expect(all[all.length - 1]).toEqual([])
    expect(badges()).toEqual([])
    spy.mockRestore()
  })

  it('в режиме «Состояния» нумеруются все копии — четыре ряда стопов', async () => {
    // Копии рисуют то же дерево, значит и стопов вчетверо больше. Это не
    // дефект, а следствие вида, и слой обязан показывать то, что есть на
    // экране, а не то, что было бы в одиночном кадре.
    window.history.pushState({}, '', '/frame.html?c=Host&sid=64&mode=states&layers=tabstops')
    render(<Frame />)
    await screen.findAllByTestId('host')
    await settle()

    await waitFor(() => expect(badges()).toHaveLength(8))
  })

  it('стопы ОТКРЫТОГО ОКНА считаются, а фон под ним — нет', async () => {
    // DS-163. Оверлей — прямой ребёнок `body` кадра, и слой от одного
    // хоста печатал здесь НОЛЬ: «до этого превью клавиатура не доходит».
    // Пустой список читается как проверенный, прочерк — хотя бы как незнание,
    // и потому ложный ноль хуже отсутствия ответа.
    window.history.pushState({}, '', '/frame.html?c=Portal&sid=65&layers=tabstops')
    const spy = vi.spyOn(window.parent, 'postMessage')
    render(<Frame />)
    await screen.findByTestId('host')
    await settle()

    const sent = (): { label: string }[][] =>
      spy.mock.calls
        .map((c) => (c[0] as { body?: { type?: string; stops?: { label: string }[] } }).body)
        .filter((b) => b?.type === 'tabstops')
        .map((b) => b?.stops ?? [])

    await waitFor(() => expect(sent().length).toBeGreaterThan(0))
    const all = sent()
    const last = all[all.length - 1]
    // Две кнопки окна и НИ ОДНОЙ фоновой: `inert` фона читается обходом, а
    // оверлей приезжает своим корнем. Сломай любую половину — список станет
    // либо пустым, либо суммой двух областей.
    expect(last?.map((s2) => s2.label)).toEqual(['Отмена', 'Провести'])
    spy.mockRestore()
  })
})
