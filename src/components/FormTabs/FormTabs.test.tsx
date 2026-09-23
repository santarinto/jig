import { useState } from 'react'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { FormTabs } from './FormTabs.js'

const tabs = [
  { id: 'a', label: 'Реализация №1' },
  { id: 'b', label: 'Контрагент' },
]

describe('FormTabs', () => {
  it('marks active tab, selects on label click, closes without selecting', async () => {
    const onSelect = vi.fn(), onClose = vi.fn()
    render(<FormTabs tabs={tabs} selectedId="a" onSelect={onSelect} onClose={onClose} />)
    expect(screen.getByRole('tab', { name: /Реализация №1/ })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByRole('tab', { name: 'Контрагент' }))
    expect(onSelect).toHaveBeenCalledWith('b')
    onSelect.mockClear()
    await userEvent.click(screen.getByTitle('Закрыть Контрагент'))
    expect(onClose).toHaveBeenCalledWith('b')
    // Крестик лежит ВНУТРИ вкладки, поэтому «не выбралось заодно» — это про
    // остановленное всплытие, а не про соседство узлов, как было раньше.
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('roving tabindex + ArrowRight moves the active tab', async () => {
    const onSelect = vi.fn()
    render(<FormTabs tabs={tabs} selectedId="a" onSelect={onSelect} />)
    const activeLabel = screen.getByRole('tab', { name: 'Реализация №1' })
    expect(activeLabel).toHaveAttribute('tabindex', '0')
    activeLabel.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onSelect).toHaveBeenCalledWith('b')
  })

  it('renders a close affordance only when onClose is given', () => {
    const { rerender } = render(<FormTabs tabs={tabs} selectedId="a" />)
    expect(screen.queryByTitle(/Закрыть/)).toBeNull()
    rerender(<FormTabs tabs={tabs} selectedId="a" onClose={() => {}} />)
    expect(screen.getAllByTitle(/Закрыть/)).toHaveLength(2)
    // Крестик перестал быть кнопкой (DS-175, вторая приёмка): в таблисте
    // не может лежать ничего, кроме вкладок, а он лежал — через обёртку без
    // роли, которая в дереве доступности прозрачна.
    expect(screen.queryByRole('button', { name: /Закрыть/ })).toBeNull()
  })

  // В учётной системе крестик виден у активной вкладки и по наведению, иначе строка шумит.
  // Прятать его нужно ТОЛЬКО визуально: убрать из разметки — значит отобрать
  // мишень у мыши. Клавиатуре крестик не нужен вовсе — там `Delete`.
  it('keeps every close affordance in the DOM when quietened, and none of them focusable', () => {
    const { container } = render(<FormTabs tabs={tabs} selectedId="a" onClose={() => {}} />)
    expect(screen.getByTitle('Закрыть Контрагент')).toBeInTheDocument()
    const crosses = [...container.querySelectorAll('.ds-formtabs__close')]
    expect(crosses).toHaveLength(2)
    for (const c of crosses) {
      expect(c.tagName).toBe('SPAN')
      expect(c).not.toHaveAttribute('tabindex')
      expect(c).toHaveAttribute('aria-hidden', 'true')
    }
  })

  /**
   * Клавиатурный путь закрытия. Мишень мыши без клавиатурной пары — это
   * действие, отобранное у половины пользователей, поэтому `Delete` здесь не
   * украшение: он ЗАМЕНЯЕТ отобранный таб-стоп, а не добавляется к нему.
   *
   * Закрывается ВКЛАДКА ПОД ФОКУСОМ, а не выбранная. Без `onSelect` стрелки
   * двигают фокус, не меняя `selectedId`, и «закрыть подсвеченную» закрыло бы
   * не ту форму, на которую смотрит пользователь.
   */
  it('Delete и Backspace закрывают вкладку ПОД ФОКУСОМ, а не выбранную', async () => {
    const onClose = vi.fn()
    render(<FormTabs tabs={tabs} selectedId="a" onClose={onClose} />)
    const other = screen.getByRole('tab', { name: 'Контрагент' })
    other.focus()
    await userEvent.keyboard('{Delete}')
    expect(onClose).toHaveBeenCalledWith('b')

    onClose.mockClear()
    screen.getByRole('tab', { name: /Реализация №1/ }).focus()
    await userEvent.keyboard('{Backspace}')
    expect(onClose).toHaveBeenCalledWith('a')
  })

  it('Delete молчит, когда закрывать нечем, и вкладка не обещает того, чего нет', async () => {
    const onSelect = vi.fn()
    render(<FormTabs tabs={tabs} selectedId="a" onSelect={onSelect} />)
    const tab = screen.getByRole('tab', { name: /Реализация №1/ })
    expect(tab).not.toHaveAttribute('aria-keyshortcuts')
    tab.focus()
    await userEvent.keyboard('{Delete}')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('вкладка объявляет сочетание, которым её закрывают', () => {
    render(<FormTabs tabs={tabs} selectedId="a" onClose={() => {}} />)
    // Крестик `aria-hidden`, значит про закрытие скринридеру не скажет ничто
    // другое. `aria-keyshortcuts` — единственный носитель этого знания.
    expect(screen.getByRole('tab', { name: /Реализация №1/ })).toHaveAttribute('aria-keyshortcuts', 'Delete')
  })

  // Открытых форм в учётной системе бывает десяток: полоса уезжает за край, и без этого
  // активная вкладка может оказаться за пределами видимой части.
  it('scrolls the active tab into view when it changes', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, label: `Документ №${i}` }))
    const { rerender } = render(<FormTabs tabs={many} selectedId="t0" />)
    scrollIntoView.mockClear()
    rerender(<FormTabs tabs={many} selectedId="t9" />)
    expect(scrollIntoView).toHaveBeenCalled()
    // Цель прокрутки — обёртка, а не сама вкладка: крестик должен въезжать
    // в видимую зону вместе с подписью, иначе закрыть форму мышью нельзя, не
    // доскроллив ещё раз. Обёртка своей роли не имеет (роль на кнопке), поэтому
    // адресуемся от вкладки вверх.
    expect(scrollIntoView.mock.instances[0]).toBe(
      screen.getByRole('tab', { name: /Документ №9/ }).closest('.ds-formtabs__tab'),
    )
  })

  it('renders a leading home button only when onHome is given, and fires it', async () => {
    const onHome = vi.fn()
    const { rerender } = render(<FormTabs tabs={tabs} selectedId="a" />)
    expect(screen.queryByRole('button', { name: 'Начальная страница' })).toBeNull()
    rerender(<FormTabs tabs={tabs} selectedId="a" onHome={onHome} />)
    await userEvent.click(screen.getByRole('button', { name: 'Начальная страница' }))
    expect(onHome).toHaveBeenCalled()
  })
})

/**
 * Роль обязана лежать на том элементе, который получает фокус.
 *
 * `role="tab"` висел на нефокусируемом `<div>`, а фокус доставался вложенной
 * `<button>` без роли — скринридер объявлял «кнопка», а не «вкладка, 2 из 5».
 * Позиция и количество вкладок теряются полностью: пользователь слышит
 * название формы и не слышит, что это вообще полоса форм.
 *
 * Образец рядом, в `Tabs`: роль, `aria-selected` и roving `tabIndex` — на самой
 * кнопке.
 *
 * Крестик при этом ПОТОМОК вкладки и не интерактивен (DS-175, вторая
 * приёмка). Соседом он быть не мог: сосед внутри таблиста — это чужой ребёнок
 * в дереве доступности, обёртка без роли его не прячет. Потомком-КНОПКОЙ он
 * быть не мог тем более: интерактивный элемент внутри `role="tab"` запрещён
 * гейтом `no-nested-interactive`.
 */
describe('FormTabs · роль на фокусируемом элементе', () => {
  it('элемент с role="tab" — он же и фокусируемый', () => {
    render(<FormTabs tabs={tabs} selectedId="a" onClose={() => {}} />)
    const tab = screen.getByRole('tab', { name: 'Реализация №1' })
    expect(tab.tagName).toBe('BUTTON')
    expect(tab).toHaveAttribute('tabindex', '0')
    tab.focus()
    expect(tab).toHaveFocus()
  })

  it('крестик — потомок вкладки и ничего интерактивного внутрь не вносит', () => {
    render(<FormTabs tabs={tabs} selectedId="a" onClose={() => {}} />)
    const tab = screen.getByRole('tab', { name: 'Реализация №1' })
    const close = screen.getByTitle('Закрыть Реализация №1')
    expect(tab.contains(close)).toBe(true)
    // Гейт `no-nested-interactive` держит то же самое снаружи; здесь это
    // утверждается о конкретном узле, чтобы поломка называла компонент.
    expect(tab.querySelectorAll('button, a, input, select, textarea, [tabindex], [role]')).toHaveLength(0)
  })

  it('имя вкладки — только название формы: крестик в него не попадает', () => {
    render(<FormTabs tabs={tabs} selectedId="a" onClose={() => {}} />)
    // `aria-hidden` на крестике несущий: без него доступное имя вкладки стало
    // бы «Реализация №1 ×», и так её объявил бы скринридер.
    expect(screen.getByRole('tab', { name: 'Реализация №1' })).toBeInTheDocument()
  })
})

/**
 * Открытых форм в учётной системе бывает десяток. Клавиатурная модель таблиста: внутрь
 * полосы ведёт один Tab, дальше работают стрелки — значит внутри неё обязан
 * быть РОВНО ОДИН таб-стоп.
 *
 * До DS-175 их было два: вкладка и её крестик, каждый со своим roving
 * `tabIndex`. Приёмка померила третий (вместе с «домой») и упёрлась в заметку
 * случая `roving`, обещавшую два. Крестик перестал быть кнопкой вовсе, и
 * обещание сошлось с разметкой: закрытие с клавиатуры теперь `Delete` на самой
 * вкладке, отдельной остановки под него не заводится.
 */
describe('FormTabs · роуминг-фокус', () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, label: `Документ №${i}` }))

  it('в порядке табуляции ровно одна вкладка — активной, и больше ничего', () => {
    const { container } = render(<FormTabs tabs={many} selectedId="t3" onClose={() => {}} />)
    const stops = container.querySelectorAll('[tabindex="0"], button:not([tabindex])')
    expect(stops).toHaveLength(1)
    expect(stops[0]).toBe(screen.getByRole('tab', { name: 'Документ №3' }))
  })

  it('десять форм дают десять остановок минус девять: крестики не считаются вовсе', () => {
    const { container } = render(<FormTabs tabs={many} selectedId="t3" onClose={() => {}} />)
    // Санитар против «прошло, потому что не отрисовалось»: крестики на месте,
    // просто ни один из них не остановка.
    expect(container.querySelectorAll('.ds-formtabs__close')).toHaveLength(10)
    expect(container.querySelectorAll('.ds-formtabs__close[tabindex]')).toHaveLength(0)
  })

  it('кнопка «домой» остаётся обычным таб-стопом — и теперь вне таблиста по разметке', () => {
    const { container } = render(<FormTabs tabs={many} selectedId="t3" onHome={() => {}} />)
    const home = screen.getByRole('button', { name: 'Начальная страница' })
    expect(home).not.toHaveAttribute('tabindex')
    expect(container.querySelectorAll('[tabindex="0"], button:not([tabindex])')).toHaveLength(2)
  })
})

/**
 * Что полоса форм сообщает о себе наружу (DS-175).
 *
 * Заголовок предыдущего теста до этой задачи гласил «она вне таблиста по
 * смыслу», и это было ровно то, что задача называет дефектом, отмытым в
 * объяснение: по смыслу — да, по РАЗМЕТКЕ кнопка лежала внутри `role="tablist"`,
 * и axe давал `aria-required-children` на пяти случаях верстака из шести.
 *
 * ДИАГНОЗ БЫЛ СНЯТ РАЗЛИЧЕНИЕМ — И ОКАЗАЛСЯ НЕВЕРЕН. Контрольным случаем взяли
 * `no-home`, где axe был чист, и разницу прочитали как одну: «нет кнопки
 * „домой“». А у него `props: { closable: false, home: false }` — сняты ДВЕ
 * переменные. Виноваты были оба узла: крестик такой же чужой ребёнок таблиста,
 * как и кнопка. После первой правки счёт нарушений не изменился вовсе (1 на
 * пяти случаях из шести), сменился только узел.
 *
 * Приём «различением, а не чтением правила» защищает от вычитывания
 * спецификации, но не от контрольного случая, отличающегося больше чем в одном
 * месте. Это и есть урок задачи, и он дороже самой правки.
 *
 * ПОЧЕМУ ТЕСТ НИЖЕ ЭТОГО НЕ ПОЙМАЛ и почему теперь поймает: он смотрел
 * `list.children` — ПРЯМЫХ детей. Крестики лежали внутри обёрток, то есть
 * внуками, а `aria-required-children` считает не детей DOM, а ВЛАДЕЕМЫХ детей
 * в дереве доступности, и обёртка без роли для него прозрачна: её содержимое
 * поднимается к таблисту. Проверка обязана ходить по потомкам.
 *
 * Мутации, которыми проверяется сам тест (обе обязаны покраснеть): вернуть
 * `role="tablist"` на внешний `.ds-formtabs`; сделать крестик `<button>`.
 */
describe('FormTabs · что полоса объявляет наружу', () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, label: `Документ №${i}` }))

  it('таблист не владеет ничем, кроме вкладок — ни на одном уровне вложенности', () => {
    render(<FormTabs tabs={many} selectedId="t3" onHome={() => {}} onClose={() => {}} />)
    const list = screen.getByRole('tablist')
    const home = screen.getByRole('button', { name: 'Начальная страница' })
    expect(list.contains(home)).toBe(false)

    // По ПОТОМКАМ, а не по детям: обёртка вкладки роли не несёт и в дереве
    // доступности прозрачна, поэтому её содержимое владеется таблистом наравне
    // с ней самой. Именно на этом первая правка и разошлась с axe.
    //
    // И не «кнопки нет», а «нет НИЧЕГО, кроме вкладок»: проверка на одну только
    // кнопку прошла бы для любого другого чужого узла, который туда однажды
    // положат — крестик ровно так и прошёл.
    const owned = [...list.querySelectorAll('button, a, input, select, textarea, [tabindex], [role]')]
    const strays = owned.filter((n) => n.getAttribute('role') !== 'tab')
    expect(
      strays.map((n) => `${n.tagName}.${n.className}`),
      'в role="tablist" владеется не вкладка',
    ).toEqual([])

    // Санитар: сами вкладки на месте, то есть пустой список выше — не
    // следствие того, что не отрисовалось ничего.
    expect(owned).toHaveLength(many.length)
  })

  it('у полосы есть доступное имя, и оно про ФОРМЫ, а не про вкладки', () => {
    render(<FormTabs tabs={many} selectedId="t3" />)
    // axe имени у `tablist` не требует и его отсутствия НЕ ПОКАЗЫВАЕТ — поэтому
    // утверждение здесь, а не в слое верстака. Скринридер на безымянном
    // таблисте объявляет «вкладка, 4 из 10» и молчит о том, что это за список.
    expect(screen.getByRole('tablist', { name: 'Открытые формы' })).toBeInTheDocument()
  })

  it('стрелка на кнопке «домой» больше не переключает открытый документ', async () => {
    const onSelect = vi.fn()
    render(<FormTabs tabs={many} selectedId="t3" onSelect={onSelect} onHome={() => {}} />)
    // Обработчик клавиш уехал на таблист вместе с ролью. Пока он висел на
    // внешнем узле, кнопка, намеренно выведенная из полосы, всё равно ею
    // управляла: ArrowRight с неё листал формы.
    screen.getByRole('button', { name: 'Начальная страница' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onSelect).not.toHaveBeenCalled()

    // Санитар против способа «проверка прошла, потому что не работает ничего»:
    // с самой вкладки та же стрелка обязана листать.
    screen.getByRole('tab', { name: 'Документ №3' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onSelect).toHaveBeenCalledWith('t4')
  })
})

describe('FormTabs · выключенная вкладка', () => {
  const withDisabled = [
    { id: 'a', label: 'Реализация №1' },
    { id: 'b', label: 'Контрагент', disabled: true },
    { id: 'c', label: 'Договор' },
  ]

  it('стрелка перешагивает выключенную вкладку', async () => {
    const onSelect = vi.fn()
    render(<FormTabs tabs={withDisabled} selectedId="a" onSelect={onSelect} />)
    screen.getByRole('tab', { name: 'Реализация №1' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onSelect).toHaveBeenCalledWith('c')
  })

  it('выключенная помечена aria-disabled и не выбирается кликом', async () => {
    const onSelect = vi.fn()
    render(<FormTabs tabs={withDisabled} selectedId="a" onSelect={onSelect} />)
    const off = screen.getByRole('tab', { name: 'Контрагент' })
    expect(off).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(off)
    expect(onSelect).not.toHaveBeenCalled()
  })
})

/**
 * Значок и «не записано» — независимые поля `FormTab` (см. доккомментарии в
 * `FormTabs.tsx`). Значок декоративен и не несёт смысла сам по себе; знак
 * «не записано» несёт и знак, и слово, но никогда цвет.
 */
describe('FormTabs · значок и «не записано»', () => {
  const ICON = <svg data-testid="doc-icon" aria-hidden="true" />

  it('значок рендерится ПЕРЕД подписью и несёт aria-hidden', () => {
    const { container } = render(
      <FormTabs tabs={[{ id: 'a', label: 'Накладная', icon: ICON }]} selectedId="a" />,
    )
    const tab = screen.getByRole('tab', { name: 'Накладная' })
    const icon = container.querySelector('.ds-formtabs__icon')
    expect(icon).not.toBeNull()
    // ПЕРЕД подписью: значок — первый узел с содержимым внутри кнопки, текст
    // подписи идёт следом. `compareDocumentPosition` не нужен — довольно
    // порядка в тексте кнопки: значок ничего не печатает сам (это SVG), а вот
    // если бы он оказался ПОСЛЕ, доступное имя осталось бы тем же — поэтому
    // порядок судится по узлам, а не по имени.
    expect(tab.firstElementChild).toBe(icon)
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    // Декоративен и в доступное имя не попадает.
    expect(screen.getByRole('tab', { name: 'Накладная' })).toBeInTheDocument()
  })

  it('без icon значка нет вовсе', () => {
    const { container } = render(
      <FormTabs tabs={[{ id: 'a', label: 'Накладная' }]} selectedId="a" />,
    )
    expect(container.querySelector('.ds-formtabs__icon')).toBeNull()
  })

  it('modified даёт знак * и title «Не записано» на кнопке вкладки', () => {
    render(<FormTabs tabs={[{ id: 'a', label: 'Накладная', modified: true }]} selectedId="a" />)
    const tab = screen.getByRole('tab', { name: 'Накладная' })
    const mark = tab.querySelector('.ds-formtabs__modified')
    expect(mark).not.toBeNull()
    expect(mark).toHaveTextContent('*')
    expect(mark).toHaveAttribute('aria-hidden', 'true')
    expect(tab).toHaveAttribute('title', 'Не записано')
  })

  it('без modified ни знака, ни title на кнопке нет', () => {
    render(<FormTabs tabs={[{ id: 'a', label: 'Накладная' }]} selectedId="a" />)
    const tab = screen.getByRole('tab', { name: 'Накладная' })
    expect(tab.querySelector('.ds-formtabs__modified')).toBeNull()
    expect(tab).not.toHaveAttribute('title')
  })
})

describe('FormTabs · прочее', () => {
  it('renders a leading home button only when onHome is given, and fires it', async () => {
    const onHome = vi.fn()
    const { rerender } = render(<FormTabs tabs={tabs} selectedId="a" />)
    expect(screen.queryByRole('button', { name: 'Начальная страница' })).toBeNull()
    rerender(<FormTabs tabs={tabs} selectedId="a" onHome={onHome} />)
    await userEvent.click(screen.getByRole('button', { name: 'Начальная страница' }))
    expect(onHome).toHaveBeenCalled()
  })
})

/**
 * Выравнивание УСТАРЕВАЕТ, и это доказано замером (DS-175, раздел 3).
 *
 * При монтировании полоса вставала мимо максимума прокрутки на константу
 * `96 × --ds-ui-scale`. Три кандидата в корень, записанные в задаче — ширина
 * вкладки, ширина кнопки «домой», узел без собственных размеров, — оказались
 * НИ ПРИ ЧЁМ. Корень во времени: эффект выравнивает раскладку, набранную
 * ЗАПАСНЫМ шрифтом, а `Inter` доезжает после и делает содержимое шире.
 *
 * Замерено в chromium владельца, кадр 900:
 *
 *     содержимое запасным шрифтом   2143      Inter   2239   прирост 96
 *     scrollLeft при монтировании   1303
 *     максимум ЗАПАСНОЙ раскладки   2143 − 840 = 1303        ← совпадает точно
 *
 * И это не «примерно»: промах РАВЕН приросту от шрифта в каждом замере, где
 * вкладка помещается в порт — 96 / 120 / 96 при шкалах 1 / 1.25 / 1. Отсюда
 * же оба прежних наблюдения: промах не зависел от ширины порта (содержимое и
 * максимум растут на одно и то же) и ехал по шкале (едет кегль — едет прирост).
 *
 * ГЕОМЕТРИЮ ЗДЕСЬ ПРОВЕРИТЬ НЕЛЬЗЯ, и это не оговорка, а причина, по которой
 * дефект прожил при зелёном тесте: в jsdom нет раскладки, `scrollWidth` там
 * ноль, и любое утверждение про `scrollLeft` было бы утверждением про нуль.
 * Числа выше сняты в браузере и живут в задаче. Здесь проверяется МЕХАНИЗМ —
 * что выравнивание вообще повторяется, — потому что именно его отсутствие и
 * было дефектом.
 */
describe('FormTabs · выравнивание переживает доезд шрифта и смену размера', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, label: `Документ №${i}` }))
  const origFonts = Object.getOwnPropertyDescriptor(document, 'fonts')
  const origRO = globalThis.ResizeObserver

  afterEach(() => {
    if (origFonts) Object.defineProperty(document, 'fonts', origFonts)
    globalThis.ResizeObserver = origRO
  })

  /** Управляемые `fonts.ready` и `ResizeObserver`: оба события — по команде. */
  function harness() {
    let releaseFonts!: () => void
    const ready = new Promise<void>((res) => { releaseFonts = () => res() })
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready } })

    const observed: Element[] = []
    let fire!: () => void
    let disconnected = 0
    globalThis.ResizeObserver = class {
      constructor(cb: () => void) { fire = cb }
      observe(el: Element) { observed.push(el) }
      disconnect() { disconnected++ }
      unobserve() {}
    } as unknown as typeof ResizeObserver

    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    return { releaseFonts, ready, observed, fire: () => fire(), disconnectedCount: () => disconnected, scrollIntoView }
  }

  it('после доезда шрифта полоса выравнивается ВТОРОЙ раз', async () => {
    const h = harness()
    render(<FormTabs tabs={many} selectedId="t11" />)
    expect(h.scrollIntoView, 'первое выравнивание — при монтировании').toHaveBeenCalledTimes(1)

    await act(async () => { h.releaseFonts(); await h.ready })
    expect(h.scrollIntoView, 'второе — когда шрифт доехал и содержимое стало шире')
      .toHaveBeenCalledTimes(2)
    // Цель та же: обёртка активной вкладки, а не подпись — крестик должен
    // въезжать в видимую зону вместе с ней.
    expect(h.scrollIntoView.mock.instances[1]).toBe(
      screen.getByRole('tab', { name: /Документ №11/ }).closest('.ds-formtabs__tab'),
    )
  })

  it('наблюдатель подписан на ОБА узла: порт и содержимое', () => {
    const h = harness()
    const { container, unmount } = render(<FormTabs tabs={many} selectedId="t11" onHome={() => {}} />)
    // Порт — внешняя полоса (шире её делает раскладка потребителя), содержимое
    // — таблист внутри (шире его делает шрифт). Подписка на один из двух
    // закрыла бы половину правила и выглядела бы рабочей.
    expect(h.observed).toEqual([
      container.querySelector('.ds-formtabs'),
      container.querySelector('.ds-formtabs__list'),
    ])

    h.fire()
    expect(h.scrollIntoView, 'смена размера выравнивает заново').toHaveBeenCalledTimes(2)

    unmount()
    expect(h.disconnectedCount(), 'наблюдатель отцеплен при размонтировании').toBe(1)
  })

  it('без ResizeObserver в среде компонент не падает, а выравнивание остаётся', () => {
    const h = harness()
    // @ts-expect-error — среда без наблюдателя: старый webview, ssr-гидратация.
    delete globalThis.ResizeObserver
    expect(() => render(<FormTabs tabs={many} selectedId="t11" />)).not.toThrow()
    expect(h.scrollIntoView).toHaveBeenCalledTimes(1)
  })
})

/**
 * Куда уходит фокус после закрытия с клавиатуры (DS-175, третья приёмка).
 *
 * Закрытая вкладка исчезает из DOM вместе с фокусом, и он падает на `body`:
 * пользователь вылетает из полосы, а следующий `Delete` уходит в никуда.
 * Замерено приёмкой в браузере — 12 вкладок, фокус на третьей, после нажатия
 * `activeElement` это `BODY`, и второй `Delete` подряд не закрывает ничего.
 * Roving-разметка при этом цела, то есть по разметке дефекта не видно вовсе:
 * ловится он только настоящим нажатием и вопросом «а где теперь фокус».
 *
 * Мутация, которой проверяется сам тест: убрать перенос фокуса. Первые два
 * утверждения обязаны покраснеть на `BODY`.
 */
describe('FormTabs · фокус переживает закрытие', () => {
  function Live({ initial, selected, home }: { initial: { id: string, label: string }[], selected: string, home?: boolean }) {
    const [list, setList] = useState(initial)
    const [sel, setSel] = useState(selected)
    return (
      <FormTabs
        tabs={list} selectedId={sel} onSelect={setSel} onHome={home ? () => {} : undefined}
        onClose={(id) => {
          const i = list.findIndex((t) => t.id === id)
          const rest = list.filter((t) => t.id !== id)
          setList(rest)
          if (id === sel && rest.length) setSel(rest[Math.min(i, rest.length - 1)]!.id)
        }}
      />
    )
  }
  const five = Array.from({ length: 5 }, (_, i) => ({ id: `t${i}`, label: `Документ №${i}` }))

  it('фокус переезжает на вкладку, ВСТАВШУЮ НА МЕСТО закрытой', async () => {
    render(<Live initial={five} selected="t0" />)
    screen.getByRole('tab', { name: 'Документ №2' }).focus()
    await userEvent.keyboard('{Delete}')
    expect(screen.queryByRole('tab', { name: 'Документ №2' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Документ №3' })).toHaveFocus()
  })

  it('закрыли последнюю — фокус на новой последней, а не на `body`', async () => {
    render(<Live initial={five} selected="t0" />)
    screen.getByRole('tab', { name: 'Документ №4' }).focus()
    await userEvent.keyboard('{Delete}')
    expect(screen.getByRole('tab', { name: 'Документ №3' })).toHaveFocus()
  })

  it('второй Delete подряд закрывает вторую форму: фокус не потерян', async () => {
    render(<Live initial={five} selected="t0" />)
    screen.getByRole('tab', { name: 'Документ №1' }).focus()
    await userEvent.keyboard('{Delete}{Delete}')
    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })

  it('потребитель проигнорировал закрытие — фокус остаётся на месте', async () => {
    // `onClose` без снятия вкладки: спросили про несохранённое, отказали. Сверка
    // ДЛИНЫ здесь несущая — без неё перенос сработал бы на живой вкладке и
    // сдвинул фокус на соседнюю ни за чем.
    render(<FormTabs tabs={five} selectedId="t0" onClose={() => {}} />)
    const tab = screen.getByRole('tab', { name: 'Документ №2' })
    tab.focus()
    await userEvent.keyboard('{Delete}')
    expect(tab).toHaveFocus()
  })

  it('закрытие МЫШЬЮ фокус в полосу не втягивает', async () => {
    render(<Live initial={five} selected="t0" />)
    await userEvent.click(screen.getByTitle('Закрыть Документ №2'))
    expect(screen.queryByRole('tab', { name: 'Документ №2' })).toBeNull()
    // Курсор уже там, куда смотрит пользователь; забирать фокус значило бы
    // уводить его с того места, где он был до клика.
    expect(screen.getByRole('tab', { name: 'Документ №3' })).not.toHaveFocus()
  })

  it('закрытие МЫШЬЮ не сбрасывает фокус с СОСЕДНЕЙ вкладки', async () => {
    // Приёмка: фокус стоял на вкладке А, мышью закрыли Б — `activeElement` стал
    // `body`. Причина не в нашем переносе, а в браузере: `mousedown` по потомку
    // фокусирует ближайшего фокусируемого предка, то есть закрываемую вкладку,
    // и она тут же исчезает вместе с фокусом. Гасится `preventDefault` на
    // `mousedown` — клик при этом доезжает.
    render(<Live initial={five} selected="t0" />)
    const stay = screen.getByRole('tab', { name: 'Документ №1' })
    stay.focus()
    await userEvent.click(screen.getByTitle('Закрыть Документ №3'))
    expect(screen.queryByRole('tab', { name: 'Документ №3' })).toBeNull()
    expect(stay).toHaveFocus()
  })

  it('закрыли ПОСЛЕДНЮЮ форму — фокус на кнопке «домой», а не на `body`', async () => {
    render(<Live initial={five.slice(0, 1)} selected="t0" home />)
    screen.getByRole('tab', { name: 'Документ №0' }).focus()
    await userEvent.keyboard('{Delete}')
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    // Единственный оставшийся стоп полосы. Переносить некуда — но и ронять
    // фокус на `body` незачем, пока рядом есть куда его поставить.
    expect(screen.getByRole('button', { name: 'Начальная страница' })).toHaveFocus()
  })
})
