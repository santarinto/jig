/**
 * Слой axe, половина «в оболочке» (DS-78).
 *
 * Утверждается пара, как у форса: щелчок обязан дойти И до патча (кадр
 * считает слой), И до вкладки (человек читает список). Схлопнутые состояния
 * порознь проходят — чип выглядит нажатым, потому что оболочка помнит
 * собственный щелчок.
 *
 * Отдельно утверждается то, ради чего задача вообще бралась: ноль нарушений
 * НЕ печатается галочкой. axe ловит меньше трети, и «0» без числа применённых
 * правил читается как «доступность проверена».
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
import { Shell } from './shell-app.js'
import { frameSid, sendUp, downSpy } from './test-kit.js'
import type { FixtureMeta, Patch, A11yViolation } from './protocol.js'

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
const layerChip = (name: string) =>
  within(screen.getByRole('group', { name: 'Слои' })).getByRole('button', { name })

const NAMELESS: A11yViolation = {
  id: 'button-name',
  impact: 'critical',
  help: 'Buttons must have discernible text',
  nodes: [{ node: 'button.ds-btn' }],
}
const LOW: A11yViolation = {
  id: 'empty-heading',
  impact: 'minor',
  help: 'Headings should not be empty',
  nodes: [{ node: 'h2' }],
}

/** Последний патч С ПОЛЕМ `layers` — оболочка копит патч одним объектом. */
const lastLayers = (spy: ReturnType<typeof downSpy>): string[] => {
  const bodies = spy.mock.calls.map((c) => (c[0] as { body: Patch }).body)
  const withLayers = bodies.filter((b) => b && 'layers' in b)
  const found = withLayers[withLayers.length - 1]
  if (!found) throw new Error(`вниз не ушло ни одного патча с layers (всего ${bodies.length})`)
  return found.layers ?? []
}

describe('слой axe в оболочке', () => {
  it('чип включает слой в кадре И открывает вкладку — не одно из двух', () => {
    render(<Shell />)
    ready()
    const spy = downSpy()

    fireEvent.click(layerChip('axe'))

    expect(lastLayers(spy)).toContain('axe')
    expect(screen.getByRole('group', { name: 'axe' })).toBeInTheDocument()
    spy.mockRestore()
  })

  it('вкладка называется axe, а не «Доступность»', () => {
    // Имя вкладки — половина ответа на «зелёный axe ≠ доступность проверена».
    // «Доступность» обещает предмет целиком, axe отвечает за свою треть.
    render(<Shell />)
    ready()

    const tabs = within(dock()).getAllByRole('tab')
    expect(tabs.map((b) => b.textContent)).toContain('axe')
    expect(tabs.map((b) => b.textContent).join(' ')).not.toMatch(/Доступность/)
  })

  it('нарушения приезжают списком в том порядке, в каком их прислал кадр', () => {
    // Порядок задан кадром (critical → minor) и оболочка НЕ ИМЕЕТ ПРАВА его
    // менять: серьёзность кодируется позицией, другого места у неё нет.
    render(<Shell />)
    ready()
    fireEvent.click(layerChip('axe'))
    sendUp(frameSid(), {
      type: 'a11y',
      violations: [NAMELESS, LOW],
      incomplete: [],
      applied: 12,
    })

    const items = within(screen.getByRole('group', { name: 'axe' })).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('button-name'),
      expect.stringContaining('empty-heading'),
    ])
    expect(items[0].textContent).toContain('button.ds-btn')
  })

  it('ноль нарушений печатается вместе с числом применённых правил, а не галочкой', () => {
    render(<Shell />)
    ready()
    fireEvent.click(layerChip('axe'))
    sendUp(frameSid(), { type: 'a11y', violations: [], incomplete: [], applied: 12 })

    const body = screen.getByRole('group', { name: 'axe' })
    expect(body.textContent).toContain('12')
    // Слово «проверено»/«в порядке» здесь запрещено: axe отвечает за треть
    // предмета, а такая подпись обещает предмет целиком.
    expect(body.textContent).not.toMatch(/проверен|в порядке|всё хорошо/i)
  })

  it('нерешённые правила видно отдельно от нуля нарушений', () => {
    // `color-contrast` поверх картинки axe не решает. Слитый с нулём, он
    // превращает «не смог посмотреть» в «посмотрел, всё хорошо».
    render(<Shell />)
    ready()
    fireEvent.click(layerChip('axe'))
    sendUp(frameSid(), {
      type: 'a11y',
      violations: [],
      incomplete: ['color-contrast'],
      applied: 12,
    })

    expect(screen.getByRole('group', { name: 'axe' }).textContent).toContain('color-contrast')
  })

  /**
   * DS-84. Уговор «выключил слой — вернись к панели» писался, когда
   * слоёв было два, и с третьей вкладкой он стал врать: выключение ЛЮБОГО
   * слоя уводило док на «Панель», в том числе с вкладки слоя, который остался
   * включённым. Список axe исчезал из вида по щелчку, к axe не относящемуся.
   *
   * Утверждение — про ПАРУ включённых слоёв, и это не придирка к формулировке:
   * поодиночке оба поведения верны, и смок, гоняющий слои по одному, дефекта
   * не видел вовсе. Различает только случай, где вкладка принадлежит одному
   * слою, а выключают другой.
   *
   * Дальше по коду это ловить нечем: вкладка — состояние оболочки, никакого
   * сообщения вниз выключение не рождает, и снаружи расхождение выглядит как
   * «док почему-то прыгнул».
   */
  const selectedTab = (): string =>
    within(dock())
      .getAllByRole('tab')
      .find((t) => t.getAttribute('aria-selected') === 'true')!
      .textContent ?? ''

  it('выключение таб-стопов не уводит с вкладки axe, пока слой axe включён', () => {
    render(<Shell />)
    ready()
    fireEvent.click(layerChip('таб-стопы'))
    fireEvent.click(layerChip('axe'))
    sendUp(frameSid(), { type: 'a11y', violations: [NAMELESS], incomplete: [], applied: 12 })
    expect(selectedTab()).toMatch(/axe/)

    fireEvent.click(layerChip('таб-стопы'))

    expect(selectedTab()).toMatch(/axe/)
    // Не только вкладка: список обязан остаться НА ЭКРАНЕ. Уцелевшая вкладка
    // с погашенным списком была бы тем же дефектом, просто тише.
    expect(
      within(screen.getByRole('group', { name: 'axe' })).getAllByRole('listitem'),
    ).toHaveLength(1)
  })

  it('выключение axe не уводит с вкладки таб-стопов, пока слой стопов включён', () => {
    render(<Shell />)
    ready()
    fireEvent.click(layerChip('axe'))
    fireEvent.click(layerChip('таб-стопы'))
    expect(selectedTab()).toMatch(/Таб-стопы/)

    fireEvent.click(layerChip('axe'))

    expect(selectedTab()).toMatch(/Таб-стопы/)
  })

  it('выключение слоя СВОЕЙ вкладки по-прежнему возвращает на «Панель»', () => {
    // Вторая половина той же пары: правка не имеет права выключить уговор,
    // она обязана его сузить. Без этой проверки «никогда не уводить» прошло бы.
    render(<Shell />)
    ready()
    fireEvent.click(layerChip('таб-стопы'))
    fireEvent.click(layerChip('axe'))
    expect(selectedTab()).toMatch(/axe/)

    fireEvent.click(layerChip('axe'))

    expect(selectedTab()).toMatch(/Панель/)
  })

  it('выключение слоя гасит список, а не оставляет его от прошлого прогона', () => {
    render(<Shell />)
    ready()
    fireEvent.click(layerChip('axe'))
    sendUp(frameSid(), { type: 'a11y', violations: [NAMELESS], incomplete: [], applied: 12 })
    expect(
      within(screen.getByRole('group', { name: 'axe' })).getAllByRole('listitem'),
    ).toHaveLength(1)

    const spy = downSpy()
    fireEvent.click(layerChip('axe'))

    expect(lastLayers(spy)).not.toContain('axe')
    // Возвращаемся на вкладку руками: выключение слоя уводит док на «Панель»,
    // и список нарушений мог бы спокойно дожить там до следующего включения.
    fireEvent.click(within(dock()).getByRole('tab', { name: 'axe' }))
    const body = screen.getByRole('group', { name: 'axe' })
    expect(within(body).queryAllByRole('listitem')).toHaveLength(0)
    expect(body.textContent).toMatch(/Слой выключен/)
  })

  it('включённый заново слой ждёт свежий отчёт, а не показывает прошлый', () => {
    // Мутация «не гасить отчёт при выключении» первую проверку пережила:
    // пока слой выключен, вкладка и так объясняется словами, и погашен отчёт
    // или нет — снаружи не видно. Видно СЛЕДУЮЩЕЕ включение: до ответа кадра
    // вкладка показала бы нарушения от прошлого превью как свои.
    render(<Shell />)
    ready()
    fireEvent.click(layerChip('axe'))
    sendUp(frameSid(), { type: 'a11y', violations: [NAMELESS], incomplete: [], applied: 12 })

    fireEvent.click(layerChip('axe'))
    fireEvent.click(layerChip('axe'))

    const body = screen.getByRole('group', { name: 'axe' })
    expect(within(body).queryAllByRole('listitem')).toHaveLength(0)
    expect(body.textContent).not.toContain('button-name')
  })

  it('пустой отчёт ВЫКЛЮЧЕННОГО слоя не превращается в «нарушений нет»', () => {
    // Кадр на снятие слоя шлёт пустой отчёт (и правильно делает — молчание
    // оболочка не отличит от «ещё считаем»). Но оболочка уже погасила свой,
    // и приехавший пустой встаёт на место `null`: следующее включение
    // показывает «Нарушений нет. Применилось правил: 0» вместо «Кадр
    // считает…» — то есть ЗЕЛЁНЫЙ ответ про фикстуру, которую в этот раз
    // никто не смотрел.
    render(<Shell />)
    ready()
    fireEvent.click(layerChip('axe'))
    sendUp(frameSid(), { type: 'a11y', violations: [NAMELESS], incomplete: [], applied: 12 })

    fireEvent.click(layerChip('axe'))
    // Вот оно — ответ кадра на снятие слоя, которого прошлая проверка не слала.
    sendUp(frameSid(), { type: 'a11y', violations: [], incomplete: [], applied: 0 })
    fireEvent.click(layerChip('axe'))

    const body = screen.getByRole('group', { name: 'axe' })
    expect(body.textContent).not.toMatch(/Нарушений нет/)
    expect(body.textContent).toMatch(/считает/)
  })

  it('смена компонента гасит отчёт — старые нарушения не приписываются новому', () => {
    // Отчёт принадлежит ДОКУМЕНТУ кадра, как стопы и числа обхода: документ
    // пересоздаётся, а список под новым именем читается как свежий ответ.
    // Хуже стопов: там пустой список безобиден, здесь «axe 3» во вкладке —
    // обвинение не тому компоненту.
    render(<Shell />)
    ready()
    fireEvent.click(layerChip('axe'))
    sendUp(frameSid(), { type: 'a11y', violations: [NAMELESS], incomplete: [], applied: 12 })

    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Компоненты' })).getByRole('button', {
        name: 'Badge',
      }),
    )

    const body = screen.getByRole('group', { name: 'axe' })
    expect(body.textContent).not.toContain('button-name')
    expect(within(body).queryAllByRole('listitem')).toHaveLength(0)
  })

  it('ноль ПРИМЕНЁННЫХ правил — это не «нарушений нет», а «смотреть было нечего»', () => {
    // «Нарушений нет. Применилось правил: 0» на пустом превью — ровно та
    // зелёная проверка, против которой заведён третий разряд.
    render(<Shell />)
    ready()
    fireEvent.click(layerChip('axe'))
    sendUp(frameSid(), { type: 'a11y', violations: [], incomplete: [], applied: 0 })

    const body = screen.getByRole('group', { name: 'axe' })
    expect(body.textContent).not.toMatch(/Нарушений нет/)
  })

  it('вкладка не печатает «0» там, где прогона не было', () => {
    // Счётчик во вкладке — то, что видно, не открывая её. «axe 0» при
    // упавшем прогоне и при нуле применённых правил — та же зелёная ложь,
    // против которой заведены обе ветки тела, только на более заметной
    // половине: тело прочитают, если откроют, а счётчик читают всегда.
    render(<Shell />)
    ready()
    fireEvent.click(layerChip('axe'))

    sendUp(frameSid(), { type: 'a11y', violations: [], incomplete: [], applied: 0 })
    const nothing = within(dock()).getByRole('tab', { name: /axe/ }).textContent
    expect(nothing).not.toMatch(/0/)

    sendUp(frameSid(), {
      type: 'a11y',
      violations: [],
      incomplete: [],
      applied: 0,
      error: 'axe упал',
    })
    const failed = within(dock()).getByRole('tab', { name: /axe/ }).textContent
    expect(failed).not.toMatch(/0/)
    // И два состояния обязаны быть РАЗЛИЧИМЫ между собой: «не смотрели» и
    // «не смогли» — разные ответы, схлопнутые порознь прошли бы оба.
    expect(failed).not.toBe(nothing)
  })

  it('упавший прогон говорит, что упал, а не молчит «считает…» вечно', () => {
    render(<Shell />)
    ready()
    fireEvent.click(layerChip('axe'))
    sendUp(frameSid(), {
      type: 'a11y',
      violations: [],
      incomplete: [],
      applied: 0,
      error: 'axe упал: Cannot read properties of null',
    })

    const body = screen.getByRole('group', { name: 'axe' })
    expect(body.textContent).toMatch(/не смог|упал/i)
    expect(body.textContent).not.toMatch(/считает/)
    expect(body.textContent).not.toMatch(/Нарушений нет/)
  })

  it('«корня нет» и «правил ноль» — РАЗНЫЕ тексты, а не один на два факта', () => {
    // DS-163, второй пункт. До задачи оба печатались как «пустое превью
    // ИЛИ фикстура не отрисовалась»: человек шёл искать в фикстуру, когда
    // искать надо было в кадре, и наоборот. Различие утверждается СРАВНЕНИЕМ
    // двух текстов, а не вхождением слова: проверка на слово прошла бы и
    // тогда, когда второй текст его тоже содержит.
    render(<Shell />)
    ready()
    fireEvent.click(layerChip('axe'))

    sendUp(frameSid(), { type: 'a11y', violations: [], incomplete: [], applied: 0 })
    const empty = screen.getByRole('group', { name: 'axe' }).textContent

    sendUp(frameSid(), {
      type: 'a11y',
      violations: [],
      incomplete: [],
      applied: 0,
      noRoot: true,
    })
    const rootless = screen.getByRole('group', { name: 'axe' }).textContent

    expect(rootless).not.toBe(empty)
    expect(rootless).toMatch(/корн/i)
    // Ни один из двух не имеет права читаться как «проверено, чисто».
    expect(rootless).not.toMatch(/Нарушений нет/)
    expect(empty).not.toMatch(/Нарушений нет/)
  })
})
