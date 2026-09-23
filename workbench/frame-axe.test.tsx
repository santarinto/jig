/**
 * Слой axe в кадре (DS-78).
 *
 * jsdom здесь честен НЕ ВО ВСЁМ, и граница проходит по правилу: разметочные
 * правила (`button-name`, `link-name`, `list`) он держит полностью, а всё, что
 * требует раскладки и цвета, axe кладёт в `incomplete` — там же, где оно
 * оказалось бы в браузере поверх картинки. Поэтому утверждается состав отчёта
 * и то, что он уехал наверх, а не то, каким он был бы на живой странице.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPortal } from 'react-dom'
import { render, screen, cleanup, act, waitFor } from '@testing-library/react'
import { Frame, AXE_QUIET_MS, AXE_RUN_ATTR } from './frame-app.js'
import { loadFixture } from './registry.js'
import { pack } from './protocol.js'
import { resetForceCache, FORCE_STYLE_ID } from './force-states.js'
import type { AnyFixture } from '../src/internal/fixture.js'

vi.mock('./registry.js', () => ({
  fixtureNames: () => ['Host', 'Clean', 'Portal'],
  loadFixture: vi.fn(),
}))

// Считалка прогонов — НЕ подмена: `runAxe` зовётся настоящий, обёртка только
// ведёт счёт. Мок вместо расчёта превратил бы проверку слоя в проверку мока.
const runCount = {
  n: 0,
  fail: null as string | null,
  /** Задержка прогона: пока стоит, результат не отдаётся — для гонок. */
  hold: null as Promise<void> | null,
}
vi.mock('./axe-layer.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./axe-layer.js')>()
  return {
    ...real,
    runAxe: (roots: readonly Element[]) => {
      runCount.n++
      // Провал прогона — единственное, что подменяется: заставить настоящий
      // axe упасть изнутри нельзя, а вести себя при его падении кадр обязан.
      if (runCount.fail) return Promise.reject(new Error(runCount.fail))
      const res = real.runAxe(roots)
      // Прогон настоящий; задерживается только МОМЕНТ выдачи результата —
      // иначе гонку «слой сняли, пока прогон летел» не смоделировать: в jsdom
      // прогон кончается раньше, чем тест успеет о нём узнать.
      return runCount.hold ? runCount.hold.then(() => res) : res
    },
  }
})

const runs = (): number => runCount.n

/** Кнопка-иконка без доступного имени: глазами кнопка есть, диктору сказать нечего. */
const HOST: AnyFixture = {
  name: 'Host',
  group: 'G',
  props: {},
  controls: {},
  cases: [{ id: 'base', title: 'B' }],
  render: () => (
    <div data-testid="host">
      <button type="button">
        <svg aria-hidden="true" width="16" height="16" />
      </button>
    </div>
  ),
}

/** Та же разметка, но кнопка названа: нарушений ноль, контуров ноль. */
const CLEAN: AnyFixture = {
  name: 'Clean',
  group: 'G',
  props: {},
  controls: {},
  cases: [{ id: 'base', title: 'B' }],
  render: () => (
    <div data-testid="host">
      <button type="button" aria-label="Открыть">
        <svg aria-hidden="true" width="16" height="16" />
      </button>
    </div>
  ),
}

/**
 * Оверлей ПОРТАЛОМ в `body`, как Modal и Drawer, — и хост при этом чистый.
 * Разделение намеренное: отчёт, назвавший `button-name`, мог бы получиться и
 * от хоста, и тогда проверка про порталы прошла бы, ничего не проверив.
 */
const PORTAL: AnyFixture = {
  name: 'Portal',
  group: 'G',
  props: {},
  controls: {},
  cases: [{ id: 'base', title: 'B' }],
  render: () => (
    <div data-testid="host">
      <button type="button" aria-label="Открыть" />
      {createPortal(
        <div className="ds-modal__overlay" role="dialog" aria-modal="true">
          <button type="button" />
        </div>,
        document.body,
      )}
    </div>
  ),
}

/** Фикстура, которая рисует ПУСТОЙ узел: корень есть, спрашивать не о чем. */
const EMPTY: AnyFixture = {
  name: 'Empty',
  group: 'G',
  props: {},
  controls: {},
  cases: [{ id: 'base', title: 'B' }],
  render: () => <div data-testid="empty" />,
}

class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

/**
 * Бюджет ожидания прогона axe. Каждое `waitFor` в этом файле ждёт настоящий
 * `axe.run` (библиотека зовётся не мокнутой — иначе проверялся бы мок, а не слой),
 * и дефолтные 1000 мс у `waitFor` под нагрузкой полного прогона НЕ ХВАТАЛО:
 * релиз 4.0.0 упал на этом файле, а по отдельности он всегда был зелёным.
 *
 * Число не выбрано «побольше», а взято от замера первого отчёта (DS-106):
 * поодиночке 368/368/410 мс, под нагрузкой полного прогона 483/795 мс. Дефолт
 * давал запас 1.25× к худшему наблюдаемому — на горячей машине этого не хватало.
 * Здесь запас ~6×, и он про НАГРУЗКУ, а не про медленный axe: тест, зависший
 * по-настоящему, всё равно упрётся в таймаут теста и не будет ждать вечно.
 *
 * Константа одна на все ожидания файла намеренно. До этого два `waitFor` из
 * одиннадцати несли `{ timeout: 2000 }` — кто-то уже упирался в тот же предел и
 * поднял точечно, оставив девять соседей на дефолте. Точечная правка лечит тот
 * вызов, что упал вчера, и оставляет класс.
 */
const AXE_WAIT_MS = 5000

const settle = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve()
  })
}

interface A11yBody {
  type?: string
  error?: string
  violations?: { id: string; nodes: { node: string }[] }[]
  incomplete?: string[]
  applied?: number
  noRoot?: true
}

const reports = (spy: ReturnType<typeof vi.spyOn>): A11yBody[] =>
  spy.mock.calls
    .map((c) => (c[0] as { body?: A11yBody }).body)
    .filter((b): b is A11yBody => b?.type === 'a11y')

beforeEach(() => {
  runCount.n = 0
  runCount.fail = null
  runCount.hold = null
  resetForceCache()
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  HTMLCanvasElement.prototype.getContext = () => null
  vi.mocked(loadFixture).mockImplementation(async (name: string) =>
    name === 'Host' ? HOST : name === 'Clean' ? CLEAN : name === 'Portal' ? PORTAL : null,
  )
})

afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute(AXE_RUN_ATTR)
  vi.unstubAllGlobals()
  vi.mocked(loadFixture).mockReset()
  document.getElementById(FORCE_STYLE_ID)?.remove()
})

// Таймаут теста выше бюджета ожидания: иначе `waitFor` не успевал бы
// израсходовать свой запас — тест падал бы раньше и по другой причине, а в
// отчёте это выглядело бы как «axe не ответил».
describe('слой axe', { timeout: AXE_WAIT_MS * 4 }, () => {
  it('со слоем отчёт уезжает наверх и называет нарушение фикстуры', async () => {
    window.history.pushState({}, '', '/frame.html?c=Host&sid=71&layers=axe')
    const spy = vi.spyOn(window.parent, 'postMessage')
    render(<Frame />)
    await screen.findByTestId('host')
    await settle()

    await waitFor(() => expect(reports(spy).length).toBeGreaterThan(0), { timeout: AXE_WAIT_MS })
    const all = reports(spy)
    const last = all[all.length - 1]
    expect(last.violations?.map((v: { id: string }) => v.id)).toContain('button-name')
    expect(last.applied).toBeGreaterThan(0)
    spy.mockRestore()
  })

  it('без слоя axe не запускается вовсе — ни отчёта, ни контуров', async () => {
    // Слой стоит 3 МБ импорта, и кадр без него не платит ничего. Молчание
    // здесь — правильный ответ: оболочка о слое и не спрашивала.
    window.history.pushState({}, '', '/frame.html?c=Host&sid=72')
    const spy = vi.spyOn(window.parent, 'postMessage')
    render(<Frame />)
    await screen.findByTestId('host')
    await settle()
    await settle()

    expect(reports(spy)).toEqual([])
    expect(document.querySelectorAll('.wbf-flaw')).toHaveLength(0)
    spy.mockRestore()
  })

  it('снятие слоя шлёт ПУСТОЙ отчёт, а не молчание', async () => {
    // Тем же доводом, что у таб-стопов: молчание оболочка не отличит от «ещё
    // считаем», и вкладка осталась бы со списком от выключенного слоя.
    window.history.pushState({}, '', '/frame.html?c=Host&sid=73&layers=axe')
    const spy = vi.spyOn(window.parent, 'postMessage')
    render(<Frame />)
    await screen.findByTestId('host')
    await waitFor(() => expect(reports(spy).length).toBeGreaterThan(0), { timeout: AXE_WAIT_MS })

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: pack(73, { type: 'patch', layers: [] }),
          origin: window.location.origin,
          source: window.parent,
        }),
      )
    })
    await settle()

    const sent = reports(spy)
    expect(sent[sent.length - 1]).toEqual({
      type: 'a11y',
      violations: [],
      incomplete: [],
      applied: 0,
    })
    expect(document.querySelectorAll('.wbf-flaw')).toHaveLength(0)
    spy.mockRestore()
  })

  it('нарушивший узел обведён — по контуру на каждый, а не один на правило', async () => {
    // У правила бывает несколько нарушивших узлов, и «одна кнопка без имени»
    // от «всех кнопок без имени» отличается только числом контуров.
    window.history.pushState({}, '', '/frame.html?c=Host&sid=74&layers=axe')
    render(<Frame />)
    await screen.findByTestId('host')

    await waitFor(() => expect(document.querySelectorAll('.wbf-flaw')).toHaveLength(1), { timeout: AXE_WAIT_MS })
  })

  it('на устойчивой разметке отчёт уезжает ОДИН раз, а не на каждый прогон', async () => {
    window.history.pushState({}, '', '/frame.html?c=Host&sid=75&layers=axe')
    const spy = vi.spyOn(window.parent, 'postMessage')
    render(<Frame />)
    await screen.findByTestId('host')
    await waitFor(() => expect(reports(spy).length).toBeGreaterThan(0), { timeout: AXE_WAIT_MS })

    const after = reports(spy).length
    for (let i = 0; i < 5; i++) await settle()

    expect(reports(spy)).toHaveLength(after)
    expect(after).toBe(1)
    spy.mockRestore()
  })

  it('упавший прогон уезжает наверх ошибкой, а не молчанием', async () => {
    // Молчание оставляет вкладку на «Кадр считает…» навсегда: ни ошибки, ни
    // повтора, ни таймаута. И случается это чаще всего на сломанном
    // компоненте — то есть там, ради чего верстак существует.
    runCount.fail = 'axe споткнулся'
    window.history.pushState({}, '', '/frame.html?c=Host&sid=77&layers=axe')
    const spy = vi.spyOn(window.parent, 'postMessage')
    render(<Frame />)
    await screen.findByTestId('host')
    await settle()

    await waitFor(() => expect(reports(spy).length).toBeGreaterThan(0), { timeout: AXE_WAIT_MS })
    const sent = reports(spy)
    expect(sent[sent.length - 1].error).toContain('axe споткнулся')
    spy.mockRestore()
  })

  it('слой, выключенный ПОКА ПРОГОН ЛЕТЕЛ, при следующем включении отвечает', async () => {
    // Дедуп отправки (`axeSent`) и гашение в оболочке — два разных источника
    // правды о том, «что оболочка уже знает». Прогон, долетевший после снятия
    // слоя, записывает свой отчёт как отправленный, а оболочка его выбрасывает
    // (слоя-то нет) — и следующее включение даёт тот же результат, который
    // кадр считает уже отправленным. Он молчит, вкладка стоит на «Кадр
    // считает…» до смены фикстуры.
    // Фикстура БЕЗ нарушений намеренно: на нарушении контуры меняются, и
    // перерисовка от `setFlaws` случайно чинит дефект — она же и прячет его.
    // Здоровый компонент такой компенсации не даёт, а он же и типичный.
    window.history.pushState({}, '', '/frame.html?c=Clean&sid=79&layers=axe')
    const spy = vi.spyOn(window.parent, 'postMessage')
    render(<Frame />)
    await screen.findByTestId('host')
    await waitFor(() => expect(reports(spy).length).toBeGreaterThan(0), { timeout: AXE_WAIT_MS })

    const patch = (layers: string[]): void => {
      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: pack(79, { type: 'patch', layers }),
            origin: window.location.origin,
            source: window.parent,
          }),
        )
      })
    }

    // Перерисовка запускает прогон, и слой снимается, НЕ ДОЖИДАЯСЬ его конца.
    let release = (): void => {}
    runCount.hold = new Promise<void>((r) => {
      release = r
    })
    patch(['axe'])
    await waitFor(() => expect(runs()).toBeGreaterThan(1), { timeout: AXE_WAIT_MS })
    patch([])
    for (let i = 0; i < 4; i++) await settle()
    // Теперь прогон долетает — уже на выключенном слое.
    runCount.hold = null
    act(() => release())
    for (let i = 0; i < 6; i++) await settle()

    const before = reports(spy).length
    patch(['axe'])

    await waitFor(() => expect(reports(spy).length).toBeGreaterThan(before), { timeout: AXE_WAIT_MS })
    const sent = reports(spy)
    expect(sent[sent.length - 1].applied).toBeGreaterThan(0)
    spy.mockRestore()
  })

  it('поток перерисовок склеивается в один прогон, а не в поток прогонов', async () => {
    // В режиме «Состояния» кадр перерисовывается на каждое движение указателя
    // (перезамер тонов по rAF). Без склейки каждая такая перерисовка запускает
    // полный прогон axe — по 150 мс, по четырём копиям, всё время, пока мышь
    // едет по кадру, то есть ровно тогда, когда смотрят на тона. Живой замер
    // до починки: 25 прогонов за 2 с движения указателя.
    //
    // Проверка прогнана двумя мутациями и ловит обе: снятый таймер (18
    // прогонов вместо 2) и НУЛЕВОЕ затишье (12) — то есть она про длительность
    // окна, а не только про факт отложенности.
    window.history.pushState({}, '', '/frame.html?c=Host&sid=78&layers=axe')
    render(<Frame />)
    await screen.findByTestId('host')
    await waitFor(() => expect(document.querySelectorAll('.wbf-flaw')).toHaveLength(1), { timeout: AXE_WAIT_MS })
    const before = runs()

    // Каждый патч — В СВОЁМ тике: пять патчей одним `act` React склеит сам, и
    // проверка мерила бы батчинг React, а не склейку слоя.
    //
    // Число патчей ФИКСИРОВАНО, а сторожит проверку ПРОМЕЖУТОК между соседними,
    // не общая длина потока. Прежняя редакция держала поток короче половины окна
    // (`deadline = now + AXE_QUIET_MS / 2`) и стерегла не то: окно затишья
    // ПЕРЕЗАПУСКАЕТСЯ на каждом патче, поэтому поток может длиться сколько угодно
    // долго — лишь бы соседние патчи стояли ближе, чем `AXE_QUIET_MS`. Привязка к
    // общему времени вместо этого ограничивала ЧИСЛО итераций, и под нагрузкой
    // (одна итерация ~33 мс против бюджета 100 мс) их выходило три вместо шести:
    // санитар «поток был настоящий» краснел от медленной машины, а не от дефекта.
    // Ронял релиз 4.0.0 (DS-106).
    const BURSTS = 8
    const gaps: number[] = []
    let prev = Date.now()
    for (let i = 0; i < BURSTS; i++) {
      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: pack(78, { type: 'patch', scale: 1 + (i % 40) / 100 }),
            origin: window.location.origin,
            source: window.parent,
          }),
        )
      })
      await settle()
      const now = Date.now()
      gaps.push(now - prev)
      prev = now
    }

    // Санитар на том УСЛОВИИ, при котором утверждение ниже осмысленно: пока
    // соседние патчи ближе окна, слой обязан молчать. Разъехались — замер не
    // состоялся, и красный тут говорит «машина не потянула», а не «склейки нет».
    expect(
      Math.max(...gaps),
      `промежуток между патчами ${Math.max(...gaps)}мс перерос окно ${AXE_QUIET_MS}мс — ` +
        'поток перестал быть потоком, замер не состоялся',
    ).toBeLessThan(AXE_QUIET_MS)
    // И за всё время потока — НИ ОДНОГО прогона: считать надо то, на чём
    // палец остановился, а не каждую перерисовку по дороге.
    expect(runs()).toBe(before)

    // А после затишья — ровно один.
    await waitFor(() => expect(runs()).toBeGreaterThan(before), { timeout: AXE_WAIT_MS })
    for (let i = 0; i < 5; i++) await settle()
    expect(runs() - before).toBeLessThanOrEqual(2)
  })

  it('прогонов axe СЧИТАННЫЕ ЕДИНИЦЫ, а не по одному на перерисовку', async () => {
    // Считается сам вызов, а не сообщение: дедуп сообщений (`axeSent`) прячет
    // лишние прогоны полностью, и слой, молотящий axe вечно, выглядел бы
    // снаружи безупречно — одно сообщение и тихо. Стоит это 150 мс за прогон
    // на каждую перерисовку кадра.
    //
    // Два — потолок с запасом: первый прогон меняет состояние (контуры),
    // второй видит то же самое и останавливается.
    window.history.pushState({}, '', '/frame.html?c=Host&sid=76&layers=axe')
    render(<Frame />)
    await screen.findByTestId('host')
    await waitFor(() => expect(document.querySelectorAll('.wbf-flaw')).toHaveLength(1), { timeout: AXE_WAIT_MS })
    for (let i = 0; i < 5; i++) await settle()

    expect(runs()).toBeLessThanOrEqual(2)
    expect(runs()).toBeGreaterThan(0)
  })

  it('нарушение в ОВЕРЛЕЕ-ПОРТАЛЕ приезжает, хотя оверлей вне хоста', async () => {
    // DS-163, главный случай. Хост здесь чистый, а безымянная кнопка —
    // в портале, прямом ребёнке `body`. До задачи вкладка на открытом Modal и
    // Drawer писала «смотреть было нечего», то есть предлагала пройти мимо
    // ровно там, где претензии axe самые частые.
    window.history.pushState({}, '', '/frame.html?c=Portal&sid=81&layers=axe')
    const spy = vi.spyOn(window.parent, 'postMessage')
    render(<Frame />)
    await screen.findByTestId('host')
    await settle()

    await waitFor(() => expect(reports(spy).length).toBeGreaterThan(0), { timeout: AXE_WAIT_MS })
    const all = reports(spy)
    const last = all[all.length - 1]
    expect(last.violations?.map((v) => v.id)).toContain('button-name')
    expect(last.applied).toBeGreaterThan(0)
    spy.mockRestore()
  })

  it('слой включён, а корня нет — ОТДЕЛЬНЫЙ разряд, а не пустой отчёт', async () => {
    // Второй пункт задачи. «Ноль применённых правил» и «кадр не отрисовал
    // фикстуру» печатались одним текстом, хотя чинятся в разных местах.
    // Корня нет, когда имя компонента верстаку неизвестно.
    window.history.pushState({}, '', '/frame.html?c=Нет&sid=82&layers=axe')
    const spy = vi.spyOn(window.parent, 'postMessage')
    render(<Frame />)
    await settle()

    await waitFor(() => expect(reports(spy).length).toBeGreaterThan(0), { timeout: AXE_WAIT_MS })
    const sent = reports(spy)
    const last = sent[sent.length - 1]
    expect(last?.noRoot).toBe(true)
    expect(last?.applied).toBe(0)
    spy.mockRestore()
  })

  it('отрисованный, но ПУСТОЙ хост даёт ноль правил и `noRoot` НЕ ставит', async () => {
    // Контроль к предыдущему: два разряда обязаны быть различимы с ОБЕИХ
    // сторон. Проверка, красневшая бы только на одной, разрешила бы поставить
    // `noRoot` всегда — и разряд снова стал бы одним.
    window.history.pushState({}, '', '/frame.html?c=Empty&sid=83&layers=axe')
    vi.mocked(loadFixture).mockImplementation(async () => EMPTY)
    const spy = vi.spyOn(window.parent, 'postMessage')
    render(<Frame />)
    await screen.findByTestId('empty')
    await settle()

    await waitFor(() => expect(reports(spy).length).toBeGreaterThan(0), { timeout: AXE_WAIT_MS })
    const sent = reports(spy)
    const last = sent[sent.length - 1]
    expect(last?.noRoot).toBeUndefined()
    expect(last?.applied).toBe(0)
    spy.mockRestore()
  })

  it('НА ВРЕМЯ ПРОГОНА кадр помечен, а после — нет: прибор уходит из кадра', async () => {
    // DS-195. Правилу `color-contrast` нужны настоящие пиксели, и метка
    // ПОВЕРХ текста делает фон неопределимым — axe отвечает `bgOverlap`. А
    // контур `.wbf-flaw` рисуется ИЗ РЕЗУЛЬТАТА прогона, то есть слой правил
    // вход следующего прогона своим же выходом и не сходился никогда.
    //
    // jsdom НЕ ВИДИТ самого перекрытия — там нет ни раскладки, ни пикселей, и
    // проверить починку целиком можно только в браузере (`smoke:wb`, шаг 16).
    // Здесь проверяется её ПОЛОВИНА — знак на корне, — и проверяется потому,
    // что вторая половина живёт в `check-full`: удали `setAttribute`, и
    // `make check` не сказал бы ничего до самого релиза.
    window.history.pushState({}, '', '/frame.html?c=Host&sid=84&layers=axe')
    render(<Frame />)
    await screen.findByTestId('host')

    let release = (): void => {}
    runCount.hold = new Promise<void>((r) => {
      release = r
    })
    await waitFor(() => expect(runs()).toBeGreaterThan(0), { timeout: AXE_WAIT_MS })
    expect(document.documentElement.getAttribute(AXE_RUN_ATTR)).toBe('run')

    runCount.hold = null
    act(() => release())
    await waitFor(() => expect(document.documentElement.hasAttribute(AXE_RUN_ATTR)).toBe(false), {
      timeout: AXE_WAIT_MS,
    })
  })

  it('УПАВШИЙ прогон тоже снимает метку — иначе кадр остаётся без своих слоёв', async () => {
    // Снятие живёт в `finally`, а не после `then`, и это не аккуратность:
    // спотыкается axe чаще всего на сломанном компоненте, то есть ровно там,
    // где верстак и нужен, — а человек в этот миг остался бы без контуров,
    // номеров стопов и рамки прицела до следующей перерисовки.
    window.history.pushState({}, '', '/frame.html?c=Host&sid=85&layers=axe')
    runCount.fail = 'axe споткнулся'
    const spy = vi.spyOn(window.parent, 'postMessage')
    render(<Frame />)
    await screen.findByTestId('host')

    await waitFor(() => expect(reports(spy).length).toBeGreaterThan(0), { timeout: AXE_WAIT_MS })
    expect(document.documentElement.hasAttribute(AXE_RUN_ATTR)).toBe(false)
    spy.mockRestore()
  })
})
