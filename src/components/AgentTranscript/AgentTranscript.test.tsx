import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { AgentTranscript } from './AgentTranscript.js'
import type { MessageTurn, EventTurn, RawTurn, AgentTranscriptShow } from './AgentTranscript.js'

/**
 * jsdom не считает раскладку: высоты нулевые, окно схлопывается. Подставляем
 * правдоподобные величины, чтобы проверять ЛОГИКУ окна/прокрутки. Геометрию
 * (какое правило победило) проверяет `npm run measure` в chromium.
 */
const ROW_H = 40
const VIEW_H = 200

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('ds-transcript__scroll') ? VIEW_H : ROW_H
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: HTMLElement) {
      const h = this.classList.contains('ds-transcript__scroll') ? VIEW_H : ROW_H
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

/**
 * Прокрутка в jsdom не двигается сама — задаём и стреляем событием. Высота
 * содержимого задаётся ПОЭЛЕМЕНТНО, а не подменой прототипа: общая на все
 * элементы `scrollHeight` возвращала 4000 и тому, у кого содержимого нет, и
 * «пользователь у низа» становилось вопросом к моку, а не к компоненту.
 * Одинаковая форма с `LogViewer.test.tsx` — там она такой и была.
 */
function scrollTo(el: HTMLElement, top: number, scrollHeight: number) {
  Object.defineProperty(el, 'scrollTop', { value: top, writable: true, configurable: true })
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, writable: true, configurable: true })
  fireEvent.scroll(el)
}

/** Форма потребителя: identity из run_id + seq, как у LogViewer. Объединение
 *  пересечений — каждый член приводим к своему TranscriptTurn-члену, поэтому
 *  компонент выводит T = Entry, а не дефолт. */
type Entry =
  | (MessageTurn & { runId: string; seq: number })
  | (EventTurn & { runId: string; seq: number })
  | (RawTurn & { runId: string; seq: number })

const getTurnId = (t: Entry) => `${t.runId}:${t.seq}`

const msg = (seq: number, over: Partial<MessageTurn> = {}): Entry => ({
  kind: 'message', runId: 'r1', seq, id: `r1:${seq}`,
  ts: `2026-08-09T12:00:${String(seq).padStart(2, '0')}+03:00`,
  role: 'assistant', text: `реплика ${seq}`, ...over,
})

const eventTurn = (seq: number, over: Partial<EventTurn> = {}): Entry => ({
  kind: 'event', runId: 'r1', seq, id: `r1:${seq}`,
  ts: `2026-08-09T12:00:${String(seq).padStart(2, '0')}+03:00`,
  variant: 'result', title: 'Готово', ...over,
})

const raw = (seq: number, text: string): Entry => ({
  kind: 'raw', runId: 'r1', seq, id: `r1:${seq}`,
  ts: `2026-08-09T12:00:${String(seq).padStart(2, '0')}+03:00`, text,
})

describe('AgentTranscript', () => {
  it('сохраняет порядок реплик и использует getTurnId', () => {
    const turns = [msg(1, { text: 'первая' }), msg(2, { text: 'вторая' }), msg(3, { text: 'третья' })]
    render(<AgentTranscript turns={turns} getTurnId={getTurnId} height={200} />)
    // Час и минута — МЕСТНЫЕ для отметок `msg` (12:00 по +03:00): компонент
    // печатает время в зоне процесса, и литерал «12:00» держался только под
    // UTC+3, зоной машины владельца (в CI, под UTC, случай падал).
    const t = new Date(msg(1).ts)
    const hm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
    const times = screen.getAllByText(new RegExp(`${hm}:0[123]`))
    expect(times).toHaveLength(3)
  })

  it('рисует блоки по дискриминатору kind', () => {
    const turns: Entry[] = [
      msg(1, { text: 'тело ответа', thinking: 'размышляю' }),
      eventTurn(2, { metrics: [{ id: 'm1', label: 'exit', value: '0' }] }),
    ]
    render(<AgentTranscript turns={turns} getTurnId={getTurnId} height={200} />)
    expect(screen.getByText('тело ответа')).toBeTruthy()
    expect(screen.getByText('Размышления')).toBeTruthy()
    expect(screen.getByText('Готово')).toBeTruthy()
    expect(screen.getByText('exit')).toBeTruthy()
  })

  it('show.raw по умолчанию прячет сырые реплики, show.raw:true — показывает', () => {
    const turns: Entry[] = [msg(1), raw(2, 'stderr line')]
    const { rerender } = render(<AgentTranscript turns={turns} getTurnId={getTurnId} height={200} />)
    expect(screen.queryByText('stderr line')).toBeNull()
    rerender(<AgentTranscript turns={turns} getTurnId={getTurnId} height={200} show={{ thinking: true, toolCalls: true, raw: true }} />)
    expect(screen.getByText('stderr line')).toBeTruthy()
  })

  it('show.thinking:false прячет блок размышлений (не удаляя данные)', () => {
    const turns: Entry[] = [msg(1, { thinking: 'секретные мысли' })]
    const show: AgentTranscriptShow = { thinking: false, toolCalls: true, raw: false }
    render(<AgentTranscript turns={turns} getTurnId={getTurnId} height={200} show={show} />)
    expect(screen.queryByText('Размышления')).toBeNull()
  })

  it('show.toolCalls:false прячет вызовы инструментов', () => {
    const turns: Entry[] = [msg(1, { toolCalls: [{ id: 'tu1', name: 'Read', input: '{}' }] })]
    const show: AgentTranscriptShow = { thinking: true, toolCalls: false, raw: false }
    render(<AgentTranscript turns={turns} getTurnId={getTurnId} height={200} show={show} />)
    expect(screen.queryByText('Read')).toBeNull()
  })

  it('query подсвечивает вхождения и не прячет реплики', () => {
    const turns: Entry[] = [msg(1, { text: 'читаю src/components и правлю' })]
    render(<AgentTranscript turns={turns} getTurnId={getTurnId} height={200} query="src/components" />)
    const hits = document.querySelectorAll('.ds-transcript__hit')
    expect(hits.length).toBeGreaterThan(0)
    expect(screen.getByText(/правлю/)).toBeTruthy()
  })

  it('сворачивание: aria-expanded и тело блока', () => {
    const turns: Entry[] = [msg(1, { thinking: 'детали' })]
    render(<AgentTranscript turns={turns} getTurnId={getTurnId} height={200} />)
    const toggle = screen.getByText('Размышления').closest('button')!
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('детали')).toBeNull()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('детали')).toBeTruthy()
  })

  it('onReachTop зовётся у верхней кромки и не зовётся от нижней', () => {
    const onReachTop = vi.fn()
    const turns: Entry[] = [msg(1), msg(2), msg(3)]
    render(<AgentTranscript turns={turns} getTurnId={getTurnId} height={200} onReachTop={onReachTop} />)
    const scroll = document.querySelector('.ds-transcript__scroll') as HTMLElement
    expect(onReachTop).not.toHaveBeenCalled()
    // Низ: имя кейса обещало и это, но проверки не было вовсе.
    act(() => scrollTo(scroll, 800, 1000))
    expect(onReachTop, 'зов от нижней кромки').not.toHaveBeenCalled()
    act(() => scrollTo(scroll, 0, 1000))
    expect(onReachTop).toHaveBeenCalledTimes(1)
  })

  it('«к последним» есть только вдали от низа: у самого низа последний блок ничем не накрыт', () => {
    // DS-327: кнопка `position: absolute` и места под собой не держит —
    // это законно ровно потому, что у низа её нет. Резерв снизу ленты взамен
    // отвергнут: постоянный — пустая полоса под живым выводом, условный —
    // скачок содержимого в миг, когда кнопка исчезает у низа.
    const turns: Entry[] = [msg(1), msg(2), msg(3)]
    render(<AgentTranscript turns={turns} getTurnId={getTurnId} height={200} />)
    const scroll = document.querySelector('.ds-transcript__scroll') as HTMLElement
    act(() => scrollTo(scroll, 0, 1000))
    expect(document.querySelector('.ds-transcript__tail'), 'вдали от низа кнопки нет — кейс проверяет не то').not.toBeNull()
    act(() => scrollTo(scroll, 1000 - VIEW_H, 1000))
    expect(document.querySelector('.ds-transcript__tail')).toBeNull()
  })

  it('onTurnClick срабатывает с клика по заголовку', () => {
    const onTurnClick = vi.fn()
    const turns: Entry[] = [msg(1, { author: { name: 'Ассистент' } })]
    render(<AgentTranscript turns={turns} getTurnId={getTurnId} height={200} onTurnClick={onTurnClick} />)
    const head = screen.getByRole('button', { name: /Ассистент/i })
    fireEvent.click(head)
    expect(onTurnClick).toHaveBeenCalledTimes(1)
    expect(onTurnClick.mock.calls[0][0].id).toBe('r1:1')
  })

  /**
   * DS-186. Кликабельный заголовок терял бейдж роли: две ветки заголовка
   * писались порознь, и в кнопочной `Badge` просто не было. Стоило потребителю
   * передать `onTurnClick` — и роль пропадала из ВИДИМОГО заголовка у всех
   * реплик разом, а `roleTones` переставал значить что-либо: красить нечего.
   *
   * Проверяется СЧЁТОМ УЗЛОВ и РАЗЛИЧЕНИЕМ: тот же набор ходов, два рендера,
   * одинаковое число бейджей. Считать только кнопочную ветку было бы слабее —
   * «три бейджа» само по себе не говорит, что столько же их и без клика.
   */
  it('onTurnClick не отнимает бейдж роли: обе ветки заголовка одинаковы', () => {
    const turns: Entry[] = [msg(1), msg(2), msg(3)]
    const count = () => document.querySelectorAll('.ds-transcript__head .ds-badge').length

    const plain = render(<AgentTranscript turns={turns} getTurnId={getTurnId} height={200} />)
    const withoutClick = count()
    plain.unmount()

    render(<AgentTranscript turns={turns} getTurnId={getTurnId} height={200} onTurnClick={vi.fn()} />)
    expect(document.querySelectorAll('.ds-transcript__head--btn').length, 'заголовки стали кнопками').toBe(withoutClick)
    expect(count(), 'бейдж роли пропал у кликабельного заголовка').toBe(withoutClick)
    expect(withoutClick, 'бейджей нет ни там, ни там — проверка мерит пустоту').toBeGreaterThan(0)
  })

  it('renderMarkdown применяется к text и thinking', () => {
    const turns: Entry[] = [msg(1, { text: '**жирный**', thinking: '**мысли**' })]
    render(
      <AgentTranscript
        turns={turns} getTurnId={getTurnId} height={200}
        renderMarkdown={(md) => <strong data-md={md}>{md}</strong>}
      />,
    )
    // text всегда в DOM; thinking — в свёрнутом блоке, раскрываем перед проверкой.
    expect(document.querySelector('[data-md="**жирный**"]')).toBeTruthy()
    fireEvent.click(screen.getByText('Размышления').closest('button')!)
    expect(document.querySelector('[data-md="**мысли**"]')).toBeTruthy()
  })

  it('groupByDay ставит разделитель на первой реплике нового дня', () => {
    const a = msg(1, { ts: '2026-08-09T12:00:01+03:00' })
    const b = msg(2, { ts: '2026-08-10T09:00:00+03:00', text: 'новый день' })
    render(<AgentTranscript turns={[a, b]} getTurnId={getTurnId} height={200} groupByDay />)
    // Разделитель первого дня + разделитель второго дня.
    expect(screen.getAllByText(/августа|10/).length).toBeGreaterThan(0)
    expect(screen.getByText('новый день')).toBeTruthy()
  })

  it('пустое состояние при turns=[]', () => {
    render(<AgentTranscript turns={[]} getTurnId={getTurnId} height={200} emptyState={<span>нет диалога</span>} />)
    expect(screen.getByText('нет диалога')).toBeTruthy()
  })
})

describe('AgentTranscript: каретка дописывания', () => {
  /**
   * Каретка — цитата из текстового ввода: она читается как «здесь появится
   * следующий символ» ровно потому, что стоит НА МЕСТЕ следующего символа
   * (DS-235). Прямым ребёнком `.ds-transcript__body` она этим быть не
   * может: тот — колоночный флекс, и `display: inline-block` на флекс-элементе
   * не применяется вовсе. Каретка занимала свой ряд под абзацем, отделённая
   * ещё и `gap`, то есть превращалась в значок «идёт работа» — а для этой
   * мысли в компоненте уже есть спиннер, и два знака одной мысли система
   * убирала на DS-144.
   *
   * Утверждение здесь СТРУКТУРНОЕ, и другого jsdom дать не может: раскладки в
   * нём нет. Геометрию — что бокс каретки пересекается с ПОСЛЕДНЕЙ строкой
   * текста, а не лежит под ней — держит случай `measure` «Каретка
   * дописывания стоит в строке текста, а не под ней». Одно без другого
   * неполно: это утверждение переживёт `display: block` на самой каретке,
   * а то — переезд каретки обратно в тело, потому что разметку случая
   * `measure` пишут руками.
   */
  it('лежит ВНУТРИ текста реплики, а не соседом абзаца', () => {
    const { container } = render(
      <AgentTranscript turns={[msg(1, { text: 'дописываю', streaming: true })]} getTurnId={getTurnId} />,
    )
    const caret = container.querySelector('.ds-transcript__streaming')
    expect(caret, 'каретки нет вовсе — реплика помечена streaming').not.toBeNull()
    expect(
      caret!.closest('.ds-transcript__text'),
      'каретка вне `.ds-transcript__text`: прямой ребёнок колоночного флекса — отдельный РЯД, а не конец строки',
    ).not.toBeNull()
  })

  it('без текста реплики каретка всё равно в строке — ей есть где стоять', () => {
    // Ход, помеченный streaming, но текста ещё не приславший: контейнер строки
    // рисуется ради каретки, иначе она снова оказывается соседом.
    const { container } = render(
      <AgentTranscript turns={[msg(1, { text: undefined, streaming: true })]} getTurnId={getTurnId} />,
    )
    const caret = container.querySelector('.ds-transcript__streaming')
    expect(caret, 'каретки нет вовсе').not.toBeNull()
    expect(caret!.closest('.ds-transcript__text'), 'каретка вне строки текста').not.toBeNull()
  })

  it('каретка молчит для диктора, а «печатает» говорит имя заголовка', () => {
    // Оба конца одного утверждения (DS-235): снять `aria-hidden` значит
    // сказать одно и то же дважды, снять слово из имени — не сказать вовсе.
    const { container } = render(
      <AgentTranscript turns={[msg(1, { text: 'дописываю', streaming: true })]} getTurnId={getTurnId} />,
    )
    expect(container.querySelector('.ds-transcript__streaming')!.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('.ds-transcript__head')!.getAttribute('aria-label'))
      .toMatch(/печатает/i)
  })
})

describe('AgentTranscript: пересчёт на прокрутке', () => {
  /**
   * Ход, который считает, сколько раз у него прочитали `kind`. Фильтр по
   * `kind !== 'raw'` — единственный проход по ВСЕМУ транскрипту в теле
   * компонента, и счётчик чтений его и ловит: отрисовка окна читает `kind` у
   * десятка видимых, фильтр — у всех.
   */
  const counted = (seq: number, reads: { n: number }): Entry => {
    const base = msg(seq) as Entry & { kind: string }
    const kind = base.kind
    const copy = { ...base }
    Object.defineProperty(copy, 'kind', {
      configurable: true,
      enumerable: true,
      get() { reads.n++; return kind },
    })
    return copy as Entry
  }

  const TURNS = 2000
  const FRAMES = 60

  it('прокрутка не гоняет фильтр по всему транскрипту', () => {
    const reads = { n: 0 }
    const turns = Array.from({ length: TURNS }, (_, i) => counted(i + 1, reads))
    render(<AgentTranscript turns={turns} getTurnId={getTurnId} height={200} />)

    // Сосед с заранее известным значением: первый рендер обязан прочитать
    // `kind` у всех — иначе счётчик сломан, и «мало чтений» ниже ничего не
    // стоит.
    expect(reads.n, 'первый рендер не прошёл по всем ходам — счётчик не работает')
      .toBeGreaterThanOrEqual(TURNS)

    const scroll = document.querySelector('.ds-transcript__scroll') as HTMLElement
    const afterMount = reads.n
    for (let f = 0; f < FRAMES; f++) {
      act(() => scrollTo(scroll, f * ROW_H, TURNS * ROW_H))
    }
    const perFrame = (reads.n - afterMount) / FRAMES

    // Порог не «поменьше», а по смыслу: в окне десятки строк, и чтений на кадр
    // обязано быть на порядок меньше длины транскрипта. До мемоизации было
    // ровно TURNS с хвостиком на кадр.
    expect(perFrame, `чтений kind на кадр прокрутки: ${perFrame} при ${TURNS} ходах`)
      .toBeLessThan(TURNS / 10)
  })

  it('инлайновый getTurnId промахивается мимо мемо, стабильный — нет', () => {
    // Ровно то, что записано в комментарии у `keys`. Кейс существует, чтобы
    // комментарий не разошёлся с кодом: соблазн «починить» промах, спрятав
    // функцию в ref, велик, а цена — идентичность реплики по УСТАРЕВШЕЙ
    // функции, то есть по тому самому, ради чего проп и заведён.
    const turns: Entry[] = Array.from({ length: 50 }, (_, i) => msg(i + 1))
    const calls = { n: 0 }
    const counting = (t: Entry) => { calls.n++; return `${t.runId}:${t.seq}` }

    const { rerender } = render(
      <AgentTranscript turns={turns} getTurnId={(t) => counting(t)} height={200} />,
    )
    const afterMount = calls.n
    expect(afterMount, 'ключи не собирались вовсе').toBeGreaterThanOrEqual(50)

    // Новая стрелка — новая зависимость: ключи пересобираются.
    rerender(<AgentTranscript turns={turns} getTurnId={(t) => counting(t)} height={200} />)
    expect(calls.n).toBeGreaterThan(afterMount)

    // Стабильная функция: рендер по смене другого пропа ключи не трогает.
    rerender(<AgentTranscript turns={turns} getTurnId={counting} height={200} />)
    const stable = calls.n
    rerender(<AgentTranscript turns={turns} getTurnId={counting} height={200} dense />)
    expect(calls.n, 'мемо не удержалось на стабильной функции').toBe(stable)
  })

  it('стриминг: у низа новый ход уводит вниз, в середине — нет', () => {
    // Мемоизация ключей не должна тронуть следование: виновником было бы
    // ссылочное сравнение массива, но зависимость эффекта — СОДЕРЖИМОЕ.
    const turns: Entry[] = Array.from({ length: 20 }, (_, i) => msg(i + 1))
    const { rerender } = render(
      <AgentTranscript turns={turns} getTurnId={getTurnId} height={200} />,
    )
    const scroll = document.querySelector('.ds-transcript__scroll') as HTMLElement

    // Пользователь у низа: 20 ходов по ROW_H, окно 200.
    act(() => scrollTo(scroll, 20 * ROW_H - VIEW_H, 20 * ROW_H))
    Object.defineProperty(scroll, 'scrollHeight', { value: 21 * ROW_H, writable: true, configurable: true })
    act(() => { rerender(<AgentTranscript turns={[...turns, msg(21)]} getTurnId={getTurnId} height={200} />) })
    expect(scroll.scrollTop, 'следование за низом не сработало').toBe(21 * ROW_H - VIEW_H)

    // Пользователь ушёл в середину: приход хода его не двигает.
    act(() => scrollTo(scroll, 5 * ROW_H, 21 * ROW_H))
    const parked = scroll.scrollTop
    Object.defineProperty(scroll, 'scrollHeight', { value: 22 * ROW_H, writable: true, configurable: true })
    act(() => { rerender(<AgentTranscript turns={[...turns, msg(21), msg(22)]} getTurnId={getTurnId} height={200} />) })
    expect(scroll.scrollTop, 'ход в конце утащил пользователя из середины').toBe(parked)
  })
})
