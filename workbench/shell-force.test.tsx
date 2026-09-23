/**
 * Задача 29, половина «в оболочке»: тумблеры состояний и два числа обхода.
 *
 * Утверждается пара, а не половина. Щелчок по состоянию обязан дойти И до
 * патча (кадр перекрашивается сразу, без перезагрузки), И до адреса окна
 * (ссылку копируют оттуда) — схлопнутые состояния («нажалось, но не поехало»)
 * порознь проходят: кнопка выглядит нажатой, потому что панель помнит свой же
 * щелчок.
 *
 * ГРАНИЦА, стоившая одной неверной проверки: `src` кадра считается ОДИН РАЗ
 * при монтировании (shell-frame.tsx) — патч его не переписывает намеренно,
 * иначе каждое движение тумблера перезагружало бы документ кадра и роняло
 * живое состояние компонента. Поэтому `frameQuery()` показывает форс только
 * там, где кадр СОЗДАН заново: адрес открытия и смена компонента.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, within, act, fireEvent } from '@testing-library/react'
import { Shell } from './shell-app.js'
import { frameQuery, frameSid, sendUp, downSpy } from './test-kit.js'
import { MIRROR_DELAY_MS } from './mirror-url.js'
import type { FixtureMeta, Patch } from './protocol.js'

/** Кадр загрузился: до `ready` оболочка вниз ничего не шлёт. */
const META: FixtureMeta = {
  name: 'DataTable',
  group: 'Data',
  cases: [{ id: 'base', title: 'base', values: {}, slots: {} }],
  controls: {},
  unexpressed: [],
  data: [],
  slots: {},
}
const ready = (): void => sendUp(frameSid(), { type: 'ready', meta: META })

afterEach(cleanup)

beforeEach(() => {
  window.history.pushState(null, '', '/')
})

const dock = () => screen.getByRole('region', { name: 'Панель' })
const forceGroup = () => within(dock()).getByRole('group', { name: 'Форс-состояния' })
const chip = (name: string) => within(forceGroup()).getByRole('button', { name })

/**
 * Последний патч С ПОЛЕМ `force`, ушедший вниз, — или провал словами.
 *
 * Не «последнее сообщение вообще»: оболочка копит патч одним объектом и шлёт
 * его вниз при каждом изменении, так что после щелчка по состоянию туда же
 * уезжают соседние поля. Спрашиваем ровно про то поле, о котором тест.
 * `in`, а не `!== undefined`: снятие последнего состояния кладёт `null`, и
 * это ЗНАЧЕНИЕ, а не отсутствие.
 */
const lastPatch = (spy: ReturnType<typeof downSpy>): Patch => {
  const bodies = spy.mock.calls.map((c) => (c[0] as { body: Patch }).body)
  // Без `.at(-1)`: `lib` проекта — ES2020, и `Array.prototype.at` там нет
  // (поймано `npm run typecheck`, а не глазами).
  const withForce = bodies.filter((b) => b && 'force' in b)
  const found = withForce[withForce.length - 1]
  if (!found) throw new Error(`вниз не ушло ни одного патча с force (всего ${bodies.length})`)
  return found
}

describe('форс-состояния в панели', () => {
  it('щелчок уходит патчем — кадр красится, не перезагружаясь', () => {
    render(<Shell />)
    ready()
    const sid = frameSid()
    const spy = downSpy()

    fireEvent.click(chip(':hover'))

    expect(lastPatch(spy).force).toBe('hover')
    expect(chip(':hover').getAttribute('aria-pressed')).toBe('true')
    // Кадр НЕ пересоздан: тот же `src`, что до щелчка.
    expect(frameQuery().get('sid')).toBe(String(sid))
  })

  it('состояния набираются, а не сменяют друг друга', () => {
    // `hover` вместе с `focus-visible` — тот самый вопрос, на котором в
    // CLAUDE.md записан живой дефект: подсветка фокуса оказалась неотличима
    // от наведения. Переключатель «одно из» этот вопрос задать не позволяет.
    render(<Shell />)
    ready()
    const spy = downSpy()

    fireEvent.click(chip(':hover'))
    fireEvent.click(chip(':focus-visible'))

    expect(lastPatch(spy).force).toBe('hover,focus-visible')
  })

  it('повторный щелчок снимает состояние, а последний снятый снимает поле целиком', () => {
    // `null`, а не пустая строка: `force=` в адресе читалось бы как «форс
    // включён, но ничего не выбрано», и `buildFrameUrl` тащил бы пустое поле.
    render(<Shell />)
    ready()
    const spy = downSpy()

    fireEvent.click(chip(':active'))
    fireEvent.click(chip(':active'))

    expect(lastPatch(spy).force).toBeNull()
    expect(chip(':active').getAttribute('aria-pressed')).toBe('false')
  })

  it('прочитанное из адреса показано нажатым — панель не расходится с кадром', () => {
    window.history.pushState(null, '', '/?force=hover,active')
    render(<Shell />)

    expect(chip(':hover').getAttribute('aria-pressed')).toBe('true')
    expect(chip(':active').getAttribute('aria-pressed')).toBe('true')
    expect(chip(':focus').getAttribute('aria-pressed')).toBe('false')
  })

  it('форс переживает смену компонента: это линза, а не состояние фикстуры', () => {
    // Тема и масштаб ведут себя так же. Гаснуть при каждом щелчке по списку
    // компонентов линза не имеет права: смотрят обычно один и тот же вопрос
    // на нескольких компонентах подряд.
    render(<Shell />)
    fireEvent.click(chip(':hover'))

    const list = screen.getByRole('navigation', { name: 'Компоненты' })
    const other = within(list)
      .getAllByRole('button')
      .find((b) => b.textContent !== 'DataTable')
    if (!other) throw new Error('в списке один компонент — переключаться некуда')
    fireEvent.click(other)

    expect(chip(':hover').getAttribute('aria-pressed')).toBe('true')
    expect(frameQuery().get('force')).toBe('hover')
  })
})

describe('числа обхода в панели', () => {
  it('до ответа кадра панель говорит словами, а не показывает нули', () => {
    // Ноль вместо «ещё не рассказал» читался бы как ответ: «обход 0 мс,
    // пропущено 0» — блестящий результат, которого никто не измерял.
    render(<Shell />)
    expect(within(forceGroup()).getByText(/ещё не рассказал/)).toBeTruthy()
  })

  it('пришедшие числа напечатаны оба', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'force-stats', ms: 5.14, skipped: 0 })

    expect(within(forceGroup()).getByText('обход 5.1 мс · пропущено 0')).toBeTruthy()
  })

  it('ненулевое «пропущено» отмечено не только цветом', () => {
    // Цвет один не годится: он не дойдёт ни до дальтоника, ни до скриншота
    // в переписке. Само число стоит в тексте, а объяснение — в `title`.
    render(<Shell />)
    sendUp(frameSid(), { type: 'force-stats', ms: 7, skipped: 3 })

    const note = within(forceGroup()).getByText('обход 7.0 мс · пропущено 3')
    expect(note.getAttribute('title')).toMatch(/:not\(:hover\)/)
  })

  it('смена компонента гасит числа: они принадлежат документу кадра', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'force-stats', ms: 5, skipped: 0 })
    expect(within(forceGroup()).getByText(/обход 5\.0 мс/)).toBeTruthy()

    const list = screen.getByRole('navigation', { name: 'Компоненты' })
    const other = within(list)
      .getAllByRole('button')
      .find((b) => b.textContent !== 'DataTable')
    if (!other) throw new Error('в списке один компонент — переключаться некуда')
    fireEvent.click(other)

    expect(within(forceGroup()).getByText(/ещё не рассказал/)).toBeTruthy()
  })
})

describe('адрес оболочки', () => {
  it('форс попадает в адрес окна после дебаунса — ссылку копируют оттуда', async () => {
    vi.useFakeTimers()
    try {
      render(<Shell />)
      fireEvent.click(chip(':hover'))
      await act(async () => {
        vi.advanceTimersByTime(MIRROR_DELAY_MS + 10)
      })
      expect(new URLSearchParams(window.location.search).get('force')).toBe('hover')

      // И снимается оттуда же: пустое `force=` в скопированной ссылке
      // читалось бы как «форс включён, но ничего не выбрано».
      fireEvent.click(chip(':hover'))
      await act(async () => {
        vi.advanceTimersByTime(MIRROR_DELAY_MS + 10)
      })
      expect(new URLSearchParams(window.location.search).has('force')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('вид кадра: кадр ↔ состояния', () => {
  const modes = () => screen.getByRole('group', { name: 'Вид' })
  const modeBtn = (name: string) => within(modes()).getByRole('button', { name })

  it('переключение уходит патчем, а не перезагрузкой кадра', () => {
    // Перезагрузка роняет и живое состояние компонента, и тёплый лист форса,
    // а щёлкать «кадр ↔ состояния» будут часто — это основное движение при
    // разглядывании состояний.
    render(<Shell />)
    ready()
    const sid = frameSid()
    const spy = downSpy()

    fireEvent.click(modeBtn('состояния'))

    const bodies = spy.mock.calls.map((c) => (c[0] as { body: { mode?: string } }).body)
    expect(bodies.some((b) => b.mode === 'states')).toBe(true)
    expect(frameSid()).toBe(sid)
    expect(modeBtn('состояния').getAttribute('aria-pressed')).toBe('true')
  })

  it('в режиме состояний тумблеры форса выключены и сказано, почему', () => {
    // Гасим, а не прячем: исчезнувший блок читается как несработавшая панель.
    // Мёртвый включённый тумблер хуже обоих — он обещает действие, которого
    // не произойдёт.
    render(<Shell />)
    ready()
    fireEvent.click(modeBtn('состояния'))

    expect(chip(':hover').hasAttribute('disabled')).toBe(true)
    expect(within(forceGroup()).getByText(/все четыре показаны рядом/)).toBeTruthy()
  })

  it('вид едет в адрес кадра при пересоздании и не пишется, когда он обычный', () => {
    window.history.pushState(null, '', '/?mode=states')
    render(<Shell />)
    expect(frameQuery().get('mode')).toBe('states')

    fireEvent.click(modeBtn('кадр'))
    const list = screen.getByRole('navigation', { name: 'Компоненты' })
    const other = within(list)
      .getAllByRole('button')
      .find((b) => b.textContent !== 'DataTable')
    if (!other) throw new Error('в списке один компонент — переключаться некуда')
    fireEvent.click(other)

    // Умолчание в адрес не пишется: ссылка на обычный кадр не должна нести
    // поле, которое ничего не меняет.
    expect(frameQuery().has('mode')).toBe(false)
  })
})

describe('прицел в тулбаре', () => {
  const aimGroup = () => screen.getByRole('group', { name: 'Прицел' })
  const aimBtn = () => within(aimGroup()).getByRole('button', { name: 'прицел' })

  it('включение уходит патчем, а до ответа кадра сказано, что делать', () => {
    render(<Shell />)
    ready()
    const spy = downSpy()

    fireEvent.click(aimBtn())

    const bodies = spy.mock.calls.map((c) => (c[0] as { body: { aim?: boolean } }).body)
    expect(bodies.some((b) => b.aim === true)).toBe(true)
    // Пустое место рядом с включённой кнопкой читалось бы как «сломалось».
    expect(within(aimGroup()).getByText(/щёлкни по узлу/)).toBeTruthy()
  })

  it('имя узла приходит снизу и печатается как есть', () => {
    // Оболочка своих узлов в документе кадра не имеет: имя — единственное,
    // что она про выбранный узел знает, и придумывать его она не вправе.
    render(<Shell />)
    ready()
    fireEvent.click(aimBtn())
    sendUp(frameSid(), { type: 'aim', selector: 'td.ds-table__cell', up: [] })

    expect(within(aimGroup()).getByText('td.ds-table__cell')).toBeTruthy()
  })

  it('выключение гасит имя, и повторное включение не показывает прошлый узел', () => {
    // Проверяется ВОЗВРАТ, а не исчезновение: пока прицел выключен, имени не
    // видно в любом случае — блок скрыт целиком, и утверждение «не видно»
    // прошло бы и на коде, который имя не гасит (проверено мутацией). Дефект
    // виден только на втором включении: старое имя читается как «узел всё ещё
    // выбран», хотя кадр про него уже забыл.
    render(<Shell />)
    ready()
    fireEvent.click(aimBtn())
    sendUp(frameSid(), { type: 'aim', selector: 'td.ds-table__cell', up: [] })

    fireEvent.click(aimBtn())
    expect(aimBtn().getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(aimBtn())
    expect(within(aimGroup()).queryByText('td.ds-table__cell')).toBeNull()
    expect(within(aimGroup()).getByText(/щёлкни по узлу/)).toBeTruthy()
  })

  /**
   * СЧЁТЧИК СТУПЕНЕЙ (DS-128, находка [12]).
   *
   * Подъём по предкам живёт в кадре и делается Alt+кликом — жестом, о котором
   * нигде не написано. Счётчик в тулбаре и есть то единственное, что делает
   * его существующим: он говорит, что выше ЕСТЬ куда идти, и сколько.
   *
   * Своей строки тулбару он не стоит — она отняла бы высоту у поля кадра ровно
   * в тот момент, когда в кадр целятся. Поэтому он показывается только когда
   * узел УЖЕ выбран: к этому моменту имя узла тулбар и так растянуло, а
   * состояние «прицел включён, не ткнули» осталось прежней ширины.
   */
  const upMark = () => within(aimGroup()).queryByText(/^↑\d+$/)

  it('счётчик называет, сколько предков осталось', () => {
    render(<Shell />)
    ready()
    fireEvent.click(aimBtn())
    sendUp(frameSid(), {
      type: 'aim',
      selector: 'td.ds-table__lead',
      up: ['tr.is-clickable', 'tbody', 'table.ds-table__grid'],
    })

    expect(within(aimGroup()).getByText('↑3')).toBeTruthy()
  })

  it('на корне компонента счётчик показывает ноль, а не пропадает', () => {
    // Пропав, он сказал бы «выше некуда» отсутствием — то есть неотличимо от
    // «счётчик сломался». А это и есть ответ, ради которого он написан.
    render(<Shell />)
    ready()
    fireEvent.click(aimBtn())
    sendUp(frameSid(), { type: 'aim', selector: 'div.ds-table', up: [] })

    expect(within(aimGroup()).getByText('↑0')).toBeTruthy()
  })

  it('пока узел не выбран, счётчика нет — тулбару не за что расти', () => {
    render(<Shell />)
    ready()
    fireEvent.click(aimBtn())

    expect(upMark()).toBeNull()
  })

  it('вся цепочка лежит в подсказке счётчика, а не только её длина', () => {
    // Число отвечает «есть куда», цепочка — «куда именно»: без неё подъём
    // вслепую, по одной ступени, с проверкой глазами после каждой.
    render(<Shell />)
    ready()
    fireEvent.click(aimBtn())
    sendUp(frameSid(), {
      type: 'aim',
      selector: 'td.ds-table__lead',
      up: ['tr.is-clickable', 'tbody'],
    })

    const hint = upMark()?.getAttribute('title') ?? ''
    expect(hint).toContain('tr.is-clickable')
    expect(hint).toContain('tbody')
  })

  it('жест назван в подсказке кнопки — иначе о нём не узнают до первого выбора', () => {
    render(<Shell />)
    ready()

    expect(aimBtn().getAttribute('title')).toMatch(/alt/i)
  })
})

describe('слой таб-стопов в оболочке (Задача 33)', () => {
  const layers = () => screen.getByRole('group', { name: 'Слои' })
  const layerBtn = () => within(layers()).getByRole('button', { name: 'таб-стопы' })
  const tab = (name: RegExp) => within(dock()).getByRole('tab', { name })

  it('вкладка стоит на месте всегда и объясняет выключенный слой словами', () => {
    // Вкладка, приходящая и уходящая вместе со слоем, заставляет искать её
    // глазами каждый раз.
    render(<Shell />)
    ready()

    fireEvent.click(tab(/Таб-стопы/))
    expect(within(dock()).getByText(/Слой выключен/)).toBeTruthy()
  })

  it('включение шлёт слой вниз и сразу открывает список', () => {
    // Слой рисует номера, но «сколько их и какие» читают списком. Заставлять
    // человека искать вкладку руками — прятать половину ответа.
    render(<Shell />)
    ready()
    const spy = downSpy()

    fireEvent.click(layerBtn())

    const bodies = spy.mock.calls.map((c) => (c[0] as { body: { layers?: string[] } }).body)
    expect(bodies.some((b) => b.layers?.includes('tabstops'))).toBe(true)
    expect(tab(/Таб-стопы/).getAttribute('aria-selected')).toBe('true')
  })

  it('пришедшие стопы печатаются по порядку, а их число стоит на вкладке', () => {
    render(<Shell />)
    ready()
    fireEvent.click(layerBtn())
    sendUp(frameSid(), {
      type: 'tabstops',
      stops: [
        { node: 'a', label: 'Строка' },
        { node: 'button.ds-btn', label: 'Открыть' },
      ],
    })

    expect(tab(/Таб-стопы 2/)).toBeTruthy()
    const items = within(dock()).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(['1aСтрока', '2button.ds-btnОткрыть'])
  })

  it('ноль стопов — законный ответ, и он назван словами, а не пустотой', () => {
    // Превью, в которое клавиатура не заходит вовсе, выглядит нормально ровно
    // до первой попытки им воспользоваться. Пустое место читалось бы как
    // «ещё не посчитали».
    render(<Shell />)
    ready()
    fireEvent.click(layerBtn())
    sendUp(frameSid(), { type: 'tabstops', stops: [] })

    expect(within(dock()).getByText(/клавиатура не доходит/)).toBeTruthy()
  })

  it('смена компонента гасит список: он принадлежит документу кадра', () => {
    render(<Shell />)
    ready()
    fireEvent.click(layerBtn())
    sendUp(frameSid(), { type: 'tabstops', stops: [{ node: 'a', label: 'Строка' }] })
    expect(tab(/Таб-стопы 1/)).toBeTruthy()

    const list = screen.getByRole('navigation', { name: 'Компоненты' })
    const other = within(list)
      .getAllByRole('button')
      .find((b) => b.textContent !== 'DataTable')
    if (!other) throw new Error('в списке один компонент — переключаться некуда')
    fireEvent.click(other)

    expect(tab(/Таб-стопы 0/)).toBeTruthy()
  })
})
