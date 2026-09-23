import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { DropdownMenu, type DropdownItem } from './DropdownMenu.js'
import { Button } from '../Button/index.js'

const makeItems = (onOpen = vi.fn(), onDelete = vi.fn()): DropdownItem[] => [
  { id: 'open', label: 'Открыть', onSelect: onOpen },
  { id: 'archive', label: 'Архив', disabled: true },
  { separator: true },
  { id: 'delete', label: 'Удалить', tone: 'error', onSelect: onDelete },
]

describe('DropdownMenu', () => {
  it('смена items при открытом меню не сбрасывает активный пункт', async () => {
    // Неполные зависимости эффекта открытия — это контракт, а не недосмотр:
    // активный пункт выбирается один раз, при открытии. Потребитель волен
    // пересчитать `items` в любой момент, и его пересчёт не должен утаскивать
    // клавиатуру пользователя к первому пункту.
    const base: DropdownItem[] = [
      { id: 'open', label: 'Открыть' }, { id: 'dup', label: 'Дублировать' }, { id: 'del', label: 'Удалить' },
    ]
    const { rerender } = render(<DropdownMenu items={base} ariaLabel="Действия" />)
    await userEvent.click(screen.getByRole('button', { name: 'Действия' }))
    expect(screen.getByRole('menuitem', { name: 'Открыть' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Дублировать' })).toHaveFocus()

    rerender(<DropdownMenu items={[...base, { id: 'export', label: 'Экспорт' }]} ariaLabel="Действия" />)
    expect(screen.getAllByRole('menuitem')).toHaveLength(4)
    expect(screen.getByRole('menuitem', { name: 'Дублировать' })).toHaveFocus()
  })

  it('opens the menu from the built-in kebab and renders items + separator', async () => {
    render(<DropdownMenu items={makeItems()} ariaLabel="Действия" />)
    expect(screen.queryByRole('menu')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Действия' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem')).toHaveLength(3)
    expect(screen.getByRole('separator')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Удалить' })).toHaveClass('ds-dropdown__item--error')
    expect(screen.getByRole('menuitem', { name: 'Архив' })).toBeDisabled()
  })

  it('runs onSelect and closes when an item is chosen', async () => {
    const onOpen = vi.fn()
    render(<DropdownMenu items={makeItems(onOpen)} ariaLabel="Действия" />)
    await userEvent.click(screen.getByRole('button', { name: 'Действия' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Открыть' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    render(<DropdownMenu items={makeItems()} ariaLabel="Действия" />)
    const trigger = screen.getByRole('button', { name: 'Действия' })
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('ArrowDown moves focus across enabled items, skipping disabled', async () => {
    render(<DropdownMenu items={makeItems()} ariaLabel="Действия" />)
    await userEvent.click(screen.getByRole('button', { name: 'Действия' }))
    expect(screen.getByRole('menuitem', { name: 'Открыть' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    // 'Архив' is disabled, so focus lands on 'Удалить'
    expect(screen.getByRole('menuitem', { name: 'Удалить' })).toHaveFocus()
  })

  it('renders the menu open on mount when defaultOpen is set', () => {
    render(<DropdownMenu items={makeItems()} defaultOpen />)
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  // ТРИГГЕР — ЭЛЕМЕНТ ПОТРЕБИТЕЛЯ, клонированный нашими пропсами (DS-359).
  // Голый `<button>` и наш `<Button>` — две разные формы: первая доказывает,
  // что пропсы доезжают до DOM, вторая — что они переживают чужой компонент,
  // который их пробрасывает спредом. Порознь неполны: голая форма зелена и
  // тогда, когда `cloneElement` работает только на интринсиках.
  it('свой триггер: голый <button> открывает меню и несёт объявление', async () => {
    render(<DropdownMenu items={makeItems()} trigger={<button>Действия</button>} />)
    const trigger = screen.getByRole('button', { name: 'Действия' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('свой триггер: системный <Button> даёт ОДИН таб-стоп, а не кнопку в кнопке', async () => {
    const { container } = render(
      <DropdownMenu items={makeItems()} trigger={<Button variant="secondary">Действия</Button>} />,
    )
    // Обёртки вокруг чужого узла больше нет: кнопок в корне ровно одна. До
    // DS-359 их было бы две — наша и переданная, — и это ровно то, что
    // запрещает гейт `no-nested-interactive`.
    expect(container.querySelectorAll('button')).toHaveLength(1)
    const trigger = screen.getByRole('button', { name: 'Действия' })
    expect(trigger).toHaveClass('ds-btn')
    // ПРОПСЫ ПЕРЕЖИВАЮТ ЧУЖОЙ КОМПОНЕНТ, и это утверждение, а не обещание в
    // комментарии: `Button` пробрасывает их спредом, и сломайся проброс — на
    // голом `<button>` тест остался бы зелёным.
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveAttribute('aria-controls', screen.getByRole('menu').id)
  })

  // ТИП ТРИГГЕРА. До DS-359 его гарантировала наша обёртка
  // (`type="button"`); теперь триггер — кнопка потребителя, а голая `<button>`
  // без `type` внутри `<form>` по умолчанию `submit`. Наш `Button` тип тоже не
  // ставит, поэтому форм тут две, а не одна: на голой кнопке дефект виден, на
  // `Button` он ехал бы через чужой спред и пропустился бы.
  it.each([
    ['голый <button>', <button key="b">Действия</button>],
    ['системный <Button>', <Button key="B" variant="secondary">Действия</Button>],
  ])('триггер в <form> не отправляет форму: %s', async (_name, node) => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <DropdownMenu items={makeItems()} trigger={node} />
      </form>,
    )
    const trigger = screen.getByRole('button', { name: 'Действия' })
    expect(trigger).toHaveAttribute('type', 'button')
    await userEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // Обратная сторона: свой `type` потребителя клон НЕ затирает. Без этого
  // случая «ставим button всегда» прошло бы, и проп потребителя исчезал бы
  // молча.
  it('свой type триггера переживает клон', () => {
    render(<DropdownMenu items={makeItems()} trigger={<button type="submit">Действия</button>} />)
    expect(screen.getByRole('button', { name: 'Действия' })).toHaveAttribute('type', 'submit')
  })

  // ССЫЛКЕ `type` не ставится: у `<a>` атрибут значит тип содержимого по
  // ссылке, а не роль кнопки.
  it('триггер-ссылка type не получает', () => {
    render(<DropdownMenu items={makeItems()} trigger={<a href="#x">Действия</a>} />)
    expect(screen.getByRole('link', { name: 'Действия' })).not.toHaveAttribute('type')
    // Второй признак — `href` на КОМПОНЕНТЕ (DS-364, находка ревью): у
    // `<Button as="a" href>` тип элемента не строка, и по одному `type === 'a'`
    // в DOM вышло бы `<a type="button">`. Мутация эта жила с 359.
    render(<DropdownMenu items={makeItems()} trigger={<Button as="a" href="#y">Ссылка</Button>} />)
    expect(screen.getByRole('link', { name: 'Ссылка' })).not.toHaveAttribute('type')
  })

  // ПОЛ ЦЕЛИ КЛИКА — классом на чужом узле. Здесь проверяется, что класс
  // ДОПИСЫВАЕТСЯ, а не заменяет свой: сам размер меряется в браузере
  // (`make measure`, случай фикстуры `bare-trigger`), jsdom высот не считает.
  it('пол цели: класс ds-dropdown__trigger дописывается к своему className', () => {
    render(<DropdownMenu items={makeItems()} trigger={<button className="my-own">Действия</button>} />)
    const trigger = screen.getByRole('button', { name: 'Действия' })
    expect(trigger).toHaveClass('my-own')
    expect(trigger).toHaveClass('ds-dropdown__trigger')
  })

  it('свой onClick триггера не теряется', async () => {
    const onClick = vi.fn()
    render(<DropdownMenu items={makeItems()} trigger={<button onClick={onClick}>Действия</button>} />)
    await userEvent.click(screen.getByRole('button', { name: 'Действия' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  // Пара к предыдущему: `onKeyDown` компонент тоже ВЕШАЕТ свой, значит тоже
  // может затереть чужой. Случай про потерю обработчика потребителя, а не про
  // клавиатуру (она отложена владельцем на время MVP).
  it('свой onKeyDown триггера не теряется', async () => {
    const onKeyDown = vi.fn()
    render(<DropdownMenu items={makeItems()} trigger={<button onKeyDown={onKeyDown}>Действия</button>} />)
    screen.getByRole('button', { name: 'Действия' }).focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(onKeyDown).toHaveBeenCalledTimes(1)
    // И наш обработчик при этом отработал: иначе «не потерялся» держалось бы
    // на том, что свой просто затёр наш.
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  // Возврат фокуса на СВОЙ триггер, а не только на кебаб. Реф сюда не доезжает
  // — потребительский компонент его пробрасывать не обязан, — поэтому триггер
  // ищется в DOM (`src/internal/trigger.ts`). Фокус сначала уводим в меню:
  // без этого «вернулся» от «никуда не уходил» не отличить.
  it('Escape возвращает фокус на свой триггер, а не в пустоту', async () => {
    render(<DropdownMenu items={makeItems()} trigger={<Button variant="secondary">Действия</Button>} />)
    const trigger = screen.getByRole('button', { name: 'Действия' })
    await userEvent.click(trigger)
    expect(screen.getByRole('menuitem', { name: 'Открыть' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  // СТАРАЯ ФОРМА ОБЯЗАНА БРОСАТЬ, а не деградировать (CLAUDE.md, «Deprecated
  // API»). `<span>` от `<button>` типом не отличить — оба `ReactElement`, — а
  // до DS-359 превью для дизайн-агента учило писать сюда именно
  // `<span className="ds-btn …">`. Без броска такой вызов продолжил бы
  // компилироваться и рисоваться, молча перестав быть таб-стопом.
  it('старая форма: <span> в trigger БРОСАЕТ', () => {
    const items = makeItems()
    expect(() => render(<DropdownMenu items={items} trigger={<span>Действия ▾</span>} />))
      .toThrow(/trigger.*<span>/s)
    expect(() => render(<DropdownMenu items={items} trigger={<span>Действия ▾</span>} />))
      .toThrow(/DS-359/)
  })

  it('старая форма: фрагмент в trigger БРОСАЕТ — пропсов он не принимает вовсе', () => {
    expect(() => render(<DropdownMenu items={makeItems()} trigger={<>Действия ▾</>} />))
      .toThrow(/фрагмент/)
  })

  // ЛОЖНЫЙ `trigger` — тоже старая форма, и она была РАБОЧЕЙ: `trigger={cond
  // && <X/>}` при ложном `cond` молча вставал встроенным кебабом. Бросок
  // остаётся, но текст обязан назвать замену, а не сообщить «не object».
  it.each([['null', null], ['false', false], ["''", '']])(
    'ложный trigger (%s) БРОСАЕТ и называет замену через undefined',
    (_name, falsy) => {
      expect(() => render(<DropdownMenu items={makeItems()} trigger={falsy as never} />))
        .toThrow(/undefined/)
      expect(() => render(<DropdownMenu items={makeItems()} trigger={falsy as never} />))
        .toThrow(/кебаб/)
    },
  )

  // `undefined` — НЕ ложное значение в этом смысле: это и есть «триггера нет».
  it('trigger={undefined} даёт встроенный кебаб, а не бросок', () => {
    render(<DropdownMenu items={makeItems()} trigger={undefined} ariaLabel="Действия" />)
    expect(screen.getByRole('button', { name: 'Действия' })).toHaveClass('ds-dropdown__kebab')
  })

  // Обратная половина: бросок обязан РАЗЛИЧАТЬ, а не запрещать всё подряд.
  // Без этих двух случаев то же самое даёт `throw` на любом триггере.
  it('законный триггер НЕ бросает: <button>, <Button> и <a href>', () => {
    const items = makeItems()
    expect(() => render(<DropdownMenu items={items} trigger={<button>Действия</button>} />)).not.toThrow()
    expect(() => render(<DropdownMenu items={items} trigger={<Button>Действия</Button>} />)).not.toThrow()
    expect(() => render(<DropdownMenu items={items} trigger={<a href="#x">Действия</a>} />)).not.toThrow()
  })

  // Список интринсиков ЗАКРЫТ, и отказ обязан это сказать: `<input
  // type="button">` и `<summary>` фокусируемы, но их модель ввода принадлежит
  // им. Без этого случая «закрытый список» было бы утверждением из комментария.
  it.each([['input', <input key="i" type="button" value="Действия" />], ['summary', <summary key="s">Действия</summary>]])(
    'фокусируемый, но чужой интринсик (%s) БРОСАЕТ и называет выход через компонент-обёртку',
    (_name, node) => {
      expect(() => render(<DropdownMenu items={makeItems()} trigger={node} />))
        .toThrow(/компонент-обёртку/)
    },
  )

  // Обёртка кнопки у потребителя — компонент, и что он рисует, знает только
  // он. Бросок на нём был бы отказом своему же `<Button>`: по типу они
  // неразличимы.
  it('компонент-обёртка кнопки у потребителя НЕ бросает', () => {
    const Wrapped = (p: React.ComponentPropsWithoutRef<'button'>) => <button {...p}>Действия</button>
    expect(() => render(<DropdownMenu items={makeItems()} trigger={<Wrapped />} />)).not.toThrow()
  })

  it('<a> без href БРОСАЕТ: он не фокусируется, то есть это тот же <span>', () => {
    expect(() => render(<DropdownMenu items={makeItems()} trigger={<a>Действия</a>} />))
      .toThrow(/href/)
  })

  // Пара к `useAnchoredPosition.test.tsx`: там проверяется арифметика хука, здесь
  // — что компонент её ВООБЩЕ ЗОВЁТ. Порознь неполны: тот случай переживёт
  // выброшенный из меню вызов хука, этот — сломанную в хуке арифметику.
  //
  // `position: fixed` тут не оформление, а единственное, что уносит меню из-под
  // клипа прокручиваемого предка: в `DataTable` с прокруткой обёртки от меню
  // строки оставался 1px из 90 (DS-240).
  it('меню позиционируется от вьюпорта: position fixed, а не absolute внутри триггера', async () => {
    render(<DropdownMenu items={[{ id: 'open', label: 'Открыть' }]} defaultOpen />)
    const menu = screen.getByRole('menu')
    expect(menu.style.position).toBe('fixed')
    // `right`/`bottom` обязаны быть погашены: модификаторы `--end` и `--up`
    // остаются в листе статическим фолбэком для ручной вёрстки, и без гашения
    // `right: 0` из листа сложился бы с посчитанным `left`.
    expect(menu.style.right).toBe('auto')
    expect(menu.style.bottom).toBe('auto')
  })
})
