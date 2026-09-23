/**
 * Хранение раскладок канваса со стороны оболочки (DS-128, шаг 5).
 *
 * Чистый модуль `canvas-store.ts` проверен своим набором — ключи, разбор
 * мусора, формат файла. Здесь проверяется РОВНО ТО, ЧЕГО ТАМ НЕТ: что оболочка
 * этот модуль действительно позвала, что прочитанное доехало ВНИЗ до кадра и
 * что человеку про всё это сказали словами. Модуль, который никто не вызывает,
 * проходит свои двадцать пять проверок и не работает — этим шаг 5 и был
 * наполовину сделан.
 *
 * ЧЕГО ЗДЕСЬ НЕТ И БЫТЬ НЕ МОЖЕТ. jsdom кадра не исполняет: про то, что места
 * НАРИСОВАЛИСЬ по загруженной раскладке, здесь не утверждается ничего — это
 * `frame-canvas.test.tsx` и живой прогон. Утверждается «оболочка послала» и
 * «оболочка показала».
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within, act, waitFor } from '@testing-library/react'
import { Shell } from './shell-app.js'
import { downSpy, frameSid, lastCanvas, lastSelected, sendUp } from './test-kit.js'
import { CANVAS_SPOTS } from './canvas-plan.js'
import { CANVAS_DRAFT_KEY, canvasKey, toFileText } from './canvas-store.js'
import { NOTE_MS } from './note-life.js'
import { CANVAS_COLS, type CanvasSpot, type FixtureMeta } from './protocol.js'

const META: FixtureMeta = {
  name: 'DataTable',
  group: 'Data',
  cases: [{ id: 'base', title: 'base', values: {}, slots: {} }],
  controls: {},
  unexpressed: [],
  data: [],
  slots: {},
}

const spot = (id: string, component = 'Pagination'): CanvasSpot => ({
  id,
  component,
  caseId: 'base',
  col: 1,
  span: CANVAS_COLS,
  props: {},
  data: null,
})

afterEach(cleanup)
beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  window.history.pushState(null, '', '/')
})

const view = () => screen.getByRole('group', { name: 'Вид' })
const sets = () => screen.getByRole('group', { name: 'Наборы' })
const note = () => screen.queryByRole('status', { name: 'Последнее действие с канвасом' })
const nameField = (): HTMLInputElement => screen.getByLabelText('набор') as HTMLInputElement
/**
 * Горит ли признак «расходится с сохранённым».
 *
 * ПО МОДИФИКАТОРУ, А НЕ ПО НАЛИЧИЮ УЗЛА. С [13] ручного QA узел стоит в
 * разметке всегда — иначе его появление сдвигало бы всё правее на ~110px, и
 * целиться приходилось бы в движущуюся мишень. Гасится он `visibility`, а его
 * jsdom не считает: `queryByText` найдёт погашенный признак так же, как
 * горящий, и проверка «признак молчит» была бы зелена всегда.
 */
const driftOn = (): boolean => {
  const el = sets().querySelector('.wb__drift')
  if (!el) throw new Error('узла признака расхождения нет в разметке')
  return !el.className.includes('wb__drift--off')
}
const btn = (name: string) => within(sets()).getByRole('button', { name })
const fileField = (): HTMLInputElement => {
  const el = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!el) throw new Error('поля выбора файла нет в разметке')
  return el
}

/** Вход в режим канваса. `ready` обязателен: до него оболочка вниз не шлёт. */
const enterCanvas = (): ReturnType<typeof downSpy> => {
  render(<Shell />)
  sendUp(frameSid(), { type: 'ready', meta: META })
  const spy = downSpy()
  fireEvent.click(within(view()).getByRole('button', { name: 'канвас' }))
  return spy
}

const typeName = (name: string): void => {
  fireEvent.change(nameField(), { target: { value: name } })
}

/** Положить набор в хранилище мимо интерфейса — как это сделала бы соседняя вкладка. */
const put = (name: string, raw: string): void => localStorage.setItem(canvasKey(name), raw)

/** Текст `Blob`. Через `FileReader`: `Blob.text()` в jsdom 25 не реализован. */
const readBlob = (b: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : '')
    r.onerror = () => reject(new Error('blob не прочитался'))
    r.readAsText(b)
  })

describe('наборы раскладок в оболочке', () => {
  it('группа «Наборы» есть на канвасе и её нет в виде «кадр»', () => {
    // Группа относится к ВИДУ целиком, а не к выделенному месту: в виде «кадр»
    // ей нечего называть, и погашенная она предлагала бы сохранить то, чего
    // человек в этот момент не собирает.
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: META })
    expect(screen.queryByRole('group', { name: 'Наборы' })).toBeNull()

    fireEvent.click(within(view()).getByRole('button', { name: 'канвас' }))
    expect(screen.getByRole('group', { name: 'Наборы' })).toBeTruthy()
  })

  it('без имени сохранять нечем: кнопка погашена, пробелы именем не считаются', () => {
    // Пустое имя дало бы ключ `ds-wb/canvas/` — тот единственный общий ключ, от
    // которого уводит смягчение №2 спеки: все безымянные наборы затирали бы
    // друг друга, и выглядело бы это как «не сохранилось».
    enterCanvas()
    expect(btn('сохранить')).toBeDisabled()

    typeName('  ')
    expect(btn('сохранить')).toBeDisabled()

    typeName('экран заказа')
    expect(btn('сохранить')).toBeEnabled()
  })

  it('сохранение кладёт раскладку в хранилище и заводит чип загрузки', () => {
    // Пара утверждений, а не одно: запись без чипа — набор, который некуда
    // открыть, чип без записи — чип, который откроет пустоту.
    enterCanvas()
    typeName('экран')
    fireEvent.click(btn('сохранить'))

    const raw = localStorage.getItem(canvasKey('экран'))
    expect(raw, 'в хранилище ничего не легло').toBeTruthy()
    expect(JSON.parse(raw!).spots.map((s: CanvasSpot) => s.id)).toEqual(
      CANVAS_SPOTS.map((s) => s.id),
    )
    expect(btn('Загрузить набор «экран»')).toBeTruthy()
    expect(note()).toHaveTextContent('сохранён')
  })

  it('занятое имя меняет слово на кнопке — перезапись не молчит', () => {
    enterCanvas()
    typeName('экран')
    fireEvent.click(btn('сохранить'))
    expect(within(sets()).queryByRole('button', { name: 'сохранить' })).toBeNull()
    expect(btn('перезаписать')).toBeTruthy()

    typeName('экран-2')
    expect(btn('сохранить')).toBeTruthy()
  })

  it('отказ хранилища назван вслух и не выдан за сохранение', () => {
    // Квота, приватное окно, запрещённые данные сайта. Проглотить `false`
    // здесь значило бы сказать «сохранено» и потерять работу — то самое, чем
    // и так дорого выбранное владельцем хранение.
    enterCanvas()
    // Заглушка вешается на САМ объект хранилища, а не на `Storage.prototype`:
    // в этом прогоне `localStorage` — подмена из `vitest.setup.ts` (node 26
    // прячет родной), и прототипа `Storage` в её цепочке нет. Через прототип
    // заглушка не сработала бы и не упала — проверка стала бы зелёной, ничего
    // не проверив.
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    typeName('экран')
    fireEvent.click(btn('сохранить'))

    expect(note()).toHaveTextContent('НЕ сохранён')
    expect(note()).not.toHaveTextContent('«экран» сохранён')
    expect(note()).toHaveTextContent('хранилище отказало')
  })

  it('загрузка заменяет раскладку, уводит её вниз и выделяет первое место', () => {
    // ВНИЗ — половина утверждения, и без неё проверка зелена при мёртвом
    // канвасе: оболочка помнила бы свой набор, а кадр рисовал бы прежний.
    put('экран', toFileText('экран', [spot('a'), spot('b')]))
    const spy = enterCanvas()
    fireEvent.click(btn('Загрузить набор «экран»'))

    expect(lastCanvas(spy)?.map((s) => s.id)).toEqual(['a', 'b'])
    expect(lastSelected(spy)).toBe('a')
    expect(nameField().value).toBe('экран')
  })

  it('испорченный набор даёт ПУСТОЙ канвас и называет каждое потерянное место', () => {
    // Смягчение №3 спеки дословно: разбор чужого и испорченного значения
    // отвечает пустым канвасом С ОБЪЯСНЕНИЕМ, а не белым экраном.
    //
    // Сказать об этом обязана ОБОЛОЧКА. Полоса кадра объясняет раскладку,
    // которую ему дали, а вниз уезжают уже отобранные места — кадру про
    // выброшенные сообщить нечем, и молчание было бы полное.
    // Версия в обёртке настоящая: без неё разбор ответил бы про формат и до
    // мест не дошёл — проверка утверждала бы уже не то, ради чего написана.
    put('битый', JSON.stringify({ v: 1, name: 'битый', spots: [{ id: 'a' }, { component: 'X' }] }))
    const spy = enterCanvas()
    fireEvent.click(btn('Загрузить набор «битый»'))

    expect(lastCanvas(spy)).toEqual([])
    expect(lastSelected(spy)).toBeNull()
    expect(note()).toHaveTextContent('отброшено 2')
    // Поимённо, а не счётчиком: по этим строкам правят файл в репозитории.
    expect(note()).toHaveTextContent('место №1')
    expect(note()).toHaveTextContent('нет компонента (component)')
    expect(note()).toHaveTextContent('место №2')
    expect(note()).toHaveTextContent('нет имени (id)')
  })

  it('не-JSON в хранилище объяснён, а не показан белым экраном', () => {
    put('чужой', 'абырвалг')
    const spy = enterCanvas()
    fireEvent.click(btn('Загрузить набор «чужой»'))

    expect(lastCanvas(spy)).toEqual([])
    expect(note()).toHaveTextContent('не читается как JSON')
  })

  it('загрузку можно вернуть: собранный экран не теряется от одного щелчка', () => {
    // Загрузка — единственное действие шага, стирающее собранный экран одним
    // щелчком, и чип этот стоит в ряду похожих. Возврат живёт в самой полосе,
    // а не отдельной кнопкой в группе: кнопка на месте предлагала бы вернуть
    // раскладку и через полчаса после загрузки, то есть стереть уже новую
    // работу.
    put('экран', toFileText('экран', [spot('a')]))
    const spy = enterCanvas()
    const before = lastCanvas(spy)!.map((s) => s.id)
    fireEvent.click(btn('Загрузить набор «экран»'))
    expect(lastCanvas(spy)?.map((s) => s.id)).toEqual(['a'])

    fireEvent.click(within(note()!).getByRole('button', { name: 'вернуть прежнюю' }))
    expect(lastCanvas(spy)?.map((s) => s.id)).toEqual(before)
    expect(lastSelected(spy)).toBe(CANVAS_SPOTS[0]!.id)
  })

  it('раскладка, разошедшаяся с сохранённой, говорит об этом — и замолкает после перезаписи', () => {
    // Замечание владельца 30.08.2026: «сохранить» есть, «вернуть прежнюю» есть,
    // а «на экране уже не то, что сохранено» не говорил никто — полоса
    // продолжала показывать «набор сохранён, мест 3» после того, как места
    // подвинули. Работа, разошедшаяся с сохранённой молча, — ровно та потеря,
    // которой цена выбранного хранения и так велика.
    enterCanvas()
    typeName('экран-заказа')
    fireEvent.click(btn('сохранить'))
    expect(driftOn()).toBe(false)

    // Двигаем выделенное место — раскладка разошлась.
    fireEvent.change(screen.getByLabelText('ширина'), { target: { value: '6' } })
    expect(driftOn()).toBe(true)

    fireEvent.click(btn('перезаписать'))
    expect(driftOn()).toBe(false)
  })

  it('признак молчит, пока такого имени в хранилище нет: расходиться не с чем', () => {
    // Без этой половины признак прошёл бы и приклеенным всегда, когда имя
    // непусто, — то есть «расходится» стояло бы над несохранённым канвасом,
    // где расходиться не с чем и сообщать нечего.
    enterCanvas()
    typeName('которого-нет')
    expect(driftOn()).toBe(false)
  })

  it('возврат к сохранённым значениям СНИМАЕТ признак, а не оставляет его до перезаписи', () => {
    // Дыра, которую ловит: признак, взведённый однажды флагом «трогали», не
    // погас бы, когда человек вернул ширину обратно. Он обязан говорить про
    // РАЗНИЦУ, а не про факт правки.
    enterCanvas()
    typeName('экран-заказа')
    fireEvent.click(btn('сохранить'))

    const span = screen.getByLabelText('ширина')
    fireEvent.change(span, { target: { value: '6' } })
    expect(driftOn()).toBe(true)

    fireEvent.change(span, { target: { value: String(CANVAS_COLS) } })
    expect(driftOn()).toBe(false)
  })

  it('«забыть» освобождает имя и погашено, пока набора с таким именем нет', () => {
    // Освободить имя обязано быть чем: `listSets` показывает и нечитаемый
    // набор именно потому, что иначе он занимал бы имя без способа его снять.
    put('экран', toFileText('экран', [spot('a')]))
    enterCanvas()
    expect(btn('забыть')).toBeDisabled()

    typeName('экран')
    expect(btn('забыть')).toBeEnabled()
    fireEvent.click(btn('забыть'))

    expect(localStorage.getItem(canvasKey('экран'))).toBeNull()
    expect(within(sets()).queryByRole('button', { name: 'Загрузить набор «экран»' })).toBeNull()
    expect(note()).toHaveTextContent('забыт')
  })

  it('выгрузка отдаёт тот же текст, который читается обратно, и своё имя файла', async () => {
    // Смягчение №1 спеки: файл в формате, КОТОРЫЙ ЧИТАЕТСЯ ОБРАТНО. Проверяется
    // не «скачивание вызвано», а СОДЕРЖИМОЕ: скачать можно и картинку.
    const blobs: Blob[] = []
    const make = vi.fn((b: Blob) => {
      blobs.push(b)
      return 'blob:sets'
    })
    Object.assign(URL, { createObjectURL: make, revokeObjectURL: vi.fn() })
    // СНИМАЕМ, А НЕ УТВЕРЖДАЕМ ВНУТРИ ЗАГЛУШКИ. Первая редакция звала `expect`
    // прямо в `mockImplementation`, и это была проверка, которая не умеет
    // краснеть: заглушку зовёт обработчик события React, брошенное оттуда
    // исключение до прогона не доходит. Мутация «якорь не кладётся в документ»
    // её ПЕРЕЖИЛА. Утверждения переехали наружу, на снятые значения.
    const clicked: { download: string; connected: boolean }[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ download: this.download, connected: this.isConnected })
    })

    enterCanvas()
    typeName('экран заказа')
    fireEvent.click(btn('в файл'))

    expect(click).toHaveBeenCalledOnce()
    expect(clicked[0]?.download).toBe('экран-заказа.json')
    // Якорь обязан быть В ДОКУМЕНТЕ на момент нажатия: узел вне документа
    // скачивает не везде, и отказ тихий.
    expect(clicked[0]?.connected, 'якорь нажат вне документа').toBe(true)
    expect(blobs).toHaveLength(1)
    expect(document.querySelector('a[download]'), 'якорь остался в документе').toBeNull()
    // `Blob.text()` в jsdom 25 не реализован — читаем тем же `FileReader`,
    // которым читает и сама загрузка из файла.
    expect(await readBlob(blobs[0]!)).toBe(toFileText('экран заказа', CANVAS_SPOTS))
  })

  it('пустой канвас выгружать нечем — кнопка погашена', () => {
    enterCanvas()
    fireEvent.click(within(screen.getByRole('group', { name: 'Канвас' })).getByRole('button', {
      name: 'убрать',
    }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Канвас' })).getByRole('button', {
      name: 'убрать',
    }))
    expect(btn('в файл')).toBeDisabled()
  })

  it('файл с именем набора приносит и раскладку, и имя', async () => {
    const spy = enterCanvas()
    // ЖДАТЬ НАДО ПАТЧ, А НЕ ПОЛОСУ, и разница здесь не в стиле. `FileReader`
    // отвечает следующим тиком; полоса появляется в ТОМ ЖЕ коммите, что и новая
    // раскладка, а вниз она уезжает вторым кругом — зеркало ставит патч, и лишь
    // эффект `ShellFrame` его отправляет. Проверка, дождавшаяся полосы и сразу
    // читающая перехват, видит прошлую раскладку и падает на живом коде.
    fireEvent.change(fileField(), {
      target: { files: [new File([toFileText('из файла', [spot('a')])], 'x.json')] },
    })
    await waitFor(() => expect(lastCanvas(spy)?.map((s) => s.id)).toEqual(['a']))

    expect(note()).toHaveTextContent('из файла x.json')
    expect(nameField().value).toBe('из файла')
  })

  it('голый список читается тоже, и про отсутствие имени сказано словами', async () => {
    // Файл кладут в репозиторий и правят руками; требовать от руки обёртку
    // значит требовать церемонию там, где нужен список. Но молча оставить в
    // поле прежнее имя нельзя: следующее «сохранить» перезаписало бы чужой
    // набор чужой раскладкой.
    put('экран', toFileText('экран', [spot('z')]))
    const spy = enterCanvas()
    fireEvent.click(btn('Загрузить набор «экран»'))
    expect(nameField().value).toBe('экран')

    fireEvent.change(fileField(), {
      target: { files: [new File([JSON.stringify([spot('a')])], 'bare.json')] },
    })
    await waitFor(() => expect(lastCanvas(spy)?.map((s) => s.id)).toEqual(['a']))

    expect(nameField().value).toBe('экран')
    expect(note()).toHaveTextContent('имени набора в файле нет')
  })

  it('набор, сохранённый в соседней вкладке, появляется в списке сам', () => {
    // `storage` летит только в ЧУЖИЕ вкладки того же origin. Верстак открывают
    // дважды — слева компонент, справа собранный экран, — и список на момент
    // открытия вкладки молчал бы о наборе, сохранённом рядом минуту назад.
    enterCanvas()
    expect(within(sets()).queryByRole('button', { name: 'Загрузить набор «соседний»' })).toBeNull()

    put('соседний', toFileText('соседний', [spot('a')]))
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: canvasKey('соседний') }))
    })

    expect(btn('Загрузить набор «соседний»')).toBeTruthy()
  })
})

/**
 * Автосохранение рабочего канваса ([1] ручного QA, DS-128).
 *
 * ПЕРЕЗАГРУЗКА ЗДЕСЬ — это `cleanup()` плюс новый `render`: хранилище пережило,
 * дерево нет. Ровно то, что делает дев-сервер, и ровно то, чего до сих пор не
 * переживал собранный экран.
 *
 * Проверяется не только «раскладка вернулась», но и три границы, на которых
 * автосохранение врёт молча: умолчание первого запуска (его нельзя подменить
 * восстановлением), пустой канвас (его нельзя воскресить умолчанием) и отказ
 * хранилища (о нём нельзя промолчать — иначе человек уверен, что работа
 * сохраняется, и это хуже, чем знать, что нет).
 */
/**
 * ЗАЛИПАНИЕ ПРИЗНАКА «РАСХОДИТСЯ С СОХРАНЁННЫМ» — наводка отчёта, закрытая
 * живым прогоном 30.08.2026.
 *
 * Репортёр воспроизвести не смог, разбор предполагал промах мимо чекбочка
 * из-за узкой колонки ([14]). Версия НЕ ПОДТВЕРДИЛАСЬ: воспроизводится ровно
 * двумя точными щелчками по одной крутилке — включить и выключить. Причина в
 * том, что крутилка писала ключ и тогда, когда её вернули к значению случая:
 * на экране то же самое, в хранилище лишний ключ, `sameSpots` считает ключи, и
 * признак горит навсегда на раскладке, которая не менялась.
 *
 * Кейс держит СИМПТОМ целиком, от сохранения до признака: правка в
 * `dockControl` проверена и своим юнитом, но он утверждает форму `props`, а
 * человек жаловался на горящую надпись.
 */
describe('признак расхождения не залипает', () => {
  it('крутилка, включённая и выключенная обратно, признака не оставляет', () => {
    enterCanvas()
    sendUp(frameSid(), {
      type: 'canvas-meta',
      id: CANVAS_SPOTS[0]!.id,
      meta: {
        ...META,
        controls: { dense: { kind: 'bool', prop: true } },
        cases: [
          { id: CANVAS_SPOTS[0]!.caseId, title: 'база', values: { dense: 'false' }, slots: {} },
        ],
      },
    })
    fireEvent.change(nameField(), { target: { value: 'заказ' } })
    fireEvent.click(btn('сохранить'))
    expect(driftOn()).toBe(false)

    const box = screen.getByLabelText('dense')
    fireEvent.click(box)
    expect(driftOn()).toBe(true)

    fireEvent.click(box)

    expect(driftOn()).toBe(false)
  })
})

/**
 * ГРУППА НАБОРОВ НЕ ЕЗДИТ И НЕ РАСТЯГИВАЕТСЯ ([13] ручного QA, DS-128).
 *
 * Геометрию утверждают два инварианта `make measure` — в jsdom все
 * прямоугольники нулевые, и мерить тут нечего. Здесь проверяется ШОВ между
 * оболочкой и теми правилами: что узел признака стоит в разметке всегда и что
 * полное имя набора уехало в `title`. Без этого инварианты держали бы CSS,
 * который никто не применил.
 */
describe('раскладка группы наборов', () => {
  const drift = () => sets().querySelector('.wb__drift')

  it('узел признака расхождения стоит в разметке всегда, погашенный модификатором', () => {
    enterCanvas()

    expect(drift()).not.toBeNull()
    expect(drift()?.className).toContain('wb__drift--off')
  })

  it('признак зажигается тем же узлом, а не появляется новым', () => {
    enterCanvas()
    fireEvent.change(nameField(), { target: { value: 'заказ' } })
    fireEvent.click(btn('сохранить'))
    fireEvent.click(screen.getByRole('button', { name: '+ DataTable' }))

    expect(drift()?.className).not.toContain('wb__drift--off')
  })

  it('полное имя набора лежит в подсказке чипа — он подрезан по ширине', () => {
    const long = 'экран заказа со всеми колонками и подвалом'
    put(long, toFileText(long, [spot('a')]))
    enterCanvas()

    const chip = within(sets()).getByRole('button', { name: `Загрузить набор «${long}»` })
    expect(chip.getAttribute('title')).toBe(long)
    expect(chip.className).toContain('wb__chip--set')
  })
})

/**
 * ПЕРЕЗАПИСЬ ПУСТЫМ ТРЕБУЕТ ПОДТВЕРЖДЕНИЯ ([11] ручного QA, DS-128).
 *
 * Один щелчок по «перезаписать» на пустом канвасе затирал сохранённый набор
 * пустотой — необратимо и молча. Возврата у хранилища нет, и восстановить
 * раскладку из десяти мест неоткуда.
 *
 * ПОДТВЕРЖДЕНИЕ ТОЛЬКО ЗДЕСЬ, а не у всякой перезаписи. Перезапись
 * непустого — обычная работа, и спрашивать про неё значило бы завести
 * церемонию, которую перестают читать через день; тогда она не спасёт и в том
 * единственном случае, ради которого заведена. Пустой канвас отличается тем,
 * что терять ВСЁ и не получать взамен ничего — это не правка, а ошибка.
 *
 * ВТОРЫМ ЩЕЛЧКОМ ПО ТОЙ ЖЕ КНОПКЕ, а не диалогом: диалог в хроме верстака не
 * из чего собрать (`Modal` брать нельзя — закон хрома), а главное — он
 * останавливает работу ради вопроса, на который в 99 случаях отвечают «да».
 * Кнопка, сменившая подпись, спрашивает ровно столько же и не отнимает
 * ничего.
 */
describe('перезапись пустым канвасом', () => {
  const clearCanvas = (): void => {
    fireEvent.click(screen.getByRole('button', { name: 'убрать' }))
    fireEvent.click(screen.getByRole('button', { name: 'убрать' }))
  }

  it('первый щелчок не затирает, а спрашивает и называет цену', () => {
    enterCanvas()
    fireEvent.change(nameField(), { target: { value: 'заказ' } })
    fireEvent.click(btn('сохранить'))
    const saved = localStorage.getItem(canvasKey('заказ'))

    clearCanvas()
    fireEvent.click(btn('перезаписать'))

    expect(localStorage.getItem(canvasKey('заказ'))).toBe(saved)
    expect(note()).toHaveTextContent('мест 2')
  })

  it('второй щелчок затирает — подтверждение, а не запрет', () => {
    enterCanvas()
    fireEvent.change(nameField(), { target: { value: 'заказ' } })
    fireEvent.click(btn('сохранить'))
    clearCanvas()

    fireEvent.click(btn('перезаписать'))
    fireEvent.click(btn('перезаписать пустым?'))

    expect(JSON.parse(localStorage.getItem(canvasKey('заказ')) ?? '{}').spots).toEqual([])
  })

  it('вопрос не гаснет по таймеру — он ждёт ответа, а не сообщает об успехе', () => {
    // Полоса гасит сообщения об успехе через шесть секунд ([10]). Погасни так
    // и вопрос — на экране осталась бы взведённая кнопка «перезаписать
    // пустым?» без единого слова о том, почему она такая. Держит его непустой
    // `lines`, и мутация «убрать объяснение» без этого кейса проходила.
    vi.useFakeTimers()
    try {
      enterCanvas()
      fireEvent.change(nameField(), { target: { value: 'заказ' } })
      fireEvent.click(btn('сохранить'))
      clearCanvas()
      fireEvent.click(btn('перезаписать'))

      act(() => vi.advanceTimersByTime(NOTE_MS * 3))

      expect(note()).toHaveTextContent('ни одного')
      expect(btn('перезаписать пустым?')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('правка канваса снимает взвод — вопрос был про ту пустоту, а не про эту', () => {
    enterCanvas()
    fireEvent.change(nameField(), { target: { value: 'заказ' } })
    fireEvent.click(btn('сохранить'))
    clearCanvas()
    fireEvent.click(btn('перезаписать'))

    fireEvent.click(screen.getByRole('button', { name: '+ DataTable' }))

    expect(btn('перезаписать')).toBeTruthy()
  })

  it('непустой канвас перезаписывается одним щелчком, как и раньше', () => {
    // Церемония на каждой перезаписи перестала бы читаться через день — и не
    // спасла бы в том единственном случае, ради которого заведена.
    enterCanvas()
    fireEvent.change(nameField(), { target: { value: 'заказ' } })
    fireEvent.click(btn('сохранить'))
    fireEvent.click(screen.getByRole('button', { name: '+ DataTable' }))

    fireEvent.click(btn('перезаписать'))

    expect(JSON.parse(localStorage.getItem(canvasKey('заказ')) ?? '{}').spots).toHaveLength(3)
  })

  it('новое имя пустым канвасом сохраняется без вопроса — терять нечего', () => {
    enterCanvas()
    clearCanvas()
    fireEvent.change(nameField(), { target: { value: 'пусто' } })

    fireEvent.click(btn('сохранить'))

    expect(localStorage.getItem(canvasKey('пусто'))).not.toBeNull()
  })
})

/**
 * ВРЕМЯ ЖИЗНИ СТРОКИ СОСТОЯНИЯ ([10] ручного QA, DS-128).
 *
 * Полоса показывала итог последнего действия ВЕЧНО. Через полчаса работы над
 * канвасом под тулбаром висело «набор «заказ» сохранён, мест: 3» — утверждение
 * про прошлое в жанре настоящего: с тех пор места двигали, добавляли и
 * убирали. Полоса, которой перестают верить, не строка состояния.
 *
 * ДВА РАЗНЫХ СРОКА, и разделены они не по важности, а по ТИПУ УТВЕРЖДЕНИЯ.
 * «Сохранено» — событие: оно случилось и кончилось, и через минуту сообщать о
 * нём нечего. «Место №3 не помещается в 12 колонок» — не событие, а положение
 * дел: оно ВЕРНО, пока раскладку не поправили, и погасить его по таймеру
 * значило бы соврать молчанием.
 *
 * ПОЛОСА ПРИ ЭТОМ НЕ ИСЧЕЗАЕТ ИЗ РАЗМЕТКИ. Две причины, обе несущие:
 * появляющаяся и исчезающая строка тулбара двигает кадр по вертикали — ровно
 * в тот момент, когда в него целятся; и живая область (`role="status"`),
 * вставленная в документ ВМЕСТЕ с текстом, дикторами часто не озвучивается
 * вовсе — она обязана существовать до того, как в ней что-то появится.
 */
describe('время жизни строки состояния', () => {
  it('полоса стоит в разметке до первого действия и молчит', () => {
    enterCanvas()

    expect(note()).not.toBeNull()
    expect(note()).toHaveTextContent('')
  })

  it('сообщение об успехе гаснет само', () => {
    vi.useFakeTimers()
    try {
      enterCanvas()
      fireEvent.change(nameField(), { target: { value: 'заказ' } })
      fireEvent.click(btn('сохранить'))
      expect(note()).toHaveTextContent('сохранён')

      act(() => vi.advanceTimersByTime(NOTE_MS + 100))

      expect(note()).toHaveTextContent('')
    } finally {
      vi.useRealTimers()
    }
  })

  it('потери раскладки не гаснут: это положение дел, а не событие', () => {
    vi.useFakeTimers()
    try {
      put('битый', JSON.stringify({ v: 1, name: 'битый', spots: [{ id: 'a' }] }))
      enterCanvas()
      fireEvent.click(within(sets()).getByRole('button', { name: 'Загрузить набор «битый»' }))
      expect(note()).toHaveTextContent('отброшено')

      act(() => vi.advanceTimersByTime(NOTE_MS * 10))

      expect(note()).toHaveTextContent('отброшено')
    } finally {
      vi.useRealTimers()
    }
  })

  it('ход назад не гаснет вместе с сообщением', () => {
    // Найдено ЖИВЫМ ПРОГОНОМ, не кейсом. Загрузка набора — единственное
    // действие, стирающее собранный экран одним щелчком, и «вернуть прежнюю»
    // живёт в самой полосе. Погаснув через шесть секунд вместе с сообщением об
    // успехе, ход назад исчезал ровно тогда, когда он нужен: человек смотрит на
    // кадр, понимает, что открыл не тот набор, и тянется к кнопке, которой уже
    // нет. Сообщение с ходом назад — не отчёт о событии, а предложение,
    // ждущее ответа, как и объяснение потерь.
    vi.useFakeTimers()
    try {
      put('другой', toFileText('другой', [spot('x')]))
      enterCanvas()
      fireEvent.click(within(sets()).getByRole('button', { name: 'Загрузить набор «другой»' }))
      expect(within(note()!).getByRole('button', { name: 'вернуть прежнюю' })).toBeTruthy()

      act(() => vi.advanceTimersByTime(NOTE_MS * 3))

      expect(within(note()!).getByRole('button', { name: 'вернуть прежнюю' })).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('новое действие сбрасывает отсчёт, а не догорает от прошлого', () => {
    // Иначе сообщение, пришедшее за секунду до конца чужого срока, живёт эту
    // секунду — и человек читает половину строки.
    vi.useFakeTimers()
    try {
      enterCanvas()
      fireEvent.click(screen.getByRole('button', { name: '+ DataTable' }))
      act(() => vi.advanceTimersByTime(NOTE_MS - 100))
      fireEvent.click(screen.getByRole('button', { name: 'убрать' }))

      act(() => vi.advanceTimersByTime(200))
      expect(note()).toHaveTextContent('убрано')
    } finally {
      vi.useRealTimers()
    }
  })
})

/**
 * КРАЕВОЙ ПРОБЕЛ В ИМЕНИ НАБОРА ([8] ручного QA, DS-128).
 *
 * `isValidName` требует `trim() === name`, и «сохранить» на имени с пробелом по
 * краю молча не делало НИЧЕГО: кнопка живая, нажатие есть, набора нет. Правило
 * при этом честное — оно защищает ключ от `ds-wb/canvas/` без имени, — но
 * человеку оно ни разу не показано и показано быть не должно.
 *
 * ТРИМИМ МОЛЧА. Вариант «написать „уберите пробел по краям“» отвергнут: он
 * объясняет правило, которого не должно существовать. Краевой пробел в имени —
 * это опечатка, а не намерение, и единственное правильное поведение — сделать
 * то, что человек хотел.
 *
 * НЕ НА ВВОДЕ, А НА ПРИМЕНЕНИИ. Подрезав в `onChange`, мы отняли бы возможность
 * набрать «экран заказа»: пробел после «экран» в этот момент КРАЕВОЙ, и его
 * съело бы на лету.
 */
describe('краевой пробел в имени набора', () => {
  const save = () => fireEvent.click(btn('сохранить'))

  it('сохраняется под подрезанным именем, а не пропадает', () => {
    enterCanvas()
    fireEvent.change(nameField(), { target: { value: '  заказ  ' } })
    save()

    expect(localStorage.getItem(canvasKey('заказ'))).not.toBeNull()
    expect(within(sets()).getByRole('button', { name: 'Загрузить набор «заказ»' })).toBeTruthy()
  })

  it('поле показывает то, подо чем сохранили', () => {
    // Иначе в поле «  заказ  », в списке «заказ», и следующее нажатие
    // «перезаписать» человек делает, не зная, во что попадёт.
    enterCanvas()
    fireEvent.change(nameField(), { target: { value: ' заказ ' } })
    save()

    expect(nameField().value).toBe('заказ')
  })

  it('пробел ВНУТРИ имени остаётся — подрезка про края, а не про пробелы', () => {
    enterCanvas()
    fireEvent.change(nameField(), { target: { value: 'экран заказа' } })
    save()

    expect(localStorage.getItem(canvasKey('экран заказа'))).not.toBeNull()
  })

  it('набор находится по подрезанному имени: «перезаписать» вместо «сохранить»', () => {
    // Признак «такой набор уже есть» считается от имени, и не подрежь мы его —
    // сохранение под « заказ » предложило бы завести второй набор поверх
    // первого, не сказав об этом.
    enterCanvas()
    fireEvent.change(nameField(), { target: { value: 'заказ' } })
    save()
    fireEvent.change(nameField(), { target: { value: ' заказ ' } })

    expect(btn('перезаписать')).toBeTruthy()
  })

  it('имя из одних пробелов именем не становится', () => {
    // Подрезка даёт пустую строку, а пустое имя — это ключ `ds-wb/canvas/`,
    // тот самый общий ключ, от которого уводит второе смягчение спеки.
    enterCanvas()
    fireEvent.change(nameField(), { target: { value: '   ' } })
    save()

    expect(localStorage.getItem(canvasKey(''))).toBeNull()
    expect(localStorage.getItem(canvasKey('   '))).toBeNull()
  })
})

describe('рабочий канвас переживает перезагрузку', () => {
  it('собранная раскладка возвращается и уезжает вниз', () => {
    enterCanvas()
    fireEvent.click(screen.getByRole('button', { name: '+ DataTable' }))
    cleanup()
    const spy = enterCanvas()
    expect(lastCanvas(spy)?.map((s) => s.id)).toEqual(['table', 'pages', 'datatable'])
  })

  it('восстановление называет себя, а не подставляет вчерашнее молча', () => {
    enterCanvas()
    fireEvent.click(screen.getByRole('button', { name: '+ DataTable' }))
    cleanup()
    enterCanvas()
    expect(note()).toHaveTextContent('работа восстановлена')
    expect(note()).toHaveTextContent('мест: 3')
  })

  it('первый запуск показывает умолчание и молчит', () => {
    const spy = enterCanvas()
    expect(lastCanvas(spy)?.map((s) => s.id)).toEqual(['table', 'pages'])
    // Полоса стоит в разметке всегда ([10]), поэтому «молчит» — это пустой
    // текст, а не отсутствие узла.
    expect(note()).toHaveTextContent('')
  })

  it('пустой канвас не воскрешает умолчание', () => {
    enterCanvas()
    fireEvent.click(screen.getByRole('button', { name: 'убрать' }))
    fireEvent.click(screen.getByRole('button', { name: 'убрать' }))
    cleanup()
    const spy = enterCanvas()
    expect(lastCanvas(spy)).toEqual([])
  })

  it('имя набора возвращается вместе с раскладкой', () => {
    enterCanvas()
    fireEvent.change(nameField(), { target: { value: 'заказ' } })
    cleanup()
    enterCanvas()
    expect(nameField().value).toBe('заказ')
  })

  it('от восстановленного канваса есть ход к умолчанию', () => {
    enterCanvas()
    fireEvent.click(screen.getByRole('button', { name: '+ DataTable' }))
    cleanup()
    const spy = enterCanvas()
    fireEvent.click(within(note()!).getByRole('button', { name: 'вернуть умолчание' }))
    expect(lastCanvas(spy)?.map((s) => s.id)).toEqual(['table', 'pages'])
  })

  /**
   * Найдено ЖИВЫМ ПРОГОНОМ, не тестом, и ровно в том случае, который соседний
   * комментарий в `shell-app.tsx` называет обычным делом: верстак открыт
   * дважды, слева компонент, справа собранный экран. Первая редакция писала
   * черновик из любого режима — то есть вкладка, которую открыли посмотреть
   * один компонент, при монтировании клала поверх собранного экрана своё
   * умолчание. Работа пропадала при следующей перезагрузке соседней вкладки, и
   * полоса объявляла это «работа восстановлена, мест: 2».
   */
  it('вкладка не на канвасе не затирает собранный экран', () => {
    enterCanvas()
    fireEvent.click(screen.getByRole('button', { name: '+ DataTable' }))
    const work = localStorage.getItem(CANVAS_DRAFT_KEY)
    expect(JSON.parse(work ?? '{}').spots).toHaveLength(3)
    cleanup()
    // Вторая вкладка: открылась в режиме кадра и канваса не касалась.
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: META })
    expect(localStorage.getItem(CANVAS_DRAFT_KEY)).toBe(work)
  })

  it('отказавшее автосохранение названо, а не проглочено', () => {
    enterCanvas()
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('квота кончилась')
    })
    fireEvent.click(screen.getByRole('button', { name: '+ DataTable' }))
    expect(note()).toHaveTextContent('работа не сохраняется')
  })
})
