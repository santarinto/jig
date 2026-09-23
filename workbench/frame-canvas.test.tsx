/**
 * Канвас в кадре (DS-128, шаг 1).
 *
 * ЧЕГО ЭТИ ПРОВЕРКИ НЕ ПРОВЕРЯЮТ, и это надо знать до чтения. jsdom считает
 * все прямоугольники нулевыми, поэтому здесь нельзя утверждать ни про
 * раскладку, ни про контуры axe, ни про то, что номера стопов встали над
 * своими узлами. Всё это — замер шага 2 живым прогоном (`smoke:wb`), и он
 * обязан быть, а не подразумеваться.
 *
 * Здесь честно проверяется РАЗМЕТКА и то, что из неё выводится: оба места
 * оказались в ОДНОМ хосте, слой таб-стопов посчитал их вместе и в порядке
 * обхода, падение одного места не уносит соседнее, а имя `c` из адреса на
 * канвас не влияет.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, waitFor } from '@testing-library/react'
import { Frame } from './frame-app.js'
import { loadFixture } from './registry.js'
import { CANVAS_SPOTS } from './canvas-plan.js'
import { pack } from './protocol.js'
import { resetForceCache, FORCE_STYLE_ID } from './force-states.js'
import type { AnyFixture } from '../src/internal/fixture.js'

vi.mock('./registry.js', () => ({
  fixtureNames: () => [],
  loadFixture: vi.fn(),
}))

const A = CANVAS_SPOTS[0]!
const B = CANVAS_SPOTS[1]!

/**
 * Подделки под настоящие места раскладки: имена и id случаев берутся ИЗ НЕЁ, а
 * не пишутся строками. Смени пару в `canvas-plan.ts` — проверки поедут за ней;
 * впиши имена сюда руками — и они однажды разойдутся, а тест останется
 * зелёным, проверяя раскладку, которой больше нет.
 */
const fake = (name: string, caseId: string, stops: string[]): AnyFixture => ({
  name,
  group: 'G',
  props: {},
  controls: {},
  cases: [{ id: caseId || 'base', title: 'B' }],
  render: () => (
    <div data-testid={`spot-${name}`}>
      {stops.map((label) => (
        <button type="button" key={label}>
          {label}
        </button>
      ))}
    </div>
  ),
})

const FX_A = fake(A.component, A.caseId, ['A1', 'A2'])
const FX_B = fake(B.component, B.caseId, ['B1'])

class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

const settle = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve()
  })
}

const spotOf = (el: Element): string | null =>
  el.closest('[data-wb-spot]')?.getAttribute('data-wb-spot') ?? null

beforeEach(() => {
  resetForceCache()
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.mocked(loadFixture).mockImplementation(async (name: string) =>
    name === A.component ? FX_A : name === B.component ? FX_B : null,
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.mocked(loadFixture).mockReset()
  document.getElementById(FORCE_STYLE_ID)?.remove()
})

describe('канвас', () => {
  it('оба места рисуются, и оба ВНУТРИ одного хоста', async () => {
    // Это и есть предмет шага 1: слои получают `hostRef.current`, и «слои
    // работают поверх нескольких компонентов» держится ровно на том, что оба
    // компонента лежат под одним корнем. Проверка на «оба на экране» этого не
    // утверждает — они могли бы оказаться соседями хоста.
    window.history.pushState({}, '', '/frame.html?c=Нетакого&sid=70&mode=canvas')
    render(<Frame />)
    await screen.findByTestId(`spot-${A.component}`)
    await screen.findByTestId(`spot-${B.component}`)
    await settle()

    const host = document.querySelector('.wbf-canvas')
    expect(host).not.toBeNull()
    expect(host?.contains(screen.getByTestId(`spot-${A.component}`))).toBe(true)
    expect(host?.contains(screen.getByTestId(`spot-${B.component}`))).toBe(true)
  })

  it('имя `c` из адреса канвас не гасит', async () => {
    // Тот же прогон, что выше, но утверждение другое и своё: в адресе стоит
    // `c=Нетакого`, у которого фикстуры нет. Одиночный кадр на этом пишет
    // «Фикстуры нет» и не рисует ничего — канвас обязан рисовать свои места,
    // потому что ни одно из них про `c` не спрашивало. Мутация, которой это
    // ловится: снять `solo` у ранних возвратов в `frame-app.tsx`.
    window.history.pushState({}, '', '/frame.html?c=Нетакого&sid=71&mode=canvas')
    render(<Frame />)
    await screen.findByTestId(`spot-${A.component}`)
    await settle()

    expect(document.querySelector('.wbf-empty')).toBeNull()
  })

  it('таб-стопы считаются по ОБОИМ местам и в порядке обхода', async () => {
    // ПОРЯДОК, А НЕ КОЛИЧЕСТВО. Фокус, обошедший оба места, и фокус,
    // застрявший в первом, дают разное число стопов только потому, что места
    // здесь разной величины; на паре одинаковых числа совпали бы, и проверка
    // по количеству прошла бы, ничего не проверив. Поэтому утверждается список
    // подписей — и то, из какого места пришёл каждый стоп.
    const spy = vi.spyOn(window.parent, 'postMessage')
    window.history.pushState({}, '', '/frame.html?c=X&sid=72&mode=canvas&layers=tabstops')
    render(<Frame />)
    await screen.findByTestId(`spot-${B.component}`)
    await settle()

    const sent = (): { node: string; label: string }[][] =>
      spy.mock.calls
        .map(
          (c) =>
            (c[0] as { body?: { type?: string; stops?: { node: string; label: string }[] } }).body,
        )
        .filter((b) => b?.type === 'tabstops')
        .map((b) => b?.stops ?? [])

    // `at(-1)` не берём: lib проекта ниже es2022 (санитар `typecheck` это и
    // поймал), а второй способ дотянуться до хвоста в одном файле с соседним
    // тестом слоя разъедется при первой правке.
    const last = (): { node: string; label: string }[] => {
      const all = sent()
      return all[all.length - 1] ?? []
    }
    await waitFor(() => expect(last()).toHaveLength(3))
    expect(last().map((s2) => s2.label)).toEqual(['A1', 'A2', 'B1'])

    // Номера на экране — те же три и в том же порядке.
    expect(Array.from(document.querySelectorAll('.wbf-stop')).map((e) => e.textContent)).toEqual([
      '1',
      '2',
      '3',
    ])

    // Стопы пришли из РАЗНЫХ мест, а не втрое больше из одного.
    const buttons = Array.from(document.querySelectorAll('.wbf-canvas button'))
    expect(buttons.map(spotOf)).toEqual([A.id, A.id, B.id])
    spy.mockRestore()
  })

  it('упавшее место не уносит соседнее', async () => {
    // Граница ошибок на КАЖДОЕ место, в отличие от «Состояний», где она одна
    // на четыре копии одной фикстуры. Мутация: перенести `FrameBoundary` из
    // `CanvasSpotView` на корень `.wbf-canvas` — тогда живая таблица исчезнет
    // вместе с упавшей листалкой, и канвас ответит «сломано всё».
    vi.mocked(loadFixture).mockImplementation(async (name: string) =>
      name === A.component
        ? FX_A
        : name === B.component
          ? {
              ...FX_B,
              render: () => {
                throw new Error('листалка упала')
              },
            }
          : null,
    )
    // Граница печатает сообщение и шлёт его наверх; консоль React про это же
    // ошибку в прогоне не глушим намеренно — она про настоящее падение.
    window.history.pushState({}, '', '/frame.html?c=X&sid=73&mode=canvas')
    render(<Frame />)
    await screen.findByTestId(`spot-${A.component}`)
    await settle()

    expect(screen.getByTestId(`spot-${A.component}`)).toBeTruthy()
    await waitFor(() => expect(document.querySelector('.wbf-error')).not.toBeNull())
    // Отказ стоит В СВОЁМ месте, а не вместо всего канваса.
    expect(spotOf(document.querySelector('.wbf-error')!)).toBe(B.id)
  })

  it('место без фикстуры объясняется словами, а не пустотой', async () => {
    vi.mocked(loadFixture).mockImplementation(async (name: string) => (name === A.component ? FX_A : null))
    window.history.pushState({}, '', '/frame.html?c=X&sid=74&mode=canvas')
    render(<Frame />)
    await screen.findByTestId(`spot-${A.component}`)
    await settle()

    await waitFor(() => expect(document.querySelector('.wbf-canvas__gap')).not.toBeNull())
    const gap = document.querySelector('.wbf-canvas__gap')!
    expect(gap.textContent).toContain(B.component)
    expect(spotOf(gap)).toBe(B.id)
  })

  it('место, чья фикстура падает при импорте, называет ДРУГОЙ диагноз', async () => {
    // «Файла нет» и «файл есть и падает» — разные ответы, и второй, поданный
    // как первый, отправляет человека писать фикстуру, которая уже написана.
    // Тот же довод, что у `fxBroken` одиночной фикстуры.
    vi.mocked(loadFixture).mockImplementation(async (name: string) => {
      if (name === A.component) return FX_A
      throw new Error('модуль не грузится')
    })
    window.history.pushState({}, '', '/frame.html?c=X&sid=75&mode=canvas')
    render(<Frame />)
    await screen.findByTestId(`spot-${A.component}`)
    await settle()

    await waitFor(() => expect(document.querySelector('.wbf-canvas__gap')).not.toBeNull())
    expect(document.querySelector('.wbf-canvas__gap')?.textContent).toContain('падает при импорте')
  })

  it('названный и не найденный случай — отказ, а не первый случай', async () => {
    // Ruling 7 у начинок позиций, то же правило здесь: подставленный первый
    // случай дал бы работающий на вид канвас не про то, а пустота заставляет
    // разбираться.
    vi.mocked(loadFixture).mockImplementation(async (name: string) =>
      name === A.component ? { ...FX_A, cases: [{ id: 'совсем-другой', title: 'X' }] } : FX_B,
    )
    window.history.pushState({}, '', '/frame.html?c=X&sid=76&mode=canvas')
    render(<Frame />)
    await screen.findByTestId(`spot-${B.component}`)
    await settle()

    await waitFor(() => expect(document.querySelector('.wbf-canvas__gap')).not.toBeNull())
    const gap = document.querySelector('.wbf-canvas__gap')!
    expect(gap.textContent).toContain(A.caseId)
    expect(spotOf(gap)).toBe(A.id)
  })

  it('раскладка приезжает ПАТЧЕМ и заменяет прежнюю целиком', async () => {
    // Целиком, а не дельтой: место можно удалить, и дельта, умеющая удалять,
    // была бы вторым языком поверх списка. Мутация: сменить замену на
    // слияние — тогда `pages` останется на канвасе, и проверка покраснеет.
    window.history.pushState({}, '', '/frame.html?c=X&sid=80&mode=canvas')
    render(<Frame />)
    await screen.findByTestId(`spot-${B.component}`)
    await settle()

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: pack(80, {
            type: 'patch',
            canvas: [{ id: 'solo', component: A.component, caseId: A.caseId, col: 4, span: 6 }],
          }),
          origin: window.location.origin,
          source: window.parent,
        }),
      )
    })
    await settle()

    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll('[data-wb-spot]')).map((e) =>
          e.getAttribute('data-wb-spot'),
        ),
      ).toEqual(['solo']),
    )
    expect(screen.queryByTestId(`spot-${B.component}`)).toBeNull()
  })

  it('координаты места едут в сетку, а не в текст', async () => {
    // jsdom раскладку не считает, но `grid-column` — это ЗАПИСЬ, а не замер:
    // утверждать её здесь честно. Сама раскладка — живым прогоном.
    window.history.pushState({}, '', '/frame.html?c=X&sid=81&mode=canvas')
    render(<Frame />)
    await screen.findByTestId(`spot-${A.component}`)
    await settle()

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: pack(81, {
            type: 'patch',
            canvas: [{ id: 'left', component: A.component, caseId: A.caseId, col: 2, span: 5 }],
          }),
          origin: window.location.origin,
          source: window.parent,
        }),
      )
    })
    await settle()

    await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-wb-spot="left"]')
      expect(el?.style.gridColumn).toBe('2 / span 5')
    })
  })

  it('испорченная раскладка объясняется словами, а не пустотой', async () => {
    // Требование спеки дословно: пустой канвас С ОБЪЯСНЕНИЕМ, а не белый
    // экран. Полоса — СОСЕД канваса, иначе оболочка мерила бы её высоту
    // вместо размера набора.
    window.history.pushState({}, '', '/frame.html?c=X&sid=82&mode=canvas')
    render(<Frame />)
    await screen.findByTestId(`spot-${A.component}`)
    await settle()

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: pack(82, { type: 'patch', canvas: 'абв' }),
          origin: window.location.origin,
          source: window.parent,
        }),
      )
    })
    await settle()

    await waitFor(() => expect(document.querySelectorAll('[data-wb-spot]')).toHaveLength(0))
    const strip = document.querySelector('.wbf-slot-unplaced')
    expect(strip?.textContent).toContain('не список')
    expect(strip?.closest('.wbf-canvas')).toBeNull()
  })

  it('патч без поля canvas раскладку НЕ трогает', async () => {
    // `undefined` — «про раскладку речи не было», и путать это с пустым
    // списком нельзя: патч темы стирал бы канвас.
    window.history.pushState({}, '', '/frame.html?c=X&sid=83&mode=canvas')
    render(<Frame />)
    await screen.findByTestId(`spot-${B.component}`)
    await settle()

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: pack(83, { type: 'patch', theme: 'dark' }),
          origin: window.location.origin,
          source: window.parent,
        }),
      )
    })
    await settle()

    expect(document.querySelectorAll('[data-wb-spot]')).toHaveLength(CANVAS_SPOTS.length)
  })

  const patch = (sid: number, body: Record<string, unknown>): void => {
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: pack(sid, { type: 'patch', ...body }),
          origin: window.location.origin,
          source: window.parent,
        }),
      )
    })
  }

  it('тычок в место уходит наверх ИМЕНЕМ места', async () => {
    // Именем, а не индексом: индекс сдвигается при удалении соседа, и
    // выделение молча переехало бы на другое место, утащив за собой док.
    const spy = vi.spyOn(window.parent, 'postMessage')
    window.history.pushState({}, '', '/frame.html?c=X&sid=84&mode=canvas')
    render(<Frame />)
    await screen.findByTestId(`spot-${B.component}`)
    await settle()

    const picks = (): string[] =>
      spy.mock.calls
        .map((c) => (c[0] as { body?: { type?: string; id?: string } }).body)
        .filter((b) => b?.type === 'canvas-pick')
        .map((b) => b?.id ?? '')

    const btn = screen.getByRole('button', { name: 'B1' })
    act(() => {
      btn.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    })
    await settle()

    expect(picks()).toContain(B.id)
    spy.mockRestore()
  })

  it('выбор НЕ гасит событие: ни preventDefault, ни stopPropagation', async () => {
    // Решение, а не недосмотр. На канвасе человеку нужно И выбирать место, И
    // работать с компонентом — открыть строку, нажать кнопку страницы. Отними
    // событие ради выбора, и канвас перестанет быть тем, ради чего заведён.
    //
    // ПОЧЕМУ УТВЕРЖДАЕТСЯ ИМЕННО ЭТО, а не «клик дошёл до onClick». Первая
    // редакция кейса звала `.click()` на кнопке и проверяла обработчик — и
    // ПЕРЕЖИЛА мутацию `stopPropagation() + preventDefault()` в выборе. jsdom
    // не порождает `click` из `pointerdown` вовсе, то есть тот кейс не мог
    // покраснеть в принципе: он утверждал связь, которой в этой среде нет.
    // Здесь утверждается то, что в jsdom настоящее, — что наш слушатель не
    // отменяет событие и не обрывает всплытие. Связку «pointerdown → click →
    // обработчик компонента» проверяет живой прогон, и только он может.
    window.history.pushState({}, '', '/frame.html?c=X&sid=85&mode=canvas')
    render(<Frame />)
    await screen.findByTestId(`spot-${B.component}`)
    await settle()

    const above: string[] = []
    const spy = (): void => {
      above.push('всплыло выше канваса')
    }
    document.addEventListener('pointerdown', spy)
    const ev = new MouseEvent('pointerdown', { bubbles: true, cancelable: true })
    act(() => {
      screen.getByRole('button', { name: 'B1' }).dispatchEvent(ev)
    })
    document.removeEventListener('pointerdown', spy)

    expect(ev.defaultPrevented).toBe(false)
    expect(above).toEqual(['всплыло выше канваса'])
  })

  it('приход фокуса выбирает место так же, как мышка', async () => {
    // Канвас обязан слушаться клавиатуры: пришёл табом в листалку — док про
    // листалку, и искать для этого мышь не надо.
    const spy = vi.spyOn(window.parent, 'postMessage')
    window.history.pushState({}, '', '/frame.html?c=X&sid=86&mode=canvas')
    render(<Frame />)
    await screen.findByTestId(`spot-${B.component}`)
    await settle()

    act(() => {
      screen.getByRole('button', { name: 'B1' }).focus()
    })
    await settle()

    const ids = spy.mock.calls
      .map((c) => (c[0] as { body?: { type?: string; id?: string } }).body)
      .filter((b) => b?.type === 'canvas-pick')
      .map((b) => b?.id)
    expect(ids).toContain(B.id)
    spy.mockRestore()
  })

  it('выделение приходит ПАТЧЕМ и озвучивается aria-current', async () => {
    // Выделение хранит оболочка. Держи кадр источником правды — и док с
    // канвасом разъедутся при первом пересоздании iframe.
    window.history.pushState({}, '', '/frame.html?c=X&sid=87&mode=canvas')
    render(<Frame />)
    await screen.findByTestId(`spot-${B.component}`)
    await settle()

    expect(document.querySelector('[aria-current]')).toBeNull()

    patch(87, { canvasSelected: B.id })
    await settle()

    await waitFor(() =>
      expect(document.querySelector('[aria-current="true"]')?.getAttribute('data-wb-spot')).toBe(
        B.id,
      ),
    )
    // Ровно одно: «текущих» мест не бывает два.
    expect(document.querySelectorAll('[aria-current="true"]')).toHaveLength(1)

    patch(87, { canvasSelected: null })
    await settle()
    await waitFor(() => expect(document.querySelector('[aria-current]')).toBeNull())
  })

  it('пустой канвас говорит, что он пуст, а не показывает белое поле', async () => {
    // [11] ручного QA: убрав последнее место, человек получал пустой белый
    // кадр — неотличимый от «фикстура не загрузилась», «раскладка не доехала»
    // и «верстак сломался». Три разных беды с одним видом.
    window.history.pushState({}, '', '/frame.html?c=X&sid=91&mode=canvas')
    render(<Frame />)
    await screen.findByTestId(`spot-${B.component}`)
    await settle()

    patch(91, { canvas: [] })
    await settle()

    await waitFor(() => expect(screen.getByText(/нет ни одного места/)).toBeTruthy())
  })

  it('подпись пустого канваса уходит, как только место появилось', async () => {
    // Иначе она висит поверх собранного экрана и врёт про него.
    window.history.pushState({}, '', '/frame.html?c=X&sid=92&mode=canvas')
    render(<Frame />)
    await screen.findByTestId(`spot-${B.component}`)
    await settle()
    patch(92, { canvas: [] })
    await settle()
    await waitFor(() => expect(screen.getByText(/нет ни одного места/)).toBeTruthy())

    patch(92, { canvas: [{ ...B }] })
    await settle()

    await waitFor(() => expect(screen.queryByText(/нет ни одного места/)).toBeNull())
  })

  it('выделенное место показывается: кадр прокручивается к нему', async () => {
    // [9] ручного QA: место добавляют кнопкой в тулбаре, а встаёт оно в конец
    // раскладки — то есть у высокого канваса за нижним краем кадра. Человек
    // жмёт «+ DataTable», ничего не происходит, и он жмёт ещё раз.
    //
    // `block: 'nearest'` НЕСУЩИЙ, а не украшение аргумента: он значит
    // «прокрути, только если не видно». Без него щелчок по месту, которое и
    // так на экране, дёргал бы кадр под курсором — тот же шов, что горел на
    // прицеле.
    //
    // Геометрия здесь не утверждается и утверждаться не может: в jsdom все
    // прямоугольники нулевые. Утверждается, что кадр ПОПРОСИЛ показать нужное
    // место — решение «надо ли двигать» отдано браузеру, которому оно и
    // принадлежит.
    window.history.pushState({}, '', '/frame.html?c=X&sid=89&mode=canvas')
    render(<Frame />)
    await screen.findByTestId(`spot-${B.component}`)
    await settle()
    const el = document.querySelector<HTMLElement>(`[data-wb-spot="${B.id}"]`)!
    const spy = vi.spyOn(el, 'scrollIntoView')

    patch(89, { canvasSelected: B.id })
    await settle()

    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ block: 'nearest' })
    spy.mockRestore()
  })

  it('снятие выделения кадр не двигает — показывать нечего', async () => {
    window.history.pushState({}, '', '/frame.html?c=X&sid=90&mode=canvas')
    render(<Frame />)
    await screen.findByTestId(`spot-${B.component}`)
    await settle()
    patch(90, { canvasSelected: B.id })
    await settle()
    const el = document.querySelector<HTMLElement>(`[data-wb-spot="${B.id}"]`)!
    const spy = vi.spyOn(el, 'scrollIntoView')

    patch(90, { canvasSelected: null })
    await settle()

    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('признак выделения НЕ ставится на само место рамкой', async () => {
    // Рамка на месте сдвинула бы раскладку — то есть исказила ровно то, ради
    // чего канвас собирают. Обводка живёт отдельным слоем `.wbf-pick`, и здесь
    // утверждается именно это: у места нет ни border, ни outline от нас.
    window.history.pushState({}, '', '/frame.html?c=X&sid=88&mode=canvas')
    render(<Frame />)
    await screen.findByTestId(`spot-${B.component}`)
    await settle()
    patch(88, { canvasSelected: B.id })
    await settle()

    const el = document.querySelector<HTMLElement>(`[data-wb-spot="${B.id}"]`)
    expect(el?.style.border).toBe('')
    expect(el?.style.outline).toBe('')
    expect(el?.style.boxShadow).toBe('')
  })

  it('крутилки места доезжают до компонента, а не до соседа', async () => {
    // Тот самый дефект, ради которого крутилки живут В МЕСТЕ: `state.props`
    // кадра адресованы `state.c`, и раздача их всем местам уронила бы крутилку
    // DataTable в Pagination.
    vi.mocked(loadFixture).mockImplementation(async (name: string) =>
      name === A.component
        ? {
            ...FX_A,
            props: { mark: 'умолчание' },
            controls: { mark: { kind: 'text' as const, prop: true } },
            render: (p: { mark: string }) => <div data-testid={`spot-${A.component}`}>{p.mark}</div>,
          }
        : {
            ...FX_B,
            props: { mark: 'умолчание' },
            controls: { mark: { kind: 'text' as const, prop: true } },
            render: (p: { mark: string }) => <div data-testid={`spot-${B.component}`}>{p.mark}</div>,
          },
    )
    window.history.pushState({}, '', '/frame.html?c=X&sid=89&mode=canvas')
    render(<Frame />)
    await screen.findByTestId(`spot-${A.component}`)
    await settle()

    patch(89, {
      canvas: [
        { id: A.id, component: A.component, caseId: A.caseId, col: 1, span: 12, props: { mark: 'покручено' } },
        { id: B.id, component: B.component, caseId: B.caseId, col: 1, span: 12 },
      ],
    })
    await settle()

    await waitFor(() => expect(screen.getByTestId(`spot-${A.component}`).textContent).toBe('покручено'))
    expect(screen.getByTestId(`spot-${B.component}`).textContent).toBe('умолчание')
  })
})
