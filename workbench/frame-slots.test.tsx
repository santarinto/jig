/**
 * Начинки позиций внутри `Frame`: пять санитаров.
 *
 * 1. Санитар гонки: начинки позиций грузятся асинхронно (у каждой свой
 *    `loadFixture`), и сеть не гарантирует порядок ответов. Утверждается ровно
 *    то, что описано в комментарии у эффекта в `frame-app.tsx`: медленно
 *    разрешившийся ПЕРВЫЙ набор начинок не переписывает собой уже показанный
 *    ВТОРОЙ, если адрес успел смениться, пока первый ещё летел.
 *
 *    `loadFixture` подменён так, чтобы промисы были в руках теста: первый
 *    вызов (для `s.cell=Badge:base`) держится, второй (для `s.cell=Badge:dot`)
 *    разрешается сразу. Порядок ОТПУСКАНИЯ обратный порядку ЗАПРОСА — ровно
 *    то, из-за чего гонка вообще возможна.
 *
 * 2. Санитар пятого отказа (Ruling 7, DS-63): начинка называет кейс
 *    явно (`Badge:нетакого`), и такого кейса у цели нет. Кадр обязан
 *    отказать словами, а не молча откатиться на первый кейс — откат здесь
 *    хуже пустоты, он ВРЁТ (см. комментарий у проверки в `frame-app.tsx`).
 *
 * 3. Санитар видимости (Ruling 9, DS-63): отказ для НЕОБЪЯВЛЕННОЙ
 *    позиции раньше строился как узел и клался в карту `fills[slotId]` — а
 *    компонент читает только объявленные им ключи, и узел пропадал НИКЕМ не
 *    прочитанным. Экран оставался пустым, а тест на построение узла — зелёным
 *    (образец «верное, но не о том»). Утверждается то, что видно в DOM, а не
 *    содержимое карты.
 *
 * 4. Санитар шестого отказа (финальное ревью фазы 4, Important 1): начинка,
 *    чей `render` бросает при построении узла (`resolveCase`/`render` цели —
 *    код чужой фикстуры). Утверждается РАЗЛИЧИМОСТЬ: слова отказа появились
 *    в позиции, И прежняя (рабочая) начинка там больше не видна — иначе
 *    санитар прошёл бы и на коде, который просто ДОБАВЛЯЕТ узел отказа рядом
 *    со старым содержимым, оставляя ложь на экране.
 *
 * 5. Санитар ветки отказа у самого `.then` (тот же Important 1): `loadFills`
 *    ЦЕЛИКОМ отклоняется (не только конкретная позиция) — мутация `fillsOf`
 *    бросает синхронно ДО цикла по позициям, и такой бросок try/catch внутри
 *    цикла не видит вовсе. Утверждается та же различимость: слова отказа
 *    видны, прежняя начинка — нет.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { Frame } from './frame-app.js'
import { loadFixture } from './registry.js'
import { metaOf } from './fixture-meta.js'
import { fillsOf } from './slot-fill.js'
import { pack } from './protocol.js'
import type { AnyFixture } from '../src/internal/fixture.js'
import type { Envelope, Up } from './protocol.js'

// `vi.mock` поднимается над импортами САМИМ vitest — статический импорт
// `loadFixture` выше видит ровно ту же подмену, что и `frame-app.tsx`: оба
// импортируют один и тот же модуль по одному и тому же пути.
vi.mock('./registry.js', () => ({
  fixtureNames: () => ['Host', 'Badge'],
  loadFixture: vi.fn(),
}))

// `metaOf` обёрнут в `vi.fn`, ПО УМОЛЧАНИЮ зовущий настоящую реализацию
// (`vi.fn(actual.metaOf)`), а не подменённый навсегда: `metaOf` зовётся на
// КАЖДЫЙ `ready` в файле (все пять тестов выше грузят `Host`/`Badge`), и
// подмена без пути назад роняла бы `postMessage` в них необработанным
// отклонением на КАЖДОМ прогоне — проверено (первая попытка так и сделала:
// 4 «Unhandled Rejection» на тестах, которые вообще не про эту находку).
// Бросок ставится ТОЧЕЧНО, одним вызовом `mockImplementationOnce` внутри
// нужного теста (см. ниже). Остальной модуль настоящий (`...actual`):
// `slot-fill.ts` импортирует ОТТУДА ЖЕ `fillToString` (шапка файла, «одна
// нормализация» — Ruling 1 плана), и её тоже нельзя терять.
vi.mock('./fixture-meta.js', async (orig) => {
  const actual = await orig<typeof import('./fixture-meta.js')>()
  return { ...actual, metaOf: vi.fn(actual.metaOf) }
})

// Тот же приём, тем же доводом, для санитара 5 (ветка отказа у `.then`):
// `fillsOf` ПО УМОЛЧАНИЮ зовёт настоящую реализацию — остальные санитары
// файла (1–4) читают карту начинок по-честному, подмена без пути назад
// ломала бы их все. Бросок ставится точечно (`mockImplementationOnce`)
// внутри одного теста ниже.
vi.mock('./slot-fill.js', async (orig) => {
  const actual = await orig<typeof import('./slot-fill.js')>()
  return { ...actual, fillsOf: vi.fn(actual.fillsOf) }
})

/** Хозяйская фикстура: одна позиция `cell`, принимает `inline`. */
const HOST: AnyFixture = {
  name: 'Host',
  group: 'G',
  props: {},
  controls: {},
  slots: { cell: { title: 'Ячейка', accepts: 'inline' } },
  cases: [{ id: 'base', title: 'B' }],
  render: (_p, slots) => <div data-testid="host">{slots.cell}</div>,
}

/** Начинка: два кейса, различимых по тексту, а не только по id. */
const BADGE: AnyFixture = {
  name: 'Badge',
  group: 'G',
  props: { label: 'none' },
  controls: {},
  kind: 'inline',
  cases: [
    { id: 'base', title: 'base', props: { label: 'base' } },
    { id: 'dot', title: 'dot', props: { label: 'dot' } },
  ],
  render: (p: { label: string }) => <span data-testid="fill">{p.label}</span>,
}

// `Frame` наблюдает размер хоста через ResizeObserver (frame-size.ts), а
// jsdom его не знает вовсе. Гонка начинок этот механизм не проверяет —
// заглушка нужна только чтобы эффект не падал молча.
class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.mocked(loadFixture).mockReset()
})

describe('гонка начинок позиций', () => {
  it('поздно разрешившийся первый набор не переписывает уже показанный второй', async () => {
    let badgeCalls = 0
    let resolveFirst: (f: AnyFixture) => void = () => {}
    const first = new Promise<AnyFixture>((res) => {
      resolveFirst = res
    })

    vi.mocked(loadFixture).mockImplementation(async (name: string) => {
      if (name === 'Host') return HOST
      if (name === 'Badge') {
        badgeCalls += 1
        // Первый запрос держим (не разрешаем), второй отвечает немедленно —
        // ИМЕННО такой порядок ответов и делает гонку возможной.
        return badgeCalls === 1 ? first : BADGE
      }
      return null
    })

    window.history.pushState({}, '', '/frame.html?c=Host&sid=7')
    render(<Frame />)

    await screen.findByTestId('host')

    // Патч 1: адрес просит Badge:base — промис за него держим.
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: pack(7, { type: 'patch', slots: { cell: 'Badge:base' } }),
          origin: window.location.origin,
          source: window.parent,
        }),
      )
    })

    // Патч 2 — сразу следом, до того как первый разрешился: адрес просит
    // Badge:dot, и этот запрос отвечает сразу.
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: pack(7, { type: 'patch', slots: { cell: 'Badge:dot' } }),
          origin: window.location.origin,
          source: window.parent,
        }),
      )
    })

    await screen.findByText('dot')
    expect(badgeCalls).toBe(2)

    // Отпускаем первый — то, что он донёс, устарело: адрес уже сменился,
    // пока он летел, и на экране обязан остаться второй ответ.
    await act(async () => {
      resolveFirst(BADGE)
    })

    expect(screen.getByText('dot')).toBeTruthy()
    expect(screen.queryByText('base')).toBeNull()
  })
})

describe('отказ: у начинки нет объявленного кейса', () => {
  it('кейс назван явно, но такого у Badge нет — отказ словами, а не откат на первый кейс', async () => {
    vi.mocked(loadFixture).mockImplementation(async (name: string) => {
      if (name === 'Host') return HOST
      if (name === 'Badge') return BADGE
      return null
    })

    window.history.pushState({}, '', '/frame.html?c=Host&sid=11')
    render(<Frame />)
    await screen.findByTestId('host')

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: pack(11, { type: 'patch', slots: { cell: 'Badge:нетакого' } }),
          origin: window.location.origin,
          source: window.parent,
        }),
      )
    })

    // Утверждаем ОБЕ половины: слова отказа есть, а откатившееся содержимое
    // (первый кейс Badge — `base`) — нет. Проверка одной половины в одиночку
    // прошла бы и на молчаливом откате (там тоже нет наших слов ошибки,
    // просто потому что рисуется что-то другое) — а другая половина в
    // одиночку прошла бы, даже если бы кадр вообще ничего не отказывал.
    await screen.findByText('у «Badge» нет кейса «нетакого»')
    expect(screen.queryByTestId('fill')).toBeNull()
  })
})

describe('отказ: позицию фикстура не объявляла (Ruling 9) — виден в кадре, а не в карте', () => {
  it('уходит в отдельную полосу под превью, а не пропадает бесследно', async () => {
    vi.mocked(loadFixture).mockImplementation(async (name: string) => {
      if (name === 'Host') return HOST
      if (name === 'Badge') return BADGE
      return null
    })

    window.history.pushState({}, '', '/frame.html?c=Host&sid=13')
    render(<Frame />)
    await screen.findByTestId('host')

    // `Host` не объявлял позицию `zzz` — HOST.render читает только slots.cell,
    // и узел под ключом 'zzz' в карте fills никто не прочитал бы. Раньше этот
    // отказ строился и терялся молча; санитар утверждает, что сегодня он
    // виден в DOM, в СВОЕЙ полосе, а не то, что он вообще где-то построен.
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: pack(13, { type: 'patch', slots: { zzz: 'Badge' } }),
          origin: window.location.origin,
          source: window.parent,
        }),
      )
    })

    const msg = await screen.findByText('позиция «zzz»: фикстура «Host» её не объявляла')
    expect(msg.closest('.wbf-slot-unplaced')).not.toBeNull()
  })
})

/**
 * Находка Task 3 → Task 5 (progress.md, Ruling-без-номера в конце Task 3):
 * у эффекта загрузки САМОЙ фикстуры (`loadFixture(state.c).then(...)`) не
 * было `.catch`. Битый модуль (есть, но падает при импорте) даёт ровно ту же
 * патологию, ради ухода от которой в `loadKinds` (карта видов, тот же файл)
 * заведён `.catch` на КАЖДУЮ фикстуру: без него промис отклоняется
 * необработанным, `ready` никогда не уходит наверх, и оболочка через
 * READY_TIMEOUT_MS решает, что кадр молчит, — вместо внятного «фикстура не
 * грузится». Лечится тем же приёмом.
 */
describe('загрузка самой фикстуры: модуль есть, но падает при импорте', () => {
  it('ready уходит всё равно, а слова отличают «файла нет» от «файл падает»', async () => {
    vi.mocked(loadFixture).mockImplementation(async (name: string) => {
      if (name === 'Host') throw new Error('boom')
      return null
    })

    const spy = vi.spyOn(window, 'postMessage')
    window.history.pushState({}, '', '/frame.html?c=Host&sid=21')
    render(<Frame />)

    // Слова отличают диагноз: файла нет вовсе (не ошибка) — и файл есть, но
    // падает при импорте (ошибка). Одна и та же пустота для обоих читалась
    // бы как «фикстуры нет», хотя правда в двух случаях разная.
    await screen.findByText('Фикстура не грузится')
    expect(screen.queryByText('Фикстуры нет')).toBeNull()

    // Утверждаем САМ факт отправки `ready`, а не только текст на экране: без
    // `.catch` `fx` остался бы `undefined` навсегда, `Frame` рисовал бы `null`
    // (ни текста, ни ошибки) — мутация «убрать .catch» роняет именно
    // `findByText` по таймауту, а не эту проверку саму по себе; обе половины
    // вместе исключают случай «текст совпал случайно, ready не уходил».
    const sent = spy.mock.calls.map(([m]) => m as Envelope<Up>)
    expect(sent.some((m) => m.body.type === 'ready' && m.body.meta === null)).toBe(true)
    spy.mockRestore()
  })
})

/**
 * Ревью Task 5+6, п. 7 (второй круг): `.catch` был навешен ПОСЛЕ `.then`
 * (цепочкой) — `.then(ok).catch(err)`. У цепочки `err` ловит броски из ОБЕИХ
 * веток: и отклонение исходного промиса, и исключение из своего же
 * УСПЕШНОГО `ok` (`metaOf`, `postMessage` в эффекте выше). Брось что-нибудь
 * внутри `ok` — и код молча объявил бы рабочую фикстуру «не грузится» и
 * отправил второй, лживый `ready`. Двухаргументная форма `.then(ok, err)`
 * эту дыру закрывает структурно: `err` вызывается ТОЛЬКО если отклонился
 * исходный промис.
 *
 * ПЕРВАЯ ВЕРСИЯ этого санитара была голым `Promise` без единого импорта из
 * `frame-app.tsx` — утверждала гарантию спецификации `Promise.prototype.then`,
 * а не наш код: откати `frame-app.tsx` к `.then(ok).catch(err)` — она не
 * покраснела бы, потому что не исполняет код вообще. Заменена на подмену
 * `metaOf` (ревью, `vi.mock('./fixture-meta.js', ...)` — у самого верха
 * файла, рядом с подменой `registry.js`): она зовётся ИМЕННО в успешной
 * ветке `.then`, ровно там, где формы расходятся, — и throw в ней
 * подстраивается, а не ловится ручной раскладкой микротасков.
 */
describe('.then(ok, err): бросок ВНУТРИ успешной ветки не путается с ошибкой загрузки', () => {
  it('фикстура загрузилась, metaOf сломался — диагноз не «не грузится», второй ready не уходит', async () => {
    vi.mocked(loadFixture).mockImplementation(async (name: string) => (name === 'Host' ? HOST : null))
    // Точечный бросок — ОДИН вызов, дальше `metaOf` вернётся к настоящей
    // реализации сам (см. комментарий у `vi.mock` выше).
    vi.mocked(metaOf).mockImplementationOnce(() => {
      throw new Error('метаданные не собрались')
    })

    // ОЖИДАЕМОЕ следствие верного кода: бросок из `ok` уходит в
    // НЕОБРАБОТАННОЕ отклонение (`err` в `.then(ok, err)` его не видит —
    // предмет всего санитара). Это не побочный шум теста, а сам механизм,
    // который проверяется, — и в проде это было бы честной громкой ошибкой
    // в консоли вместо тихого неверного диагноза. Слушатель ловит её здесь,
    // чтобы тестовый ран не падал на «unhandled rejection» ОТДЕЛЬНО от
    // утверждений ниже (снят обязательно, `finally`, иначе потёк бы в
    // соседние тесты файла).
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)

    try {
      const spy = vi.spyOn(window, 'postMessage')
      window.history.pushState({}, '', '/frame.html?c=Host&sid=71')
      render(<Frame />)

      // НЕ ждём появления `host` в DOM: под правильным кодом это сработало
      // бы (единственный `setFx(HOST)`, состояние стабильно), но под
      // МУТАЦИЕЙ — нет. `.then(ok).catch(err)` даёт ДВА вызова `setFx`
      // (сперва `HOST` внутри `ok`, потом `null` внутри `catch`, на
      // следующем тике промиса), а React схлопывает их в ОДИН коммит —
      // `host` не появляется в DOM НИ НА МГНОВЕНИЕ, найти его нечем, и
      // `findByTestId` падал бы таймаутом ДО строк с утверждениями ниже,
      // ни разу их не исполнив (ровно то, что поймало повторное ре-ревью —
      // «санитар не о том, что врёт»: сторож стоит, но не там).
      //
      // Вместо ожидания узла — слив микрозадач до пустоты. Его делает САМ
      // `act` с асинхронной областью: он прогоняет очередь, пока в ней
      // что-то есть, и только потом отдаёт управление. Тело области пустое
      // не по недосмотру — слив и есть вся работа этого вызова.
      //
      // ГРАНИЦА, названная честно (первая редакция комментария здесь врала).
      // Раньше тут крутился счётный цикл на 8 витков `await
      // Promise.resolve()` с объяснением «глубина цепочки два тика, восемь —
      // четырёхкратный запас», и хрупкость числа была записана в отчёт.
      // Числа нет: слив ничем не ограничен, а цикл не работал вовсе.
      // Измерено тремя мутациями (`.then(ok, err)` → `.then(ok).catch(err)`
      // в `frame-app.tsx`, тест обязан краснеть):
      //   0 витков цикла, цепочка как есть           → краснеет;
      //   0 витков, цепочка углублена на 10 звеньев  → краснеет;
      //   0 витков, цепочка углублена на 100 звеньев → краснеет.
      // А вот `act` — несущий: снять его целиком, оставив всё прочее, и тест
      // падает уже на ЗДОРОВОМ коде (`unhandled` пуст — бросок не успел). То
      // есть углубление цепочки в эффекте `frame-app.tsx` этому санитару не
      // грозит ничем; сломает его только потеря `act` или потеря самого
      // броска.
      //
      // Почему не `waitFor`: он ждёт НАСТУПЛЕНИЯ события, а при верном коде
      // здесь не наступает ничего — второй `ready` не отправляется, узел
      // «не грузится» не появляется. Ждать нечего, и на здоровом коде
      // `waitFor` просто истёк бы по таймауту.
      await act(async () => {})

      // Утверждаем РАЗЛИЧИМОСТЬ двух состояний, не каждое по отдельности
      // (CLAUDE.md, случай 6): под `.then(ok).catch(err)` ОБА ломаются разом
      // (ложный диагноз И второй `ready`), под `.then(ok, err)` ОБА истинны.
      // Оба утверждения теперь ИСПОЛНЯЮТСЯ под мутацией (см. текст падения
      // в отчёте) — ждать больше нечего, слив микрозадач выше уже случился.
      //
      // 1. Диагноз НЕ «фикстура не грузится» — она ЗАГРУЗИЛАСЬ, сломались
      //    метаданные, и врать о причине нельзя.
      expect(screen.queryByText('Фикстура не грузится')).toBeNull()

      // 2. Наверх НЕ ушёл второй, лживый `ready` (ошибочной ветки).
      const readyCount = spy.mock.calls
        .map(([m]) => m as Envelope<Up>)
        .filter((m) => m.body.type === 'ready').length
      expect(readyCount).toBe(0)

      spy.mockRestore()

      // 3. Бросок и правда УШЁЛ, а не был случайно проглочен где-то ещё —
      //    иначе утверждения 1–2 прошли бы и на коде, который вообще не
      //    зовёт `metaOf`.
      expect(unhandled).toHaveLength(1)
      expect(String((unhandled[0] as Error).message)).toContain('метаданные не собрались')
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })
})

/**
 * Финальное ревью фазы 4, Important 1: `loadFills` — третий асинхронный путь
 * кадра, и у него не было ветки отказа вовсе. `.then` без `onRejected` даёт
 * ровно ту болезнь, ради ухода от которой заведены `.then(ok, err)` у загрузки
 * самой фикстуры и `.catch` на каждую фикстуру в `loadKinds`: `setFills` не
 * позвался бы, и на экране осталась бы ПРЕЖНЯЯ начинка при уже сменившемся
 * адресе — «врёт, а не молчит».
 */
const BADGE_THAT_THROWS: AnyFixture = {
  name: 'Boom',
  group: 'G',
  props: {},
  controls: {},
  kind: 'inline',
  cases: [{ id: 'base', title: 'B' }],
  render: () => {
    throw new Error('фикстура начинки взорвалась')
  },
}

describe('отказ: начинка ПАДАЕТ при построении узла (try/catch в loadFills)', () => {
  it('позиция получает узел отказа, а прежняя (рабочая) начинка больше не видна', async () => {
    vi.mocked(loadFixture).mockImplementation(async (name: string) => {
      if (name === 'Host') return HOST
      if (name === 'Badge') return BADGE
      if (name === 'Boom') return BADGE_THAT_THROWS
      return null
    })

    window.history.pushState({}, '', '/frame.html?c=Host&sid=31')
    render(<Frame />)
    await screen.findByTestId('host')

    // Сперва рабочая начинка — то самое «прежнее содержимое», которое
    // отказ обязан заменить, а не оставить рядом с собой.
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: pack(31, { type: 'patch', slots: { cell: 'Badge:base' } }),
          origin: window.location.origin,
          source: window.parent,
        }),
      )
    })
    await screen.findByText('base')

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: pack(31, { type: 'patch', slots: { cell: 'Boom' } }),
          origin: window.location.origin,
          source: window.parent,
        }),
      )
    })

    // Обе половины различимости: слова отказа появились...
    await screen.findByText(/начинка «Boom» упала при построении/)
    // ...и прежней начинки на экране больше нет.
    expect(screen.queryByText('base')).toBeNull()
  })
})

describe('отказ: loadFills целиком отклонился — ветка у самого .then', () => {
  it('слова отказа заменяют прежнюю начинку, а не остаются рядом с ней', async () => {
    vi.mocked(loadFixture).mockImplementation(async (name: string) => {
      if (name === 'Host') return HOST
      if (name === 'Badge') return BADGE
      return null
    })

    window.history.pushState({}, '', '/frame.html?c=Host&sid=33')
    render(<Frame />)
    await screen.findByTestId('host')

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: pack(33, { type: 'patch', slots: { cell: 'Badge:base' } }),
          origin: window.location.origin,
          source: window.parent,
        }),
      )
    })
    await screen.findByText('base')

    // Мутация — не «начинка бросила», а сам `loadFills` бросает СИНХРОННО, до
    // цикла по позициям: `try/catch` вокруг построения узла (санитар выше)
    // этот путь не видит вообще, и ловить его обязана только ветка `.then`.
    vi.mocked(fillsOf).mockImplementationOnce(() => {
      throw new Error('фикстура начинок взорвалась')
    })

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: pack(33, { type: 'patch', slots: { cell: 'Badge:dot' } }),
          origin: window.location.origin,
          source: window.parent,
        }),
      )
    })

    await screen.findByText(/начинки этого случая не удалось построить/)
    expect(screen.queryByText('base')).toBeNull()
  })
})
