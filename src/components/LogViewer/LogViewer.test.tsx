import { render, screen, act, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { LogViewer } from './LogViewer.js'
import type { LogLine } from './LogViewer.js'

/**
 * jsdom не считает раскладку: у каждого элемента высота 0, и окно без подмены
 * измерений схлопнулось бы в одну строку. Подставляем правдоподобные величины,
 * чтобы проверять ЛОГИКУ окна и прокрутки. Геометрию — то, какое правило
 * победило и что получилось, — проверяет `npm run measure` в chromium.
 */
const LINE_H = 20
const VIEW_H = 200
/** Плашка навигатора совпадений: отступ сверху окна и высота. */
const NAV_TOP = 6
const NAV_H = 26
/** Сколько сверху окна отдаётся плашке при прыжке: её низ плюс такой же воздух, как над ней. */
const NAV_INSET = NAV_TOP + NAV_H + NAV_TOP
/** `scrollTop`, при котором строка `row` встаёт сразу под плашкой. */
const underNav = (row: number) => row * LINE_H - NAV_INSET
/** Длиннее этого — текст, который не влезает в потолок `clampLines`. */
const LONG_TEXT = 40

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.classList.contains('ds-log__scroll')) return VIEW_H
      // Потолок МОДЕЛИРУЕТСЯ, а не подразумевается: у раскрытой (и у свободной,
      // при `clampLines={0}`) строки видимая высота равна полной, у обрезанной
      // — одна строка. Без этого замер «переполнилась ли» был бы верен и для
      // раскрытой, и мутация «мерить раскрытую тоже» выживала бы (DS-194).
      const free = this.classList.contains('ds-log__text--open')
        || this.classList.contains('ds-log__text--free')
      if (this.classList.contains('ds-log__text') && free) return this.scrollHeight
      return LINE_H
    },
  })
  /**
   * ПЕРЕПОЛНЕНИЕ строки — то, чего в jsdom нет вовсе: `scrollHeight` там ноль у
   * всего. Подменяем ровно у текста строки и ровно по длине: «длинный» текст
   * не влезает в потолок, короткий влезает. Проверяется этим ЛОГИКА выбора
   * (замер → кнопка или распорка), а не раскладка; что `-webkit-line-clamp`
   * действительно режет и `scrollHeight` действительно больше — предмет
   * chromium, случай `LogViewer: обрезанная строка занимает ровно объявленное
   * число строк` в `make measure` (DS-194).
   */
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      if (!this.classList.contains('ds-log__text')) return 0
      return (this.textContent ?? '').length > LONG_TEXT ? LINE_H * 4 : LINE_H
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: HTMLElement) {
      // Плашка навигатора — со своей геометрией: `top` и высота РАЗНЫЕ, чтобы
      // отступ прыжка к совпадению (низ плашки плюс воздух, равный верху)
      // отличался и от «только высота», и от «только низ» (DS-325).
      if (this.classList.contains('ds-log__nav')) {
        return { width: 80, height: NAV_H, top: NAV_TOP, left: 700, right: 780, bottom: NAV_TOP + NAV_H, x: 700, y: NAV_TOP, toJSON: () => ({}) }
      }
      const h = this.classList.contains('ds-log__scroll') ? VIEW_H : LINE_H
      return { width: 800, height: h, top: 0, left: 0, right: 800, bottom: h, x: 0, y: 0, toJSON: () => ({}) }
    },
  })
  if (!('ResizeObserver' in globalThis)) {
    class RO {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(globalThis, 'ResizeObserver', { value: RO, writable: true, configurable: true })
  }
})

/** Прокрутка в jsdom не двигается сама — задаём и стреляем событием. */
function scrollTo(el: HTMLElement, top: number, scrollHeight: number) {
  Object.defineProperty(el, 'scrollTop', { value: top, writable: true, configurable: true })
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, writable: true, configurable: true })
  fireEvent.scroll(el)
}

/** Форма, близкая к реальной у потребителя: identity из run_id + seq. */
interface Entry extends LogLine {
  runId: string
  seq: number
}

const line = (seq: number, text: string, kind = 'out'): Entry => ({
  runId: 'r1', seq, ts: `2026-07-29T12:00:${String(seq).padStart(2, '0')}+03:00`, kind, text,
})

const lines: Entry[] = [
  line(1, 'запуск воркера', 'sys'),
  line(2, 'Готовлю ответ по задаче TK-418'),
  line(3, 'ошибка соединения', 'err'),
]

const id = (l: Entry) => `${l.runId}:${l.seq}`
const labels = { sys: 'Система', out: 'Ответ', err: 'Ошибка' }

describe('LogViewer', () => {
  it('рисует строки в полученном порядке', () => {
    const { container } = render(<LogViewer lines={lines} getLineId={id} labels={labels} />)
    const rows = container.querySelectorAll('.ds-log__line')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('запуск воркера')
    expect(rows[2]).toHaveTextContent('ошибка соединения')
  })

  it('берёт подпись вида из labels, без ключа показывает сырой kind', () => {
    render(<LogViewer lines={lines} getLineId={id} labels={{ sys: 'Система' }} />)
    expect(screen.getByText('Система')).toBeInTheDocument()
    expect(screen.getAllByText('out').length).toBeGreaterThan(0)
  })

  it('красит вид по карте тонов, неизвестный kind даёт neutral', () => {
    const { container } = render(
      <LogViewer lines={lines} getLineId={id} labels={labels} tones={{ err: 'error' }} />,
    )
    const kinds = container.querySelectorAll('.ds-log__kind')
    expect(kinds[2]).toHaveClass('ds-log__kind--error')
    expect(kinds[0]).toHaveClass('ds-log__kind--neutral')
  })

  it('hiddenKinds прячет строки указанных видов, остальные видны', () => {
    const { container } = render(
      <LogViewer lines={lines} getLineId={id} labels={labels} hiddenKinds={new Set(['err'])} />,
    )
    expect(container.querySelectorAll('.ds-log__line')).toHaveLength(2)
    expect(container.querySelector('.ds-log__line')!).toHaveTextContent('запуск воркера')
    expect(container.textContent).not.toContain('ошибка соединения')
  })

  it('hiddenKinds — видимость, не фильтрация данных: входной массив цел', () => {
    const snapshot = [...lines]
    render(<LogViewer lines={lines} getLineId={id} hiddenKinds={new Set(['out'])} />)
    expect(lines).toEqual(snapshot)
    expect(lines).toHaveLength(3)
  })

  it('неизвестный kind в hiddenKinds не выкидывает видимых строк', () => {
    const { container } = render(
      <LogViewer lines={lines} getLineId={id} hiddenKinds={new Set(['nope'])} />,
    )
    expect(container.querySelectorAll('.ds-log__line')).toHaveLength(3)
  })

  it('подсвечивает вхождения запроса', () => {
    const { container } = render(
      <LogViewer lines={lines} getLineId={id} labels={labels} query="ошибк" />,
    )
    const marks = container.querySelectorAll('.ds-log__hit')
    expect(marks).toHaveLength(1)
    expect(marks[0]).toHaveTextContent('ошибк')
  })

  it('подсвечивает независимо от регистра', () => {
    const { container } = render(
      <LogViewer lines={lines} getLineId={id} labels={labels} query="ГОТОВЛЮ" />,
    )
    expect(container.querySelectorAll('.ds-log__hit')).toHaveLength(1)
  })

  it('подсвечивает все вхождения в одной строке, а не только первое', () => {
    const { container } = render(
      <LogViewer lines={[line(1, 'да, да, да')]} getLineId={id} query="да" />,
    )
    expect(container.querySelectorAll('.ds-log__hit')).toHaveLength(3)
  })

  it('не убирает ни одной строки — запрос подсвечивает, но не фильтрует', () => {
    const { container } = render(
      <LogViewer lines={lines} getLineId={id} labels={labels} query="ошибк" />,
    )
    expect(container.querySelectorAll('.ds-log__line')).toHaveLength(3)
  })

  it('пустой запрос не режет текст на куски', () => {
    const { container } = render(
      <LogViewer lines={[line(1, 'целая строка')]} getLineId={id} query="" />,
    )
    expect(container.querySelectorAll('.ds-log__hit')).toHaveLength(0)
    expect(container.querySelector('.ds-log__text')).toHaveTextContent('целая строка')
  })

  it('спецсимволы регэкспа в запросе не ломают разбор и ищутся буквально', () => {
    const { container } = render(
      <LogViewer lines={[line(1, 'путь a.b(c)[d] и просто axb')]} getLineId={id} query="a.b(c)[d]" />,
    )
    const marks = container.querySelectorAll('.ds-log__hit')
    expect(marks).toHaveLength(1)
    expect(marks[0]).toHaveTextContent('a.b(c)[d]')
  })

  it('запрос без вхождений оставляет текст целым', () => {
    const { container } = render(
      <LogViewer lines={[line(1, 'целая строка')]} getLineId={id} query="зззз" />,
    )
    expect(container.querySelectorAll('.ds-log__hit')).toHaveLength(0)
    expect(container.querySelector('.ds-log__text')).toHaveTextContent('целая строка')
  })

  it('обрезка объявлена переменной и снимается нулём', () => {
    const { container: clamped } = render(<LogViewer lines={lines} getLineId={id} />)
    const text = clamped.querySelector('.ds-log__text') as HTMLElement
    expect(text.style.getPropertyValue('--ds-log-clamp')).toBe('3')

    const { container: free } = render(<LogViewer lines={lines} getLineId={id} clampLines={0} />)
    expect(free.querySelector('.ds-log__text')).toHaveClass('ds-log__text--free')
  })

  it('метка времени машиночитаема и по умолчанию несёт секунды', () => {
    const { container } = render(<LogViewer lines={lines} getLineId={id} />)
    const t = container.querySelector('time')!
    expect(t).toHaveAttribute('dateTime', lines[0].ts)
    // Лог читают по секундам: две строки в одну минуту иначе неразличимы.
    expect(t.textContent).toMatch(/\d{2}:\d{2}:\d{2}/)
  })

  it('свой formatTime побеждает дефолт', () => {
    const { container } = render(
      <LogViewer lines={lines} getLineId={id} formatTime={() => 'ТОГДА'} />,
    )
    expect(container.querySelector('time')).toHaveTextContent('ТОГДА')
  })

  it('стрим рисуется, только когда он есть', () => {
    const withStream = [{ ...line(1, 'текст'), stream: 'stdout' }]
    const { container: a } = render(<LogViewer lines={withStream} getLineId={id} />)
    expect(a.querySelector('.ds-log__stream')).toHaveTextContent('stdout')
    const { container: b } = render(<LogViewer lines={lines} getLineId={id} />)
    expect(b.querySelector('.ds-log__stream')).toBeNull()
  })

  it('getLineId служит ключом — одинаковый ts у разных строк не схлопывает их', () => {
    const sameTs: Entry[] = [
      { runId: 'r1', seq: 1, ts: '2026-07-29T12:00:00.000+03:00', kind: 'out', text: 'первая' },
      { runId: 'r1', seq: 2, ts: '2026-07-29T12:00:00.000+03:00', kind: 'out', text: 'вторая' },
    ]
    const { container } = render(<LogViewer lines={sameTs} getLineId={id} />)
    expect(container.querySelectorAll('.ds-log__line')).toHaveLength(2)
  })

  const many = (n: number, from = 1) =>
    Array.from({ length: n }, (_, i) => line(from + i, `строка ${from + i}`))
  /** То же, но текстом, который не влезает в потолок: у такой строки есть кнопка. */
  const manyLong = (n: number, from = 1) =>
    Array.from({ length: n }, (_, i) =>
      line(from + i, `строка ${from + i} ${'очень длинный хвост '.repeat(4)}`))
  const scroller = (c: HTMLElement) => c.querySelector('.ds-log__scroll') as HTMLElement

  describe('окно и прокрутка', () => {
    it('рисует не весь список, а окно вокруг видимого', () => {
      const { container } = render(<LogViewer lines={many(500)} getLineId={id} />)
      const drawn = container.querySelectorAll('.ds-log__line').length
      expect(drawn).toBeGreaterThan(0)
      expect(drawn).toBeLessThan(500)
    })

    it('держит полную высоту списка распорками, а не отрисовкой всех строк', () => {
      const { container } = render(<LogViewer lines={many(500)} getLineId={id} />)
      const pads = container.querySelectorAll('.ds-log__pad')
      expect(pads).toHaveLength(2)
      const h = (el: Element) => parseFloat((el as HTMLElement).style.height) || 0
      const drawn = container.querySelectorAll('.ds-log__line').length
      // Распорки плюс отрисованное обязаны давать всю высоту — иначе полоса
      // прокрутки живёт своей жизнью.
      expect(h(pads[0]) + drawn * LINE_H + h(pads[1])).toBeCloseTo(500 * LINE_H, 0)
    })

    it('при скрытых видах окно идёт по видимому подсписку', () => {
      // Половина видов скрыта — видимых вдвое меньше; распорки и окно — по ним.
      const mixed = Array.from({ length: 200 }, (_, i) =>
        line(i + 1, `строка ${i + 1}`, i % 2 === 0 ? 'out' : 'err'))
      const { container } = render(
        <LogViewer lines={mixed} getLineId={id} hiddenKinds={new Set(['err'])} />,
      )
      const drawn = container.querySelectorAll('.ds-log__line')
      expect(drawn.length).toBeGreaterThan(0)
      expect(drawn.length).toBeLessThan(100)
      // Все отрисованные — вида out (скрытого err нет).
      for (const row of drawn) {
        expect(row.querySelector('.ds-log__kind')!.textContent).toBe('out')
      }
      const pads = container.querySelectorAll('.ds-log__pad')
      const h = (el: Element) => parseFloat((el as HTMLElement).style.height) || 0
      // 100 видимых строк по LINE_H — полная высота именно видимого подсписка.
      expect(h(pads[0]) + drawn.length * LINE_H + h(pads[1])).toBeCloseTo(100 * LINE_H, 0)
    })

    it('зовёт onReachTop у верхней границы', () => {
      const onReachTop = vi.fn()
      const { container } = render(
        <LogViewer lines={many(500)} getLineId={id} onReachTop={onReachTop} />,
      )
      scrollTo(scroller(container), 0, 500 * LINE_H)
      expect(onReachTop).toHaveBeenCalledTimes(1)
    })

    it('не зовёт onReachTop повторно, пока массив не изменился', () => {
      const onReachTop = vi.fn()
      const { container } = render(
        <LogViewer lines={many(500)} getLineId={id} onReachTop={onReachTop} />,
      )
      const el = scroller(container)
      scrollTo(el, 0, 500 * LINE_H)
      scrollTo(el, 2, 500 * LINE_H)
      scrollTo(el, 0, 500 * LINE_H)
      // Иначе потребитель получил бы шквал запросов before_ts, пока
      // пользователь просто стоит наверху.
      expect(onReachTop).toHaveBeenCalledTimes(1)
    })

    it('снова зовёт onReachTop после того, как старые строки приехали', () => {
      const onReachTop = vi.fn()
      const { container, rerender } = render(
        <LogViewer lines={many(200)} getLineId={id} onReachTop={onReachTop} />,
      )
      const el = scroller(container)
      scrollTo(el, 0, 200 * LINE_H)
      expect(onReachTop).toHaveBeenCalledTimes(1)
      rerender(<LogViewer lines={[...many(50, 1000), ...many(200)]} getLineId={id} onReachTop={onReachTop} />)
      scrollTo(el, 0, 250 * LINE_H)
      expect(onReachTop).toHaveBeenCalledTimes(2)
    })

    it('не зовёт onReachTop при прокрутке в середине', () => {
      const onReachTop = vi.fn()
      const { container } = render(
        <LogViewer lines={many(500)} getLineId={id} onReachTop={onReachTop} />,
      )
      scrollTo(scroller(container), 4000, 500 * LINE_H)
      expect(onReachTop).not.toHaveBeenCalled()
    })

    it('подгрузка вверх сдвигает прокрутку на высоту приехавших строк', () => {
      const { container, rerender } = render(<LogViewer lines={many(100)} getLineId={id} />)
      const el = scroller(container)
      scrollTo(el, 300, 100 * LINE_H)
      rerender(<LogViewer lines={[...many(10, 900), ...many(100)]} getLineId={id} />)
      // Десять строк приехали сверху — смещение обязано вырасти ровно на их
      // высоту, иначе пользователя унесёт от того места, куда он смотрел.
      expect(el.scrollTop).toBe(300 + 10 * LINE_H)
    })

    it('подмена массива не сдвигает прокрутку — это другой список, а не подгрузка', () => {
      const { container, rerender } = render(<LogViewer lines={many(100)} getLineId={id} />)
      const el = scroller(container)
      scrollTo(el, 300, 100 * LINE_H)
      rerender(<LogViewer lines={many(40, 5000)} getLineId={id} />)
      expect(el.scrollTop).not.toBe(300 + 40 * LINE_H)
    })

    it('следует за низом, пока пользователь у низа', () => {
      const { container, rerender } = render(<LogViewer lines={many(50)} getLineId={id} />)
      const el = scroller(container)
      rerender(<LogViewer lines={many(60)} getLineId={id} />)
      expect(el.scrollTop).toBe(el.scrollHeight - VIEW_H)
    })

    it('прокрутка вверх ставит следование на паузу и показывает кнопку возврата', () => {
      const { container, rerender } = render(<LogViewer lines={many(200)} getLineId={id} />)
      const el = scroller(container)
      expect(container.querySelector('.ds-log__tail')).toBeNull()
      scrollTo(el, 400, 200 * LINE_H)
      expect(container.querySelector('.ds-log__tail')).not.toBeNull()
      const before = el.scrollTop
      rerender(<LogViewer lines={many(220)} getLineId={id} />)
      // На паузе новые строки не утаскивают вниз.
      expect(el.scrollTop).toBe(before)
    })

    it('кнопка возврата снимает паузу и уводит вниз', () => {
      const { container } = render(<LogViewer lines={many(200)} getLineId={id} />)
      const el = scroller(container)
      scrollTo(el, 400, 200 * LINE_H)
      act(() => {
        (container.querySelector('.ds-log__tail') as HTMLButtonElement).click()
      })
      expect(el.scrollTop).toBe(el.scrollHeight - VIEW_H)
      expect(container.querySelector('.ds-log__tail')).toBeNull()
    })

    it('возврат прокруткой к низу тоже снимает паузу', () => {
      const { container } = render(<LogViewer lines={many(200)} getLineId={id} />)
      const el = scroller(container)
      scrollTo(el, 400, 200 * LINE_H)
      expect(container.querySelector('.ds-log__tail')).not.toBeNull()
      scrollTo(el, 200 * LINE_H - VIEW_H, 200 * LINE_H)
      expect(container.querySelector('.ds-log__tail')).toBeNull()
    })

    it('числовая высота растёт вместе с масштабом интерфейса, строковая идёт как есть', () => {
      const { container: num } = render(<LogViewer lines={many(5)} getLineId={id} height={240} />)
      expect((num.querySelector('.ds-log') as HTMLElement).style.height)
        .toBe('calc(240px * var(--ds-ui-scale, 1))')
      const { container: str } = render(<LogViewer lines={many(5)} getLineId={id} height="60vh" />)
      expect((str.querySelector('.ds-log') as HTMLElement).style.height).toBe('60vh')
    })

    it('разворот меняет только свою строку', () => {
      // Строки ДЛИННЫЕ: кнопка теперь стоит только у переполненных
      // (DS-194), и на коротких этому случаю нечего было бы нажимать.
      const { container } = render(<LogViewer lines={manyLong(5)} getLineId={id} />)
      const toggles = container.querySelectorAll('button.ds-log__toggle')
      expect(toggles.length).toBeGreaterThan(0)
      act(() => { (toggles[1] as HTMLButtonElement).click() })
      const texts = container.querySelectorAll('.ds-log__text')
      expect(texts[1]).toHaveClass('ds-log__text--open')
      expect(texts[0]).not.toHaveClass('ds-log__text--open')
      expect(toggles[1]).toHaveAttribute('aria-expanded', 'true')
    })

    /**
     * КНОПКА СТОИТ ТОЛЬКО ТАМ, ГДЕ ЕСТЬ ЧТО РАЗВОРАЧИВАТЬ (DS-194).
     *
     * `clamped` был свойством ПАНЕЛИ — одно значение пропа на весь список, — и
     * кнопка «Развернуть строку» стояла на каждой строке. Замерено на приёмке
     * волны 6: 900 — кнопок 10 при 0 переполненных, 768 — 10 при 1, 360 — 8
     * при 8. Нажатие ложной кнопки не меняло ничего, но `aria-expanded`
     * переключался: диктор подтверждал действие, которого не произошло, и
     * каждая такая кнопка стоила таб-стопа.
     *
     * Проверяется РАЗЛИЧЕНИЕМ на одном экране: длинные и короткие строки
     * вперемешку. Список из одних длинных прошёл бы и у панельного флага.
     */
    const mixedLen = () => [
      line(1, 'коротко'),
      line(2, `длинная ${'хвост '.repeat(12)}`),
      line(3, 'тоже коротко'),
      line(4, `и ещё длинная ${'хвост '.repeat(12)}`),
    ]

    it('кнопка — у переполненных, распорка — у остальных', () => {
      const { container } = render(<LogViewer lines={mixedLen()} getLineId={id} />)
      const rows = Array.from(container.querySelectorAll('.ds-log__line'))
      const hasButton = rows.map((r) => !!r.querySelector('button.ds-log__toggle'))
      expect(hasButton).toEqual([false, true, false, true])
      // Распорка на месте отсутствующей кнопки ОБЯЗАТЕЛЬНА: без неё колонки
      // разъезжаются между строками. Она та же, что при `clampLines={0}`.
      const spacers = container.querySelectorAll('.ds-log__toggle--empty')
      expect(spacers).toHaveLength(2)
      expect(spacers[0]).toHaveAttribute('aria-hidden', 'true')
      // И у каждой строки ровно один элемент на этом месте — кнопка ИЛИ
      // распорка, не оба и не ничего.
      for (const r of rows) expect(r.querySelectorAll('.ds-log__toggle')).toHaveLength(1)
    })

    it('раскрытая строка кнопку не теряет — иначе её нечем свернуть', () => {
      const { container } = render(<LogViewer lines={mixedLen()} getLineId={id} />)
      const btn = container.querySelectorAll('button.ds-log__toggle')[0] as HTMLButtonElement
      act(() => { btn.click() })
      // Раскрытая строка потолка не имеет, `scrollHeight === clientHeight` —
      // наивный замер объявил бы её невлезающей и отобрал кнопку.
      const row = btn.closest('.ds-log__line')!
      expect(row.querySelector('button.ds-log__toggle')).toBeTruthy()
      expect(row.querySelector('button.ds-log__toggle')).toHaveAttribute('aria-expanded', 'true')
      act(() => { (row.querySelector('button.ds-log__toggle') as HTMLButtonElement).click() })
      expect(row.querySelector('button.ds-log__toggle')).toHaveAttribute('aria-expanded', 'false')
    })

    it('без потолка (clampLines={0}) кнопок нет вовсе, даже у длинных', () => {
      const { container } = render(<LogViewer lines={mixedLen()} getLineId={id} clampLines={0} />)
      expect(container.querySelectorAll('button.ds-log__toggle')).toHaveLength(0)
      expect(container.querySelectorAll('.ds-log__toggle--empty')).toHaveLength(4)
    })
  })

  describe('навигация по совпадениям', () => {
    // ХИТ в каждой 10-й строке: при n=50 — строки 0,10,20,30,40 (5 совпадений).
    const mixed = (n: number) => Array.from({ length: n }, (_, i) =>
      line(i + 1, i % 10 === 0 ? `ХИТ строка ${i + 1}` : `строка ${i + 1}`))
    const navBtns = (c: HTMLElement) => c.querySelectorAll<HTMLButtonElement>('.ds-log__nav-btn')
    const navCount = (c: HTMLElement) => c.querySelector('.ds-log__nav-count')!.textContent

    it('навигатор виден только при заданном query', () => {
      const { container: withQ } = render(<LogViewer lines={many(10)} getLineId={id} query="строка" />)
      expect(withQ.querySelector('.ds-log__nav')).not.toBeNull()
      const { container: noQ } = render(<LogViewer lines={many(10)} getLineId={id} />)
      expect(noQ.querySelector('.ds-log__nav')).toBeNull()
    })

    it('считает совпадения по видимому подсписку', () => {
      const { container } = render(<LogViewer lines={mixed(50)} getLineId={id} query="ХИТ" />)
      expect(navCount(container)).toBe('1/5')
    })

    it('совпадения скрытого вида не считаются', () => {
      const data = [
        line(1, 'ХИТ один', 'out'),
        line(2, 'ХИТ два', 'err'),
        line(3, 'мимо', 'out'),
      ]
      const { container } = render(
        <LogViewer lines={data} getLineId={id} query="ХИТ" hiddenKinds={new Set(['err'])} />,
      )
      expect(navCount(container)).toBe('1/1')
    })

    it('next/prev цикличны и двигают текущий индекс', () => {
      const { container } = render(<LogViewer lines={mixed(50)} getLineId={id} query="ХИТ" />)
      expect(navCount(container)).toBe('1/5')
      act(() => { navBtns(container)[1]!.click() }) // next → 2/5
      expect(navCount(container)).toBe('2/5')
      act(() => { navBtns(container)[1]!.click() }) // next → 3/5
      expect(navCount(container)).toBe('3/5')
      act(() => { navBtns(container)[0]!.click() }) // prev → 2/5
      expect(navCount(container)).toBe('2/5')
    })

    it('next зацикливается к началу с последнего совпадения', () => {
      const { container } = render(<LogViewer lines={mixed(20)} getLineId={id} query="ХИТ" />)
      // mixed(20): ХИТ в 0,10 → 2 совпадения. С начала (1/2) → next → 2/2 → next → 1/2.
      expect(navCount(container)).toBe('1/2')
      act(() => { navBtns(container)[1]!.click() })
      expect(navCount(container)).toBe('2/2')
      act(() => { navBtns(container)[1]!.click() })
      expect(navCount(container)).toBe('1/2')
    })

    it('без совпадений — 0/0 и кнопки выключены', () => {
      const { container } = render(<LogViewer lines={many(10)} getLineId={id} query="ззззз" />)
      expect(navCount(container)).toBe('0/0')
      const [prev, next] = navBtns(container)
      expect(prev).toBeDisabled()
      expect(next).toBeDisabled()
    })

    it('next прокручивает к следующему совпадению через offsetOf', () => {
      const { container } = render(
        <LogViewer lines={mixed(50)} getLineId={id} query="ХИТ" height={200} />,
      )
      const el = scroller(container)
      // jsdom не считает layout: дать scrollHeight, иначе scrollTop жмётся к 0.
      Object.defineProperty(el, 'scrollHeight', {
        value: 50 * LINE_H, writable: true, configurable: true,
      })
      // Следующее совпадение — строка 10 видимого подсписка, смещение 10*LINE_H.
      act(() => { navBtns(container)[1]!.click() })
      expect(el.scrollTop).toBe(underNav(10))
      // Навигация ставит следование на паузу — появляется «К последним».
      expect(container.querySelector('.ds-log__tail')).not.toBeNull()
    })

    it('текущее совпадение встаёт ПОД плашкой навигатора, а не под неё', () => {
      // DS-325: прыжок ставил строку на верхнюю кромку окна — ровно туда,
      // где в правом верхнем углу плавает плашка «‹ i/N ›». Свидетель —
      // положение строки относительно окна: её верх ниже низа плашки. Мутация
      // — `scrollToIndex(lineIndex)` без отступа — даёт верх строки 0 при низе
      // плашки 32, кейс красный.
      const { container } = render(
        <LogViewer lines={mixed(50)} getLineId={id} query="ХИТ" height={200} />,
      )
      const el = scroller(container)
      Object.defineProperty(el, 'scrollHeight', { value: 50 * LINE_H, writable: true, configurable: true })
      act(() => { navBtns(container)[1]!.click() }) // → строка 10
      const rowTopInView = 10 * LINE_H - el.scrollTop
      expect(rowTopInView).toBeGreaterThanOrEqual(NAV_TOP + NAV_H)
      // И не дальше, чем нужно: воздух под плашкой равен воздуху над ней.
      expect(rowTopInView).toBe(NAV_INSET)
    })

    it('совпадение у самого начала лога — scrollTop не уходит ниже нуля', () => {
      // Строку 0 из-под плашки прокруткой не вывести, и отрицательный
      // scrollTop не должен из этого получиться.
      const { container } = render(
        <LogViewer lines={mixed(50)} getLineId={id} query="ХИТ" height={200} />,
      )
      const el = scroller(container)
      Object.defineProperty(el, 'scrollHeight', { value: 50 * LINE_H, writable: true, configurable: true })
      act(() => { navBtns(container)[1]!.click() }) // → 2/5
      act(() => { navBtns(container)[0]!.click() }) // → 1/5, строка 0
      expect(navCount(container)).toBe('1/5')
      expect(el.scrollTop).toBe(0)
    })

    // ХИТ начиная с 10-й строки: первое совпадение НЕ в нуле, поэтому прыжок к
    // нему отличим от «никуда не прыгали» — при `mixed` оба дают scrollTop 0.
    const late = (n: number) => Array.from({ length: n }, (_, i) =>
      line(i + 1, i > 0 && i % 10 === 0 ? `ХИТ строка ${i + 1}` : `строка ${i + 1}`))

    /** Раскладки в jsdom нет: без scrollHeight прокрутка жмётся к нулю. */
    const givePage = (el: HTMLElement, n: number) =>
      Object.defineProperty(el, 'scrollHeight', { value: n * LINE_H, writable: true, configurable: true })

    it('строки приехали после запроса — прыгает к первому совпадению тогда', () => {
      // Реальный порядок у потребителя: запрос уже в пропах, ответ сервера ещё
      // в пути. Эффект «на смену query» здесь отрабатывал по пустому списку и
      // больше не запускался — счётчик показывал «0/4», и до первого совпадения
      // пользователь добирался кнопкой ›.
      const { container, rerender } = render(
        <LogViewer lines={[]} getLineId={id} query="ХИТ" height={200} />,
      )
      expect(navCount(container)).toBe('0/0')
      const el = scroller(container)
      givePage(el, 50)
      act(() => { rerender(<LogViewer lines={late(50)} getLineId={id} query="ХИТ" height={200} />) })
      expect(navCount(container)).toBe('1/4')
      expect(el.scrollTop).toBe(underNav(10))
    })

    it('догрузка строк не уносит с текущего совпадения', () => {
      // Обратная сторона того же условия: «прыгаем, если ещё не прыгали».
      // Мутация — убрать `matchIdx >= 0` — красит именно этот кейс.
      const { container, rerender } = render(
        <LogViewer lines={late(50)} getLineId={id} query="ХИТ" height={200} />,
      )
      const el = scroller(container)
      givePage(el, 50)
      act(() => { navBtns(container)[1]!.click() }) // → 2/4
      act(() => { navBtns(container)[1]!.click() }) // → 3/4, строка 30
      expect(navCount(container)).toBe('3/4')
      expect(el.scrollTop).toBe(underNav(30))

      givePage(el, 60)
      act(() => { rerender(<LogViewer lines={late(60)} getLineId={id} query="ХИТ" height={200} />) })
      expect(navCount(container)).toBe('3/5')
      expect(el.scrollTop).toBe(underNav(30))
    })

    it('смена запроса на несовпадающий даёт «0/0», а не «1/0»', () => {
      const { container, rerender } = render(
        <LogViewer lines={late(50)} getLineId={id} query="ХИТ" height={200} />,
      )
      expect(navCount(container)).toBe('1/4')
      act(() => { rerender(<LogViewer lines={late(50)} getLineId={id} query="ззззз" height={200} />) })
      expect(navCount(container)).toBe('0/0')
      const [prev, next] = navBtns(container)
      expect(prev).toBeDisabled()
      expect(next).toBeDisabled()
    })

    it('запрос сменился обратно на совпадающий — прыгает снова', () => {
      // Сброс позиции при смене query проверяется здесь: без него `matchIdx`
      // остался бы неотрицательным с прошлого запроса и прыжок не случился бы.
      const { container, rerender } = render(
        <LogViewer lines={late(50)} getLineId={id} query="ХИТ" height={200} />,
      )
      const el = scroller(container)
      givePage(el, 50)
      act(() => { navBtns(container)[1]!.click() }) // ушли на 2/4
      act(() => { rerender(<LogViewer lines={late(50)} getLineId={id} query="ззззз" height={200} />) })
      act(() => { rerender(<LogViewer lines={late(50)} getLineId={id} query="ХИТ" height={200} />) })
      expect(navCount(container)).toBe('1/4')
      expect(el.scrollTop).toBe(underNav(10))
    })

    it('новый запрос ведёт к своему первому совпадению, а не к прошлой позиции', () => {
      // Тот случай, когда подтяжка индекса не спасает: у нового запроса
      // совпадений не меньше, чем у прошлого, и `matchIdx` остаётся в силе.
      // Пользователь получил бы «2/7», стоя там, куда его привёл ПРОШЛЫЙ поиск.
      // Мутация — убрать сброс `matchIdx` при смене query — красит этот кейс.
      const two = (n: number) => Array.from({ length: n }, (_, i) =>
        line(i + 1, i > 0 && i % 10 === 0 ? `ХИТ строка ${i + 1}`
          : i > 0 && i % 7 === 0 ? `ЗНАК строка ${i + 1}` : `строка ${i + 1}`))

      const { container, rerender } = render(
        <LogViewer lines={two(50)} getLineId={id} query="ХИТ" height={200} />,
      )
      const el = scroller(container)
      givePage(el, 50)
      act(() => { navBtns(container)[1]!.click() }) // 2/4 — строка 20
      expect(el.scrollTop).toBe(underNav(20))

      act(() => { rerender(<LogViewer lines={two(50)} getLineId={id} query="ЗНАК" height={200} />) })
      expect(navCount(container)).toBe('1/7')
      expect(el.scrollTop).toBe(underNav(7))
    })

    it('запрос сменился, пока строк нет, — прыжок случится, когда они приедут', () => {
      // Стык двух эффектов, а не один из них: подтяжка индекса при нуле
      // совпадений обязана оставить -1. Поставит 0 — «уже прыгали» окажется
      // правдой раньше времени, и приехавшие строки застанут пользователя там,
      // где его бросил ПРОШЛЫЙ запрос. Счётчик тут не свидетель: «1/7» он
      // печатает и при matchIdx 0. Свидетель — прокрутка.
      const two = (n: number) => Array.from({ length: n }, (_, i) =>
        line(i + 1, i > 0 && i % 10 === 0 ? `ХИТ строка ${i + 1}`
          : i > 0 && i % 7 === 0 ? `ЗНАК строка ${i + 1}` : `строка ${i + 1}`))

      const { container, rerender } = render(
        <LogViewer lines={two(50)} getLineId={id} query="ХИТ" height={200} />,
      )
      const el = scroller(container)
      givePage(el, 50)
      act(() => { navBtns(container)[1]!.click() }) // 2/4 — строка 20
      expect(el.scrollTop).toBe(underNav(20))

      act(() => { rerender(<LogViewer lines={[]} getLineId={id} query="ЗНАК" height={200} />) })
      expect(navCount(container)).toBe('0/0')

      givePage(el, 50)
      act(() => { rerender(<LogViewer lines={two(50)} getLineId={id} query="ЗНАК" height={200} />) })
      expect(navCount(container)).toBe('1/7')
      expect(el.scrollTop).toBe(underNav(7))
    })
  })

  /**
   * DS-190. У транскрипта `emptyState` был, у лога — нет, и обоснования
   * не было ни в типах, ни в AGENTS.md. Пустая панель заданной высоты — первое,
   * что видит потребитель, и три состояния в ней неразличимы: прогон не
   * начался, прогон не дал вывода, связь оборвалась.
   *
   * Проверяется не «надпись видна», а РАЗЛИЧЕНИЕМ, как требует qa: при непустых
   * строках заглушки быть НЕ ДОЛЖНО. Утверждение «видна» одно прошло бы и на
   * сломанном окне, которое не рисует строк никогда.
   */
  describe('пустое состояние', () => {
    const stub = <span data-stub>прогон не начинался</span>
    const has = (c: HTMLElement) => c.querySelector('.ds-log__empty [data-stub]') !== null

    it('заглушка рисуется на пустом логе и исчезает, как только строки есть', () => {
      const { container, rerender } = render(
        <LogViewer lines={[]} getLineId={id} height={200} emptyState={stub} />,
      )
      expect(has(container), 'заглушка не показана на пустом логе').toBe(true)

      rerender(<LogViewer lines={[line(1, 'первая')]} getLineId={id} height={200} emptyState={stub} />)
      expect(has(container), 'заглушка осталась при непустых строках').toBe(false)
      expect(container.querySelectorAll('.ds-log__line').length, 'строки не отрисовались — проверка мерит пустоту').toBeGreaterThan(0)
    })

    it('лог, целиком спрятанный hiddenKinds, тоже пуст', () => {
      // Строки ЕСТЬ, показывать нечего. Тот же выбор, что у транскрипта с
      // `show.raw: false`: заглушка считается по видимому, а не по входу.
      const lines = [line(1, 'первая', 'error'), line(2, 'вторая', 'error')]
      const { container } = render(
        <LogViewer
          lines={lines} getLineId={id} height={200} emptyState={stub}
          hiddenKinds={new Set(['error'])}
        />,
      )
      expect(has(container)).toBe(true)
    })

    it('навигатор по совпадениям переживает пустоту — он часть панели, а не строк', () => {
      // Первая редакция выходила из компонента рано и уносила навигатор вместе
      // со строками. А «0/0» при заданном query — это ответ на вопрос «нашлось
      // ли что-нибудь», и он нужен ровно тогда, когда строк ещё нет.
      const { container } = render(
        <LogViewer lines={[]} getLineId={id} query="ХИТ" height={200} emptyState={stub} />,
      )
      expect(has(container)).toBe(true)
      expect(container.querySelector('.ds-log__nav-count')?.textContent).toBe('0/0')
    })

    it('без emptyState панель по-прежнему просто пуста', () => {
      // Проп необязательный: потребитель, которому объяснять нечего, не обязан
      // выдумывать текст, и пустой узел не должен занимать место.
      const { container } = render(<LogViewer lines={[]} getLineId={id} height={200} />)
      expect(container.querySelector('.ds-log__empty')?.textContent).toBe('')
    })
  })
})
