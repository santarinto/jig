/**
 * Панель снизу: док, вкладки, блок случаев.
 *
 * Утверждения про выбор случая переехали сюда из shell-list.test.tsx вместе
 * с разметкой. Переезд разметки без переезда проверки — самый тихий способ
 * потерять покрытие: тест продолжает проходить, потому что проверяет то, чего
 * больше нет.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { Shell } from './shell-app.js'
import { downSpy, frameQuery, frameSid, frameSrc, sendUp } from './test-kit.js'
import type { Envelope, FixtureMeta } from './protocol.js'

const META: FixtureMeta = {
  name: 'DataTable',
  group: 'Data',
  cases: [
    { id: 'base', title: 'Обычная', note: 'Три строки, ничего особенного.', values: {}, slots: {} },
    { id: 'dense', title: 'Плотная', values: {}, slots: {} },
    { id: 'loading', title: 'Загрузка', values: {}, slots: {} },
  ],
  controls: {},
  unexpressed: [],
  data: [],
  slots: {},
}

afterEach(cleanup)

const dock = () => screen.getByRole('region', { name: 'Панель' })
const cases = () => within(dock()).getByRole('group', { name: 'Случаи' })
const slots = () => within(dock()).getByRole('group', { name: 'Позиции' })

describe('док панели', () => {
  it('док на месте и до ответа кадра объясняет пустоту словами', () => {
    render(<Shell />)
    expect(within(cases()).getByText(/фикстур/i)).toBeTruthy()
  })

  it('до ответа кадра кнопка копирования неактивна, а не копирует пустую строку', () => {
    render(<Shell />)
    expect(within(dock()).getByRole('button', { name: 'скопировать' })).toBeDisabled()
    expect(dock().querySelector('.wb__dock-jsx')).toBeNull()
    expect(within(dock()).getByText(/пропах/)).toBeTruthy()
  })

  it('случаи приходят от кадра и подсвечивают действующий', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: META })

    const list = within(cases()).getAllByRole('button')
    expect(list.map((b) => b.textContent)).toEqual(['Обычная', 'Плотная', 'Загрузка'])
    expect(list[0]!.getAttribute('aria-pressed')).toBe('true')
  })

  it('выбор случая уезжает в адрес кадра новой сессией', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: META })
    const before = frameSid()

    fireEvent.click(within(cases()).getByRole('button', { name: 'Плотная' }))

    expect(frameQuery().get('case')).toBe('dense')
    expect(frameSid()).toBeGreaterThan(before)
  })

  /**
   * Регресс DS-63 (Task 4, ревью): `resetFrameState()` по ошибке гасил
   * `meta` при смене случая наравне со сменой компонента. Смена случая тоже
   * пересоздаёт кадр (`setSid`), значит новый `ready` рано или поздно придёт
   * — но до него, пока `meta` держится, список случаев и подсветку должны
   * показывать СТАРУЮ мету: она про ту же фикстуру, ничего в ней не менялось
   * (случаи, крутилки, наборы данных — свойства фикстуры, не случая).
   */
  it('список случаев переживает клик по случаю без нового ready — фикстура та же', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: META })

    fireEvent.click(within(cases()).getByRole('button', { name: 'Плотная' }))

    // Новый `ready` НЕ шлём: проверяем состояние сразу после клика.
    const list = within(cases()).getAllByRole('button')
    expect(list.map((b) => b.textContent)).toEqual(['Обычная', 'Плотная', 'Загрузка'])
    expect(list[1]!.getAttribute('aria-pressed')).toBe('true')
  })

  // Регресс DS-61: pickCase сравнивал щелчок с caseId, а подсвечен в
  // списке currentCase — щелчок по уже подсвеченному первому случаю (caseId
  // пустой, значит «первый») проходил сравнение и пересоздавал сессию, теряя
  // живое состояние компонента. Полное объяснение — shell-app.tsx:99-103.
  it('щелчок по уже действующему случаю не трогает адрес кадра', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: META })
    const before = frameSrc()

    fireEvent.click(within(cases()).getByRole('button', { name: 'Обычная' }))

    expect(frameSrc()).toBe(before)
  })

  it('случаи прошлого компонента не висят под новым именем', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: META })
    expect(within(cases()).getByRole('button', { name: 'Плотная' })).toBeTruthy()

    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Компоненты' })).getByRole('button', {
        name: 'Badge',
      }),
    )

    expect(within(cases()).queryByRole('button', { name: 'Плотная' })).toBeNull()
  })

  it('движение крутилки уходит патчем и не перезагружает кадр', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: { ...META, controls: { dense: { kind: 'bool', prop: true } }, data: [] } })
    const before = frameSrc()
    const spy = downSpy()

    fireEvent.click(within(dock()).getByRole('checkbox', { name: 'dense' }))

    expect(frameSrc()).toBe(before)
    const sent = spy.mock.calls.map(([m]) => m as Envelope<{ type: string; props?: Record<string, string> }>)
    expect(sent.some((m) => m.body.props?.dense === 'true')).toBe(true)
    spy.mockRestore()
  })

  it('отметка «≠ кейс» появляется, называет значение кейса и снимается сбросом', () => {
    render(<Shell />)
    sendUp(frameSid(), {
      type: 'ready',
      meta: { ...META, data: [], controls: { dense: { kind: 'bool', prop: true } },
        cases: [{ id: 'base', title: 'Обычная', values: { dense: 'false' }, slots: {} }] },
    })

    expect(within(dock()).queryByText(/≠ кейс/)).toBeNull()

    fireEvent.click(within(dock()).getByRole('checkbox', { name: 'dense' }))
    expect(within(dock()).getByText(/≠ кейс/).textContent).toContain('в кейсе: false')

    // Доступное имя кнопки сброса — не глиф ⟲: экранный диктор должен
    // прочитать, что она делает и для какой крутилки, а не символ.
    expect(within(dock()).getByRole('button', { name: 'Сбросить dense к значению кейса' })).toBeTruthy()

    // Панель — это только половина утверждения. Главное решение (в патч кладётся
    // ЗНАЧЕНИЕ КЕЙСА, а не удаляется ключ, shell-app.tsx resetControl) проверяем
    // тем, что реально ушло вниз в кадр — не только тем, что исчезла отметка.
    const spy = downSpy()
    fireEvent.click(within(dock()).getByTitle('Сбросить к значению кейса'))
    expect(within(dock()).queryByText(/≠ кейс/)).toBeNull()
    const sent = spy.mock.calls.map(([m]) => m as Envelope<{ props?: Record<string, string> }>)
    expect(sent.some((m) => m.body.props?.dense === 'false')).toBe(true)
    spy.mockRestore()
  })

  it('общий сброс гасит счётчик «изменённые» и шлёт вниз обе пары ключ — значение кейса', () => {
    render(<Shell />)
    sendUp(frameSid(), {
      type: 'ready',
      meta: {
        ...META,
        unexpressed: [],
        data: [],
        controls: { dense: { kind: 'bool', prop: true }, count: { kind: 'number', min: 0, max: 9, prop: true } },
        cases: [{ id: 'base', title: 'Обычная', values: { dense: 'false', count: '2' }, slots: {} }],
      },
    })

    fireEvent.click(within(dock()).getByRole('checkbox', { name: 'dense' }))
    fireEvent.change(within(dock()).getByRole('spinbutton', { name: 'count' }), {
      target: { value: '5' },
    })
    expect(within(dock()).getByText(/изменённые\s*2/)).toBeTruthy()

    const spy = downSpy()
    fireEvent.click(within(dock()).getByRole('button', { name: 'сброс' }))

    expect(within(dock()).getByText(/изменённые\s*0/)).toBeTruthy()
    const sent = spy.mock.calls.map(([m]) => m as Envelope<{ props?: Record<string, string> }>)
    const props = Object.assign({}, ...sent.map((m) => m.body.props ?? {}))
    expect(props).toEqual({ dense: 'false', count: '2' })
    spy.mockRestore()
  })

  it('четыре вида крутилок рисуются своими элементами', () => {
    render(<Shell />)
    sendUp(frameSid(), {
      type: 'ready',
      meta: {
        ...META,
        unexpressed: [],
        data: [],
        controls: {
          tone: { kind: 'enum', values: ['neutral', 'error'], prop: true },
          dot: { kind: 'bool', prop: true },
          count: { kind: 'number', min: 0, max: 9, prop: true },
          text: { kind: 'text', prop: true },
        },
      },
    })

    expect(within(dock()).getByRole('group', { name: 'tone' })).toBeTruthy()
    expect(within(dock()).getByRole('checkbox', { name: 'dot' })).toBeTruthy()
    expect(within(dock()).getByRole('spinbutton', { name: 'count' })).toBeTruthy()
    expect(within(dock()).getByRole('textbox', { name: 'text' })).toBeTruthy()
  })

  it('набор данных уходит патчем и снимается обратно', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: { ...META, controls: {}, data: ['rows-500'] } })
    const spy = downSpy()

    fireEvent.click(within(dock()).getByRole('button', { name: 'rows-500' }))
    fireEvent.click(within(dock()).getByRole('button', { name: 'нет' }))

    const sent = spy.mock.calls.map(([m]) => m as Envelope<{ data?: string | null }>)
    expect(sent.map((m) => m.body.data)).toEqual(['rows-500', null])
    spy.mockRestore()
  })

  it('JSX-сниппет включает то, что задал сам кейс, а не только покрученное руками', () => {
    render(<Shell />)
    sendUp(frameSid(), {
      type: 'ready',
      meta: {
        ...META,
        controls: { dense: { kind: 'bool', prop: true } },
        unexpressed: [],
        data: [],
        cases: [
          { id: 'base', title: 'Обычная', values: {}, slots: {} },
          { id: 'dense', title: 'Плотная', values: { dense: 'true' }, slots: {} },
        ],
      },
    })

    // Крутилку никто не трогал — `dense` пришёл из кейса. Сниппет обязан
    // показать то, что видно на экране, а не только то, что покручено руками.
    fireEvent.click(within(cases()).getByRole('button', { name: 'Плотная' }))

    const jsx = dock().querySelector('.wb__dock-jsx')
    expect(jsx?.textContent).toBe('<DataTable dense />')
  })

  it('случай со своим render не притворяется, что сниппет — про экран; обычный случай сниппет показывает как прежде', () => {
    render(<Shell />)
    sendUp(frameSid(), {
      type: 'ready',
      meta: {
        ...META,
        controls: { dense: { kind: 'bool', prop: true } },
        unexpressed: [],
        data: [],
        cases: [
          { id: 'base', title: 'Обычная', values: { dense: 'false' }, slots: {} },
          { id: 'tones', title: 'Все тона', values: {}, ownRender: true, slots: {} },
        ],
      },
    })

    // Случай без своего render — снип и кнопка копирования как прежде.
    expect(dock().querySelector('.wb__dock-jsx')?.textContent).toBe('<DataTable />')
    expect(within(dock()).getByRole('button', { name: 'скопировать' })).toBeTruthy()

    fireEvent.click(within(cases()).getByRole('button', { name: 'Все тона' }))

    // Случай со своим render — ни кнопки, ни сниппета, вместо них слова.
    expect(within(dock()).queryByRole('button', { name: 'скопировать' })).toBeNull()
    expect(dock().querySelector('.wb__dock-jsx')).toBeNull()
    expect(within(dock()).getByText(/своя разметка/)).toBeTruthy()
  })

  /**
   * КРУТИЛКИ, ДО КОТОРЫХ НЕ ДОЕЗЖАЮТ ПРОПЫ ([3] ручного QA).
   *
   * Отчёт просил «просто погасить» на случаях со своей разметкой. Сделано
   * иначе по двум причинам, обе — от кода.
   *
   * ПЕРВАЯ: своя разметка НЕ означает мёртвых крутилок. У `Badge` случай «Все
   * тона» рисует себя сам и при этом берёт `p.dot`. Признак поэтому другой —
   * `ignoresProps`, действующий `render` без параметров (`fixture-meta.ts`).
   *
   * ВТОРАЯ: погашенная крутилка без причины — та же тишина в другой позе.
   * Человек видит серый ряд и не знает, сломался ли верстак, не загрузилась ли
   * фикстура или так задумано. Причина пишется ОДИН РАЗ НА ГРУППУ: над каждой
   * из четырёх колонок она читалась бы как четыре разных блока — тот же довод,
   * по которому шапка «крутилки N» стоит только над первой.
   */
  // По СОДЕРЖИМОМУ, а не по шапке: шапка «крутилки N» стоит только над первой
  // колонкой, у остальных она пустая — фильтр по ней нашёл бы ровно одну
  // колонку всегда, и проверка «колонок несколько» была бы зелена на любом коде.
  const controlsCols = () =>
    Array.from(dock().querySelectorAll('.wb__dock-col')).filter((c) => c.querySelector('.wb__ctl'))

  const blind = (): FixtureMeta => ({
    ...META,
    controls: { dense: { kind: 'bool', prop: true }, tone: { kind: 'enum', values: ['a', 'b'], prop: true } },
    unexpressed: [],
    data: [],
    cases: [
      { id: 'base', title: 'Обычная', values: { dense: 'false' }, slots: {} },
      { id: 'tones', title: 'Все тона', values: {}, ownRender: true, ignoresProps: true, slots: {} },
    ],
  })

  it('крутилки погашены на случае, до которого пропы не доезжают', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: blind() })

    expect(within(dock()).getByLabelText('dense')).not.toBeDisabled()

    fireEvent.click(within(cases()).getByRole('button', { name: 'Все тона' }))

    expect(within(dock()).getByLabelText('dense')).toBeDisabled()
    expect(within(within(dock()).getByRole('group', { name: 'tone' })).getByRole('button', { name: 'a' })).toBeDisabled()
  })

  it('причина названа, и один раз на группу, а не над каждой колонкой', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: blind() })
    fireEvent.click(within(cases()).getByRole('button', { name: 'Все тона' }))

    expect(within(dock()).getAllByText(/пропов не берёт/)).toHaveLength(1)
  })

  /**
   * ПЕРЕКРЫТЫЕ КРУТИЛКИ (DS-164) — адресно, а не группой: случай
   * `Drawer/side-left` задаёт `title` сам, а `side` берёт из пропа. Гаснет
   * ровно перекрытая, соседняя живая, и причина называет имя — «крутилки до
   * него не доедут» тут была бы неправдой про `side`.
   */
  it('перекрытая случаем крутилка погашена, соседняя живая, причина называет имя', () => {
    const m = blind()
    render(<Shell />)
    sendUp(frameSid(), {
      type: 'ready',
      meta: { ...m, cases: [m.cases[0]!, { ...m.cases[1]!, ignoresProps: undefined, overrides: ['dense'] }] },
    })

    expect(within(dock()).getByLabelText('dense')).not.toBeDisabled()
    expect(within(dock()).queryByText(/задаёт сам/)).toBeNull()

    fireEvent.click(within(cases()).getByRole('button', { name: 'Все тона' }))

    expect(within(dock()).getByLabelText('dense')).toBeDisabled()
    expect(within(within(dock()).getByRole('group', { name: 'tone' })).getByRole('button', { name: 'a' })).not.toBeDisabled()
    expect(within(dock()).getAllByText(/задаёт сам: dense/)).toHaveLength(1)
  })

  it('своя разметка сама по себе крутилок не гасит — они могут работать', () => {
    // `Badge` «Все тона»: `render: (p) => … dot={p.dot}`. Погасив крутилку по
    // `ownRender`, панель отняла бы живой контрол и соврала бы про него.
    const m = blind()
    render(<Shell />)
    sendUp(frameSid(), {
      type: 'ready',
      meta: { ...m, cases: [m.cases[0]!, { ...m.cases[1]!, ignoresProps: undefined }] },
    })
    fireEvent.click(within(cases()).getByRole('button', { name: 'Все тона' }))

    expect(within(dock()).getByLabelText('dense')).not.toBeDisabled()
    expect(within(dock()).queryByText(/пропов не берёт/)).toBeNull()
  })

  it('колонок крутилок несколько, а причина всё равно одна', () => {
    // Крутилки чанкуются по 5 в колонку. Шесть штук дают две колонки, и
    // повторённая причина читалась бы как два разных блока.
    const m = blind()
    render(<Shell />)
    sendUp(frameSid(), {
      type: 'ready',
      meta: {
        ...m,
        controls: Object.fromEntries(
          Array.from({ length: 6 }, (_, i) => [`c${i}`, { kind: 'bool', prop: true } as const]),
        ),
      },
    })
    fireEvent.click(within(cases()).getByRole('button', { name: 'Все тона' }))

    expect(controlsCols().length).toBeGreaterThan(1)
    expect(within(dock()).getAllByText(/пропов не берёт/)).toHaveLength(1)
  })
})

/**
 * Блок позиций (Задача 6, пункт 25 спеки, «Панель») — четвёртая колонка
 * дока. Семь случаев, как в брифе:
 *
 * 1–2 — блок не прячется и объясняет пустоту/состояние словами (тот же приём,
 *   что у блока случаев выше — исчезнувший блок читается как несработавшая
 *   панель).
 * 3 — начинка кейса видна ЧИПОМ без единого параметра в адресе (кейс —
 *   данные, не адрес; Ruling из брифа: «слоистость начинок» — кейс, потом
 *   адрес).
 * 4 — правдивость чипа СТРУКТУРНА (решение №6): выбор не может пообещать то,
 *   от чего кадр откажется, потому что несовместимое просто не предложено.
 * 5 — патч, а не перезагрузка (граница задачи).
 * 6 — против рефакторинга, а не против сегодняшнего кода: сегодня оболочка
 *   физически не может насеять `s.*` в адрес кадра (`state.slots` — литерал
 *   `{}`, `key={sid}` пересоздаёт `<iframe>`). Санитар охраняет это свойство.
 * 7 — из финального ревью Задачи 5: фикстура с НЕПРОЧИТАННЫМ видом годится в
 *   любую позицию (`fitsSlot(accepts, undefined)` истинно), без пометки
 *   десяток таких превратил бы выбор в свалку без объяснения, почему их так
 *   много. Повод сменился с DS-67 (карта собирается разбором исходника,
 *   и «не прочитан» пришло на место «не грузится»), предмет — нет.
 */
describe('блок позиций', () => {
  it('блок позиций не прячется при нуле и объясняет пустоту словами', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: { ...META, slots: {} } })
    expect(within(slots()).getByText(/позиций нет/i)).toBeTruthy()
  })

  it('позиция показывает подпись prop и состояние «пусто»', () => {
    render(<Shell />)
    sendUp(frameSid(), {
      type: 'ready',
      meta: {
        ...META,
        slots: { cell: { title: 'Свободная ячейка', accepts: 'inline', prop: 'columns[3].render' } },
      },
    })
    expect(within(slots()).getByText('columns[3].render')).toBeTruthy()
    expect(within(slots()).getByText(/пусто/i)).toBeTruthy()
  })

  /**
   * Хвост финального ревью фазы 4 (пункт 2), вторая половина: у позиции,
   * которую кейс НЕ задавал, не было пути назад — «⟲» возвращает к начинке
   * кейса и потому там не появляется, а патч умел только заменять значение.
   * Заполнил — и до перезагрузки кадра пусто уже не сделать.
   *
   * Утверждается ПАРА: кнопка появилась И вниз ушло снятие (`null`, а не
   * пустая строка — она означала бы «ссылка не читается»). Одна половина без
   * другой проходит на коде, который рисует кнопку и ничего не делает.
   */
  it('начинку, которой кейс не задавал, можно снять — и вниз уходит null', () => {
    render(<Shell />)
    sendUp(frameSid(), {
      type: 'ready',
      meta: { ...META, slots: { cell: { title: 'Свободная ячейка', accepts: 'inline' } } },
    })

    // Пока позиция пуста — снимать нечего, кнопки нет.
    expect(within(slots()).queryByRole('button', { name: /Снять начинку/ })).toBeNull()

    fireEvent.click(within(slots()).getByRole('button', { expanded: false }))
    sendUp(frameSid(), { type: 'kinds', list: [{ name: 'Badge', kind: 'inline' }] })
    fireEvent.click(within(within(slots()).getByRole('group', { name: /Начинка для/ })).getByRole('button', { name: 'Badge' }))
    expect(within(slots()).getByText('Badge')).toBeTruthy()

    const spy = downSpy()
    fireEvent.click(within(slots()).getByRole('button', { name: /Снять начинку/ }))

    const sent = spy.mock.calls.map(([m]) => m as Envelope<{ slots?: Record<string, string | null> }>)
    expect(sent.some((m) => m.body.slots?.cell === null)).toBe(true)
    expect(within(slots()).getByText(/пусто/i)).toBeTruthy()
    spy.mockRestore()
  })

  /**
   * Хвост финального ревью фазы 4 (пункт 2): `aria-expanded` стоял ОДИН.
   * «Раскрыто» без указания на раскрытое оставляет диктора без цели, а
   * ссылка на несуществующий id — уже не подсказка, а ошибка разметки,
   * поэтому утверждаются ОБА состояния: закрыто — атрибута нет, открыто —
   * он указывает на узел, который в документе ЕСТЬ.
   */
  it('aria-controls появляется вместе с раскрытым списком и указывает на живой узел', () => {
    render(<Shell />)
    sendUp(frameSid(), {
      type: 'ready',
      meta: { ...META, slots: { cell: { title: 'Свободная ячейка', accepts: 'inline' } } },
    })

    const chip = within(slots()).getByRole('button', { expanded: false })
    expect(chip.hasAttribute('aria-controls')).toBe(false)

    fireEvent.click(chip)

    const id = within(slots()).getByRole('button', { expanded: true }).getAttribute('aria-controls')
    expect(id).toBeTruthy()
    expect(document.getElementById(id!)).not.toBeNull()
  })

  /**
   * Финальное ревью фазы 4, Important 3: `note` позиции (чем она опасна)
   * доезжал протоколом (`SlotMeta.note`, заполняется в `fixture-meta.ts`),
   * но `SlotRow` его не рисовал НИЧЕМ — поле доходило до объекта и умирало в
   * панели. Санитар на ДОСТАВКУ: сам атрибут на живом узле, а не наличие
   * поля где-то в карте — тест на построение объекта прошёл бы и на старом,
   * дефектном коде.
   */
  it('note позиции доезжает до экрана — доступно наведением на её имя', () => {
    render(<Shell />)
    sendUp(frameSid(), {
      type: 'ready',
      meta: {
        ...META,
        slots: {
          cell: {
            title: 'Свободная ячейка',
            accepts: 'inline',
            note: 'DisplayColumn.render — text-overflow включается для всей строки.',
          },
        },
      },
    })

    expect(within(slots()).getByText('Свободная ячейка').getAttribute('title')).toBe(
      'DisplayColumn.render — text-overflow включается для всей строки.',
    )
  })

  it('начинка, заданная кейсом, показана чипом без единого параметра в адресе', () => {
    render(<Shell />)
    sendUp(frameSid(), {
      type: 'ready',
      meta: {
        ...META,
        cases: [{ id: 'base', title: 'Обычная', values: {}, slots: { cell: 'Badge:dot' } }],
        slots: { cell: { title: 'Ячейка', accepts: 'inline' } },
      },
    })

    expect(within(slots()).getByText('Badge:dot')).toBeTruthy()
    expect(within(slots()).queryByText(/пусто/i)).toBeNull()
    // Данные кейса, а не адрес: ничего вида `s.<id>=` в query кадра.
    expect(frameQuery().toString()).not.toMatch(/s\./)
  })

  it('выбор предлагает ТОЛЬКО совместимые фикстуры', () => {
    render(<Shell />)
    const sid = frameSid()
    sendUp(sid, {
      type: 'ready',
      meta: { ...META, slots: { cell: { title: 'Ячейка', accepts: 'inline' } } },
    })

    fireEvent.click(within(slots()).getByRole('button', { name: 'пусто' }))
    sendUp(sid, {
      type: 'kinds',
      list: [
        { name: 'Badge', kind: 'inline' },
        { name: 'DataTable', kind: 'block' },
      ],
    })

    const picker = within(slots()).getByRole('group', { name: 'Начинка для Ячейка' })
    expect(within(picker).getByRole('button', { name: 'Badge' })).toBeTruthy()
    expect(within(picker).queryByRole('button', { name: 'DataTable' })).toBeNull()
  })

  it('выбор начинки уходит патчем и не перезагружает кадр', () => {
    render(<Shell />)
    const sid = frameSid()
    sendUp(sid, {
      type: 'ready',
      meta: { ...META, slots: { cell: { title: 'Ячейка', accepts: 'inline' } } },
    })
    const before = frameSrc()

    fireEvent.click(within(slots()).getByRole('button', { name: 'пусто' }))
    sendUp(sid, { type: 'kinds', list: [{ name: 'Badge', kind: 'inline' }] })

    const spy = downSpy()
    fireEvent.click(within(slots()).getByRole('button', { name: 'Badge' }))

    expect(frameSrc()).toBe(before)
    // Утверждаем ТИП сообщения, не только наличие поля `slots`: без этого
    // тест устроило бы ЛЮБОЕ сообщение с полем `slots` (например будущий вид
    // `Down`), лишь бы совпало значение — не то, что реально проверяем
    // («ушёл именно патч»).
    const sent = spy.mock.calls.map(([m]) => m as Envelope<{ type: string; slots?: Record<string, string> }>)
    expect(sent.some((m) => m.body.type === 'patch' && m.body.slots?.cell === 'Badge')).toBe(true)
    spy.mockRestore()
  })

  it('смена случая начинает кадр БЕЗ начинок — в адресе нового кадра нет ни одного s.*', () => {
    render(<Shell />)
    const sid = frameSid()
    sendUp(sid, {
      type: 'ready',
      meta: {
        ...META,
        cases: [
          { id: 'base', title: 'Обычная', values: {}, slots: {} },
          { id: 'dense', title: 'Плотная', values: {}, slots: {} },
        ],
        slots: { cell: { title: 'Ячейка', accepts: 'inline' } },
      },
    })

    fireEvent.click(within(slots()).getByRole('button', { name: 'пусто' }))
    sendUp(sid, { type: 'kinds', list: [{ name: 'Badge', kind: 'inline' }] })
    fireEvent.click(within(slots()).getByRole('button', { name: 'Badge' }))

    fireEvent.click(within(cases()).getByRole('button', { name: 'Плотная' }))

    expect(frameQuery().toString()).not.toMatch(/s\./)
    // Панель — тоже часть утверждения, не только адрес нового кадра
    // (ревью Task 5+6): выбор ЭТОЙ сессии обязан гаснуть вместе с ней сразу
    // по клику, ещё до нового `ready` (`meta` его переживает — Ruling 10, у
    // случая «Плотная» своих начинок не задано), иначе панель показывала бы
    // чип «Badge» там, где в новом кадре пусто — ложь ровно того класса,
    // ради ухода от которого чип делали правдивым (структурная гарантия).
    expect(within(slots()).getByText(/пусто/i)).toBeTruthy()
  })

  it('фикстура с непрочитанным видом предложена, но помечена', () => {
    render(<Shell />)
    const sid = frameSid()
    sendUp(sid, {
      type: 'ready',
      meta: { ...META, slots: { cell: { title: 'Ячейка', accepts: 'inline' } } },
    })

    fireEvent.click(within(slots()).getByRole('button', { name: 'пусто' }))
    sendUp(sid, {
      type: 'kinds',
      list: [
        { name: 'Badge', kind: 'inline' },
        { name: 'Zzz', unread: true },
      ],
    })

    const picker = within(slots()).getByRole('group', { name: 'Начинка для Ячейка' })
    expect(within(picker).getByRole('button', { name: 'Badge' })).toBeTruthy()
    expect(within(picker).getByText(/Zzz/)).toBeTruthy()
    expect(within(picker).getByText(/вид не прочитан/i)).toBeTruthy()
  })

  /**
   * Ruling 12 (ревью Task 5+6): кнопка «⟲» у позиции — сверх обоих брифов,
   * тем же доводом, что у крутилок (спека): подменил начинку, забыл — и
   * дальше винишь компонент, а не свою же правку. Решение оставить кнопку
   * принято, но без санитара она была ДЕФЕКТОМ, а не удобством — ни
   * `onResetFill`, ни ветка «показать ⟲, когда выбор ушёл от кейса» не были
   * исполнены ни одним тестом.
   */
  it('«⟲» возвращает позицию к начинке кейса, а не стирает её', () => {
    render(<Shell />)
    const sid = frameSid()
    sendUp(sid, {
      type: 'ready',
      meta: {
        ...META,
        cases: [{ id: 'base', title: 'Обычная', values: {}, slots: { cell: 'Badge:dot' } }],
        slots: { cell: { title: 'Ячейка', accepts: 'inline' } },
      },
    })

    // Начинка кейса на месте, «⟲» ещё не нужна — выбор ничего не перекрывал.
    expect(within(slots()).getByText('Badge:dot')).toBeTruthy()
    expect(within(slots()).queryByRole('button', { name: /Вернуть/ })).toBeNull()

    // Подменили начинку панелью — она разошлась с кейсом.
    fireEvent.click(within(slots()).getByRole('button', { name: 'Badge:dot' }))
    sendUp(sid, {
      type: 'kinds',
      list: [
        { name: 'Badge', kind: 'inline' },
        { name: 'Avatar', kind: 'inline' },
      ],
    })
    fireEvent.click(within(slots()).getByRole('button', { name: 'Avatar' }))
    expect(within(slots()).getByText('Avatar')).toBeTruthy()

    const spy = downSpy()
    fireEvent.click(within(slots()).getByRole('button', { name: 'Вернуть Ячейка к начинке кейса' }))

    // Чип вернулся к кейсовому — а не пропал и не остался «Avatar».
    expect(within(slots()).getByText('Badge:dot')).toBeTruthy()
    expect(within(slots()).queryByText('Avatar')).toBeNull()
    // И вниз ушла ИМЕННО СТРОКА кейса, а не пустота (та же ГРАНИЦА, что у
    // resetControl для крутилок: патч умеет только заменить значение).
    const sent = spy.mock.calls.map(([m]) => m as Envelope<{ type: string; slots?: Record<string, string> }>)
    expect(sent.some((m) => m.body.type === 'patch' && m.body.slots?.cell === 'Badge:dot')).toBe(true)
    spy.mockRestore()
  })

  /**
   * Финальное ревью фазы 4, Minor 6: `setOpenSlot(null)` в `resetFrameState`
   * (shell-app.tsx) — единственное поле там, снятое по одному, что РОНЯЕТ
   * тесты (два соседних поля избыточны и намеренно оставлены — см. комментарий
   * на месте). Без него открытый список выбора переживает смену случая: та
   * же фикстура, `meta` не гасится, `SlotRow` продолжает рисовать
   * `.wb__slot-picker` уже под другим случаем.
   */
  it('открытый выбор начинки не переживает смену случая', () => {
    render(<Shell />)
    const sid = frameSid()
    sendUp(sid, {
      type: 'ready',
      meta: {
        ...META,
        cases: [
          { id: 'base', title: 'Обычная', values: {}, slots: {} },
          { id: 'dense', title: 'Плотная', values: {}, slots: {} },
        ],
        slots: { cell: { title: 'Ячейка', accepts: 'inline' } },
      },
    })

    fireEvent.click(within(slots()).getByRole('button', { name: 'пусто' }))
    expect(within(slots()).getByRole('group', { name: 'Начинка для Ячейка' })).toBeTruthy()

    fireEvent.click(within(cases()).getByRole('button', { name: 'Плотная' }))

    expect(within(slots()).queryByRole('group', { name: 'Начинка для Ячейка' })).toBeNull()
  })
})

/**
 * DS-150. Колонки дока: продолжение группы и пустая колонка.
 *
 * ПРОВЕРЯЕТСЯ РАЗЛИЧЕНИЕМ, как требует задача. «Стало лучше» здесь непроверяемо:
 * до починки компонент с одной колонкой крутилок и компонент с двумя давали
 * ОДИНАКОВЫЙ ответ на вопрос «сколько колонок названы» — одну, — отличаясь лишь
 * тем, что во второй пусто. Санитар, считающий только вторую фикстуру, зеленел
 * бы и на прежнем коде.
 */
describe('колонки дока (DS-150)', () => {
  const withControls = (n: number): FixtureMeta => ({
    ...META,
    controls: Object.fromEntries(
      Array.from({ length: n }, (_, i) => [`p${i}`, { kind: 'bool' as const, prop: true as const }]),
    ),
  })

  const heads = () =>
    Array.from(dock().querySelectorAll('.wb__dock-head')).map((h) => h.textContent ?? '')
  const contHeads = () =>
    Array.from(dock().querySelectorAll('.wb__dock-head--cont')).map((h) => h.textContent ?? '')
  const ctlCols = () =>
    Array.from(dock().querySelectorAll('.wb__dock-col')).filter((c) => c.querySelector('.wb__ctl'))

  it('крутилки в одну колонку: продолжений нет', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: withControls(3) })

    expect(ctlCols()).toHaveLength(1)
    expect(contHeads()).toEqual([])
    expect(heads()).toContain('крутилки 3')
  })

  it('крутилки в две колонки: вторая названа продолжением, а не пустотой', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: withControls(6) })

    // Две колонки — то самое переполнение, на котором дефект и был виден.
    expect(ctlCols()).toHaveLength(2)
    expect(heads()).toContain('крутилки 6')
    expect(contHeads()).toEqual(['продолжение'])
  })

  it('ни одна колонка дока не остаётся с пустой шапкой', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: withControls(6) })

    const blank = heads().filter((t) => t.trim() === '')
    expect(blank).toEqual([])
  })

  it('стена стоит между группами, но не внутри одной', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: withControls(6) })

    const cols = ctlCols()
    // У первой стены нет — за ней продолжение той же группы; у последней есть:
    // за ней уже другая группа.
    expect(cols[0]?.classList.contains('wb__dock-col--joined')).toBe(true)
    expect(cols[1]?.classList.contains('wb__dock-col--joined')).toBe(false)
  })

  it('пустая колонка позиций не растёт, живая растёт', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: withControls(3) })
    expect(slots().classList.contains('wb__dock-col--idle')).toBe(true)

    cleanup()
    render(<Shell />)
    sendUp(frameSid(), {
      type: 'ready',
      meta: { ...withControls(3), slots: { cell: { title: 'Ячейка', accepts: 'any' } } },
    })
    expect(slots().classList.contains('wb__dock-col--idle')).toBe(false)
  })
})
