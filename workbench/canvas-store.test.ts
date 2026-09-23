/**
 * Хранение раскладок канваса (DS-128, шаг 5).
 *
 * Спека требует поимённо: «Разбор хранилища — юнитом, на мусоре. `abc`, `-1`,
 * чужая схема, ссылка на компонент, которого больше нет в каталоге. Последнее
 * случится: канвас переживёт удаление компонента, и „раскладка ссылается на
 * снесённое“ — не исключение, а нормальный ход событий».
 *
 * Хранилище подделано, а не взято настоящее: настоящее `localStorage` в vitest
 * то есть, то нет (ноды его отдают под флагом), и тест, зависящий от флага
 * запуска, — это тест, который однажды пройдёт, ничего не проверив.
 */
import { describe, it, expect } from 'vitest'
import {
  CANVAS_DRAFT_KEY,
  CANVAS_KEY_PREFIX,
  canvasKey,
  loadDraft,
  saveDraft,
  sameSpots,
  fileNameOf,
  isValidName,
  listSets,
  loadSet,
  nameFromFile,
  parseFile,
  removeSet,
  saveSet,
  toFileText,
} from './canvas-store.js'
import { CANVAS_SPOTS } from './canvas-plan.js'
import type { CanvasSpot } from './protocol.js'

/** Подделка `Storage` — ровно та часть, которую модуль трогает. */
const fakeStore = (seed: Record<string, string> = {}) => {
  const map = new Map(Object.entries(seed))
  return {
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
    raw: map,
  }
}

/** Хранилище, которое бросает на всём, — приватное окно, запрещённые данные. */
const angryStore = () => ({
  get length(): number {
    throw new Error('нельзя')
  },
  key: (): string | null => {
    throw new Error('нельзя')
  },
  getItem: (): string | null => {
    throw new Error('нельзя')
  },
  setItem: (): void => {
    throw new Error('нельзя')
  },
  removeItem: (): void => {
    throw new Error('нельзя')
  },
})

const spot = (id: string): CanvasSpot => ({
  id,
  component: 'Button',
  caseId: '',
  col: 1,
  span: 12,
  props: {},
  data: null,
})

describe('имя набора', () => {
  it.each([
    ['пустое', ''],
    ['одни пробелы', '   '],
    ['с ведущим пробелом', ' экран'],
    ['с хвостовым пробелом', 'экран '],
  ])('негодное имя отвергается (%s)', (_n, name) => {
    // Пустое имя даёт ключ `ds-wb/canvas/` — ровно тот единственный общий ключ,
    // от которого уводит смягчение №2 спеки: безымянные наборы затирали бы
    // друг друга, и выглядело бы это как «не сохранилось».
    expect(isValidName(name)).toBe(false)
    expect(saveSet(name, [spot('a')], fakeStore())).toBe(false)
  })

  it('ключ именованный, а не один общий', () => {
    // Смягчение №2 спеки целиком.
    expect(canvasKey('экран заказа')).toBe(`${CANVAS_KEY_PREFIX}экран заказа`)
    expect(canvasKey('второй')).not.toBe(canvasKey('экран заказа'))
  })

  it('косая черта в конце префикса разводит соседние пространства', () => {
    // Без неё набор с именем `-h` попал бы в `ds-wb/canvas-h` — ключ высоты
    // дока живёт по соседству (`ds-wb/dock-h`), и такие столкновения молчат.
    expect(canvasKey('-h')).toBe('ds-wb/canvas/-h')
    expect(canvasKey('-h')).not.toBe('ds-wb/canvas-h')
  })
})

describe('хранилище', () => {
  it('сохранённое читается обратно тем же', () => {
    const store = fakeStore()
    expect(saveSet('экран', CANVAS_SPOTS, store)).toBe(true)
    const back = loadSet('экран', store)
    expect(back.dropped).toEqual([])
    expect(back.spots).toEqual(CANVAS_SPOTS.map((s) => ({ ...s })))
  })

  it('второй набор не затирает первый', () => {
    // То самое «выглядит как не сохранилось», ради чего ключ именованный.
    const store = fakeStore()
    saveSet('первый', [spot('a')], store)
    saveSet('второй', [spot('b')], store)
    expect(loadSet('первый', store).spots.map((s) => s.id)).toEqual(['a'])
    expect(loadSet('второй', store).spots.map((s) => s.id)).toEqual(['b'])
  })

  it('список наборов по алфавиту и без чужих ключей', () => {
    const store = fakeStore({
      'ds-wb/dock-h': '340',
      'ds-wb/canvas/бета': '[]',
      'ds-wb/canvas/альфа': '[]',
      'чужое/canvas/гамма': '[]',
    })
    expect(listSets(store)).toEqual(['альфа', 'бета'])
  })

  it('испорченный набор ОСТАЁТСЯ в списке', () => {
    // Соблазн не показывать нечитаемое — ложная забота: набор занимает имя, и
    // пропав из списка он оставил бы человека с «я же сохранял» и без способа
    // это имя освободить.
    const store = fakeStore({ 'ds-wb/canvas/битый': 'абв' })
    expect(listSets(store)).toEqual(['битый'])
    expect(loadSet('битый', store).dropped[0]).toContain('не читается как JSON')
  })

  it('«такого имени нет» и «имя есть, содержимое негодно» — разные ответы', () => {
    // Разные ответы требуют разных действий: искать опечатку в имени или
    // пересохранить набор.
    // Обёртка ВЕРСИОНИРОВАНА намеренно: без `v` разбор отвечал бы про версию и
    // до мест не доходил — тест утверждал бы уже не то, ради чего написан.
    const store = fakeStore({ 'ds-wb/canvas/битый': '{"v":1,"spots":"абв"}' })
    expect(loadSet('нетакого', store).dropped[0]).toContain('нет')
    expect(loadSet('битый', store).dropped[0]).toContain('не список')
  })

  it('удаление освобождает имя', () => {
    const store = fakeStore()
    saveSet('экран', [spot('a')], store)
    expect(removeSet('экран', store)).toBe(true)
    expect(listSets(store)).toEqual([])
  })

  it('отказ хранилища НЕ роняет и не врёт про успех', () => {
    // Приватное окно, запрещённые данные сайта, кончившаяся квота. Сказать
    // «сохранено» и потерять работу — худшее из возможного при этом хранении.
    const angry = angryStore()
    expect(() => saveSet('экран', [spot('a')], angry)).not.toThrow()
    expect(saveSet('экран', [spot('a')], angry)).toBe(false)
    expect(listSets(angry)).toEqual([])
    expect(loadSet('экран', angry).dropped[0]).toContain('хранилище')
    expect(removeSet('экран', angry)).toBe(false)
  })

  it('хранилища нет вовсе — отвечает словами, а не падением', () => {
    expect(saveSet('экран', [spot('a')], null)).toBe(false)
    expect(listSets(null)).toEqual([])
    expect(loadSet('экран', null).dropped).toHaveLength(1)
  })
})

describe('файл', () => {
  it('выгруженное читается обратно — смягчение №1 спеки', () => {
    // «Не картинка и не дамп состояния — тот же список позиций, который можно
    // положить в репозиторий руками и загрузить у себя».
    const text = toFileText('экран заказа', CANVAS_SPOTS)
    expect(parseFile(text).spots).toEqual(CANVAS_SPOTS.map((s) => ({ ...s })))
    expect(nameFromFile(text)).toBe('экран заказа')
  })

  it('файл многострочный: иначе ревью раскладки не работает вовсе', () => {
    // Ревью — то немногое, что при этом хранении возможно, и однострочный JSON
    // отдал бы на любую правку diff «изменилась одна строка».
    const text = toFileText('экран', CANVAS_SPOTS)
    expect(text.split('\n').length).toBeGreaterThan(CANVAS_SPOTS.length)
    expect(text.endsWith('\n')).toBe(true)
  })

  it('голый список, набранный руками, читается тоже', () => {
    // Файл кладут в репозиторий и правят рукой; требовать от руки обёртку
    // значит требовать церемонию там, где нужен список.
    const r = parseFile('[{"id":"a","component":"Button"}]')
    expect(r.dropped).toEqual([])
    expect(r.spots).toHaveLength(1)
    expect(nameFromFile('[{"id":"a","component":"Button"}]')).toBeNull()
  })

  it.each([
    ['не JSON', 'абв', 'не читается как JSON'],
    ['пустой', '', 'не читается как JSON'],
    ['HTML вместо JSON', '<!doctype html>', 'не читается как JSON'],
    ['число', '7', 'нет списка мест'],
    ['чужая схема', '{"layout":[]}', 'нет списка мест'],
  ])('негодный файл объясняется словами (%s)', (_n, text, says) => {
    const r = parseFile(text)
    expect(r.spots).toEqual([])
    expect(r.dropped[0]).toContain(says)
  })

  it('ссылка на снесённый компонент переживает и хранилище, и файл', () => {
    // Спека ждёт этого прямо: канвас переживёт удаление компонента, и
    // «раскладка ссылается на снесённое» — нормальный ход событий, а не
    // исключение. Место обязано доехать целым; про отсутствие фикстуры
    // отвечает кадр словами в самом месте.
    const store = fakeStore()
    saveSet('экран', [{ ...spot('a'), component: 'СнесённыйКомпонент' }], store)
    const back = loadSet('экран', store)
    expect(back.dropped).toEqual([])
    expect(back.spots[0]?.component).toBe('СнесённыйКомпонент')
  })

  it('имя файла человеческое, но переживает файловую систему', () => {
    expect(fileNameOf('экран заказа')).toBe('экран-заказа.json')
    expect(fileNameOf('a/b:c')).toBe('a-b-c.json')
    // Имя, от которого ничего не осталось, не даёт файла с именем `.json`.
    expect(fileNameOf('///')).toBe('canvas.json')
  })

  it('имя из файла берётся только годное', () => {
    // Негодное имя в файле дало бы ключ `ds-wb/canvas/` при сохранении — тот
    // самый общий ключ.
    expect(nameFromFile('{"name":"  ","spots":[]}')).toBeNull()
    expect(nameFromFile('{"name":7,"spots":[]}')).toBeNull()
    expect(nameFromFile('абв')).toBeNull()
  })
})

describe('расхождение с сохранённым', () => {
  const spot = (over = {}) => ({
    id: 'table', component: 'DataTable', caseId: 'row-open',
    col: 1, span: 12, props: {}, data: null, ...over,
  })

  it('та же раскладка — совпадает', () => {
    expect(sameSpots([spot()], [spot()])).toBe(true)
  })

  it('другая ширина — расходится', () => {
    expect(sameSpots([spot()], [spot({ span: 6 })])).toBe(false)
  })

  /**
   * ПОЛЕ ЗА ПОЛЕМ, а не «пара отличающихся раскладок». Ревью показало, что
   * четыре сравнения из семи переживали удаление: тесты трогали `span`, `data`
   * и `props`, а `id`, `component`, `caseId` и `col` не держало ничто. Самое
   * дорогое из них — `caseId`: смена случая выделенного места это половина
   * того, ради чего док существует, и признак молчал бы в самом частом
   * сценарии.
   *
   * Список полей здесь продублирован с `CanvasSpot` намеренно: сравнение в
   * `sameSpots` тоже написано руками, и таблица напротив таблицы —
   * единственное, что краснеет, когда одна из них отстанет.
   */
  const FIELDS: [string, Partial<Parameters<typeof spot>[0]>][] = [
    ['id', { id: 'другое' }],
    ['component', { component: 'Pagination' }],
    ['caseId', { caseId: 'dense' }],
    ['col', { col: 3 }],
    ['span', { span: 6 }],
    ['data', { data: 'rows-500' }],
    ['props', { props: { dense: 'true' } }],
  ]

  it.each(FIELDS)('поле «%s» различает раскладки', (_name, over) => {
    expect(sameSpots([spot()], [spot(over)])).toBe(false)
  })

  it('другое число мест — расходится', () => {
    expect(sameSpots([spot()], [spot(), spot({ id: 'pages' })])).toBe(false)
  })

  it('тот же набор мест в другом порядке — расходится', () => {
    // Порядок мест — это порядок обхода табом, то есть половина того, ради
    // чего канвас собирают. Считать перестановку совпадением значило бы
    // предложить «перезаписать» и не сказать, что перезаписывается.
    const a = [spot(), spot({ id: 'pages', component: 'Pagination' })]
    expect(sameSpots(a, [a[1]!, a[0]!])).toBe(false)
  })

  it('покрученное значение — расходится', () => {
    expect(sameSpots([spot()], [spot({ props: { dense: 'true' } })])).toBe(false)
  })

  it('те же крутилки, записанные в другом порядке, — СОВПАДАЮТ', () => {
    // Дыра сравнения текстом: `JSON.stringify` зависит от порядка ключей, и
    // набор, загруженный из файла и покрученный обратно, показал бы
    // «расходится» на раскладке, которая не изменилась. Ложное расхождение
    // хуже молчания: его видят каждый раз и перестают верить признаку.
    expect(sameSpots(
      [spot({ props: { a: '1', b: '2' } })],
      [spot({ props: { b: '2', a: '1' } })],
    )).toBe(true)
  })

  it('набор данных различается — расходится', () => {
    expect(sameSpots([spot()], [spot({ data: 'rows-500' })])).toBe(false)
  })
})

describe('версия и имена в файле', () => {
  const spots = [
    { id: 'table', component: 'DataTable', caseId: 'row-open', col: 1, span: 12, props: {}, data: null },
  ]

  it('выгрузка несёт версию формата и пишет компонент словом, а не буквой', () => {
    // Обе придирки владельца 30.08.2026, и обе про то, что файл ложится в
    // репозиторий: `"component"` в диффе читается, `"c"` нет, а версия делает
    // будущую смену схемы громкой вместо молча кривой раскладки.
    const obj = JSON.parse(toFileText('экран', spots))
    expect(obj.v).toBe(1)
    expect(obj.spots[0].component).toBe('DataTable')
    expect(obj.spots[0].c).toBeUndefined()
  })

  it('круговой рейс: выгруженное читается обратно тем же', () => {
    // Половина, без которой предыдущая проверка утверждает только запись:
    // формат, который пишется красиво и не читается, — это не формат.
    const back = parseFile(toFileText('экран', spots))
    expect(back.dropped).toEqual([])
    expect(back.spots).toEqual(spots)
  })

  it('обёртка чужой версии отвергается словами, а не встаёт кривой раскладкой', () => {
    // Ровно то, ради чего владелец просил поле версии.
    const out = parseFile(JSON.stringify({ v: 2, name: 'э', spots }))
    expect(out.spots).toEqual([])
    expect(out.dropped.join(' ')).toContain('версии 2')
  })

  it('обёртка ДО версии названа отдельно — это старый файл, а не мусор', () => {
    // У человека уже лежат выгрузки без `v`. «В файле нет списка мест» отправило
    // бы его искать опечатку там, где формат просто старый.
    const out = parseFile(JSON.stringify({ name: 'э', spots }))
    expect(out.spots).toEqual([])
    expect(out.dropped.join(' ')).toContain('без версии')
  })

  it('голый список версии не несёт и читается — это форма для руки', () => {
    // Обёртку пишет инструмент, голый список пишут руками в репозитории.
    // Требовать от руки `"v": 1` значит требовать церемонию там, где нужен
    // список; обещание версии дано обёртке, и только ей.
    const out = parseFile(JSON.stringify(spots))
    expect(out.dropped).toEqual([])
    expect(out.spots[0]!.component).toBe('DataTable')
  })

  it('старое имя поля названо вместе с починкой, а не просто «нет компонента»', () => {
    // Поле НАМЕРЕННО старое: тест про то, как отвергается вчерашняя выгрузка.
    const out = parseFile(JSON.stringify([{ id: 'a', c: 'DataTable' }]))
    expect(out.spots).toEqual([])
    expect(out.dropped.join(' ')).toContain('«c»')
    expect(out.dropped.join(' ')).toContain('component')
  })
})

/**
 * Рабочий канвас — тот, что на экране сейчас, а не сохранённый под именем
 * ([1] ручного QA, DS-128).
 *
 * Проверяется РОВНО ГРАНИЦА между ним и именованными наборами: черновик обязан
 * лежать мимо их пространства имён (иначе он появится в списке отдельным
 * набором и займёт имя, которого никто не давал) и обязан ОТЛИЧАТЬ «черновика
 * нет» от «черновик пуст» — на первом встаёт умолчание первого запуска, на
 * втором пустой канвас, который человек и оставил.
 */
describe('рабочий канвас', () => {
  it('черновика нет — это не то же самое, что пустой канвас', () => {
    const store = fakeStore()
    expect(loadDraft(store)).toBe(null)
    saveDraft('', [], store)
    expect(loadDraft(store)?.spots).toEqual([])
  })

  it('черновик возвращает и раскладку, и имя набора из поля', () => {
    const store = fakeStore()
    saveDraft('заказ', CANVAS_SPOTS, store)
    const back = loadDraft(store)
    expect(back?.name).toBe('заказ')
    expect(sameSpots(back?.spots ?? [], CANVAS_SPOTS)).toBe(true)
  })

  it('черновик не заводит набора в списке', () => {
    const store = fakeStore()
    saveDraft('заказ', CANVAS_SPOTS, store)
    expect(listSets(store)).toEqual([])
    expect(CANVAS_DRAFT_KEY.startsWith(CANVAS_KEY_PREFIX)).toBe(false)
  })

  it('испорченный черновик объясняется словами, а не пропадает', () => {
    const store = fakeStore({ [CANVAS_DRAFT_KEY]: '{' })
    const back = loadDraft(store)
    expect(back?.spots).toEqual([])
    expect(back?.dropped).toEqual(['файл не читается как JSON'])
  })

  it('отказ хранилища на записи черновика виден вызывающему', () => {
    expect(saveDraft('заказ', CANVAS_SPOTS, angryStore())).toBe(false)
    expect(saveDraft('заказ', CANVAS_SPOTS, null)).toBe(false)
  })
})
