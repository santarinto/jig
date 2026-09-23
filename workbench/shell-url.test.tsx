/**
 * Task 9 (DS-63): адрес ОБОЛОЧКИ — состояние читается при старте и
 * зеркалится на лету. До этой задачи `location`/`history` в shell-app.tsx не
 * встречались вовсе: открытая ссылка со состоянием доставалась только кадру
 * (`?c=DataTable` «работал» по совпадению с захардкоженным умолчанием).
 *
 * Состав адреса — ТОТ ЖЕ, что у кадра (frame-url.ts): `c`, `case`, `theme`,
 * `scale`, `data`, `p.*`, `s.*`. Разбор и сборка — существующие
 * `parseFrameUrl`/`buildFrameUrl`, второго разборщика в проекте не заводим —
 * поэтому тесты ниже импортируют их напрямую, не копируют логику.
 *
 * ГРАНИЦЫ (записаны и в код, shell-app.tsx):
 * - `sid` из адреса НЕ читается — это сессия кадра, оболочка всегда
 *   начинает новую (nextSid());
 * - ширины в адресе КАДРА нет; в адресе оболочки она есть с DS-345
 *   (`w`, сборщик `buildShellUrl`) — случаи в shell-width.test.tsx;
 * - неизвестный `case` разбирает кадр (resolve-case.ts), оболочка его
 *   не проверяет и не подменяет.
 *
 * Каждый случай ниже утверждает СРАЗУ панель И `src` кадра, где это уместно
 * (правило брифа): jsdom не грузит кадр по-настоящему, поэтому «панель
 * показывает прочитанное» и «кадр получил прочитанное» — разные проверки,
 * и схлопнутые состояния («прочитала, но не передала») порознь проходят.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent, within } from '@testing-library/react'
import { Shell } from './shell-app.js'
import { downSpy, frameQuery, frameSid, sendUp } from './test-kit.js'
import { parseFrameUrl } from './frame-url.js'
import { MIRROR_DELAY_MS } from './mirror-url.js'
import type { Envelope, FixtureMeta, Patch } from './protocol.js'

afterEach(cleanup)

/** Открыть оболочку по заданному query — до render, как реальный переход по ссылке. */
const openAt = (search: string): void => {
  window.history.pushState(null, '', `/${search}`)
}

beforeEach(() => {
  window.history.pushState(null, '', '/')
})

const names = () => screen.getByRole('navigation', { name: 'Компоненты' })
const dock = () => screen.getByRole('region', { name: 'Панель' })
const cases = () => within(dock()).getByRole('group', { name: 'Случаи' })
const slotsGroup = () => within(dock()).getByRole('group', { name: 'Позиции' })
const dataGroup = () => within(dock()).getByRole('group', { name: 'Набор данных' })
const themeGroup = () => screen.getByRole('group', { name: 'Тема кадра' })
const scaleGroup = () => screen.getByRole('group', { name: 'Масштаб' })
const isCurrent = (el: HTMLElement) => el.classList.contains('is-current')

describe('адрес оболочки — чтение при старте', () => {
  it('пустой адрес — сегодняшнее умолчание (регрессия)', () => {
    openAt('')
    render(<Shell />)

    // DataTable — пилот фазы 1, действующее умолчание, когда в адресе `c` нет.
    expect(isCurrent(within(names()).getByRole('button', { name: 'DataTable' }))).toBe(true)
    const q = frameQuery()
    expect(q.get('c')).toBe('DataTable')
    expect(q.get('case')).toBeNull()
    // Регрессия — не только `c`/`case`: до задачи `data`/`props`/`slots` в
    // объекте, уходящем в кадр, были хардкодом (`null`/`{}`/`{}`), и это
    // умолчание обязано остаться прежним. `theme`/`scale` — тоже прежние
    // умолчания (light/1), а не что-то, оставшееся от предыдущего теста.
    expect(q.get('theme')).toBe('light')
    expect(q.get('scale')).toBeNull() // buildFrameUrl не пишет scale=1 (frame-url.ts)
    expect(q.get('data')).toBeNull()
    expect([...q.keys()].some((k) => k.startsWith('p.') || k.startsWith('s.'))).toBe(false)
  })

  it('?c=Badge&case=dot — подсвечен Badge, случай dot, и src кадра везёт оба поля', () => {
    openAt('?c=Badge&case=dot')
    render(<Shell />)

    const META: FixtureMeta = {
      name: 'Badge',
      group: 'Отображение',
      cases: [
        { id: 'base', title: 'base', values: {}, slots: {} },
        { id: 'dot', title: 'dot', values: {}, slots: {} },
      ],
      controls: {},
      unexpressed: [],
      data: [],
      slots: {},
    }
    sendUp(frameSid(), { type: 'ready', meta: META })

    // Половина 1 — панель: список компонентов и список случаев дока.
    expect(isCurrent(within(names()).getByRole('button', { name: 'Badge' }))).toBe(true)
    expect(within(cases()).getByRole('button', { name: 'dot' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    // Половина 2 — кадр: то же самое обязано доехать до его src.
    expect(frameQuery().get('c')).toBe('Badge')
    expect(frameQuery().get('case')).toBe('dot')
  })

  it('крутилки/чипы панели показывают прочитанное И src кадра везёт p.*, s.*, data, theme, scale', () => {
    openAt('?p.tone=neutral&s.cell=Badge%3Adot&data=long-cell&theme=dark&scale=1.5')
    render(<Shell />)

    const META: FixtureMeta = {
      name: 'DataTable',
      group: 'Data',
      cases: [{ id: 'base', title: 'base', values: {}, slots: {} }],
      controls: { tone: { kind: 'enum', values: ['neutral', 'error'], prop: true } },
      unexpressed: [],
      data: ['long-cell'],
      slots: { cell: { title: 'Ячейка', accepts: 'inline' } },
    }
    sendUp(frameSid(), { type: 'ready', meta: META })

    // Половина 1 — панель.
    const toneGroup = within(dock()).getByRole('group', { name: 'tone' })
    expect(within(toneGroup).getByRole('button', { name: 'neutral' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(
      within(dataGroup()).getByRole('button', { name: 'long-cell' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(within(slotsGroup()).getByText('Badge:dot')).toBeTruthy()
    // Тема и масштаб кадра — шапка оболочки, не дока.
    expect(
      within(themeGroup()).getByRole('button', { name: 'тьма' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      within(scaleGroup()).getByRole('button', { name: '1.5×' }).getAttribute('aria-pressed'),
    ).toBe('true')

    // Половина 2 — кадр.
    const q = frameQuery()
    expect(q.get('p.tone')).toBe('neutral')
    expect(q.get('s.cell')).toBe('Badge:dot')
    expect(q.get('data')).toBe('long-cell')
    expect(q.get('theme')).toBe('dark')
    expect(q.get('scale')).toBe('1.5')
  })

  /**
   * ШКАЛА ИЗ АДРЕСА — ТРИ СОСТОЯНИЯ, И ОНИ ОБЯЗАНЫ РАЗЛИЧАТЬСЯ (DS-164).
   * Из набора — подсвечен её чип. Не из набора (`1.25`, старый набор, чужая
   * ссылка) — ни один чип набора не подсвечен, И группа говорит, какая шкала
   * действует, словами «не из набора». Молчащая группа без подсвеченного чипа
   * читалась как «масштаб не выбран», хотя кадр рисует на 1.25.
   *
   * Утверждается пара, а не каждый адрес порознь (writing-checks, пункт 6):
   * пометка, стоящая всегда, прошла бы случай 1.25 и провалила бы 1.15.
   */
  it('?scale=1.15 подсвечивает чип 1.15, а ?scale=1.25 — пометку «не из набора», группа живая', () => {
    openAt('?c=Tooltip&case=shown&scale=1.15')
    render(<Shell />)
    const inSet = within(scaleGroup())
    expect(inSet.getByRole('button', { name: '1.15×' }).getAttribute('aria-pressed')).toBe('true')
    expect(isCurrent(inSet.getByRole('button', { name: '1.15×' }))).toBe(true)
    expect(inSet.queryByText(/не из набора/)).toBeNull()
    cleanup()

    openAt('?c=Tooltip&case=shown&scale=1.25')
    render(<Shell />)
    const off = within(scaleGroup())
    const chips = off.getAllByRole('button')
    expect(chips.filter((b) => b.getAttribute('aria-pressed') === 'true')).toEqual([])
    expect(chips.every((b) => !(b as HTMLButtonElement).disabled)).toBe(true)
    const marker = off.getByText('1.25× не из набора')
    // ПОМЕТКА — НЕ НАЖАТЫЙ ЧИП (приёмка DS-164). С `is-current` она по
    // computed style совпадала с нажатым `1.15×` во всём, кроме пунктира цвета
    // заливки на фоне шапки, — то есть глазом читалась как нажатая кнопка.
    // Класс здесь — только половина: что вид действительно различим, мерит
    // живой браузер (`make shell-rhythm`), jsdom каскада не считает.
    expect(marker.classList.contains('wb__chip--foreign')).toBe(true)
    expect(isCurrent(marker)).toBe(false)
    expect(frameQuery().get('scale')).toBe('1.25')

    // Щелчок по чипу набора снимает пометку: действует уже шкала из набора.
    fireEvent.click(off.getByRole('button', { name: '1.15×' }))
    expect(off.queryByText(/не из набора/)).toBeNull()
  })

  /**
   * Задача 28: `force`/`layers` до этого шага стояли в состоянии оболочки
   * ЛИТЕРАЛАМИ (`force: null, layers: []`). Пока форс был мёртв, это было
   * безвредно; с оживлением вставленная в оболочку ссылка на кадр молча
   * теряла бы ровно то поле, ради которого её и копировали, — и молчание тут
   * хуже поломки: на экране обычный кадр, и человек ищет дефект в компоненте.
   *
   * Утверждается ОБА поля разом. Схлопни их в одно — правка, чинящая только
   * `force`, прошла бы незамеченной для `layers`.
   */
  it('?force=hover&layers=tabstops не теряются: src кадра везёт оба', () => {
    openAt('?force=hover&layers=tabstops,axe')
    render(<Shell />)

    const q = frameQuery()
    expect(q.get('force')).toBe('hover')
    expect(q.get('layers')).toBe('tabstops,axe')
  })

  it('?c=Нетакого — имя доезжает до кадра как есть, в списке не подсвечено ничего', () => {
    openAt(`?c=${encodeURIComponent('Нетакого')}`)
    render(<Shell />)

    const buttons = within(names()).getAllByRole('button')
    expect(buttons.some(isCurrent)).toBe(false)
    expect(frameQuery().get('c')).toBe('Нетакого')
  })

  /**
   * Ревью (круг 1, находка 5): «`sid` из адреса игнорируется» держалось только
   * на комментарии — ни один случай не открывал адрес С `sid`, значит
   * `useState(initial.sid || nextSid())` прошёл бы все шесть прежних случаев
   * незамеченным. Открываем ЗАВЕДОМО занятое (по счётчику сессий) значение —
   * `sid=999` — и утверждаем, что кадр получил СВОЙ, отличный от него.
   */
  it('sid из адреса игнорируется — кадр получает свою сессию, а не sid=999 из ссылки', () => {
    openAt('?c=Badge&sid=999')
    render(<Shell />)

    expect(frameSid()).not.toBe(999)
  })
})

describe('адрес оболочки — круговой ход', () => {
  /**
   * Ревью (круг 1, находка 2): открыть адрес с целевыми значениями и тут же
   * разобрать его тем же parseFrameUrl не отличает «оболочка записала» от
   * «адрес просто не трогали» — случай оставался бы зелёным и без единой
   * строки зеркала. Поэтому адрес открывается БЕЗ единого из проверяемых
   * ниже значений (`?c=Badge`, ни case, ни темы, ни масштаба, ни данных, ни
   * крутилок, ни начинок), а нужное состояние набирается кликами через UI —
   * то есть разбирается именно то, что оболочка ЗАПИСАЛА сама.
   */
  it('то, что оболочка ЗАПИСАЛА в адрес (кликами, не из адреса открытия), parseFrameUrl разбирает обратно', () => {
    vi.useFakeTimers()
    try {
      openAt('?c=Badge')
      render(<Shell />)
      act(() => vi.advanceTimersByTime(MIRROR_DELAY_MS)) // спускаем запись начального чтения

      const META: FixtureMeta = {
        name: 'Badge',
        group: 'Отображение',
        cases: [
          { id: 'base', title: 'base', values: {}, slots: {} },
          { id: 'dot', title: 'dot', values: {}, slots: {} },
        ],
        controls: { tone: { kind: 'enum', values: ['neutral', 'error'], prop: true } },
        unexpressed: [],
        data: ['long-cell'],
        slots: { cell: { title: 'Ячейка', accepts: 'inline' } },
      }
      act(() => sendUp(frameSid(), { type: 'ready', meta: META }))

      // Случай — ДО остального: pickCase гасит values/data/selectedSlots
      // новой сессией (resetFrameState), и то, что покручено раньше, стёрлось бы.
      act(() => fireEvent.click(within(cases()).getByRole('button', { name: 'dot' })))
      const sid = frameSid() // новая сессия — новый sid
      act(() => sendUp(sid, { type: 'ready', meta: META }))

      const toneGroup = within(dock()).getByRole('group', { name: 'tone' })
      act(() => fireEvent.click(within(toneGroup).getByRole('button', { name: 'neutral' })))
      act(() => fireEvent.click(within(dataGroup()).getByRole('button', { name: 'long-cell' })))
      act(() => fireEvent.click(within(themeGroup()).getByRole('button', { name: 'тьма' })))
      act(() => fireEvent.click(within(scaleGroup()).getByRole('button', { name: '1.5×' })))

      act(() => fireEvent.click(within(slotsGroup()).getByRole('button', { name: 'пусто' })))
      act(() => sendUp(sid, { type: 'kinds', list: [{ name: 'Badge', kind: 'inline' }] }))
      const picker = within(slotsGroup()).getByRole('group', { name: 'Начинка для Ячейка' })
      act(() => fireEvent.click(within(picker).getByRole('button', { name: 'Badge' })))

      act(() => vi.advanceTimersByTime(MIRROR_DELAY_MS))

      const parsed = parseFrameUrl(window.location.search)
      expect(parsed.c).toBe('Badge')
      expect(parsed.caseId).toBe('dot')
      expect(parsed.theme).toBe('dark')
      expect(parsed.scale).toBe(1.5)
      expect(parsed.data).toBe('long-cell')
      expect(parsed.props).toEqual({ tone: 'neutral' })
      expect(parsed.slots).toEqual({ cell: 'Badge' })
    } finally {
      vi.useRealTimers()
    }
  })
})

/**
 * КРУТИЛКА, КОТОРУЮ СЛУЧАЙ ПЕРЕКРЫВАЕТ, В АДРЕС НЕ ПИШЕТСЯ (DS-164).
 * Ссылка `?case=side-left&p.title=X` обещает заголовок X, а кадр рисует
 * «Парки и филиалы» — то есть ссылка врёт тому, кто её откроет, и выглядит
 * это дефектом компонента.
 *
 * Пара, а не одно утверждение: тот же адрес на случае, который `title` НЕ
 * перекрывает, обязан `p.title` сохранить. Иначе «не пишем в адрес ничего»
 * прошло бы проверку.
 */
describe('адрес оболочки — перекрытые крутилки', () => {
  const meta = (overrides?: string[]): FixtureMeta => ({
    name: 'Drawer',
    group: 'Оверлеи',
    cases: [
      { id: 'open', title: 'open', values: { title: 'Док', side: 'right' }, slots: {} },
      {
        id: 'side-left',
        title: 'side-left',
        values: { title: 'Док', side: 'left' },
        slots: {},
        ...(overrides ? { overrides } : {}),
      },
    ],
    controls: {
      title: { kind: 'text', prop: true },
      side: { kind: 'enum', values: ['left', 'right', 'bottom'], prop: true },
    },
    unexpressed: [],
    data: [],
    slots: {},
  })

  const mirrored = (m: FixtureMeta): URLSearchParams => {
    vi.useFakeTimers()
    try {
      openAt('?c=Drawer&case=side-left&p.title=X&p.side=bottom')
      render(<Shell />)
      act(() => sendUp(frameSid(), { type: 'ready', meta: m }))
      act(() => vi.advanceTimersByTime(MIRROR_DELAY_MS))
      return new URLSearchParams(window.location.search)
    } finally {
      vi.useRealTimers()
    }
  }

  it('перекрытая крутилка из адреса выпадает, соседняя остаётся; без перекрытия остаются обе', () => {
    const dead = mirrored(meta(['title']))
    expect(dead.get('p.title')).toBeNull()
    expect(dead.get('p.side')).toBe('bottom')
    cleanup()

    const live = mirrored(meta())
    expect(live.get('p.title')).toBe('X')
    expect(live.get('p.side')).toBe('bottom')
  })
})

/**
 * ПЕРЕКРЫТАЯ КРУТИЛКА ЗНАЧЕНИЯ НЕ ПОКАЗЫВАЕТ (DS-164, приёмка).
 *
 * `Drawer/side-left`: погашенная `title` показывала в поле «Документ ТК-00417»
 * — значение базы фикстуры, — а кадр рисовал «Парки и филиалы», литерал
 * `render`. С `p.title=X` в адресе к этому добавлялись «изменённые 1»,
 * «≠ кейс · в кейсе: …» и ⟲, хотя `p.title` из адреса уже вычищен. Значение,
 * которое рисует случай, неизвестно — показывать нечего: поле пустое, ни один
 * чип не нажат, флажок `indeterminate`. И `p.*` перекрытой изменением не
 * считается: ни справки, ни ⟲, ни счётчика, ни «сброса».
 *
 * Все четыре вида разом и ПАРОЙ со случаем, который их не перекрывает (п. 6
 * writing-checks): пустое поле на обоих прошло бы и «никогда не показываем
 * значение».
 */
describe('док — перекрытые крутилки без значения', () => {
  const OVER = ['title', 'side', 'count', 'modal']
  const meta: FixtureMeta = {
    name: 'Drawer',
    group: 'Оверлеи',
    cases: [
      { id: 'open', title: 'open', values: { title: 'Док', side: 'right', count: '3', modal: 'true', size: 'm' }, slots: {} },
      {
        id: 'side-left',
        title: 'side-left',
        values: { title: 'Док', side: 'left', count: '3', modal: 'true', size: 'm' },
        slots: {},
        overrides: OVER,
      },
    ],
    controls: {
      title: { kind: 'text', prop: true },
      side: { kind: 'enum', values: ['left', 'right', 'bottom'], prop: true },
      count: { kind: 'number', min: 0, max: 9, prop: true },
      modal: { kind: 'bool', prop: true },
      size: { kind: 'enum', values: ['s', 'm', 'l'], prop: true },
    },
    unexpressed: [],
    data: [],
    slots: {},
  }
  const ADDR = 'p.title=X&p.side=bottom&p.count=7&p.modal=false&p.size=l'

  const open = (kase: string): void => {
    openAt(`?c=Drawer&case=${kase}&${ADDR}`)
    render(<Shell />)
    act(() => sendUp(frameSid(), { type: 'ready', meta }))
  }
  const d = () => within(dock())
  const pressedIn = (name: string) =>
    within(d().getByRole('group', { name }))
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
      .map((b) => b.textContent)

  it('перекрытая: поле пустое, чип не нажат, флажок неопределён; живая соседняя показывает адрес', () => {
    open('side-left')
    expect((d().getByLabelText('title') as HTMLInputElement).value).toBe('')
    expect((d().getByLabelText('count') as HTMLInputElement).value).toBe('')
    expect(pressedIn('side')).toEqual([])
    const modal = d().getByLabelText('modal') as HTMLInputElement
    expect(modal.indeterminate).toBe(true)
    expect(modal.checked).toBe(false)
    expect(pressedIn('size')).toEqual(['l'])
    cleanup()

    // Пара: тот же адрес на случае без перекрытия — значения на месте.
    open('open')
    expect((d().getByLabelText('title') as HTMLInputElement).value).toBe('X')
    expect((d().getByLabelText('count') as HTMLInputElement).value).toBe('7')
    expect(pressedIn('side')).toEqual(['bottom'])
    expect((d().getByLabelText('modal') as HTMLInputElement).indeterminate).toBe(false)
  })

  it('p.* перекрытой — не изменение: счётчик, справка и ⟲ только у живой', () => {
    open('side-left')
    expect(d().getByText('изменённые 1')).toBeTruthy()
    expect(d().getAllByText(/≠ кейс/)).toHaveLength(1)
    expect(d().queryByRole('button', { name: 'Сбросить size к значению кейса' })).not.toBeNull()
    for (const k of OVER) {
      expect(d().queryByRole('button', { name: `Сбросить ${k} к значению кейса` })).toBeNull()
    }
    cleanup()

    open('open')
    expect(d().getByText('изменённые 5')).toBeTruthy()
    expect(d().getAllByText(/≠ кейс/)).toHaveLength(5)
  })

  it('«сброс» перекрытую не трогает: вниз уходит только живая', () => {
    open('side-left')
    const spy = downSpy()
    fireEvent.click(d().getByRole('button', { name: 'сброс' }))
    const sent = spy.mock.calls
      .map(([m]) => (m as Envelope<Patch>).body)
      .filter((b) => b?.type === 'patch' && b.props)
    const keys = new Set(sent.flatMap((b) => Object.keys(b.props ?? {})))
    spy.mockRestore()
    expect(keys.has('size')).toBe(true)
    for (const k of OVER) expect(keys.has(k)).toBe(false)
  })

  /**
   * СЛУЧАЙ БЕЗ ПРОПОВ (`ignoresProps`) — тот же вывод для ВСЕХ крутилок.
   * Причина другая («пропов не берёт»), но поле, показывающее значение,
   * которого на экране нет, врёт независимо от причины. Пара — тот же адрес
   * на обычном случае `open` (он уже утверждён выше: значения на месте,
   * «изменённые 5»).
   */
  it('случай без пропов: все крутилки пустые, изменённых 0, «сброс» вниз ничего не шлёт', () => {
    const blindMeta: FixtureMeta = {
      ...meta,
      cases: [meta.cases[0]!, { ...meta.cases[1]!, overrides: undefined, ignoresProps: true }],
    }
    openAt(`?c=Drawer&case=side-left&${ADDR}`)
    render(<Shell />)
    act(() => sendUp(frameSid(), { type: 'ready', meta: blindMeta }))

    expect((d().getByLabelText('title') as HTMLInputElement).value).toBe('')
    expect((d().getByLabelText('count') as HTMLInputElement).value).toBe('')
    expect(pressedIn('side')).toEqual([])
    expect(pressedIn('size')).toEqual([])
    expect((d().getByLabelText('modal') as HTMLInputElement).indeterminate).toBe(true)
    expect(d().getByText('изменённые 0')).toBeTruthy()
    expect(d().queryByText(/≠ кейс/)).toBeNull()

    const spy = downSpy()
    fireEvent.click(d().getByRole('button', { name: 'сброс' }))
    const props = spy.mock.calls
      .map(([m]) => (m as Envelope<Patch>).body)
      .filter((b) => b?.type === 'patch' && b.props)
    spy.mockRestore()
    expect(props).toEqual([])
    cleanup()

    // Пара: обычный случай — те же значения из адреса видны и считаются.
    openAt(`?c=Drawer&case=open&${ADDR}`)
    render(<Shell />)
    act(() => sendUp(frameSid(), { type: 'ready', meta: blindMeta }))
    expect((d().getByLabelText('title') as HTMLInputElement).value).toBe('X')
    expect(pressedIn('size')).toEqual(['l'])
    expect(d().getByText('изменённые 5')).toBeTruthy()
  })
})

describe('адрес оболочки — зеркало на лету', () => {
  it('смена компонента переписывает адрес окна ПОСЛЕ дебаунса, а не раньше', () => {
    vi.useFakeTimers()
    try {
      openAt('?c=Badge')
      render(<Shell />)
      // Спускаем начальную запись зеркала (эффект срабатывает и на монтировании) —
      // иначе она сама попадёт под то же окно времени, что и клик ниже.
      act(() => vi.advanceTimersByTime(MIRROR_DELAY_MS))

      act(() => fireEvent.click(within(names()).getByRole('button', { name: 'DataTable' })))

      // До срабатывания дебаунса адрес ещё врёт прежним именем.
      expect(new URLSearchParams(window.location.search).get('c')).toBe('Badge')

      act(() => vi.advanceTimersByTime(MIRROR_DELAY_MS))
      expect(new URLSearchParams(window.location.search).get('c')).toBe('DataTable')
    } finally {
      vi.useRealTimers()
    }
  })

  /**
   * Ревью (круг 1, находка 4): Step 2 брифа требует уборку зеркала при
   * размонтировании («как это делает кадр») — но ни один прежний случай не
   * размонтировал `Shell` до срабатывания дебаунса, значит снятие
   * `useEffect(() => () => mirror.current?.stop(), [])` не роняло ничего.
   * `window.setTimeout` внутри `makeMirror` живёт на `window`, а не на дереве
   * React — без явной остановки он переживёт unmount и всё равно перепишет
   * адрес спустя 250 мс.
   */
  it('размонтирование останавливает отложенную запись — адрес не переписывается после ухода со страницы', () => {
    vi.useFakeTimers()
    try {
      openAt('?c=Badge')
      const { unmount } = render(<Shell />)
      act(() => vi.advanceTimersByTime(MIRROR_DELAY_MS)) // спускаем запись начального чтения

      act(() => fireEvent.click(within(names()).getByRole('button', { name: 'DataTable' })))
      const before = window.location.search
      unmount() // до срабатывания дебаунса — запись про смену компонента ещё в очереди

      act(() => vi.advanceTimersByTime(MIRROR_DELAY_MS * 4))
      expect(window.location.search).toBe(before)
    } finally {
      vi.useRealTimers()
    }
  })
})
