/**
 * Канвас со стороны оболочки (DS-128): раскладку и выделение держит она.
 *
 * ГЛАВНОЕ, ЧТО ЗДЕСЬ УТВЕРЖДАЕТСЯ, — решение владельца: выделенная позиция
 * управляет доком. Док при этом НЕ ПЕРЕУСТРОЕН, он получает другой предмет, и
 * проверки написаны так, чтобы поймать именно подмену предмета: те же блоки,
 * другое содержимое.
 *
 * jsdom кадра не исполняет, поэтому здесь нет и не может быть утверждений про
 * то, что нарисовано, — только про то, что оболочка ПОСЛАЛА вниз и что она
 * показала в доке. Отрисовку мест проверяет `frame-canvas.test.tsx`, раскладку
 * на экране — живой прогон.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { Shell } from './shell-app.js'
import { downSpy, frameSid, lastCanvas, lastSelected, sendUp } from './test-kit.js'
import { CANVAS_SPOTS } from './canvas-plan.js'
import { CANVAS_COLS, type FixtureMeta } from './protocol.js'

const meta = (name: string, cases: string[], controls: string[]): FixtureMeta => ({
  name,
  group: 'G',
  cases: cases.map((id) => ({ id, title: id, values: {}, slots: {} })),
  controls: Object.fromEntries(controls.map((k) => [k, { kind: 'bool' as const, prop: true as const }])),
  unexpressed: [],
  data: [],
  slots: {},
})

const A = CANVAS_SPOTS[0]!
const B = CANVAS_SPOTS[1]!

afterEach(cleanup)
// Рабочий канвас автосохраняется (DS-128, [1]), то есть переживает
// `cleanup()` — он в хранилище, а не в дереве. Без этой строки каждый
// следующий кейс файла начинался бы с раскладки, собранной предыдущим, и
// «оболочка открылась с умолчанием» проверялось бы на чужой работе.
beforeEach(() => localStorage.clear())

const view = () => screen.getByRole('group', { name: 'Вид' })
const canvasGroup = () => screen.getByRole('group', { name: 'Канвас' })
const dock = () => screen.getByRole('region', { name: 'Панель' })
const note = () => screen.queryByRole('status', { name: 'Последнее действие с канвасом' })
/**
 * Колонки крутилок своей роли не носят (их несколько, они делят один заголовок
 * «крутилки N»), поэтому ищем по самому доку. Заводить роль ради теста нельзя:
 * разметка изменилась бы под прибор.
 */
const knobs = () => dock()

/**
 * Вход в режим канваса.
 *
 * `ready` ОБЯЗАТЕЛЕН перед патчами: оболочка не шлёт вниз ничего, пока кадр не
 * ответил (`phase !== 'ok'` в shell-frame.tsx). Без него все проверки ниже
 * видели бы пустой список патчей и падали, не дойдя до предмета.
 */
const enterCanvas = (): ReturnType<typeof downSpy> => {
  render(<Shell />)
  sendUp(frameSid(), { type: 'ready', meta: meta('DataTable', ['base'], []) })
  const spy = downSpy()
  fireEvent.click(within(view()).getByRole('button', { name: 'канвас' }))
  return spy
}

describe('канвас в оболочке', () => {
  it('вид «канвас» стоит в переключателе рядом с остальными', () => {
    // Тумблером, а не отдельной кнопкой: виды взаимоисключающие.
    render(<Shell />)
    expect(within(view()).getByRole('button', { name: 'канвас' })).toBeTruthy()
  })

  it('вход в режим сам отправляет раскладку и выделение вниз', () => {
    // ПОЙМАНО ЖИВЫМ ПРОГОНОМ, НЕ ТЕСТОМ, и потому кейс здесь. Первая редакция
    // слала патч только из правок раскладки — при входе в режим вниз не уходило
    // ничего: кадр рисовал своё умолчание, оболочка держала своё выделение, и
    // обводки на экране не было при живом и правильном доке.
    const spy = enterCanvas()
    expect(lastCanvas(spy)?.map((s) => s.id)).toEqual(CANVAS_SPOTS.map((s) => s.id))
    expect(lastSelected(spy)).toBe(A.id)
  })

  it('выделено с самого начала: пустой док читается как поломка', () => {
    // Решение владельца: выделение есть всегда, пока есть хоть одно место.
    const spy = enterCanvas()
    expect(lastSelected(spy)).not.toBeNull()
  })

  it('тычок в место переключает ПРЕДМЕТ дока, а не его устройство', () => {
    const spy = enterCanvas()
    const sid = frameSid()
    sendUp(sid, { type: 'canvas-meta', id: A.id, meta: meta(A.component, ['a1'], ['alpha']) })
    sendUp(sid, { type: 'canvas-meta', id: B.id, meta: meta(B.component, ['b1', 'b2'], ['beta']) })

    expect(within(knobs()).getByTitle('alpha')).toBeTruthy()

    sendUp(sid, { type: 'canvas-pick', id: B.id })

    // Тот же блок крутилок — другое содержимое. Это и есть «док получает другой
    // предмет, а не другую форму».
    expect(within(knobs()).getByTitle('beta')).toBeTruthy()
    expect(within(knobs()).queryByTitle('alpha')).toBeNull()
    expect(lastSelected(spy)).toBe(B.id)
  })

  it('крутилка садится на ВЫДЕЛЕННОЕ место и не трогает соседа', () => {
    // Тот самый дефект, ради которого крутилки живут в месте: раздача их всем
    // разом уронила бы крутилку одного компонента в другой.
    const spy = enterCanvas()
    const sid = frameSid()
    sendUp(sid, { type: 'canvas-meta', id: A.id, meta: meta(A.component, ['a1'], ['alpha']) })
    sendUp(sid, { type: 'canvas-meta', id: B.id, meta: meta(B.component, ['b1'], ['alpha']) })
    sendUp(sid, { type: 'canvas-pick', id: B.id })

    fireEvent.click(within(knobs()).getByRole('checkbox', { name: 'alpha' }))

    const sent = lastCanvas(spy)
    expect(sent?.find((s) => s.id === B.id)?.props).toEqual({ alpha: 'true' })
    // Имя крутилки НАМЕРЕННО одно и то же у обоих мест: разные имена прошли бы
    // и при раздаче пропсов всем разом.
    expect(sent?.find((s) => s.id === A.id)?.props).toEqual({})
  })

  it('док ПОКАЗЫВАЕТ значения выделенного места, а не чужие', () => {
    // Дыра, найденная мутацией: соседний кейс проверял только то, что ушло
    // ВНИЗ, и подмена `dockValues` на крутилки одиночного компонента его
    // переживала. Между тем показанное положение крутилки — половина ответа:
    // покрути на одном месте, перейди на другое — и там она обязана стоять
    // по-своему, иначе человек правит то, чего не видит.
    enterCanvas()
    const sid = frameSid()
    sendUp(sid, { type: 'canvas-meta', id: A.id, meta: meta(A.component, ['a1'], ['alpha']) })
    sendUp(sid, { type: 'canvas-meta', id: B.id, meta: meta(B.component, ['b1'], ['alpha']) })
    sendUp(sid, { type: 'canvas-pick', id: B.id })

    fireEvent.click(within(knobs()).getByRole('checkbox', { name: 'alpha' }))
    expect(within(knobs()).getByRole('checkbox', { name: 'alpha' })).toHaveProperty('checked', true)

    sendUp(sid, { type: 'canvas-pick', id: A.id })
    expect(within(knobs()).getByRole('checkbox', { name: 'alpha' })).toHaveProperty(
      'checked',
      false,
    )

    sendUp(sid, { type: 'canvas-pick', id: B.id })
    expect(within(knobs()).getByRole('checkbox', { name: 'alpha' })).toHaveProperty('checked', true)
  })

  it('смена случая у места не пересоздаёт сессию', () => {
    // У одиночного кадра пересоздание неизбежно — другой набор пропсов от кейса
    // на всю фикстуру. Здесь кадр перерисовывает ОДНО место, а соседние
    // компоненты обязаны сохранить живое состояние: открытый Combobox, скролл
    // таблицы. Пересоздание гасило бы весь собранный экран.
    enterCanvas()
    const sid = frameSid()
    sendUp(sid, { type: 'canvas-meta', id: A.id, meta: meta(A.component, ['a1', 'a2'], []) })
    const cases = within(dock()).getByRole('group', { name: 'Случаи' })

    fireEvent.click(within(cases).getByRole('button', { name: /a2/ }))

    expect(frameSid()).toBe(sid)
  })

  it('добавление ставит место с читаемым именем и сразу его выделяет', () => {
    // Имя от компонента, а не случайное: его видно в прицеле и в выгруженном
    // файле, и `datatable-2` человек читает, а `k3f9` — нет. Выделяется сразу,
    // потому что док обязан говорить про то, что человек только что сделал.
    const spy = enterCanvas()
    fireEvent.click(within(canvasGroup()).getByRole('button', { name: /^\+/ }))

    const sent = lastCanvas(spy)
    expect(sent).toHaveLength(CANVAS_SPOTS.length + 1)
    const added = sent?.[sent.length - 1]
    expect(added?.id).toMatch(/^[a-z]/)
    expect(lastSelected(spy)).toBe(added?.id)
  })

  it('повторное добавление того же компонента не даёт двух мест с одним именем', () => {
    // Два места с одним именем получили бы одни крутилки на двоих, и разбор
    // выбросил бы второе — то есть добавление молча не сработало бы.
    const spy = enterCanvas()
    const add = within(canvasGroup()).getByRole('button', { name: /^\+/ })
    fireEvent.click(add)
    fireEvent.click(add)

    const ids = lastCanvas(spy)?.map((s) => s.id) ?? []
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('удаление уводит выделение на соседа, а не гасит его', () => {
    // Пустой док читается как поломка панели, а не как «никто не выделен».
    const spy = enterCanvas()
    sendUp(frameSid(), { type: 'canvas-pick', id: A.id })

    fireEvent.click(within(canvasGroup()).getByRole('button', { name: 'убрать' }))

    expect(lastCanvas(spy)?.map((s) => s.id)).toEqual([B.id])
    expect(lastSelected(spy)).toBe(B.id)
  })

  it('удаление последнего места гасит выделение — вот тут это правда', () => {
    const spy = enterCanvas()
    const drop = within(canvasGroup()).getByRole('button', { name: 'убрать' })
    fireEvent.click(drop)
    fireEvent.click(drop)

    expect(lastCanvas(spy)).toEqual([])
    expect(lastSelected(spy)).toBeNull()
    expect(within(canvasGroup()).getByRole('button', { name: 'убрать' })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('потолки колонки и ширины считаются друг от друга — ошибиться не дают', () => {
    // Пара, вылезающая за правый край, отвергается разбором. Дать её набрать
    // значило бы показать человеку отказ там, где можно было не дать ошибиться.
    //
    // ПОРЯДОК ДЕЙСТВИЙ ЗДЕСЬ НЕ СЛУЧАЕН, и до [4] ручного QA он был обратным.
    // Умолчание — во всю ширину (span 12), и у такого места колонка может быть
    // только первой: потолок колонки равен 1, это правда про сетку, а не
    // придирка. Чтобы место подвинуть, его сначала сужают. Прежняя редакция
    // позволяла набрать колонку 10 при ширине 12 — пару, которую `parseSpots`
    // выбрасывает, то есть место пропадало с канваса (пункт А ревью).
    enterCanvas()
    const col = screen.getByLabelText('колонка') as HTMLInputElement
    const span = screen.getByLabelText('ширина') as HTMLInputElement

    expect(Number(col.max)).toBe(1)

    fireEvent.change(span, { target: { value: '3' } })

    expect(Number(col.max)).toBe(10)
    expect(Number(span.max)).toBe(12)
  })
  it('блок JSX на канвасе отдаёт ВЕСЬ набор в контейнере сетки, а не выделенное место', () => {
    // Тот самый шаг 7. Мутация, которую это ловит: оставить доку прежний
    // сниппет выделенного места. Он бы прошёл любую проверку про DataTable —
    // потому и утверждается СОСЕД, которого в выделенном месте нет.
    enterCanvas()
    const sid = frameSid()
    sendUp(sid, { type: 'canvas-meta', id: A.id, meta: meta(A.component, [A.caseId], []) })
    sendUp(sid, { type: 'canvas-meta', id: B.id, meta: meta(B.component, [B.caseId], []) })

    const jsx = dock().querySelector('.wb__dock-jsx')?.textContent ?? ''
    expect(jsx).toContain(`<${A.component} />`)
    expect(jsx).toContain(`<${B.component} />`)
    // Без контейнера вставленный набор встал бы столбиком: сетка — половина
    // того, что человек собрал.
    expect(jsx).toContain("display: 'grid'")
  })

  it('свой render у ВЫДЕЛЕННОГО места не уносит с собой кнопку копирования набора', () => {
    // У одиночного кадра свой render гасит кнопку целиком — копировать нечего.
    // На канвасе предмет копирования другой: набор. Перенести сюда то же
    // правило значило бы отнять копию всего экрана из-за одного места, и
    // выглядело бы это как «кнопка пропадает, когда ткнёшь не туда».
    enterCanvas()
    const sid = frameSid()
    sendUp(sid, {
      type: 'canvas-meta',
      id: A.id,
      meta: {
        ...meta(A.component, [], []),
        cases: [{ id: A.caseId, title: 'Все тона', values: {}, ownRender: true, slots: {} }],
      },
    })
    sendUp(sid, { type: 'canvas-meta', id: B.id, meta: meta(B.component, [B.caseId], []) })

    expect(within(dock()).getByRole('button', { name: 'скопировать' })).toBeTruthy()
    const jsx = dock().querySelector('.wb__dock-jsx')?.textContent ?? ''
    expect(jsx).toContain(`<${B.component} />`)
    expect(jsx).toContain('своя разметка')
  })

  it('пустой канвас не даёт копировать пустоту: кнопка неактивна', () => {
    // Активная кнопка на пустом канвасе скопировала бы пустую строку и
    // показала галочку — успех, которого не было. То же правило, что у
    // пустой панели одиночного кадра.
    enterCanvas()
    const drop = within(canvasGroup()).getByRole('button', { name: 'убрать' })
    fireEvent.click(drop)
    fireEvent.click(drop)

    expect(within(dock()).getByRole('button', { name: 'скопировать' })).toBeDisabled()
    expect(dock().querySelector('.wb__dock-jsx')).toBeNull()
  })
  it('набор, где ни одна фикстура не загрузилась, копировать нечем', () => {
    // Кнопка гаснет на пустом канвасе — а набор из одних отказов даёт непустую
    // строку из контейнера и объяснений, и кнопка оставалась живой. Клик
    // копировал бы сетку без единого компонента и показывал галочку — успех,
    // которого не было. Довод дословно тот же, что записан в `dock.tsx` двумя
    // экранами выше; код его не покрывал.
    enterCanvas()
    const sid = frameSid()
    sendUp(sid, { type: 'canvas-meta', id: A.id, meta: null })
    sendUp(sid, { type: 'canvas-meta', id: B.id, meta: null })

    expect(within(dock()).getByRole('button', { name: 'скопировать' })).toBeDisabled()
    // Объяснения при этом остаются на экране: человеку надо видеть, ПОЧЕМУ
    // копировать нечего, а не пустой блок.
    expect(dock().querySelector('.wb__dock-jsx')?.textContent).toContain('фикстура не загрузилась')
  })
})

/**
 * ПЕРЕОПРЕДЕЛЕНИЕ, РАВНОЕ ЗНАЧЕНИЮ СЛУЧАЯ, — НЕ ПЕРЕОПРЕДЕЛЕНИЕ.
 *
 * Найдено ЖИВЫМ ПРОГОНОМ при перепроверке наводки про «залипание признака
 * расходится с сохранённым» (разбор 30.08.2026 предполагал промах мимо
 * чекбокса из-за [14] — версия не подтвердилась, причина другая и настоящая).
 *
 * `props` места — это ПЕРЕОПРЕДЕЛЕНИЯ поверх случая. Крутилка писала ключ
 * всегда, в том числе когда её вернули к значению случая: в наборе «заказ»
 * лежало `{widths, wrapCity}`, а после «включил dense и выключил обратно» на
 * канвасе становилось `{widths, wrapCity, dense: 'false'}` — на экране то же
 * самое, в хранилище другое. `sameSpots` сравнивает число ключей, и признак
 * «расходится с сохранённым» загорался НАВСЕГДА на раскладке, которая не
 * менялась. Заодно каждый такой ключ уезжал в выгруженный файл.
 *
 * Панель это различие УЖЕ знает: счётчик «изменено N» и пометка «≠ кейс» в
 * строке считаются от `values[k] !== caseValues[k]`. Не знало только хранилище,
 * и правка убирает расхождение, а не заводит новое правило.
 */
describe('крутилки места', () => {
  // Случай называется ТЕМ ЖЕ ИМЕНЕМ, что у места в умолчании канваса: значения
  // случая панель берёт по `pickedSpot.caseId`, и случай с другим id дал бы
  // пустые `caseValues` — проверка «ключ убран» стала бы про отсутствие
  // значений, а не про совпадение с ними.
  const withDense = (component: string): FixtureMeta => ({
    ...meta(component, [A.caseId], ['dense']),
    cases: [{ id: A.caseId, title: A.caseId, values: { dense: 'false' }, slots: {} }],
  })

  const denseBox = (): HTMLInputElement => within(knobs()).getByLabelText('dense') as HTMLInputElement

  it('возврат крутилки к значению случая убирает ключ, а не пишет его', () => {
    const spy = enterCanvas()
    sendUp(frameSid(), { type: 'canvas-meta', id: A.id, meta: withDense(A.component) })

    fireEvent.click(denseBox())
    expect(lastCanvas(spy)?.find((s) => s.id === A.id)?.props).toEqual({ dense: 'true' })

    fireEvent.click(denseBox())
    expect(lastCanvas(spy)?.find((s) => s.id === A.id)?.props).toEqual({})
  })

  it('значение, отличное от случая, ключ пишет — иначе крутилка не работала бы вовсе', () => {
    const spy = enterCanvas()
    sendUp(frameSid(), { type: 'canvas-meta', id: A.id, meta: withDense(A.component) })

    fireEvent.click(denseBox())

    expect(lastCanvas(spy)?.find((s) => s.id === A.id)?.props).toEqual({ dense: 'true' })
  })
})

/**
 * ЧТО СКАЗАНО ПРО ДОБАВЛЕНИЕ И УДАЛЕНИЕ МЕСТА ([9] ручного QA, DS-128).
 *
 * Место встаёт в КОНЕЦ раскладки, то есть у высокого канваса за нижним краем
 * кадра. Прокрутку к нему делает кадр (`frame-canvas.test.tsx`), но её одной
 * мало: прокрутка отвечает «вот оно», а на вопрос «сколько их теперь» отвечает
 * только счёт. Человек, нажавший «+ DataTable» дважды, обязан узнать об этом от
 * верстака, а не пересчитывая места глазами.
 */
describe('строка состояния про места', () => {
  it('добавление называет место и счёт', () => {
    enterCanvas()
    fireEvent.click(screen.getByRole('button', { name: '+ DataTable' }))

    expect(note()).toHaveTextContent('datatable')
    expect(note()).toHaveTextContent('мест: 3')
  })

  it('удаление называет убранное место, а не только счёт', () => {
    // «мест: 1» без имени не отличает «убрал не то» от «убрал что хотел».
    enterCanvas()
    fireEvent.click(screen.getByRole('button', { name: 'убрать' }))

    expect(note()).toHaveTextContent(A.id)
    expect(note()).toHaveTextContent('мест: 1')
  })

  it('на пустом канвасе счёт называется словом, а не нулём', () => {
    enterCanvas()
    fireEvent.click(screen.getByRole('button', { name: 'убрать' }))
    fireEvent.click(screen.getByRole('button', { name: 'убрать' }))

    expect(note()).toHaveTextContent('канвас пуст')
  })
})

/**
 * ЧИСЛОВЫЕ ПОЛЯ РАСКЛАДКИ ([4] ручного QA, DS-128).
 *
 * Было `Number(e.target.value) || 1` на КАЖДЫЙ ввод. Стереть поле, чтобы
 * набрать заново, не получалось: пустая строка тут же превращалась в `1`, и
 * набранное дописывалось К НЕЙ — «12» давало 112. То есть поле мешало набрать
 * ровно то, ради чего его и стирают.
 *
 * Здесь же закрывается пункт А кодового ревью 30.08.2026: `min`/`max` у
 * `input type=number` ничего не запрещают НАБРАТЬ, и `-3` доезжал до раскладки,
 * хранилища и файла — а обратно этот файл `parseFile` уже не читал, то есть
 * ломалось первое смягчение спеки. Прижатие на blur закрывает эту дверь
 * ПОСТРОЕНИЕМ: негодное значение просто не уезжает.
 */
describe('числовые поля раскладки', () => {
  const colField = (): HTMLInputElement =>
    within(canvasGroup()).getByLabelText('колонка') as HTMLInputElement
  const spanField = (): HTMLInputElement =>
    within(canvasGroup()).getByLabelText('ширина') as HTMLInputElement

  it('стёртое поле остаётся стёртым, а не подставляет минимум на каждый ввод', () => {
    enterCanvas()
    fireEvent.change(colField(), { target: { value: '' } })

    expect(colField().value).toBe('')
  })

  it('годное значение уезжает вниз сразу, не дожидаясь ухода из поля', () => {
    // Ждать blur целиком значило бы отнять живой отклик: раскладку двигают,
    // глядя на кадр, а не на поле.
    const spy = enterCanvas()
    fireEvent.change(spanField(), { target: { value: '6' } })

    expect(lastCanvas(spy)?.find((s) => s.id === A.id)?.span).toBe(6)
  })

  it('уход из стёртого поля возвращает то, что на канвасе', () => {
    // Не минимум: на канвасе лежит последнее годное значение, и подставить
    // вместо него единицу значило бы молча подвинуть место, которое человек
    // не трогал — он только передумал набирать.
    //
    // КОЛОНКУ ПРИХОДИТСЯ СНАЧАЛА СДВИНУТЬ, и это не церемония: умолчание стоит
    // в колонке 1, то есть РОВНО НА МИНИМУМЕ, и «вернулось текущее» было бы
    // неотличимо от «подставился минимум». Мутация `return min` такую проверку
    // переживала — поймано ею же.
    enterCanvas()
    fireEvent.change(spanField(), { target: { value: '4' } })
    fireEvent.change(colField(), { target: { value: '3' } })

    fireEvent.change(colField(), { target: { value: '' } })
    fireEvent.blur(colField())

    expect(colField().value).toBe('3')
  })

  it('значение вне диапазона прижимается на выходе из поля', () => {
    const spy = enterCanvas()
    fireEvent.change(spanField(), { target: { value: '99' } })
    fireEvent.blur(spanField())

    expect(spanField().value).toBe(String(CANVAS_COLS))
    expect(lastCanvas(spy)?.find((s) => s.id === A.id)?.span).toBe(CANVAS_COLS)
  })

  it('отрицательная колонка до раскладки не доезжает вовсе', () => {
    // Пункт А ревью: `editSpot` писал что дали, и место с `col: -3` уходило в
    // хранилище и в файл, который `parseFile` обратно НЕ читает.
    const spy = enterCanvas()
    fireEvent.change(colField(), { target: { value: '-3' } })
    const mid = lastCanvas(spy)?.find((s) => s.id === A.id)?.col
    fireEvent.blur(colField())

    expect(mid).toBe(A.col)
    expect(lastCanvas(spy)?.find((s) => s.id === A.id)?.col).toBe(1)
  })

  it('поле показывает значение выделенного места, а не то, что набирали в прошлом', () => {
    // Своё состояние поля обязано сбрасываться при смене выделения: иначе на
    // соседнем месте стоит чужой недобранный текст, а кадр показывает своё.
    enterCanvas()
    fireEvent.change(colField(), { target: { value: '' } })
    sendUp(frameSid(), { type: 'canvas-pick', id: B.id })

    expect(colField().value).toBe(String(B.col))
  })
})
