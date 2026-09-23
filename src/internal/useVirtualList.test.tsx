import { render, act, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { useVirtualList, type VirtualListInput } from './useVirtualList.js'

/**
 * jsdom не считает раскладку. Высоту строки берём из `data-h`, высоту окна — из
 * класса: так кейс задаёт РАЗНЫЕ высоты разным строкам, а это единственный
 * способ отличить кэш измеренных от оценки. Пока все строки одной высоты,
 * «оценка среднее измеренных» и «оценка константа» дают одно и то же число, и
 * мутация выживает — так и вышло на кейсах `LogViewer`.
 */
const VIEW_H = 200
/** Высота окна сейчас. Меняет её кейс «панель выросла» (DS-340). */
let viewH = VIEW_H
beforeEach(() => { viewH = VIEW_H })

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('scroll') ? viewH : Number(this.dataset.h ?? 0)
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: HTMLElement) {
      const h = this.classList.contains('scroll') ? viewH : Number(this.dataset.h ?? 0)
      const width = Number(this.dataset.w ?? 800)
      return { width, height: h, top: 0, left: 0, right: width, bottom: h, x: 0, y: 0, toJSON: () => ({}) }
    },
  })
})

/**
 * Все живые ResizeObserver с тем, за чем они следят, — чтобы дёрнуть руками
 * ровно тот, что смотрит на узел. У хука их два (окно и строки, DS-340),
 * и «последний созданный» больше не значит «тот, что на окне».
 */
const ros = new Set<{ cb: () => void; targets: Set<Element> }>()
const fireResize = (target: Element) => {
  for (const r of [...ros]) if (r.targets.has(target)) r.cb()
}
beforeAll(() => {
  class RO {
    private me: { cb: () => void; targets: Set<Element> }
    constructor(cb: () => void) { this.me = { cb, targets: new Set() }; ros.add(this.me) }
    observe(t: Element) { this.me.targets.add(t) }
    unobserve(t: Element) { this.me.targets.delete(t) }
    disconnect() { ros.delete(this.me) }
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { value: RO, writable: true, configurable: true })
})

interface HarnessProps extends Omit<VirtualListInput, 'keys'> {
  keys: string[]
  /** Высота строки по ключу; отсутствует — 10. */
  rowH?: (key: string) => number
  /** Ширина контейнера: её меняет кейс про ResizeObserver. */
  width?: number
}

function Harness({ keys, rowH, width = 800, ...rest }: HarnessProps) {
  const v = useVirtualList({ keys, ...rest })
  return (
    <div className="scroll" ref={v.scrollRef} onScroll={v.onScroll} data-w={width}>
      <div data-testid="padTop" data-pad={v.slice.padTop} />
      <div data-testid="total" data-total={v.slice.total} />
      <div data-testid="following" data-following={String(v.following)} />
      {keys.slice(v.slice.start, v.slice.end).map((k) => (
        <div
          key={k}
          data-key={k}
          data-h={rowH ? rowH(k) : 10}
          ref={(el) => {
            if (el) v.rowRefs.current.set(k, el)
            else v.rowRefs.current.delete(k)
          }}
        >{k}</div>
      ))}
      <div data-testid="padBottom" data-pad={v.slice.padBottom} />
      <button type="button" data-testid="tail" onClick={v.toTail}>к последним</button>
      <button type="button" data-testid="toIndex" onClick={() => v.scrollToIndex(30)}>к 30-й</button>
      <button type="button" data-testid="toIndexInset" onClick={() => v.scrollToIndex(30, 25)}>к 30-й под плашку</button>
      <button type="button" data-testid="toHeadInset" onClick={() => v.scrollToIndex(1, 25)}>к 1-й под плашку</button>
    </div>
  )
}

const keysOf = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `k${i + from}`)
/** Первые двадцать строк высокие, остальные низкие — чтобы кэш отличался от оценки. */
const tall = (k: string) => (Number(k.slice(1)) < 20 ? 40 : 10)

const num = (c: HTMLElement, id: string, attr: string) =>
  Number((c.querySelector(`[data-testid="${id}"]`) as HTMLElement).dataset[attr])
const scroller = (c: HTMLElement) => c.querySelector('.scroll') as HTMLElement

/** Прокрутка в jsdom не двигается сама — задаём и стреляем событием. */
function scrollTo(el: HTMLElement, top: number, scrollHeight: number) {
  Object.defineProperty(el, 'scrollTop', { value: top, writable: true, configurable: true })
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, writable: true, configurable: true })
  fireEvent.scroll(el)
}

describe('useVirtualList', () => {
  it('оценка неизмеренной строки — среднее измеренных, а не константа', () => {
    // Константа не знает про --ds-ui-scale и про то, что строки бывают выше
    // объявленного. Здесь измеренные — 40, объявленная оценка — 10, и полная
    // высота обязана считаться по 40 для тех строк, что уже видели.
    const { container } = render(<Harness keys={keysOf(60)} rowH={() => 40} fallbackEstimate={10} />)
    // Видимых строк десяток, остальные по оценке. Если оценка осталась
    // константой 10, total будет заметно меньше.
    expect(num(container, 'total', 'total')).toBe(60 * 40)
  })

  it('до первого измерения работает объявленная оценка', () => {
    // Санитар на соседе с известным значением: без него кейс выше зеленел бы и
    // при оценке, взятой с потолка.
    const { container } = render(<Harness keys={[]} rowH={() => 40} fallbackEstimate={10} />)
    expect(num(container, 'total', 'total')).toBe(0)
  })

  it('ResizeObserver роняет кэш высот по ширине и НЕ роняет по высоте', () => {
    // Ширина перевёрстывает текст и меняет все высоты разом; высота панели —
    // нет. Ронять кэш из-за высоты значило бы мерить заново на каждое
    // перетаскивание нижней границы.
    //
    // Видно это только на строках ЗА окном: у видимых высота всё равно
    // перемеряется следующим же рендером. Поэтому кейс уходит прокруткой вниз
    // и смотрит на padTop — сумму высот двадцати высоких строк.
    const { container, rerender } = render(
      <Harness keys={keysOf(60)} rowH={tall} fallbackEstimate={10} width={800} />,
    )
    const el = scroller(container)
    act(() => { scrollTo(el, 20 * 40, 20 * 40 + 40 * 10) })
    const padTop = num(container, 'padTop', 'pad')
    expect(padTop, 'высокие строки не измерились — кейс проверяет не то').toBeGreaterThan(20 * 10)

    // Та же ширина: кэш обязан устоять.
    act(() => { fireResize(el) })
    expect(num(container, 'padTop', 'pad')).toBe(padTop)

    // Другая ширина: кэш падает, и padTop пересчитывается по оценке видимых.
    act(() => { rerender(<Harness keys={keysOf(60)} rowH={tall} fallbackEstimate={10} width={400} />) })
    act(() => { fireResize(el) })
    expect(num(container, 'padTop', 'pad')).not.toBe(padTop)
  })

  it('подгрузка сверху удерживает позицию, а не утаскивает вниз', () => {
    // Порядок двух шагов в эффекте и есть вся суть: сначала компенсация
    // prepend, потом следование за низом. В обратном порядке следование затёрло
    // бы компенсацию.
    const { container, rerender } = render(
      <Harness keys={keysOf(40)} rowH={() => 10} fallbackEstimate={10} />,
    )
    const el = scroller(container)
    act(() => { scrollTo(el, 100, 400) })
    // Пользователь не у низа: следование снято, и приход строк сверху обязан
    // только компенсироваться, а не уводить вниз.
    expect((container.querySelector('[data-testid="following"]') as HTMLElement).dataset.following).toBe('false')
    const before = el.scrollTop

    act(() => { rerender(<Harness keys={[...keysOf(10, -10), ...keysOf(40)]} rowH={() => 10} fallbackEstimate={10} />) })
    expect(el.scrollTop).toBe(before + 10 * 10)
  })

  it('следует за низом, пока пользователь у низа, и отпускает, когда он ушёл', () => {
    const { container } = render(<Harness keys={keysOf(40)} rowH={() => 10} fallbackEstimate={10} />)
    const el = scroller(container)
    act(() => { scrollTo(el, 200, 400) }) // 400 - 200 = 200 = низ
    expect((container.querySelector('[data-testid="following"]') as HTMLElement).dataset.following).toBe('true')
    act(() => { scrollTo(el, 0, 400) })
    expect((container.querySelector('[data-testid="following"]') as HTMLElement).dataset.following).toBe('false')
  })

  it('auto:false выключает следование целиком', () => {
    // Транскрипт зовёт хук с `auto`, лог — без него. Прокрутка к самому низу не
    // должна включать следование, если потребитель его не просил.
    const { container } = render(
      <Harness keys={keysOf(40)} rowH={() => 10} fallbackEstimate={10} auto={false} />,
    )
    const el = scroller(container)
    act(() => { scrollTo(el, 200, 400) })
    expect((container.querySelector('[data-testid="following"]') as HTMLElement).dataset.following).toBe('false')
  })

  it('onReachTop зовётся раз на упор и снова после прихода старых записей', () => {
    const onReachTop = vi.fn()
    const { container, rerender } = render(
      <Harness keys={keysOf(40)} rowH={() => 10} fallbackEstimate={10} onReachTop={onReachTop} />,
    )
    const el = scroller(container)
    act(() => { scrollTo(el, 0, 400) })
    expect(onReachTop).toHaveBeenCalledTimes(1)
    act(() => { scrollTo(el, 0, 400) })
    expect(onReachTop, 'второй упор без новых данных зовёт повторно').toHaveBeenCalledTimes(1)

    act(() => { rerender(<Harness keys={[...keysOf(10, -10), ...keysOf(40)]} rowH={() => 10} fallbackEstimate={10} onReachTop={onReachTop} />) })
    act(() => { scrollTo(el, 0, 500) })
    expect(onReachTop).toHaveBeenCalledTimes(2)
  })

  it('scrollToIndex уводит к строке вне окна и снимает следование', () => {
    const { container } = render(<Harness keys={keysOf(60)} rowH={() => 10} fallbackEstimate={10} />)
    const el = scroller(container)
    Object.defineProperty(el, 'scrollHeight', { value: 600, writable: true, configurable: true })
    act(() => { (container.querySelector('[data-testid="toIndex"]') as HTMLElement).click() })
    expect(el.scrollTop).toBe(30 * 10)
    expect((container.querySelector('[data-testid="following"]') as HTMLElement).dataset.following).toBe('false')
  })

  it('scrollToIndex с inset ставит строку ниже полосы, у начала — не ниже нуля', () => {
    // inset — то, что плавает поверх окна сверху (навигатор совпадений
    // LogViewer, DS-325). Без него строка встаёт под плашку.
    const { container } = render(<Harness keys={keysOf(60)} rowH={() => 10} fallbackEstimate={10} />)
    const el = scroller(container)
    Object.defineProperty(el, 'scrollHeight', { value: 600, writable: true, configurable: true })
    act(() => { (container.querySelector('[data-testid="toIndexInset"]') as HTMLElement).click() })
    expect(el.scrollTop).toBe(30 * 10 - 25)
    act(() => { (container.querySelector('[data-testid="toHeadInset"]') as HTMLElement).click() })
    expect(el.scrollTop, 'смещение 10 меньше inset 25 — прижаться к нулю').toBe(0)
  })
  /**
   * DS-340. `following` пересчитывался ТОЛЬКО в `onScroll`: любое
   * изменение геометрии без события прокрутки оставляло флаг устаревшим. Три
   * сценария сняты в браузере (задача), здесь — логика пересчёта на
   * поддельной геометрии: jsdom раскладку не считает.
   */
  describe('следование при изменении геометрии без события scroll', () => {
    const following = (c: HTMLElement) =>
      (c.querySelector('[data-testid="following"]') as HTMLElement).dataset.following

    it('S1: панель выросла под пользователем, отмотавшим вверх, — он у низа, следование включается', () => {
      const { container } = render(<Harness keys={keysOf(60)} rowH={() => 10} fallbackEstimate={10} />)
      const el = scroller(container)
      act(() => { scrollTo(el, 390, 600) }) // низ 400, пользователь выше на 10
      expect(following(container), 'кейс проверяет не то: следование и так включено').toBe('false')
      // Панель +10: низ стал 390, scrollTop уже на нём. Событий прокрутки нет.
      viewH = VIEW_H + 10
      act(() => { fireResize(el) })
      expect(following(container)).toBe('true')
    })

    it('S2: содержимое стало помещаться — прокручивать нечего, следование включается', () => {
      const { container } = render(<Harness keys={keysOf(60)} rowH={() => 10} fallbackEstimate={10} />)
      const el = scroller(container)
      act(() => { scrollTo(el, 0, 600) })
      expect(following(container)).toBe('false')
      Object.defineProperty(el, 'scrollHeight', { value: 150, writable: true, configurable: true })
      act(() => { fireResize(el) })
      expect(following(container)).toBe('true')
    })

    it('S3: строки выросли без рендера (догрузка шрифта) — лента доматывается к низу', () => {
      const { container } = render(<Harness keys={keysOf(60)} rowH={() => 10} fallbackEstimate={10} />)
      const el = scroller(container)
      act(() => { scrollTo(el, 400, 600) })
      expect(following(container)).toBe('true')
      // Перенос сменился: строка стала выше, React об этом не знает.
      const row = container.querySelector('[data-key="k59"]') as HTMLElement
      row.dataset.h = '35'
      Object.defineProperty(el, 'scrollHeight', { value: 625, writable: true, configurable: true })
      act(() => { fireResize(row) })
      expect(el.scrollTop).toBe(625 - VIEW_H)
      expect(following(container)).toBe('true')
    })

    it('S3: событие СВОЕЙ прокрутки посреди роста не выключает следование', () => {
      // На 1.15 программная прокрутка к низу (top 842) доходила событием уже
      // при max 867, и onScroll читал это как «пользователь ушёл вверх».
      const { container } = render(<Harness keys={keysOf(60)} rowH={() => 10} fallbackEstimate={10} />)
      const el = scroller(container)
      act(() => { scrollTo(el, 400, 600) })
      expect(following(container)).toBe('true')
      act(() => { scrollTo(el, 400, 625) }) // позиция та же, низ уехал на 25
      expect(following(container)).toBe('true')
      expect(el.scrollTop, 'и лента догнала новый низ').toBe(625 - VIEW_H)
    })

    it('пользователь, ушедший вверх, после роста строк остаётся где был', () => {
      // Сосед S3: доматывать можно только того, кто следовал. Иначе рост
      // строк утаскивал бы читающего вниз.
      const { container } = render(<Harness keys={keysOf(60)} rowH={() => 10} fallbackEstimate={10} />)
      const el = scroller(container)
      act(() => { scrollTo(el, 100, 600) })
      const row = container.querySelector('[data-key="k12"]') as HTMLElement
      row.dataset.h = '35'
      Object.defineProperty(el, 'scrollHeight', { value: 625, writable: true, configurable: true })
      act(() => { fireResize(row) })
      expect(el.scrollTop).toBe(100)
      expect(following(container)).toBe('false')
    })

    it('auto:false — геометрия следование не включает', () => {
      const { container } = render(
        <Harness keys={keysOf(60)} rowH={() => 10} fallbackEstimate={10} auto={false} />,
      )
      const el = scroller(container)
      act(() => { scrollTo(el, 0, 600) })
      Object.defineProperty(el, 'scrollHeight', { value: 150, writable: true, configurable: true })
      act(() => { fireResize(el) })
      expect(following(container)).toBe('false')
    })
  })
})
