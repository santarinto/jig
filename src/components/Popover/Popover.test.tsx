import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Popover } from './Popover.js'
import { Button } from '../Button/index.js'

describe('Popover', () => {
  it('toggles the panel on trigger click (uncontrolled)', async () => {
    render(<Popover trigger={<button>Открыть</button>}><div>Содержимое</div></Popover>)
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(screen.getByText('Открыть'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Открыть'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders open when defaultOpen is set and closes on Escape', async () => {
    render(<Popover defaultOpen trigger={<button>T</button>}><div>Панель</div></Popover>)
    expect(screen.getByText('Панель')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on outside click', async () => {
    render(
      <div>
        <Popover defaultOpen trigger={<button>T</button>}><div>Панель</div></Popover>
        <button>Снаружи</button>
      </div>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Снаружи'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is controllable via open + onOpenChange', async () => {
    const onOpenChange = vi.fn()
    render(<Popover open={false} onOpenChange={onOpenChange} trigger={<button>T</button>}><div>П</div></Popover>)
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(screen.getByText('T'))
    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(screen.queryByRole('dialog')).toBeNull() // stays closed until parent flips `open`
  })
})

/**
 * Триггер оборачивался в `<span onClick>`: мышью работало, но обёртка не была
 * ни фокусируемой, ни объявленной. Скринридер слышал содержимое триггера и не
 * слышал, что оно что-то раскрывает; клавиатура открывала панель только если
 * потребитель сам положил внутрь кнопку — то есть по счастливой случайности.
 *
 * Обернуть чужой триггер в свою кнопку нельзя: у потребителя там `Button`, и
 * вышло бы `<button><button>` — вложенная интерактивность, два таб-стопа.
 * Поэтому пропсы навешиваются на сам триггер.
 */
describe('Popover · триггер и имя панели', () => {
  const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'

  it('триггер объявляет, что раскрывает диалог, и его состояние', async () => {
    render(<Popover trigger={<button>Открыть</button>}><div>П</div></Popover>)
    const trigger = screen.getByRole('button', { name: 'Открыть' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveAttribute('aria-controls', screen.getByRole('dialog').id)
  })

  it('таб-стоп ровно один — сам триггер, а не он внутри обёртки', () => {
    const { container } = render(
      <Popover trigger={<button>Открыть</button>}><div>П</div></Popover>,
    )
    expect(container.querySelectorAll(FOCUSABLE)).toHaveLength(1)
  })

  it('панель названа — role="dialog" без имени скринридер объявляет «диалог» и всё', () => {
    render(<Popover defaultOpen label="Выбор упражнений" trigger={<button>T</button>}><div>П</div></Popover>)
    expect(screen.getByRole('dialog', { name: 'Выбор упражнений' })).toBeInTheDocument()
  })

  it('Esc возвращает фокус на триггер', async () => {
    render(<Popover trigger={<button>Открыть</button>}><button>внутри</button></Popover>)
    const trigger = screen.getByRole('button', { name: 'Открыть' })
    await userEvent.click(trigger)
    screen.getByRole('button', { name: 'внутри' }).focus()
    await userEvent.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
  })

  it('клик мимо фокус на триггер НЕ возвращает', async () => {
    render(
      <div>
        <Popover defaultOpen trigger={<button>Открыть</button>}><div>П</div></Popover>
        <button>Снаружи</button>
      </div>,
    )
    const trigger = screen.getByRole('button', { name: 'Открыть' })
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).not.toHaveFocus()
  })

  // Мутация «не исключать панель» пережила ДВЕ версии этой проверки, и обе
  // были неопровержимы: панель размонтируется сразу, поэтому фокус попадает в
  // body хоть с исключением, хоть без — «не тронули» от «тронули исчезающее»
  // не отличить.
  //
  // Отличить можно там, где панель НЕ исчезает: управляемый Popover, чей
  // владелец `onOpenChange` игнорирует (open остаётся true). Тогда без
  // исключения Esc увёл бы фокус внутрь всё ещё открытой панели — то есть
  // «закрытие» не закрыло бы, а перебросило фокус вглубь.
  //
  // Триггер здесь — ВЫКЛЮЧЕННАЯ кнопка, и это не украшение: с фокусируемым
  // триггером мутация выживает, потому что первым фокусируемым в корне он и
  // стоит, с исключением или без. До DS-364 тут лежал `<span>`; теперь
  // он бросает, а `disabled` даёт тот же нефокусируемый триггер законной
  // формой — и она у потребителя встречается.
  it('управляемая панель, которую не закрыли: Esc не уводит фокус внутрь неё', async () => {
    render(
      <Popover open onOpenChange={() => {}} trigger={<button disabled>Выключен</button>}>
        <button>внутри панели</button>
      </Popover>,
    )
    const inside = screen.getByRole('button', { name: 'внутри панели' })
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(inside).not.toHaveFocus()
    outside.remove()
  })

  it('свой onClick триггера не теряется', async () => {
    const onClick = vi.fn()
    render(<Popover trigger={<button onClick={onClick}>Открыть</button>}><div>П</div></Popover>)
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  // Форма, в которой Popover стоит у портала (SearchMultiPicker): триггер —
  // наш Button с содержимым внутри. Здесь она обязана давать один таб-стоп и
  // объявленное состояние, а не span-обёртку вокруг кнопки.
  it('форма потребителя: Button-триггер даёт один таб-стоп и объявленное состояние', async () => {
    const { container } = render(
      <Popover label="Выбор" trigger={<Button variant="secondary">Выбрано: 3</Button>}>
        <button>внутри панели</button>
      </Popover>,
    )
    const trigger = screen.getByRole('button', { name: 'Выбрано: 3' })
    expect(container.querySelectorAll(FOCUSABLE)).toHaveLength(1)
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog', { name: 'Выбор' })).toBeInTheDocument()
    // И возврат фокуса — на ЭТОЙ форме, а не только на голом <button>.
    // Фокус сначала уводим В ПАНЕЛЬ: без этого проверка неопровержима — после
    // клика фокус и так на триггере, и «вернулся» от «никуда не уходил» не
    // отличить. Первая версия была именно такой и зеленела, пока возврат был
    // сломан (ref не доезжал через компонент потребителя на React 18).
    const inside = screen.getByRole('button', { name: 'внутри панели' })
    inside.focus()
    expect(inside).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
  })

  // Пара к `useAnchoredPosition.test.tsx`: там арифметика хука, здесь — что
  // компонент его ЗОВЁТ. `position: fixed` — единственное, что уносит панель
  // из-под клипа прокручиваемого предка (DS-240).
  it('панель позиционируется от вьюпорта: position fixed, а не absolute внутри корня', () => {
    render(<Popover trigger={<button type="button">Открыть</button>} label="Фильтры" defaultOpen>тело</Popover>)
    const panel = screen.getByRole('dialog')
    expect(panel.style.position).toBe('fixed')
    expect(panel.style.right).toBe('auto')
    expect(panel.style.bottom).toBe('auto')
  })
})

// СТРОГОСТЬ ТРИГГЕРА — ТА ЖЕ, ЧТО У DropdownMenu (DS-364). После 359
// общий `assertTriggerElement` звал один из двух его клиентов: `<span>` в
// `Popover.trigger` компилировался, рисовался и молча не был кнопкой. Сам
// бросок проверен в `DropdownMenu.test.tsx` по всем веткам; здесь — что
// Popover его ЗОВЁТ и что тексты говорят про Popover, а не про меню.
describe('Popover · триггер обязан быть кнопкой (DS-364)', () => {
  it('<span> в trigger БРОСАЕТ и называет Popover', () => {
    expect(() => render(<Popover trigger={<span>Фильтр ▾</span>}>панель</Popover>))
      .toThrow(/Popover: `trigger`.*<span>/s)
    expect(() => render(<Popover trigger={<span>Фильтр ▾</span>}>панель</Popover>))
      .toThrow(/DS-364/)
  })

  it('фрагмент и <a> без href БРОСАЮТ', () => {
    expect(() => render(<Popover trigger={<>Фильтр</>}>панель</Popover>)).toThrow(/фрагмент/)
    expect(() => render(<Popover trigger={<a>Фильтр</a>}>панель</Popover>)).toThrow(/href/)
  })

  // У Popover встроенного триггера НЕТ, и текст отказа DropdownMenu («передайте
  // undefined — встанет кебаб») здесь был бы советом, ведущим в следующий
  // бросок. Поэтому `undefined` тоже отказ, а замена названа своя: условие
  // выносится наружу.
  it.each([['null', null], ['false', false], ["''", ''], ['undefined', undefined]])(
    'ложный trigger (%s) БРОСАЕТ, про кебаб молчит и называет условие снаружи',
    (_name, falsy) => {
      const run = () => render(<Popover trigger={falsy as never}>панель</Popover>)
      expect(run).toThrow(/обязателен/)
      expect(run).toThrow(/cond && <Popover/)
      expect(run).not.toThrow(/кебаб/)
    },
  )

  it('законный триггер НЕ бросает: <button>, <Button>, <a href> и компонент-обёртка', () => {
    const Wrapped = (p: React.ComponentPropsWithoutRef<'button'>) => <button {...p}>Фильтр</button>
    for (const node of [<button key="b">Ф</button>, <Button key="B">Ф</Button>, <a key="a" href="#x">Ф</a>, <Wrapped key="w" />]) {
      expect(() => render(<Popover trigger={node}>панель</Popover>)).not.toThrow()
    }
  })

  // ТИП. Голая `<button>` без `type` внутри `<form>` — submit: клик по
  // триггеру отправлял бы форму заодно с открытием панели. Наш `Button` с
  // DS-365 ставит `button` сам, поэтому дефект виден только на голой.
  it('голый <button>-триггер в <form> не отправляет форму', async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    render(<form onSubmit={onSubmit}><Popover trigger={<button>Фильтр</button>}>панель</Popover></form>)
    const trigger = screen.getByRole('button', { name: 'Фильтр' })
    expect(trigger).toHaveAttribute('type', 'button')
    await userEvent.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('свой type потребителя клон не затирает, а ссылке type не ставится', () => {
    render(<Popover trigger={<button type="submit">С</button>}>п</Popover>)
    expect(screen.getByRole('button', { name: 'С' })).toHaveAttribute('type', 'submit')
    render(<Popover trigger={<a href="#x">Л</a>}>п</Popover>)
    expect(screen.getByRole('link', { name: 'Л' })).not.toHaveAttribute('type')
    // Второй признак ссылки — `href` на КОМПОНЕНТЕ: у `<Button as="a" href>`
    // тип элемента не строка, и без него в DOM вышло бы `<a type="button">`.
    render(<Popover trigger={<Button as="a" href="#y">К</Button>}>п</Popover>)
    expect(screen.getByRole('link', { name: 'К' })).not.toHaveAttribute('type')
  })
})
