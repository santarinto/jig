import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { CommandBar, type CommandAction } from './CommandBar.js'

const A = (label: string, extra: Partial<CommandAction> = {}): CommandAction =>
  ({ id: label, label, ...extra })

describe('CommandBar', () => {
  it('рисует панель, действия и разделитель на смене группы', () => {
    render(
      <CommandBar
        aria-label="Команды"
        actions={[A('Создать', { group: 'edit' }), A('Обновить', { group: 'view' })]}
      />,
    )
    const bar = screen.getByRole('toolbar', { name: 'Команды' })
    expect(bar).toHaveClass('ds-cmdbar')
    expect(bar.querySelector('.ds-cmdbar__sep')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Создать' })).toBeInTheDocument()
  })

  it('нажатие зовёт `onSelect` того действия, по которому нажали', async () => {
    const save = vi.fn()
    const post = vi.fn()
    render(<CommandBar aria-label="Команды" actions={[A('Записать', { onSelect: save }), A('Провести', { onSelect: post })]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Провести' }))
    expect(save).not.toHaveBeenCalled()
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('`href` рисует ссылку, а не кнопку — без гидрации переход обязан работать', () => {
    render(<CommandBar aria-label="Команды" actions={[A('Долги', { href: '#debts' })]} />)
    expect(screen.getByRole('link', { name: 'Долги' })).toHaveAttribute('href', '#debts')
  })

  // DS-360: значок действия рисует `Button.icon`, у панели больше нет
  // своей `.ds-cmdbar__icon` — она перерисовывала токенами то, что уже даёт
  // `.ds-btn__icon` (Button.css).
  it('значок действия уходит в Button.icon, а не в свою .ds-cmdbar__icon', () => {
    const { container } = render(
      <CommandBar aria-label="Команды" actions={[A('Создать', { icon: <svg data-testid="ic" /> })]} />,
    )
    expect(container.querySelector('.ds-cmdbar__icon')).toBeNull()
    const btn = screen.getByRole('button', { name: 'Создать' })
    expect(btn.querySelector('.ds-btn__icon')).not.toBeNull()
    expect(screen.getByTestId('ic')).toBeInTheDocument()
  })
})

/**
 * РАЗДЕЛИТЕЛЬ ВЫВОДИТСЯ ИЗ ГРУПП, а не ставится руками (DS-239).
 *
 * Утверждения парные и оба обязательны. «Разделитель есть на смене группы»
 * верно и на компоненте, который ставит его перед КАЖДЫМ действием, — а такой
 * разделитель не означает ничего и становится фоном. «Ведущего нет» верно и на
 * компоненте, который не рисует разделителей вовсе.
 */
describe('CommandBar · разделители групп', () => {
  const bar = (actions: CommandAction[]) => render(<CommandBar aria-label="Команды" actions={actions} />).container

  it('разделитель ровно один на каждую смену группы, и ни одного внутри группы', () => {
    const c = bar([
      A('Провести и закрыть', { group: 'write' }),
      A('Записать', { group: 'write' }),
      A('Печать', { group: 'print' }),
      A('Отчёты', { group: 'print' }),
      A('Удалить', { group: 'delete' }),
    ])
    expect(c.querySelectorAll('.ds-cmdbar__sep')).toHaveLength(2)
    expect(screen.getAllByRole('separator')).toHaveLength(2)
  })

  it('ВЕДУЩЕГО разделителя нет, хотя у первого действия группа названа', () => {
    const c = bar([A('Создать', { group: 'edit' }), A('Обновить', { group: 'edit' })])
    expect(c.querySelectorAll('.ds-cmdbar__sep')).toHaveLength(0)
  })

  it('без групп разделителей нет вовсе', () => {
    const c = bar([A('Создать'), A('Обновить'), A('Удалить')])
    expect(c.querySelectorAll('.ds-cmdbar__sep')).toHaveLength(0)
  })
})

/**
 * `role="toolbar"` — обещание клавиатурной модели, а не украшение: внутрь ведёт
 * один Tab, дальше стрелки, следующий Tab выводит наружу. Панель объявляла
 * роль и давала таб-стоп на каждую кнопку — описывала виджет, которым не была.
 *
 * Роуминг по-прежнему по DOM: в обходе участвуют и «Ещё», и ссылка вместо
 * кнопки — узлы, которых в `actions` нет поштучно.
 */
describe('CommandBar · роуминг-фокус', () => {
  const ACTIONS: CommandAction[] = [
    A('Создать', { group: 'edit' }),
    A('Обновить', { group: 'view' }),
    A('Долги', { href: '/debt', group: 'view' }),
  ]
  // disabled-кнопка отдаёт tabIndex 0 по умолчанию, но таб-стопом не является:
  // считать её значило бы мерить атрибут вместо порядка табуляции.
  const stops = (c: HTMLElement) =>
    [...c.querySelectorAll<HTMLElement>('button, a[href]')]
      .filter((el) => el.tabIndex === 0 && !(el as HTMLButtonElement).disabled)

  const bar = (actions: CommandAction[] = ACTIONS, trailing?: React.ReactNode) =>
    <CommandBar aria-label="Команды" actions={actions} trailing={trailing} />

  it('в порядке табуляции ровно один элемент, хотя действий три', () => {
    const { container } = render(bar())
    expect(stops(container)).toHaveLength(1)
    expect(stops(container)[0]).toBe(screen.getByRole('button', { name: 'Создать' }))
  })

  it('стрелки ходят по действиям, включая ссылку — не только по кнопкам', async () => {
    render(bar())
    screen.getByRole('button', { name: 'Создать' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: 'Обновить' })).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('link', { name: 'Долги' })).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByRole('button', { name: 'Обновить' })).toHaveFocus()
  })

  it('стрелка идёт по кругу — у замкнутой группы края нет', async () => {
    render(bar())
    screen.getByRole('button', { name: 'Создать' }).focus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByRole('link', { name: 'Долги' })).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: 'Создать' })).toHaveFocus()
  })

  it('Home и End — первое и последнее действие', async () => {
    render(bar())
    screen.getByRole('button', { name: 'Обновить' }).focus()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('link', { name: 'Долги' })).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(screen.getByRole('button', { name: 'Создать' })).toHaveFocus()
  })

  it('таб-стоп переезжает за фокусом, а не отскакивает на первый', async () => {
    const { container } = render(bar())
    screen.getByRole('button', { name: 'Создать' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(stops(container)).toHaveLength(1)
    expect(stops(container)[0]).toBe(screen.getByRole('button', { name: 'Обновить' }))
  })

  // Мутация «таб-стоп всегда на первом» пережила первую версию набора: стрелки
  // двигают tabIndex прямо в обработчике, а эффект без перерисовки не бежит —
  // ветка «оставить таб-стоп на том, где фокус» просто не получала хода.
  // Живой сценарий, где она решает: панель перерисовалась от родителя, пока
  // пользователь стоит на третьей кнопке. Без ветки таб-стоп молча уезжает на
  // первую, и Shift+Tab наружу с возвратом приводит не туда, где были.
  it('перерисовка не отбирает таб-стоп у того, на ком фокус', () => {
    const { container, rerender } = render(bar())
    const link = screen.getByRole('link', { name: 'Долги' })
    link.focus()
    rerender(bar(ACTIONS, <span>обновлено</span>))
    expect(stops(container)).toHaveLength(1)
    expect(stops(container)[0]).toBe(link)
  })

  it('состав панели изменился — таб-стоп не потерялся', () => {
    const { container, rerender } = render(bar())
    rerender(bar([...ACTIONS, A('Экспорт')]))
    expect(stops(container)).toHaveLength(1)
  })

  it('disabled-действие не участвует в роуминге', async () => {
    const { container } = render(bar([A('Создать'), A('Удалить', { disabled: true }), A('Обновить')]))
    expect(stops(container)).toHaveLength(1)
    screen.getByRole('button', { name: 'Создать' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: 'Обновить' })).toHaveFocus()
  })

  it('пустая панель не падает и таб-стопов не выдумывает', () => {
    const { container } = render(<CommandBar aria-label="Пусто" actions={[]} />)
    expect(stops(container)).toHaveLength(0)
  })

  it('ХОЛОСТАЯ «Ещё» в обход не встаёт — сворачивать нечего, кнопки для человека нет', () => {
    const { container } = render(bar())
    // Она есть В РАЗМЕТКЕ (её ширина — слагаемое бюджета свёртки), но выведена
    // из потока и из дерева. Мутация «рисовать её только при свёртке» ломает
    // замер, а мутация «не прятать» ломает этот счётчик.
    expect(container.querySelector('.ds-cmdbar__more')).not.toBeNull()
    expect(container.querySelector('.ds-cmdbar__more')).toHaveClass('is-idle')
    expect(stops(container)).toHaveLength(1)
  })
})

/**
 * СВЁРТКА ХВОСТА (DS-239).
 *
 * jsdom раскладки не считает — все ширины в нём нули, — и подменяются они
 * здесь НЕ для правдоподобия, а чтобы проверить ПРОВОДКУ: панель сняла
 * настоящие числа с узлов, отдала их `fitCount` и нарисовала ответ. Сама
 * арифметика проверяется без DOM (`src/internal/overflow.test.ts`), а то, что
 * числа в браузере настоящие, — случаем `measure`. Три утверждения, каждое
 * переживает поломку, которой не видят два других.
 */
describe('CommandBar · свёртка хвоста в «Ещё»', () => {
  /** Ширина по классу: действие 100, разделитель 17, «Ещё» 60, полоса — `barW`. */
  function withLayout(barW: number, run: () => void) {
    // Обе подмены кладутся СВОИМИ свойствами на `HTMLElement.prototype`, где
    // их нет: `getBoundingClientRect` живёт на `Element.prototype`, и снимать
    // подмену надо `delete`, а не возвратом дескриптора, которого не было.
    const proto = HTMLElement.prototype
    const client = Object.getOwnPropertyDescriptor(proto, 'clientWidth')
    const width = (el: HTMLElement) => {
      if (el.classList.contains('ds-cmdbar')) return barW
      if (el.classList.contains('ds-cmdbar__sep')) return 17
      if (el.classList.contains('ds-cmdbar__more')) return 60
      if (el.hasAttribute('data-ds-action')) return 100
      return 0
    }
    Object.defineProperty(proto, 'getBoundingClientRect', {
      configurable: true,
      value(this: HTMLElement) { return { width: width(this), height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } },
    })
    Object.defineProperty(proto, 'clientWidth', {
      configurable: true,
      get(this: HTMLElement) { return width(this) },
    })
    try { run() } finally {
      delete (proto as never as Record<string, unknown>).getBoundingClientRect
      if (client) Object.defineProperty(proto, 'clientWidth', client); else delete (proto as never as Record<string, unknown>).clientWidth
    }
  }

  const SIX = ['Создать', 'Скопировать', 'Изменить', 'Провести', 'Отменить проведение', 'Печать']
    .map((l) => A(l))
  const bar = (actions = SIX) => <CommandBar aria-label="Действия" actions={actions} />

  /** Видимые действия: скрытые помечены `data-ds-folded`. */
  const shown = (c: HTMLElement) =>
    [...c.querySelectorAll<HTMLElement>('[data-ds-action]')].filter((el) => !el.hasAttribute('data-ds-folded'))

  it('всё влезло — «Ещё» холостая, свёрнутых нет', () => {
    withLayout(1000, () => {
      const { container } = render(bar())
      expect(shown(container)).toHaveLength(6)
      expect(container.querySelector('.ds-cmdbar__more')).toHaveClass('is-idle')
      expect(container.querySelector('.ds-cmdbar__row')).not.toHaveClass('is-folded')
    })
  })

  it('не влезло — хвост уходит в меню, а не за край', () => {
    // Бюджет 300: три действия по 100 стоили бы ровно 300, но с «Ещё» (60)
    // помещаются только два. Наивный счёт «сколько влезло» ответил бы три и
    // нарисовал бы «Ещё» ПОВЕРХ бюджета.
    withLayout(300, () => {
      const { container } = render(bar())
      expect(shown(container)).toHaveLength(2)
      expect(container.querySelector('.ds-cmdbar__more')).not.toHaveClass('is-idle')
      expect(container.querySelector('.ds-cmdbar__row')).toHaveClass('is-folded')
    })
  })

  it('свёрнутое ЛЕЖИТ В МЕНЮ, а не пропадает — и нажимается оттуда', async () => {
    const exp = vi.fn()
    withLayout(300, () => {
      render(bar([...SIX.slice(0, 5), A('Экспорт', { onSelect: exp })]))
    })
    await userEvent.click(screen.getByRole('button', { name: 'Ещё' }))
    const item = screen.getByRole('menuitem', { name: 'Экспорт' })
    expect(item).toBeInTheDocument()
    await userEvent.click(item)
    expect(exp).toHaveBeenCalledTimes(1)
  })

  it('свёрнутое действие ВТОРЫМ ИМЕНЕМ в дереве не появляется', () => {
    // Узел остаётся в разметке (его ширина — источник следующего замера), но
    // `aria-hidden` снимает его с дерева. Без этого «Экспорт» читался бы
    // дважды: скрытая копия в полосе и видимый пункт меню.
    withLayout(300, () => {
      const { container } = render(bar())
      const hidden = container.querySelector('[data-ds-action][data-ds-folded]')
      expect(hidden, 'свёрнутого узла нет в разметке — замер ослепнет').not.toBeNull()
      expect(hidden).toHaveAttribute('aria-hidden', 'true')
      expect(screen.queryAllByRole('button', { name: 'Печать' })).toHaveLength(0)
    })
  })

  it('свёрнутый хвост уносит СВОЙ разделитель, сироты у края не остаётся', () => {
    // Группа начинается с четвёртого действия. При бюджете на три видимых
    // разделитель не рисуется вовсе: он означал бы «дальше другая группа»
    // там, где дальше ничего.
    const actions = SIX.map((a, i) => ({ ...a, group: i < 3 ? 'edit' : 'print' }))
    withLayout(400, () => {
      const { container } = render(bar(actions))
      expect(shown(container)).toHaveLength(3)
      const seps = [...container.querySelectorAll('.ds-cmdbar__sep')]
        .filter((el) => !el.hasAttribute('data-ds-folded'))
      expect(seps, 'разделитель остался сиротой у правого края').toHaveLength(0)
    })
  })

  it('не влезает НИ ОДНО действие — в полосе остаётся одна «Ещё»', () => {
    withLayout(80, () => {
      const { container } = render(bar())
      expect(shown(container)).toHaveLength(0)
      expect(container.querySelector('.ds-cmdbar__more')).not.toHaveClass('is-idle')
    })
  })

  it('хвост `trailing` резервирует ширину раньше действий и сам не сворачивается', () => {
    withLayout(300, () => {
      const { container } = render(
        <CommandBar aria-label="Действия" actions={SIX} trailing={<span>Не проведён</span>} />,
      )
      expect(container.querySelector('.ds-cmdbar__trailing')).not.toBeNull()
      expect(screen.getByText('Не проведён')).toBeInTheDocument()
    })
  })
})
