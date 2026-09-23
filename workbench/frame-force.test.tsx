/**
 * Форс в кадре: атрибут и лист (Задача 28), четыре копии в ряд (Задача 30).
 *
 * Что здесь ПРОВЕРЯЕТСЯ, а что нет. Красит ли переписанный CSS тем же, чем
 * настоящее наведение, — вопрос каскада, и отвечает на него браузер: три
 * случая «Форс: …» в `scripts/measure-invariants.mjs` (jsdom каскада не
 * считает и `:hover` не знает вовсе — «зелёная проверка, которая ничего не
 * проверяет» началась бы ровно здесь). Этот файл — про другое и про то, что
 * jsdom видит честно: доехало ли состояние из адреса и патча до АТРИБУТА, и
 * появился ли лист форса ПОСЛЕДНИМ в голове документа.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent, waitFor } from '@testing-library/react'
import { Frame } from './frame-app.js'
import { loadFixture } from './registry.js'
import { pack } from './protocol.js'
import { FORCE_ATTR, FORCE_STYLE_ID, resetForceCache } from './force-states.js'
import type { AnyFixture } from '../src/internal/fixture.js'

vi.mock('./registry.js', () => ({
  fixtureNames: () => ['Host'],
  loadFixture: vi.fn(),
}))

const HOST: AnyFixture = {
  name: 'Host',
  group: 'G',
  props: {},
  controls: {},
  cases: [{ id: 'base', title: 'B' }],
  render: () => (
    <button className="probe" data-testid="host">
      кнопка
    </button>
  ),
}

/**
 * Лист с интерактивными правилами — и его уборка.
 *
 * Здесь jsdom работает ЧЕСТНО, и это проверено пробником: он разбирает
 * правило с `:hover`, `installForce` переписывает его в
 * `[data-wb-force~="hover"]`, а `getComputedStyle` этот атрибутный селектор
 * применяет. То есть замер тонов проходит весь путь целиком — от CSS до числа
 * на экране — без единой подделки. (Чего jsdom по-прежнему не умеет: сказать,
 * КАК это выглядит; за это отвечают случаи «Форс: …» в браузере.)
 */
const withSheet = (css: string): (() => void) => {
  const el = document.createElement('style')
  el.textContent = css
  document.head.appendChild(el)
  return () => el.remove()
}

/**
 * Дать эффекту замера тонов дойти до состояния.
 *
 * Микрозадачи мало под нагрузкой: эффект ставит состояние, состояние даёт
 * второй коммит, и только он рисует числа. Поэтому там, где утверждение о
 * ЧИСЛАХ, стоит ещё и `waitFor` — `settle` лишь снимает лишний виток
 * ожидания.
 */
const settle = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve()
  })
}

const toneValues = (): string[] =>
  Array.from(document.querySelectorAll('.wbf-states__value')).map((e) => e.textContent ?? '')

const sameMarks = (): (string | null)[] =>
  Array.from(document.querySelectorAll('.wbf-states__cell')).map(
    (c) => c.querySelector('.wbf-states__same')?.textContent ?? null,
  )

/**
 * Наблюдатель, ЗАПОМИНАЮЩИЙ, за чем его попросили следить.
 *
 * jsdom `ResizeObserver` не знает вовсе, и заглушка нужна была бы в любом
 * случае. Запоминание — не украшение: «фактическое» в тулбаре берётся с того
 * узла, который наблюдают, и в режиме «Состояния» этот узел ДРУГОЙ. Молчащая
 * заглушка пропускала бы и промах привязки, и отсутствие пересоздания при
 * смене вида — оба дают одно и то же: старое число, выданное за новое.
 */
const observed: Element[] = []
class FakeResizeObserver {
  observe(el: Element): void {
    observed.push(el)
  }
  disconnect(): void {}
}

/** Корень превью — тот узел, на который вешается атрибут. */
const host = (): HTMLElement => {
  const el = screen.getByTestId('host').closest('.wbf-host')
  if (!(el instanceof HTMLElement)) throw new Error('корень превью не найден')
  return el
}

beforeEach(() => {
  // Кэш листа форса живёт в модуле, то есть переживает тест. Без сброса
  // второй случай получил бы дубликат, собранный по ЛИСТУ ПЕРВОГО, и
  // «фокус совпал с наведением» оказалось бы правдой про чужой CSS.
  // Найдено ровно так: три случая полосы разом покраснели на чужих числах.
  resetForceCache()
  observed.length = 0
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.mocked(loadFixture).mockImplementation(async (name: string) => (name === 'Host' ? HOST : null))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.mocked(loadFixture).mockReset()
  document.getElementById(FORCE_STYLE_ID)?.remove()
})

describe('форс в кадре', () => {
  it('состояние из адреса доезжает до атрибута на корне превью', async () => {
    window.history.pushState({}, '', '/frame.html?c=Host&sid=11&force=hover')
    render(<Frame />)
    await screen.findByTestId('host')

    expect(host().getAttribute(FORCE_ATTR)).toBe('hover')
  })

  it('несколько состояний едут через запятую, а в атрибут — через пробел', async () => {
    // `~=` ищет СЛОВО в списке, разделённом пробелами: запятая в атрибуте
    // сделала бы `[data-wb-force~="hover"]` неверным, и форс молча не красил бы.
    window.history.pushState({}, '', '/frame.html?c=Host&sid=12&force=hover,focus-visible')
    render(<Frame />)
    await screen.findByTestId('host')

    expect(host().getAttribute(FORCE_ATTR)).toBe('hover focus-visible')
  })

  it('без форса атрибута нет вовсе — не пустая строка', async () => {
    // Пустой атрибут — не то же самое, что его отсутствие: `[data-wb-force]`
    // (а такой селектор появится у прицела, Задача 32) считал бы кадр
    // форсированным.
    window.history.pushState({}, '', '/frame.html?c=Host&sid=13')
    render(<Frame />)
    await screen.findByTestId('host')

    expect(host().hasAttribute(FORCE_ATTR)).toBe(false)
  })

  it('патч включает и снимает форс на лету, без перезагрузки кадра', async () => {
    window.history.pushState({}, '', '/frame.html?c=Host&sid=14')
    render(<Frame />)
    const before = await screen.findByTestId('host')

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: pack(14, { type: 'patch', force: 'active' }),
          origin: window.location.origin,
          source: window.parent,
        }),
      )
    })
    expect(host().getAttribute(FORCE_ATTR)).toBe('active')
    // Тот же узел, что до патча: включение форса — запись атрибута, а не
    // пересоздание превью. Пересоздайся оно — состояние компонента (открытый
    // список, скролл) терялось бы на каждом щелчке по состоянию.
    expect(screen.getByTestId('host')).toBe(before)

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: pack(14, { type: 'patch', force: null }),
          origin: window.location.origin,
          source: window.parent,
        }),
      )
    })
    expect(host().hasAttribute(FORCE_ATTR)).toBe(false)
  })

  it('лист форса вставлен и стоит последним в голове документа', async () => {
    // Последним — не опрятность, а весь механизм: дубликат равен оригиналу по
    // специфичности, и спор решает только порядок (см. force-states.ts).
    // Здесь утверждается ПОЗИЦИЯ, а не содержимое: в jsdom листов нет, и
    // содержимое пусто законно.
    document.head.appendChild(document.createElement('style'))
    window.history.pushState({}, '', '/frame.html?c=Host&sid=15')
    render(<Frame />)
    await screen.findByTestId('host')

    const style = document.getElementById(FORCE_STYLE_ID)
    expect(style).not.toBeNull()
    expect(document.head.lastElementChild).toBe(style)
  })
})

describe('режим «Состояния»', () => {
  /** Коробки копий — по порядку слева направо. */
  const boxes = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('.wbf-states__box'))

  it('четыре копии в ряд: покой без атрибута, три остальных — со своим', async () => {
    // Покой БЕЗ атрибута, а не с пустым: `data-wb-force=""` отвечал бы на
    // `[data-wb-force]`, и прицел (Задача 32) считал бы покойную копию
    // форсированной. Утверждается весь ряд разом — состав и порядок: копия,
    // уехавшая на чужое место, порознь неотличима от правильной.
    window.history.pushState({}, '', '/frame.html?c=Host&sid=21&mode=states')
    render(<Frame />)
    await screen.findAllByTestId('host')

    expect(boxes().map((b) => b.getAttribute(FORCE_ATTR))).toEqual([
      null,
      'hover',
      'focus-visible',
      'active',
    ])
    expect(screen.getAllByTestId('host')).toHaveLength(4)
  })

  it('подпись копии вне форса — иначе полоса тонов читала бы её вместе с превью', async () => {
    window.history.pushState({}, '', '/frame.html?c=Host&sid=22&mode=states')
    render(<Frame />)
    await screen.findAllByTestId('host')

    const label = screen.getByText(':hover')
    expect(label.closest(`[${FORCE_ATTR}]`)).toBeNull()
  })

  it('размер мерится с копии ПОКОЯ и переезжает на неё при смене вида', async () => {
    // «Фактическое» в тулбаре снимается с наблюдаемого узла. В «Состояниях»
    // это копия покоя — точка отсчёта; наблюдай мы наведённую, число зависело
    // бы от состояния, а вопрос «сколько места занимает компонент» — нет.
    // Вторая половина утверждения важнее первой: без пересоздания эффекта на
    // смене вида наблюдатель остался бы висеть на снятом со страницы `.wbf-host`,
    // и тулбар показывал бы число от прошлого вида как свежее.
    window.history.pushState({}, '', '/frame.html?c=Host&sid=24')
    render(<Frame />)
    await screen.findByTestId('host')
    // `reportSize` наблюдает и корень, и его детей (frame-size.ts мерит
    // объединение боксов детей), поэтому спрашиваем про вхождение, а не про
    // последний элемент.
    //
    // `waitFor`, а не голое утверждение: наблюдение — результат ЭФФЕКТА, а
    // `findByTestId` ждёт появления УЗЛА. Между ними целый коммит, и под
    // нагрузкой полного прогона эффект в него не успевает — тест падал раз в
    // несколько прогонов на React 19 (поймано `make release`, а не глазами).
    await waitFor(() => expect(observed).toContain(host()))

    // Список чистится ПЕРЕД сменой вида: иначе «наблюдаем нужное» проходило бы
    // на старых записях, и обе мутации — снятая привязка и эффект без `mode`
    // в зависимостях — остались бы незамеченными.
    observed.length = 0
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: pack(24, { type: 'patch', mode: 'states' }),
          origin: window.location.origin,
          source: window.parent,
        }),
      )
    })

    await waitFor(() => expect(observed).toContain(boxes()[0]))
    const rest = boxes()[0]
    expect(rest?.hasAttribute(FORCE_ATTR)).toBe(false)
  })

  it('патч переключает вид на лету, а тумблеры форса при этом не действуют', async () => {
    window.history.pushState({}, '', '/frame.html?c=Host&sid=23&force=hover')
    render(<Frame />)
    await screen.findByTestId('host')
    expect(boxes()).toHaveLength(0)

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: pack(23, { type: 'patch', mode: 'states' }),
          origin: window.location.origin,
          source: window.parent,
        }),
      )
    })

    // Копий четыре, и `force=hover` из адреса на них НЕ распространился:
    // в этом виде состояния заданы жёстко, иначе покойная копия оказалась бы
    // наведённой и сравнивать было бы не с чем.
    expect(boxes().map((b) => b.getAttribute(FORCE_ATTR))).toEqual([
      null,
      'hover',
      'focus-visible',
      'active',
    ])
  })
})

describe('полоса фактических тонов (Задача 31)', () => {
  it('печатает вычисленный тон каждой копии, а не заявленный в CSS', async () => {
    const drop = withSheet(
      '.probe { background: rgb(1, 1, 1); } .probe:hover { background: rgb(2, 2, 2); }',
    )
    window.history.pushState({}, '', '/frame.html?c=Host&sid=31&mode=states')
    render(<Frame />)
    await screen.findAllByTestId('host')
    await settle()

    // Покой и наведение разошлись, две оставшиеся копии равны покою — потому
    // что правил для них в листе нет. Это и есть «фактический», а не
    // «объявленный»: числа взяты с элементов, а не из текста CSS.
    await waitFor(() =>
      expect(toneValues()).toEqual(['rgb(1, 1, 1)', 'rgb(2, 2, 2)', 'rgb(1, 1, 1)', 'rgb(1, 1, 1)']),
    )
    drop()
  })

  it('НАЗЫВАЕТ совпадение фокуса с наведением — тот самый случай из CLAUDE.md', async () => {
    // Живой дефект системы: правка доступности открыла клавиатуре путь туда,
    // где его не было, и подсветка фокуса совпала с наведением. Четыре копии
    // в ряд эту пару показывают, но глаз на «чуть-чуть другое» не отвечает.
    // Здесь дефект воспроизведён целиком и утверждается, что полоса его
    // НАЗЫВАЕТ, а не просто печатает два одинаковых числа рядом.
    const drop = withSheet(`
      .probe { background: rgb(1, 1, 1); }
      .probe:hover { background: rgb(2, 2, 2); }
      .probe:focus-visible { background: rgb(2, 2, 2); }
    `)
    window.history.pushState({}, '', '/frame.html?c=Host&sid=32&mode=states')
    render(<Frame />)
    await screen.findAllByTestId('host')
    await settle()

    await waitFor(() => expect(sameMarks()).toEqual([null, null, '= :hover', '= покой']))
    drop()
  })

  it('прозрачный фон назван словом, а не rgba(0, 0, 0, 0)', async () => {
    // Числовая форма прозрачности читается как чёрный: нули впереди, альфа в
    // конце, и глаз её пропускает. Прозрачность задаётся ЯВНО: у голой
    // `<button>` фон не прозрачный, а `buttonface` из листа браузера (jsdom
    // отдаёт ключевое слово, Chrome — rgb(239, 239, 239)); полоса печатает
    // вычисленное, каким бы оно ни пришло.
    const drop = withSheet('.probe { background: transparent; }')
    window.history.pushState({}, '', '/frame.html?c=Host&sid=33&mode=states')
    render(<Frame />)
    await screen.findAllByTestId('host')
    await settle()

    await waitFor(() => expect(toneValues()[0]).toBe('прозрачно'))
    drop()
  })

  it('вне режима «Состояния» полосы нет вовсе', async () => {
    window.history.pushState({}, '', '/frame.html?c=Host&sid=34')
    render(<Frame />)
    await screen.findByTestId('host')
    await settle()

    expect(document.querySelectorAll('.wbf-states__tone')).toHaveLength(0)
  })
})

describe('прицел (Задача 32)', () => {
  /** Патч в кадр — как его шлёт оболочка. */
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

  /** Имена узлов, ушедшие наверх сообщением `aim`. */
  const aimsSent = (spy: ReturnType<typeof vi.spyOn>): (string | null)[] =>
    spy.mock.calls
      .map((c) => (c[0] as { body?: { type?: string; selector?: string | null } }).body)
      .filter((b) => b?.type === 'aim')
      .map((b) => b?.selector ?? null)

  it('щелчок переносит форс с корня превью на выбранный узел', async () => {
    // Без переноса форма «предок» красит всё поддерево разом — для таблицы
    // это «подсветилось всё», то есть ответа нет. Утверждается ПАРА: на узле
    // появилось И с корня снялось; половина без другой проходит на коде,
    // который просто добавил форс ещё в одно место.
    window.history.pushState({}, '', '/frame.html?c=Host&sid=41&force=hover&aim=1')
    render(<Frame />)
    const btn = await screen.findByTestId('host')

    fireEvent.click(btn)

    expect(btn.getAttribute(FORCE_ATTR)).toBe('hover')
    expect(host().hasAttribute(FORCE_ATTR)).toBe(false)
  })

  it('щелчок не доезжает до компонента — целятся, а не нажимают', async () => {
    // Попади щелчок в кнопку «Удалить», прицел открывал бы диалог вместо
    // выбора узла.
    let clicks = 0
    vi.mocked(loadFixture).mockImplementation(async () => ({
      ...HOST,
      render: () => (
        <button className="probe" data-testid="host" onClick={() => (clicks += 1)}>
          кнопка
        </button>
      ),
    }))
    window.history.pushState({}, '', '/frame.html?c=Host&sid=42&aim=1')
    render(<Frame />)
    const btn = await screen.findByTestId('host')

    fireEvent.click(btn)

    expect(clicks).toBe(0)
  })

  it('имя выбранного узла уходит наверх, а снятие прицела — гасит его', async () => {
    const spy = vi.spyOn(window.parent, 'postMessage')
    window.history.pushState({}, '', '/frame.html?c=Host&sid=43&aim=1')
    render(<Frame />)
    const btn = await screen.findByTestId('host')

    fireEvent.click(btn)
    expect(aimsSent(spy)).toContain('button.probe')

    patch(43, { aim: false })
    // Последним ушёл `null`: выключенный прицел с висящим именем читался бы
    // как «узел всё ещё выбран».
    const sent = aimsSent(spy)
    expect(sent[sent.length - 1]).toBeNull()
    expect(btn.hasAttribute(FORCE_ATTR)).toBe(false)
    spy.mockRestore()
  })

  it('щелчок по декорации внутри кнопки садится на КНОПКУ, а не на декорацию', async () => {
    // Находка [6] ручного QA: у иконочной кнопки верхний узел под указателем —
    // `<circle>` внутри `<svg aria-hidden>`, и прицел садился на него. Две
    // разные кнопки в колонке действий давали одно имя, а навесить `:hover` на
    // кнопку действия было нельзя вовсе.
    //
    // Проверяется ПУТЬ ЧЕРЕЗ КАДР, а не правило: у `aimTargetOf` свои юниты,
    // но они прошли бы и при не подключённой функции.
    vi.mocked(loadFixture).mockImplementation(async () => ({
      ...HOST,
      render: () => (
        <button className="probe" data-testid="host" aria-label="Удалить">
          <svg aria-hidden="true">
            <circle data-testid="dot" />
          </svg>
        </button>
      ),
    }))
    const spy = vi.spyOn(window.parent, 'postMessage')
    window.history.pushState({}, '', '/frame.html?c=Host&sid=52&force=hover&aim=1')
    render(<Frame />)
    const dot = await screen.findByTestId('dot')

    fireEvent.click(dot)

    expect(aimsSent(spy)).toContain('button.probe')
    // И форс встал на кнопку, а не на невидимый диктору кружок: это и есть
    // то, ради чего прицел существует.
    expect(screen.getByTestId('host').hasAttribute(FORCE_ATTR)).toBe(true)
    expect(dot.hasAttribute(FORCE_ATTR)).toBe(false)
    spy.mockRestore()
  })

  it('повторный щелчок по тому же узлу снимает выбор, а форс возвращается на корень', async () => {
    window.history.pushState({}, '', '/frame.html?c=Host&sid=44&force=active&aim=1')
    render(<Frame />)
    const btn = await screen.findByTestId('host')

    fireEvent.click(btn)
    fireEvent.click(btn)

    expect(btn.hasAttribute(FORCE_ATTR)).toBe(false)
    expect(host().getAttribute(FORCE_ATTR)).toBe('active')
  })

  it('рамка с меткой рисуется отдельным слоем и не перехватывает щелчки', async () => {
    // Рамка на самом узле сдвинула бы раскладку — ровно то, что прицел пришёл
    // разглядывать; слой, ловящий указатель, не дал бы прицелиться дальше.
    window.history.pushState({}, '', '/frame.html?c=Host&sid=45&aim=1')
    render(<Frame />)
    const btn = await screen.findByTestId('host')

    expect(document.querySelector('.wbf-aim')).toBeNull()
    fireEvent.click(btn)

    await waitFor(() => expect(document.querySelector('.wbf-aim')).not.toBeNull())
    const box = document.querySelector('.wbf-aim')
    expect(box?.querySelector('.wbf-aim__label')?.textContent).toBe('button.probe')
    expect(btn.contains(box!)).toBe(false)
  })

  it('без прицела щелчки узлов не выбирают', async () => {
    window.history.pushState({}, '', '/frame.html?c=Host&sid=46&force=hover')
    render(<Frame />)
    const btn = await screen.findByTestId('host')

    fireEvent.click(btn)

    expect(document.querySelector('.wbf-aim')).toBeNull()
    expect(host().getAttribute(FORCE_ATTR)).toBe('hover')
  })

  /**
   * ПОДЪЁМ ПО ПРЕДКАМ (находка [12] ручного QA).
   *
   * Щелчок отдаёт самый глубокий узел, и `tr.is-clickable` закрыт своими `td`
   * целиком — то есть вопрос «как выглядит наведённая СТРОКА» задать нечем.
   * Дерево фикстуры настоящее (`div.ds-table > table > tbody > tr > td`), а не
   * два вложенных `div`: цепочка обязана считаться по тому, что бывает в
   * системе, иначе кейс зелен на разметке, которой нет.
   */
  const ROWS: AnyFixture = {
    ...HOST,
    render: () => (
      <div className="ds-table">
        <table className="ds-table__grid">
          <tbody>
            <tr className="is-clickable">
              <td className="ds-table__lead" data-testid="cell">
                Иванов
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    ),
  }

  /** Цепочка предков, ушедшая наверх последним сообщением `aim`. */
  const lastUp = (spy: ReturnType<typeof vi.spyOn>): string[] | undefined => {
    const all = spy.mock.calls
      .map((c) => (c[0] as { body?: { type?: string; up?: string[] } }).body)
      .filter((b) => b?.type === 'aim')
    return all[all.length - 1]?.up
  }

  it('alt+щелчок садится на предка, а не на узел под курсором', async () => {
    vi.mocked(loadFixture).mockImplementation(async () => ROWS)
    const spy = vi.spyOn(window.parent, 'postMessage')
    window.history.pushState({}, '', '/frame.html?c=Host&sid=61&aim=1')
    render(<Frame />)
    const cell = await screen.findByTestId('cell')

    fireEvent.click(cell, { altKey: true })

    expect(aimsSent(spy)).toContain('tr.is-clickable')
    spy.mockRestore()
  })

  it('второй alt+щелчок поднимает ещё выше, а не возвращает вниз', async () => {
    // Ходить надо ПО ЦЕПОЧКЕ, а не туда-обратно: цель подъёма — корень
    // компонента, до него от ячейки четыре ступени.
    vi.mocked(loadFixture).mockImplementation(async () => ROWS)
    const spy = vi.spyOn(window.parent, 'postMessage')
    window.history.pushState({}, '', '/frame.html?c=Host&sid=62&aim=1')
    render(<Frame />)
    const cell = await screen.findByTestId('cell')

    fireEvent.click(cell, { altKey: true })
    fireEvent.click(cell, { altKey: true })

    expect(aimsSent(spy)).toContain('tbody')
    spy.mockRestore()
  })

  it('на корне компонента alt+щелчок прицел не двигает — выше некуда', async () => {
    vi.mocked(loadFixture).mockImplementation(async () => ROWS)
    const spy = vi.spyOn(window.parent, 'postMessage')
    window.history.pushState({}, '', '/frame.html?c=Host&sid=63&aim=1')
    render(<Frame />)
    const cell = await screen.findByTestId('cell')

    for (let i = 0; i < 6; i++) fireEvent.click(cell, { altKey: true })

    const sent = aimsSent(spy)
    expect(sent[sent.length - 1]).toBe('div.ds-table')
    // И не ушёл В ИНСТРУМЕНТ: хост кадра — не предмет прицеливания.
    expect(sent).not.toContain('div')
    spy.mockRestore()
  })

  it('обычный щелчок после подъёма снова садится на глубокий узел', async () => {
    // Иначе подъём был бы не уточнением, а режимом: попав однажды на `tr`,
    // человек не смог бы вернуться к ячейке ничем, кроме снятия прицела.
    vi.mocked(loadFixture).mockImplementation(async () => ROWS)
    const spy = vi.spyOn(window.parent, 'postMessage')
    window.history.pushState({}, '', '/frame.html?c=Host&sid=64&aim=1')
    render(<Frame />)
    const cell = await screen.findByTestId('cell')

    fireEvent.click(cell, { altKey: true })
    fireEvent.click(cell)

    const sent = aimsSent(spy)
    expect(sent[sent.length - 1]).toBe('td.ds-table__lead')
    spy.mockRestore()
  })

  it('наверх едет и цепочка предков, а не только имя выбранного', async () => {
    // Без неё тулбар не может сказать, есть ли куда подниматься, — а Alt+клик
    // без этого невидим: жест, о котором нигде не написано, не существует.
    vi.mocked(loadFixture).mockImplementation(async () => ROWS)
    const spy = vi.spyOn(window.parent, 'postMessage')
    window.history.pushState({}, '', '/frame.html?c=Host&sid=65&aim=1')
    render(<Frame />)
    const cell = await screen.findByTestId('cell')

    fireEvent.click(cell)

    expect(lastUp(spy)).toEqual(['tr.is-clickable', 'tbody', 'table.ds-table__grid', 'div.ds-table'])
    spy.mockRestore()
  })
})

describe('прицел выбирает, ЧТО сравнивать полосой (Задачи 31+32)', () => {
  /** Компонент, у которого состояние живёт НЕ на корне, — как строка таблицы. */
  const NESTED: AnyFixture = {
    ...HOST,
    render: () => (
      <div className="probe" data-testid="host">
        <span className="inner" data-testid="inner">
          x
        </span>
      </div>
    ),
  }
  const SHEET = `
    .probe { background: rgb(1, 1, 1); }
    .inner { background: rgb(5, 5, 5); }
    .probe:hover .inner { background: rgb(9, 9, 9); }
  `

  it('без прицела полоса мерит корень — и честно показывает, что он не меняется', async () => {
    // Это НЕ дефект полосы, а правда про корень: у составного компонента
    // состояние живёт глубже. Утверждается именно она — иначе следующий шаг
    // (прицел) не с чем было бы сравнивать.
    vi.mocked(loadFixture).mockImplementation(async () => NESTED)
    const drop = withSheet(SHEET)
    window.history.pushState({}, '', '/frame.html?c=Host&sid=51&mode=states')
    render(<Frame />)
    await screen.findAllByTestId('host')
    await settle()

    await waitFor(() =>
      expect(toneValues()).toEqual(['rgb(1, 1, 1)', 'rgb(1, 1, 1)', 'rgb(1, 1, 1)', 'rgb(1, 1, 1)']),
    )
    drop()
  })

  it('прицел в узел одной копии переносит замер в ТОТ ЖЕ узел остальных', async () => {
    // Тот же самый узел, а не похожий: путь переносится по индексам детей
    // (dom-path.ts). Селектор по классам нашёл бы первый подходящий — в
    // таблице это была бы всегда первая строка, какую бы ни выбрали.
    vi.mocked(loadFixture).mockImplementation(async () => NESTED)
    const drop = withSheet(SHEET)
    window.history.pushState({}, '', '/frame.html?c=Host&sid=52&mode=states&aim=1')
    render(<Frame />)
    const inners = await screen.findAllByTestId('inner')
    await settle()

    fireEvent.click(inners[0]!)
    await settle()

    await waitFor(() =>
      expect(toneValues()).toEqual(['rgb(5, 5, 5)', 'rgb(9, 9, 9)', 'rgb(5, 5, 5)', 'rgb(5, 5, 5)']),
    )
    // И совпадения теперь говорят правду: наведение отличается, два других — нет.
    expect(sameMarks()).toEqual([null, null, '= покой', '= покой'])
    drop()
  })

  it('в режиме «Состояния» прицел НЕ снимает форс с копий', async () => {
    // Состояния копий заданы атрибутом на их коробках; сними его ради
    // выбранного узла — и ряд, ради которого сюда пришли, схлопнется в четыре
    // одинаковых копии.
    vi.mocked(loadFixture).mockImplementation(async () => NESTED)
    const drop = withSheet(SHEET)
    window.history.pushState({}, '', '/frame.html?c=Host&sid=53&mode=states&aim=1')
    render(<Frame />)
    await screen.findAllByTestId('inner')
    await settle()

    // Целимся в САМУ КОРОБКУ копии — единственный узел, у которого атрибут
    // форса и есть. Мутация «прицел двигает форс и здесь» на любом другом
    // узле незаметна (снимать там нечего), а на этом снесла бы состояние
    // копии целиком, и ряд схлопнулся бы в четыре одинаковых.
    const boxes = Array.from(document.querySelectorAll<HTMLElement>('.wbf-states__box'))
    fireEvent.click(boxes[1]!)
    await settle()

    expect(boxes.map((b) => b.getAttribute(FORCE_ATTR))).toEqual([
      null,
      'hover',
      'focus-visible',
      'active',
    ])
    drop()
  })

  it('тон перезамеряется по событию указателя, а не застывает', async () => {
    // Настоящее наведение мышью меняет тон копии, НЕ вызывая перерисовки
    // React: полоса застывала на числах, снятых под курсором — увёл мышь, а
    // «покой» так и стоит с тоном наведения. Найдено живым прогоном; здесь
    // проверяется сам МЕХАНИЗМ перезамера — событие указателя обновляет
    // числа, — потому что указателя у jsdom нет.
    vi.mocked(loadFixture).mockImplementation(async () => NESTED)
    const drop = withSheet('.probe { background: rgb(1, 1, 1); }')
    window.history.pushState({}, '', '/frame.html?c=Host&sid=54&mode=states')
    render(<Frame />)
    await screen.findAllByTestId('host')
    await settle()
    await waitFor(() => expect(toneValues()[0]).toBe('rgb(1, 1, 1)'))

    drop()
    const drop2 = withSheet('.probe { background: rgb(2, 2, 2); }')
    // Перерисовки не было — числа обязаны остаться прежними до события.
    expect(toneValues()[0]).toBe('rgb(1, 1, 1)')

    await act(async () => {
      document.dispatchEvent(new Event('pointerover', { bubbles: true }))
      await new Promise((r) => requestAnimationFrame(() => r(null)))
    })
    await waitFor(() => expect(toneValues()[0]).toBe('rgb(2, 2, 2)'))
    drop2()
  })
})
