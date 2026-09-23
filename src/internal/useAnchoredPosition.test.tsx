import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCallback, useRef } from 'react'
import { useAnchoredPosition, type AnchorSide, type AnchorAlign } from './useAnchoredPosition.js'

/**
 * jsdom не считает раскладку: `getBoundingClientRect` там всегда нули, и без
 * подмены каждый случай ниже сошёлся бы на нулях — то есть был бы зелёным, ни
 * о чём не говоря. Прямоугольники ЗАДАЮТСЯ, и проверяется арифметика хука.
 *
 * Чего эти случаи НЕ держат: что `position: fixed` действительно уносит узел
 * из-под клипа прокручиваемого предка. Это утверждение про движок, и оно живёт
 * в `measure` («всплывающее на fixed выходит за клип прокручиваемого предка»).
 * Пара, а не дубль: тот случай переживёт снятый хук, эти — снятое правило.
 */
function rect(r: Partial<DOMRect>): DOMRect {
  return {
    x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0,
    toJSON: () => ({}), ...r,
  } as DOMRect
}

interface HarnessProps {
  side?: AnchorSide
  align?: AnchorAlign
  onTrapped?: (offBy: number) => void
  anchor: Partial<DOMRect>
  /** Якорь СТОРОНЫ, если он не тот же: панель, из которой выходит подменю. */
  sideAnchor?: Partial<DOMRect>
  floating: Partial<DOMRect>
  /**
   * Предок-ловушка: НАЧАЛО его containing block во вьюпорте. `fixed` внутри
   * такого предка отсчитывается от этой точки, а не от нуля экрана.
   */
  trap?: { dx: number, dy: number }
  gap?: string
  inset?: string
  /** Счётчик вызовов тела компонента — для утверждения о числе рендеров. */
  renders?: { current: number }
}

function Harness({
  side, align, onTrapped, anchor, sideAnchor, floating, trap, gap = '4px', inset = '8px', renders,
}: HarnessProps) {
  if (renders) renders.current += 1
  const anchorRef = useRef<HTMLButtonElement>(null)
  const sideAnchorRef = useRef<HTMLDivElement>(null)
  const floatingRef = useRef<HTMLDivElement>(null)
  // Прямоугольники подменяются В CALLBACK-РЕФЕ, а не на рендере: на ПЕРВОМ
  // рендере `ref.current` ещё null, подмена не срабатывает, и layout-эффект
  // хука меряет настоящие нули jsdom. Первая редакция этих случаев ровно так и
  // покраснела — «ожидали 234px, получили 4px», то есть считала от нулевого
  // якоря. Callback-реф зовётся в commit, ДО layout-эффектов.
  //
  // Читает он из рефа, а не из замыкания: иначе каждый рендер вешал бы новую
  // подмену со СТАРЫМ прямоугольником и затирал сдвиг, которым проверяется
  // пересчёт при прокрутке.
  const wanted = useRef({ anchor, sideAnchor, floating, trap })
  wanted.current = { anchor, sideAnchor, floating, trap }
  const setAnchor = useCallback((el: HTMLButtonElement | null) => {
    anchorRef.current = el
    if (el) el.getBoundingClientRect = () => rect(wanted.current.anchor)
  }, [])
  // Прямоугольник плавающего узла — ФУНКЦИЯ ОТ ПРИМЕНЁННОГО СТИЛЯ, а не
  // константа. Раньше здесь стояло фиксированное «куда узел ФАКТИЧЕСКИ встал»
  // (`landed`), не зависящее от того, что хук в этот момент реально поставил в
  // `style` — и это ловило только арифметику `Math.abs`, а не ФАЗУ. В
  // настоящем браузере старый код читал прямоугольник узла СРАЗУ ПОСЛЕ
  // `setPos`, то есть ДО применения стиля: на первом показе честный узел
  // отдал бы `offBy = left + top`, и «ловушка» срабатывала бы всегда, на любом
  // первом рендере без единого предка-ловушки. Константа этого класса не
  // ловила вовсе — ей нечем было отличить «стиль ещё не применён» от «стиль
  // применён, но потерялся в чужом containing block»: оба варианта она
  // выдавала бы одним и тем же числом.
  //
  // Здесь узел ВИДЕН там, куда его поставил стиль СЕЙЧАС (`el.style.left/top`
  // читается в момент вызова, то есть отражает последний коммит), плюс
  // смещение коробки предка-ловушки (`trap`). Без `trap` слагаемое нулевое, и
  // видимый прямоугольник — это ровно применённый стиль, как и должно быть у
  // узла без ловушки.
  const setFloating = useCallback((el: HTMLDivElement | null) => {
    floatingRef.current = el
    if (el) el.getBoundingClientRect = () => {
      const { floating, trap } = wanted.current
      const l = (parseFloat(el.style.left) || 0) + (trap?.dx ?? 0)
      const t = (parseFloat(el.style.top) || 0) + (trap?.dy ?? 0)
      const w = floating.width ?? 0
      const h = floating.height ?? 0
      return rect({ left: l, top: t, right: l + w, bottom: t + h, width: w, height: h, x: l, y: t })
    }
  }, [])
  const setSideAnchor = useCallback((el: HTMLDivElement | null) => {
    sideAnchorRef.current = el
    if (el) el.getBoundingClientRect = () => rect(wanted.current.sideAnchor ?? {})
  }, [])
  const pos = useAnchoredPosition({
    enabled: true,
    anchorRef,
    // Ref передаётся ТОЛЬКО когда случай его заказал: иначе пустой узел стал бы
    // якорем стороны с нулевым прямоугольником, и каждый прежний случай начал
    // бы мерить не то, о чём написан.
    sideAnchorRef: sideAnchor ? sideAnchorRef : undefined,
    floatingRef,
    side,
    align,
    onTrapped,
  })
  return (
    <>
      <button ref={setAnchor} type="button">якорь</button>
      {sideAnchor && <div ref={setSideAnchor} data-testid="sideanchor" />}
      <div
        ref={setFloating}
        data-testid="floating"
        data-side={pos.side}
        style={{ ...pos.style, ['--ds-anchor-gap' as string]: gap, ['--ds-anchor-inset' as string]: inset }}
      />
    </>
  )
}

/** Вьюпорт документа: hook читает clientWidth/Height, а не innerWidth. */
function viewport(w: number, h: number) {
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(w)
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(h)
}

beforeEach(() => viewport(1000, 800))
afterEach(() => vi.restoreAllMocks())

const styleOf = () => screen.getByTestId('floating').style

describe('useAnchoredPosition', () => {
  it('ставит position: fixed — это и есть выход из-под клипа, а не оформление', () => {
    render(<Harness anchor={{ left: 100, right: 140, top: 200, bottom: 230 }} floating={{ width: 180, height: 90 }} />)
    expect(styleOf().position).toBe('fixed')
  })

  it('гасит right и bottom: сторона из листа-фолбэка не участвует в fixed-боксе', () => {
    // DS-287. У `Tooltip` в листе `bottom: calc(100% + gap)`, и fixed-бокс
    // с top И bottom схлопывался до падингов. Живое следствие держит гейт
    // `states` (кадр с JS); здесь — сама форма контракта, и в первую очередь
    // `right`: при `width: max-content` пересдержанная горизонталь в LTR
    // игнорирует `right`, так что в браузере его пропажа не видна вовсе.
    render(<Harness anchor={{ left: 100, right: 140, top: 200, bottom: 230 }} floating={{ width: 180, height: 90 }} />)
    expect(styleOf().right).toBe('auto')
    expect(styleOf().bottom).toBe('auto')
  })

  it('снизу от якоря, с зазором из CSS-переменной, а не из числа в коде', () => {
    render(<Harness anchor={{ left: 100, right: 140, top: 200, bottom: 230 }} floating={{ width: 180, height: 90 }} gap="12px" />)
    // top = bottom якоря + зазор; left = левый край якоря (align start).
    expect(styleOf().top).toBe('242px')
    expect(styleOf().left).toBe('100px')
    expect(screen.getByTestId('floating').dataset.side).toBe('bottom')
  })

  it('переворачивается вверх, когда снизу не влезает, а сверху влезает', () => {
    // Якорь у нижнего края: 800 − 770 = 30 под ним, пузырьку нужно 90 + 4.
    render(<Harness anchor={{ left: 100, right: 140, top: 740, bottom: 770 }} floating={{ width: 180, height: 90 }} />)
    expect(screen.getByTestId('floating').dataset.side).toBe('top')
    expect(styleOf().top).toBe('646px') // 740 − 4 − 90
  })

  it('НЕ переворачивается, когда не влезает НИ ТУДА НИ СЮДА — сторона остаётся заказанной', () => {
    // Вьюпорт ниже пузырька: обе стороны тесны. Переворот здесь поменял бы
    // дефект на такой же, но неожиданный — и случай стережёт именно это.
    viewport(1000, 100)
    render(<Harness anchor={{ left: 100, right: 140, top: 40, bottom: 70 }} floating={{ width: 180, height: 90 }} />)
    expect(screen.getByTestId('floating').dataset.side).toBe('bottom')
  })

  it('align=end совмещает ПРАВЫЕ края: left считается от правого края якоря', () => {
    render(<Harness align="end" anchor={{ left: 600, right: 640, top: 200, bottom: 230 }} floating={{ width: 180, height: 90 }} />)
    expect(styleOf().left).toBe('460px') // 640 − 180
  })

  it('поджимается к краю экрана, а не уезжает за него', () => {
    // Якорь у левого края: align start дал бы left 2, поджим держит inset 8.
    render(<Harness anchor={{ left: 2, right: 42, top: 200, bottom: 230 }} floating={{ width: 180, height: 90 }} />)
    expect(styleOf().left).toBe('8px')
  })

  it('поджимается и справа: правый край не уходит за вьюпорт', () => {
    render(<Harness anchor={{ left: 950, right: 990, top: 200, bottom: 230 }} floating={{ width: 180, height: 90 }} />)
    expect(styleOf().left).toBe('812px') // 1000 − 180 − 8
  })

  // Горизонтальная ось — DS-242, подменю свёрнутой SideNav. Случаи ниже
  // повторяют ЧЕТЫРЕ утверждения вертикальной оси (сторона, переворот, отказ от
  // переворота в такую же тесноту, поджим), потому что общая формула ошибается
  // не «где-то», а в конкретной перестановке осей: сломай `cross`, и
  // вертикальные случаи останутся зелёными.
  it('side=right ставит узел СПРАВА от якоря, с тем же зазором из CSS-переменной', () => {
    render(<Harness side="right" gap="12px" anchor={{ left: 0, right: 40, top: 200, bottom: 230 }} floating={{ width: 180, height: 90 }} />)
    expect(styleOf().left).toBe('52px') // 40 + 12
    expect(styleOf().top).toBe('200px') // align start — верхние края совмещены
    expect(screen.getByTestId('floating').dataset.side).toBe('right')
  })

  it('переворачивается влево, когда справа не влезает, а слева влезает', () => {
    // Якорь у правого края: 1000 − 960 = 40 справа, подменю нужно 180 + 4.
    render(<Harness side="right" anchor={{ left: 920, right: 960, top: 200, bottom: 230 }} floating={{ width: 180, height: 90 }} />)
    expect(screen.getByTestId('floating').dataset.side).toBe('left')
    expect(styleOf().left).toBe('736px') // 920 − 4 − 180
  })

  it('НЕ переворачивается по горизонтали, когда тесно с обеих сторон', () => {
    viewport(200, 800)
    render(<Harness side="right" anchor={{ left: 80, right: 120, top: 200, bottom: 230 }} floating={{ width: 180, height: 90 }} />)
    expect(screen.getByTestId('floating').dataset.side).toBe('right')
  })

  it('на горизонтальной стороне поджим работает по ВЕРТИКАЛИ: подменю у низа экрана не уезжает за край', () => {
    // Якорь на 770: align start дал бы top 770, а подменю высотой 90 вылезло бы
    // за 800. Поджим держит его в inset 8 от низа.
    render(<Harness side="right" anchor={{ left: 0, right: 40, top: 770, bottom: 800 }} floating={{ width: 180, height: 90 }} />)
    expect(styleOf().top).toBe('702px') // 800 − 90 − 8
  })

  it('align=center на горизонтальной стороне центрует по ВЫСОТЕ якоря, а не по ширине', () => {
    // Якорь 30px высотой, узел 90: верх уезжает на 30 вверх от верха якоря.
    render(<Harness side="right" align="center" anchor={{ left: 0, right: 40, top: 200, bottom: 230 }} floating={{ width: 180, height: 90 }} />)
    expect(styleOf().top).toBe('170px') // 200 + (30 − 90) / 2
  })

  // Два якоря — DS-243. Подменю свёрнутой SideNav выходит ИЗ ПАНЕЛИ, но
  // выравнивается ПО СТРОКЕ, и расстояние между их краями непостоянно: падинг
  // плюс полоса прокрутки, когда рейка прокручивается. Зазором это не
  // выражается, поэтому сторона получила свой якорь.
  it('sideAnchorRef задаёт СТОРОНУ, а поперечная ось остаётся за anchorRef', () => {
    render(
      <Harness
        side="right"
        // Строка утоплена внутрь панели на 15 слева и на 20 справа — так
        // выглядит рейка с полосой прокрутки.
        anchor={{ left: 35, right: 65, top: 200, bottom: 230 }}
        sideAnchor={{ left: 30, right: 85, top: 100, bottom: 400 }}
        floating={{ width: 180, height: 90 }}
      />,
    )
    // Сторона от ПАНЕЛИ: 85 + 4. От строки вышло бы 69 — на 16 внутрь панели.
    expect(styleOf().left).toBe('89px')
    // Поперечная ось от СТРОКИ: верх подменю совмещён с верхом пункта, а не
    // с верхом панели (иначе было бы 100).
    expect(styleOf().top).toBe('200px')
  })

  it('переворот тоже считается по стороннему якорю, а не по строке', () => {
    // Панель у правого края: справа от НЕЁ 1000 − 985 = 15, подменю нужно 184.
    // От строки (right 900) места хватило бы, и переворота не случилось бы —
    // случай стережёт именно эту разницу.
    render(
      <Harness
        side="right"
        anchor={{ left: 870, right: 900, top: 200, bottom: 230 }}
        sideAnchor={{ left: 865, right: 985, top: 100, bottom: 400 }}
        floating={{ width: 180, height: 90 }}
      />,
    )
    expect(screen.getByTestId('floating').dataset.side).toBe('left')
    expect(styleOf().left).toBe('681px') // 865 − 4 − 180
  })

  it('без sideAnchorRef сторона по-прежнему считается от anchorRef', () => {
    // Контроль к двум случаям выше: они утверждают про РАЗЛИЧИЕ якорей, и без
    // этого случая правка, всегда берущая сторонний якорь, тоже прошла бы.
    render(<Harness side="right" anchor={{ left: 0, right: 40, top: 200, bottom: 230 }} floating={{ width: 180, height: 90 }} />)
    expect(styleOf().left).toBe('44px')
  })

  // Ловушка containing block, DS-367. Заказанные координаты — bottom
  // якоря (230) + gap (12) = top 242, left = 100 (align start). Предок-ловушка
  // сдвигает НАЧАЛО containing block на (120, 120) — так `getBoundingClientRect`
  // ведёт себя под `transform`/`contain` (см. хук).
  it('предок-ловушка компенсируется: в стиле стоит want − trap, а виден узел там, где заказано', () => {
    render(
      <Harness
        gap="12px"
        trap={{ dx: 120, dy: 120 }}
        anchor={{ left: 100, right: 140, top: 200, bottom: 230 }}
        floating={{ width: 180, height: 90 }}
      />,
    )
    // (а) стиль — заказанное МИНУС коробка ловушки. Утверждение само по себе
    // повторяет арифметику реализации, поэтому оно не одно — см. (б) ниже.
    expect(styleOf().left).toBe('-20px') // 100 − 120
    expect(styleOf().top).toBe('122px') // 242 − 120
    // (б) НЕЗАВИСИМАЯ проверка: видимый прямоугольник узла (стиль + коробка
    // ловушки — то, что и подставляет харнесс) равен заказанным координатам
    // вьюпорта. Это то, что видит глаз, а не то, что написано в атрибуте.
    const visible = screen.getByTestId('floating').getBoundingClientRect()
    expect(visible.left).toBe(100)
    expect(visible.top).toBe(242)
  })

  it('компенсация сходится с ПЕРВОГО коммита: у ловушки и без неё одинаковое число рендеров', () => {
    // Если бы поправка требовала «поставить — перемерить — поправить», это
    // был бы ТРЕТИЙ рендер, которого у случая без ловушки нет и быть не может.
    // Счётчик — единственный способ увидеть разницу: оба случая сходятся к
    // верным пиксельным координатам в любом случае, а лишний проход виден
    // только по числу вызовов тела компонента.
    const plain = { current: 0 }
    const trapped = { current: 0 }
    render(
      <Harness
        renders={plain}
        gap="12px"
        anchor={{ left: 100, right: 140, top: 200, bottom: 230 }}
        floating={{ width: 180, height: 90 }}
      />,
    )
    render(
      <Harness
        renders={trapped}
        gap="12px"
        trap={{ dx: 120, dy: 120 }}
        anchor={{ left: 100, right: 140, top: 200, bottom: 230 }}
        floating={{ width: 180, height: 90 }}
      />,
    )
    // Монтирование (стиль ещё 0,0) плюс один коммит с уже верной, скорректированной
    // позицией — и ни одного сверх этого.
    expect(plain.current).toBe(2)
    expect(trapped.current).toBe(plain.current)
  })

  it('onTrapped зовётся один раз и несёт смещение коробки (240 для dx=dy=120)', () => {
    const onTrapped = vi.fn()
    render(
      <Harness
        onTrapped={onTrapped}
        gap="12px"
        trap={{ dx: 120, dy: 120 }}
        anchor={{ left: 100, right: 140, top: 200, bottom: 230 }}
        floating={{ width: 180, height: 90 }}
      />,
    )
    expect(onTrapped).toHaveBeenCalledTimes(1)
    // Коробка ловушки начинается на (120, 120) вьюпорта, и это ПОЛОЖИТЕЛЬНОЕ
    // смещение: на столько узел уехал бы, не вычти его хук. 120 + 120.
    expect(onTrapped.mock.calls[0][0]).toBeCloseTo(240, 0)
  })

  it('предок-ловушка с РАЗНЫМИ знаками по осям (transform: translate(50px, -60px)) компенсируется, а Math.abs не даёт им погасить друг друга', () => {
    // Разные знаки — не экзотика: `transform: translate(50px, -60px)` у
    // предка-потребителя даёт ровно такую коробку. Все прежние случаи про
    // ловушку брали dx и dy ОДНОГО знака (120,120 или 300,50) — этого мало:
    // сумма БЕЗ модуля на разных знаках частично гасит сама себя
    // (50 + (−60) = −10) и не перевалила бы порог `> 1` даже при заметной
    // ловушке по КАЖДОЙ оси в отдельности — `onTrapped` промолчал бы, хотя
    // предок реально стал containing block.
    const onTrapped = vi.fn()
    render(
      <Harness
        onTrapped={onTrapped}
        gap="12px"
        trap={{ dx: 50, dy: -60 }}
        anchor={{ left: 100, right: 140, top: 200, bottom: 230 }}
        floating={{ width: 180, height: 90 }}
      />,
    )
    // (а) компенсация верна и на разнознаковом смещении — узел виден там, где
    // заказано, вьюпортными координатами, а не то, что написано в стиле.
    const visible = screen.getByTestId('floating').getBoundingClientRect()
    expect(visible.left).toBe(100)
    expect(visible.top).toBe(242)
    // (б) диагностика несёт |50| + |−60| = 110, а НЕ 50 + (−60) = −10.
    expect(onTrapped).toHaveBeenCalledTimes(1)
    expect(onTrapped.mock.calls[0][0]).toBeCloseTo(110, 0)
  })

  it('без ловушки onTrapped молчит НА ПЕРВОМ ПОКАЗЕ', () => {
    // Прежняя редакция читала прямоугольник узла СРАЗУ ПОСЛЕ `setPos`, то есть
    // ДО применения стиля — на первом показе честный узел без единой ловушки
    // отдал бы `offBy = left + top` и был бы принят за пойманный. Здесь `trap`
    // не задан вовсе, и харнесс меряет РЕАЛЬНО применённый стиль (см. комментарий
    // у `setFloating`) — случай обязан остаться тихим.
    const onTrapped = vi.fn()
    render(
      <Harness
        onTrapped={onTrapped}
        gap="12px"
        anchor={{ left: 100, right: 140, top: 200, bottom: 230 }}
        floating={{ width: 180, height: 90 }}
      />,
    )
    expect(onTrapped).not.toHaveBeenCalled()
  })

  it('прокрутка предка-ловушки: коробка уехала — узел пересчитался', () => {
    // Якорь не двигается — заказанные координаты (100, 242) те же самые на
    // протяжении всего случая. Меняется только коробка предка-ловушки, как в
    // соседнем случае про прокрутку меняется прямоугольник якоря.
    const anchor = { left: 100, right: 140, top: 200, bottom: 230 }
    const floating = { width: 180, height: 90 }
    const { rerender } = render(
      <Harness gap="12px" anchor={anchor} floating={floating} trap={{ dx: 120, dy: 120 }} />,
    )
    expect(styleOf().left).toBe('-20px') // 100 − 120
    expect(styleOf().top).toBe('122px') // 242 − 120

    // Рейка предка-ловушки уехала: сам по себе рендер компенсацию не трогает —
    // эффект хука не перезапускается, точно как у прокрутки якоря рядом.
    rerender(<Harness gap="12px" anchor={anchor} floating={floating} trap={{ dx: 300, dy: 50 }} />)
    expect(styleOf().left).toBe('-20px')
    expect(styleOf().top).toBe('122px')

    act(() => { document.dispatchEvent(new Event('scroll')) })
    expect(styleOf().left).toBe('-200px') // 100 − 300
    expect(styleOf().top).toBe('192px') // 242 − 50
    // И видимый прямоугольник — снова заказанные координаты, уже под новой
    // коробкой ловушки.
    const visible = screen.getByTestId('floating').getBoundingClientRect()
    expect(visible.left).toBe(100)
    expect(visible.top).toBe(242)
  })

  it('слушает прокрутку ЛЮБОГО предка — на документе и с capture, иначе scroll не всплывёт', () => {
    const add = vi.spyOn(document, 'addEventListener')
    render(<Harness anchor={{ left: 100, right: 140, top: 200, bottom: 230 }} floating={{ width: 180, height: 90 }} />)
    const scrollCall = add.mock.calls.find(([type]) => type === 'scroll')
    expect(scrollCall).toBeDefined()
    expect(scrollCall![2]).toBe(true)
  })

  it('снимает слушатели при размонтировании — иначе они переживают попап', () => {
    const remove = vi.spyOn(document, 'removeEventListener')
    const removeWin = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<Harness anchor={{ left: 100, right: 140, top: 200, bottom: 230 }} floating={{ width: 180, height: 90 }} />)
    unmount()
    expect(remove.mock.calls.some(([type]) => type === 'scroll')).toBe(true)
    expect(removeWin.mock.calls.some(([type]) => type === 'resize')).toBe(true)
  })

  it('пересчитывается при прокрутке предка, а не остаётся висеть на прежнем месте', () => {
    const floating = { width: 180, height: 90 }
    const { rerender } = render(
      <Harness anchor={{ left: 100, right: 140, top: 200, bottom: 230 }} floating={floating} />,
    )
    expect(styleOf().top).toBe('234px')
    // Якорь уехал вверх на 150 — так выглядит прокрутка предка. Сам по себе
    // рендер позицию НЕ двигает (эффект хука не перезапускается), поэтому
    // следующая строка проверяет именно реакцию на событие, а не на рендер.
    rerender(<Harness anchor={{ left: 100, right: 140, top: 50, bottom: 80 }} floating={floating} />)
    expect(styleOf().top).toBe('234px')
    act(() => { document.dispatchEvent(new Event('scroll')) })
    expect(styleOf().top).toBe('84px')
  })
})
