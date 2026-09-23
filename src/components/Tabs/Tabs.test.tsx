import { render, screen, fireEvent, act } from '@testing-library/react'
import { useState } from 'react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TabPanel } from './TabPanel.js'
import { Tabs } from './Tabs.js'

const tabs = [{ id: 'in', label: 'Входящие' }, { id: 'out', label: 'Исходящие' }]

describe('Tabs', () => {
  it('marks the active tab, selects on click, and moves with ArrowRight (roving tabindex)', async () => {
    const onSelect = vi.fn()
    render(<Tabs tabs={tabs} selectedId="in" onSelect={onSelect} />)
    const active = screen.getByRole('tab', { name: 'Входящие' })
    expect(active).toHaveAttribute('aria-selected', 'true')
    expect(active).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Исходящие' })).toHaveAttribute('tabindex', '-1')
    await userEvent.click(screen.getByRole('tab', { name: 'Исходящие' }))
    expect(onSelect).toHaveBeenCalledWith('out')
    onSelect.mockClear()
    active.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onSelect).toHaveBeenCalledWith('out')
  })
})

describe('Tabs: счётчик', () => {
  const tabs = [
    { id: 'all', label: 'Все', count: 42 },
    { id: 'todo', label: 'К работе', count: 7 },
    { id: 'done', label: 'Готово', count: 0 },
    { id: 'plain', label: 'Без счётчика' },
  ]

  it('рисует счётчик только там, где он задан', () => {
    const { container } = render(<Tabs tabs={tabs} selectedId="all" />)
    const counts = container.querySelectorAll('.ds-tabs__count')
    expect(counts).toHaveLength(3)
    expect(Array.from(counts).map((c) => c.textContent)).toEqual(['42', '7', '0'])
  })

  it('ноль показывается, а не прячется', () => {
    // «Готово: 0» — содержательный ответ. Спрятать счётчик на нуле значило бы
    // сделать вид, что вкладку не считали.
    const { container } = render(<Tabs tabs={tabs} selectedId="all" />)
    expect(container.textContent).toContain('0')
  })

  it('счётчик входит в имя вкладки для скринридера', () => {
    // Иначе «Все» и «Все, 42» звучат одинаково, и число теряется для тех,
    // кто не видит его глазами.
    const { container } = render(<Tabs tabs={tabs} selectedId="all" />)
    const first = container.querySelectorAll('[role="tab"]')[0]!
    expect(first.textContent).toContain('42')
  })

  it('без счётчиков разметка прежняя — всё аддитивно', () => {
    const { container } = render(
      <Tabs tabs={[{ id: 'a', label: 'Раз' }, { id: 'b', label: 'Два' }]} selectedId="a" />,
    )
    expect(container.querySelectorAll('.ds-tabs__count')).toHaveLength(0)
  })
})

describe('Tabs: шов под роутер', () => {
  const tabs = [
    { id: 'all', label: 'Все', count: 42 },
    { id: 'todo', label: 'К работе' },
  ]

  it('renderItem ПОДМЕНЯЕТ элемент, а не оборачивает кнопку', () => {
    // Обёртка ссылки вокруг кнопки даёт <a><button> — невалидный HTML и два
    // таб-стопа на один пункт. Шов отдаёт пропсы, потребитель рисует один
    // элемент.
    const { container } = render(
      <Tabs tabs={tabs} selectedId="all"
        renderItem={(t, props) => <a href={`/t/${t.id}`} {...props} />} />,
    )
    expect(container.querySelectorAll('button')).toHaveLength(0)
    expect(container.querySelectorAll('a')).toHaveLength(2)
    // Ровно один интерактивный элемент на вкладку.
    expect(container.querySelectorAll('a[href], button')).toHaveLength(2)
  })

  it('подменённый элемент получает классы, роль и состояние', () => {
    const { container } = render(
      <Tabs tabs={tabs} selectedId="all"
        renderItem={(t, props) => <a href={`/t/${t.id}`} {...props} />} />,
    )
    const first = container.querySelector('a')!
    expect(first).toHaveClass('ds-tabs__tab', 'is-active')
    expect(first).toHaveAttribute('role', 'tab')
    expect(first).toHaveAttribute('aria-selected', 'true')
  })

  it('счётчик доезжает в подменённый элемент', () => {
    const { container } = render(
      <Tabs tabs={tabs} selectedId="all"
        renderItem={(t, props) => <a href={`/t/${t.id}`} {...props} />} />,
    )
    expect(container.querySelector('a')!.textContent).toContain('42')
  })

  it('клавиатура работает и на подменённых элементах', () => {
    // Фокус ищется по [role=tab] в контейнере, а не по рефам на кнопки —
    // иначе шов работал бы только с тем элементом, который выбрали мы.
    const onSelect = vi.fn()
    const { container } = render(
      <Tabs tabs={tabs} selectedId="all" onSelect={onSelect}
        renderItem={(t, props) => <a href={`/t/${t.id}`} {...props} />} />,
    )
    fireEvent.keyDown(container.querySelector('[role="tablist"]')!, { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenCalledWith('todo')
    expect(document.activeElement).toBe(container.querySelectorAll('[role="tab"]')[1])
  })

  it('без renderItem разметка прежняя — кнопки', () => {
    const { container } = render(<Tabs tabs={tabs} selectedId="all" />)
    expect(container.querySelectorAll('button')).toHaveLength(2)
    expect(container.querySelectorAll('a')).toHaveLength(0)
  })
})

describe('Tabs: значок статуса', () => {
  const withIcon = [
    { id: 'todo', label: 'В работе', icon: <span data-testid="dot">●</span>, count: 7 },
    { id: 'done', label: 'Готово' },
  ]

  it('значок не попадает в доступное имя — смысл несёт подпись, а не картинка', () => {
    render(<Tabs tabs={withIcon} selectedId="todo" onSelect={() => {}} />)
    expect(screen.getByRole('tab', { name: 'В работе 7' })).toBeInTheDocument()
  })

  it('счётчик, наоборот, в имя попадает — иначе «В работе» и «В работе, 7» звучат одинаково', () => {
    render(<Tabs tabs={withIcon} selectedId="todo" onSelect={() => {}} />)
    expect(screen.getByRole('tab', { name: /7/ })).toBeInTheDocument()
  })

  it('обёртка значка помечена aria-hidden', () => {
    const { container } = render(<Tabs tabs={withIcon} selectedId="todo" onSelect={() => {}} />)
    expect(container.querySelector('.ds-tabs__icon')).toHaveAttribute('aria-hidden', 'true')
  })

  it('значок стоит перед подписью, а не после счётчика', () => {
    const { container } = render(<Tabs tabs={withIcon} selectedId="todo" onSelect={() => {}} />)
    const tab = container.querySelector('.ds-tabs__tab')!
    expect(tab.firstElementChild).toHaveClass('ds-tabs__icon')
  })

  it('без значка узла нет', () => {
    const { container } = render(<Tabs tabs={[{ id: 'a', label: 'А' }]} selectedId="a" onSelect={() => {}} />)
    expect(container.querySelector('.ds-tabs__icon')).toBeNull()
  })

  it('значок доезжает до шва — потребитель раскладывает те же children на свою ссылку', () => {
    render(
      <Tabs tabs={withIcon} selectedId="todo" onSelect={() => {}}
        renderItem={(t, props) => <a href={`/${t.id}`} {...props} />} />,
    )
    const tab = screen.getByRole('tab', { name: 'В работе 7' })
    expect(tab.tagName).toBe('A')
    expect(tab.querySelector('.ds-tabs__icon')).not.toBeNull()
  })
})

describe('Tabs + TabPanel: связь вкладки и тела', () => {
  const tabs = [{ id: 'branches', label: 'Ветки' }, { id: 'langs', label: 'Языки' }]

  it('с id вкладки получают DOM-id и указывают на панель', () => {
    render(<Tabs id="hist" tabs={tabs} selectedId="branches" onSelect={() => {}} />)
    const tab = screen.getByRole('tab', { name: 'Ветки' })
    expect(tab).toHaveAttribute('id', 'hist-tab-branches')
    expect(tab).toHaveAttribute('aria-controls', 'hist-panel')
  })

  it('без id ни одного из атрибутов нет — пустая ссылка хуже отсутствующей', () => {
    render(<Tabs tabs={tabs} selectedId="branches" onSelect={() => {}} />)
    const tab = screen.getByRole('tab', { name: 'Ветки' })
    expect(tab).not.toHaveAttribute('id')
    expect(tab).not.toHaveAttribute('aria-controls')
  })

  it('панель названа активной вкладкой и найдётся по её имени', () => {
    render(
      <>
        <Tabs id="hist" tabs={tabs} selectedId="branches" onSelect={() => {}} />
        <TabPanel tabsId="hist" selectedId="branches">тело</TabPanel>
      </>,
    )
    expect(screen.getByRole('tabpanel', { name: 'Ветки' })).toBeInTheDocument()
  })

  it('смена активной вкладки переименовывает панель', () => {
    const { rerender } = render(
      <>
        <Tabs id="hist" tabs={tabs} selectedId="branches" onSelect={() => {}} />
        <TabPanel tabsId="hist" selectedId="branches">тело</TabPanel>
      </>,
    )
    rerender(
      <>
        <Tabs id="hist" tabs={tabs} selectedId="langs" onSelect={() => {}} />
        <TabPanel tabsId="hist" selectedId="langs">тело</TabPanel>
      </>,
    )
    expect(screen.getByRole('tabpanel', { name: 'Языки' })).toBeInTheDocument()
  })

  it('id панели совпадает с тем, на который ссылаются вкладки', () => {
    render(
      <>
        <Tabs id="hist" tabs={tabs} selectedId="branches" onSelect={() => {}} />
        <TabPanel tabsId="hist" selectedId="branches">тело</TabPanel>
      </>,
    )
    const controls = screen.getByRole('tab', { name: 'Ветки' }).getAttribute('aria-controls')!
    expect(document.getElementById(controls)).toBe(screen.getByRole('tabpanel'))
  })

  it('панель фокусируема — иначе до графика без кнопок не добраться с клавиатуры', () => {
    render(<TabPanel tabsId="hist" selectedId="branches">график</TabPanel>)
    expect(screen.getByRole('tabpanel')).toHaveAttribute('tabindex', '0')
  })

  it('noPadding даёт модификатор, по умолчанию его нет', () => {
    const { container, rerender } = render(<TabPanel tabsId="h" selectedId="a">x</TabPanel>)
    expect(container.querySelector('.ds-tabs__panel--flush')).toBeNull()
    rerender(<TabPanel tabsId="h" selectedId="a" noPadding>x</TabPanel>)
    expect(container.querySelector('.ds-tabs__panel--flush')).not.toBeNull()
  })

  it('идентификаторы доезжают до шва — потребитель раскладывает их на свою ссылку', () => {
    render(
      <Tabs id="hist" tabs={tabs} selectedId="branches" onSelect={() => {}}
        renderItem={(t, props) => <a href={`/${t.id}`} {...props} />} />,
    )
    const tab = screen.getByRole('tab', { name: 'Ветки' })
    expect(tab.tagName).toBe('A')
    expect(tab).toHaveAttribute('aria-controls', 'hist-panel')
  })
})

describe('Tabs: закрываемые вкладки', () => {
  const tabs = [
    { id: 'file', label: 'Файл', closable: true },
    { id: 'edit', label: 'Правка', closable: true },
  ]

  it('крестик зовёт onClose и не трогает onSelect', async () => {
    const onClose = vi.fn()
    const onSelect = vi.fn()
    render(<Tabs tabs={tabs} selectedId="file" onSelect={onSelect} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть вкладку Файл' }))
    expect(onClose).toHaveBeenCalledWith('file')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('крестик есть только у закрываемых вкладок', () => {
    render(
      <Tabs
        tabs={[{ id: 'a', label: 'А', closable: true }, { id: 'b', label: 'Б' }]}
        selectedId="a" onClose={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Закрыть вкладку А' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Закрыть вкладку Б' })).toBeNull()
  })

  it('Delete на активной закрываемой вкладке зовёт onClose', () => {
    const onClose = vi.fn()
    const { container } = render(<Tabs tabs={tabs} selectedId="file" onClose={onClose} />)
    fireEvent.keyDown(container.querySelector('[role="tablist"]')!, { key: 'Delete' })
    expect(onClose).toHaveBeenCalledWith('file')
  })

  it('крестик не создаёт лишний таб-стоп у неактивной вкладки', () => {
    render(<Tabs tabs={tabs} selectedId="file" onClose={() => {}} />)
    // Крестик активной вкладки достижим, неактивной — вне таб-порядка.
    expect(screen.getByRole('button', { name: 'Закрыть вкладку Файл' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('button', { name: 'Закрыть вкладку Правка' })).toHaveAttribute('tabindex', '-1')
  })
})

/**
 * DS-218. Узел под фокусом удаляет КОМПОНЕНТ — значит и переставить
 * фокус его дело. До правки фокус уезжал в `body` при закрытии ЛЮБЫМ путём, и
 * стрелки после этого были мертвы.
 *
 * Здесь jsdom, и он отвечает только на «куда встал фокус». Покадровая часть
 * («перенос случился до первого кадра, а не к 250 мс») в jsdom не выражается и
 * снята в chromium настоящими нажатиями — там же пять путей удаления и
 * вертикаль.
 */
describe('Tabs: фокус после закрытия вкладки', () => {
  /** Управляемая обёртка: выбор после закрытия делает ПОТРЕБИТЕЛЬ, как в жизни. */
  function Host({ onEmpty }: { onEmpty?: () => void } = {}) {
    const [list, setList] = useState([
      { id: 'a', label: 'Первая', closable: true },
      { id: 'b', label: 'Вторая', closable: true },
      { id: 'c', label: 'Третья', closable: true },
    ])
    const [sel, setSel] = useState('b')
    return (
      <Tabs
        tabs={list}
        selectedId={sel}
        onSelect={setSel}
        onClose={(id) => {
          const rest = list.filter((t) => t.id !== id)
          setList(rest)
          if (rest[0]) setSel(rest[0].id)
          else onEmpty?.()
        }}
      />
    )
  }

  const focused = () => document.activeElement as HTMLElement | null

  it('после Delete фокус на вкладке, которой роуминг дал tabindex=0', () => {
    render(<Host />)
    const tablist = screen.getByRole('tablist')
    screen.getByRole('tab', { name: 'Вторая' }).focus()
    act(() => { fireEvent.keyDown(tablist, { key: 'Delete' }) })
    const rest = screen.getAllByRole('tab')
    expect(rest.map((t) => t.textContent)).toEqual(['Первая', 'Третья'])
    expect(focused()).toBe(rest[0])
    expect(rest[0]).toHaveAttribute('tabindex', '0')
  })

  it('Backspace ведёт себя так же — путь один, правка одна', () => {
    render(<Host />)
    screen.getByRole('tab', { name: 'Вторая' }).focus()
    act(() => { fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Backspace' }) })
    expect(focused()).toBe(screen.getAllByRole('tab')[0])
  })

  it('клик по крестику тоже возвращает фокус в полосу, а не в body', async () => {
    render(<Host />)
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть вкладку Вторая' }))
    expect(focused()).toBe(screen.getAllByRole('tab')[0])
    expect(focused()).not.toBe(document.body)
  })

  /**
   * ГРАНИЦА, а не пропуск: закрыта последняя оставшаяся вкладка, полосы нет,
   * фокусировать нечего. Компонент обязан не бросить и не тронуть фокус.
   * Край стал достижим и в верстаке — `?c=Tabs&data=one-closable`
   * (DS-220).
   */
  it('закрытие ПОСЛЕДНЕЙ вкладки: цели нет, фокус не трогаем и не падаем', () => {
    function Solo() {
      const [list, setList] = useState([{ id: 'only', label: 'Одна', closable: true }])
      return (
        <>
          <button type="button" data-testid="вне">вне</button>
          <Tabs tabs={list} selectedId="only" onClose={() => setList([])} />
        </>
      )
    }
    render(<Solo />)
    screen.getByRole('tab', { name: 'Одна' }).focus()
    expect(() => {
      act(() => { fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Delete' }) })
    }).not.toThrow()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
  })

  /**
   * ЧУЖОЙ ФОКУС НЕ ОТБИРАЕТСЯ. Закрытие через подтверждение — обычный случай:
   * `onClose` уводит фокус в диалог, а вкладка исчезает позже. Компонент,
   * возвращающий фокус безусловно, выдернул бы человека из диалога.
   */
  it('если к моменту удаления фокус увели наружу — не отбираем', () => {
    function Deferred() {
      const [list, setList] = useState([
        { id: 'a', label: 'Первая', closable: true },
        { id: 'b', label: 'Вторая', closable: true },
      ])
      const [sel, setSel] = useState('b')
      const [pending, setPending] = useState<string | null>(null)
      return (
        <>
          <button type="button" data-testid="вне" onClick={() => {
            setList((l) => l.filter((t) => t.id !== pending))
            setSel('a')
          }}>подтвердить</button>
          <Tabs
            tabs={list} selectedId={sel} onSelect={setSel}
            onClose={(id) => { setPending(id); screen.getByTestId('вне').focus() }}
          />
        </>
      )
    }
    render(<Deferred />)
    screen.getByRole('tab', { name: 'Вторая' }).focus()
    act(() => { fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Delete' }) })
    // Вкладка ещё на месте, фокус уже снаружи — это состояние «жду подтверждения».
    expect(screen.getAllByRole('tab')).toHaveLength(2)
    expect(document.activeElement).toBe(screen.getByTestId('вне'))
    act(() => { fireEvent.click(screen.getByTestId('вне')) })
    expect(screen.getAllByRole('tab')).toHaveLength(1)
    expect(document.activeElement).toBe(screen.getByTestId('вне'))
  })

  /**
   * ОТЛОЖЕННОЕ УДАЛЕНИЕ, ФОКУС НИКТО НЕ УВОДИЛ. Утверждение про «жду того
   * рендера, где вкладки не станет»: без него возврат срабатывает на ПЕРВОМ
   * же рендере после `onClose`, когда вкладка ещё на месте, флаг гаснет — и
   * настоящее удаление приходит уже без взведённого возврата. Фокус теряется
   * ровно так же, как до правки, но проверка выглядит зелёной.
   *
   * Соседний тест про подтверждение этого НЕ ловит: там фокус уводят наружу, и
   * возврат не срабатывает по другой причине.
   */
  it('удаление пришло позже — возврат ЖДЁТ его, а не гаснет на первом рендере', () => {
    let remove: () => void = () => {}
    function Later() {
      const [list, setList] = useState([
        { id: 'a', label: 'Первая', closable: true },
        { id: 'b', label: 'Вторая', closable: true },
      ])
      const [sel, setSel] = useState('b')
      const [pending, setPending] = useState<string | null>(null)
      remove = () => { setList((l) => l.filter((t) => t.id !== pending)); setSel('a') }
      // `[...list]` — НОВЫЙ массив каждым рендером, как у настоящего
      // потребителя (и как у фикстуры). Со стабильной ссылкой эффект возврата
      // просто не переустанавливается, и утверждение ниже становится
      // неопровержимым: оно зелено и без проверки «вкладка исчезла».
      return (
        <Tabs tabs={[...list]} selectedId={sel} onSelect={setSel} onClose={(id) => setPending(id)} />
      )
    }
    render(<Later />)
    screen.getByRole('tab', { name: 'Вторая' }).focus()
    act(() => { fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Delete' }) })
    expect(screen.getAllByRole('tab')).toHaveLength(2)
    act(() => { remove() })
    const rest = screen.getAllByRole('tab')
    expect(rest.map((t) => t.textContent)).toEqual(['Первая'])
    expect(document.activeElement).toBe(rest[0])
  })

  /**
   * ФОКУС БЫЛ СНАРУЖИ В МОМЕНТ ЗАКРЫТИЯ — и потерялся сам, по чужой причине
   * (кнопка, с которой закрывали, исчезла в том же обновлении). `body` тогда
   * выглядит как «наш потерянный фокус», и без условия «фокус был в полосе»
   * компонент утащил бы человека во вкладки из совершенно другого места.
   *
   * Программный клик по крестику фокуса не переводит — этим сценарий и
   * снимается: настоящая мышь сначала сфокусировала бы крестик.
   */
  it('закрытие пришло, когда фокус был СНАРУЖИ, — во вкладки не утаскиваем', () => {
    function Elsewhere() {
      const [list, setList] = useState([
        { id: 'a', label: 'Первая', closable: true },
        { id: 'b', label: 'Вторая', closable: true },
      ])
      const [gone, setGone] = useState(false)
      return (
        <>
          {!gone && <button type="button" data-testid="исчезнет">закрыть вторую</button>}
          <Tabs
            tabs={list} selectedId="a"
            onClose={(id) => { setGone(true); setList((l) => l.filter((t) => t.id !== id)) }}
          />
        </>
      )
    }
    render(<Elsewhere />)
    screen.getByTestId('исчезнет').focus()
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Закрыть вкладку Вторая' })) })
    expect(screen.getAllByRole('tab')).toHaveLength(1)
    // Кнопка исчезла, фокус упал в body — и остался там: закрывали не из полосы.
    expect(document.activeElement).toBe(document.body)
  })

  /**
   * Обратная сторона: вкладка исчезла БЕЗ нашего `onClose` — потребитель
   * переписал `tabs` сам. Тогда компонент фокус не трогает вовсе: он ничего не
   * закрывал.
   */
  it('вкладка убрана потребителем мимо onClose — фокус не трогаем', () => {
    function Outside() {
      const [list, setList] = useState([
        { id: 'a', label: 'Первая' },
        { id: 'b', label: 'Вторая' },
      ])
      return (
        <>
          <button type="button" data-testid="убрать" onClick={() => setList((l) => l.slice(0, 1))}>
            убрать
          </button>
          <Tabs tabs={list} selectedId="a" />
        </>
      )
    }
    render(<Outside />)
    const btn = screen.getByTestId('убрать')
    btn.focus()
    act(() => { fireEvent.click(btn) })
    expect(screen.getAllByRole('tab')).toHaveLength(1)
    expect(document.activeElement).toBe(btn)
  })
})

/**
 * DS-221. Выключенная вкладка — не выключенная ПОЛОСА. Формула
 * `active && !disabled ? 0 : -1` не давала `tabIndex 0` никому, `Tab`
 * перепрыгивал полосу на панель, и человек не узнавал, что вкладки есть.
 * Правило вынесено в `rovingEntry` (`src/internal/roving.ts`) — там же сказано,
 * почему оно общее, и там же его собственные утверждения.
 */
describe('Tabs: все вкладки выключены — полоса остаётся достижимой', () => {
  const allOff = [
    { id: 'a', label: 'Все', disabled: true },
    { id: 'b', label: 'В работе', disabled: true },
    { id: 'c', label: 'Архив', disabled: true },
  ]

  const entries = () => screen.getAllByRole('tab').filter((t) => t.getAttribute('tabindex') === '0')

  it('вход РОВНО ОДИН, и это активная вкладка — не ноль и не три', () => {
    render(<Tabs tabs={allOff} selectedId="b" />)
    expect(entries()).toHaveLength(1)
    expect(entries()[0]).toHaveTextContent('В работе')
  })

  it('активного нет вовсе — вход всё равно один', () => {
    render(<Tabs tabs={allOff} selectedId="нет такой" />)
    expect(entries()).toHaveLength(1)
  })

  /**
   * ВТОРАЯ ПОЛОВИНА, без которой правка делает хуже: достижимая выключенная
   * вкладка не должна становиться выбираемой. Иначе «недостижимо» меняется на
   * «нажимается и молчит».
   */
  it('достижимая — но НЕ выбираемая: aria-disabled на месте, нажатия молчат', async () => {
    const onSelect = vi.fn()
    render(<Tabs tabs={allOff} selectedId="b" onSelect={onSelect} />)
    for (const t of screen.getAllByRole('tab')) expect(t).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(screen.getByRole('tab', { name: 'Все' }))
    expect(onSelect).not.toHaveBeenCalled()
    const entry = entries()[0]!
    entry.focus()
    fireEvent.keyDown(entry, { key: 'Enter' })
    fireEvent.keyDown(entry, { key: ' ' })
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('tab', { name: 'В работе' })).toHaveAttribute('aria-selected', 'true')
  })

  it('стрелка внутри полосы из одних выключенных выбор не меняет', () => {
    const onSelect = vi.fn()
    const { container } = render(<Tabs tabs={allOff} selectedId="b" onSelect={onSelect} />)
    fireEvent.keyDown(container.querySelector('[role="tablist"]')!, { key: 'ArrowRight' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  /**
   * Побочное из постановки: крестики в этом состоянии тоже были `tabIndex -1`,
   * то есть закрыть вкладку с клавиатуры было нельзя никаким путём. Закрытие и
   * выбор — разные действия: выключенная вкладка не выбирается, но закрывается.
   */
  it('крестик вкладки-входа достижим и при выключенности', () => {
    render(
      <Tabs
        tabs={allOff.map((t) => ({ ...t, closable: true }))}
        selectedId="b" onClose={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Закрыть вкладку В работе' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('button', { name: 'Закрыть вкладку Все' })).toHaveAttribute('tabindex', '-1')
  })

  /**
   * Смешанный случай работал и до правки — значит правка обязана его не
   * тронуть. Без этого утверждения «починка» могла бы переехать вход на
   * выключенную вкладку и никто бы не заметил.
   */
  it('часть выключена, активная — нет: вход там же, где был', () => {
    render(
      <Tabs
        tabs={[{ id: 'a', label: 'Все' }, { id: 'b', label: 'Архив', disabled: true }]}
        selectedId="a"
      />,
    )
    expect(entries()).toHaveLength(1)
    expect(entries()[0]).toHaveTextContent('Все')
  })
})

describe('Tabs: слот trailing (кнопка +)', () => {
  /**
   * «В конце бара» — это про МЕСТО В ДЕРЕВЕ, а не про «кнопка отрисовалась»
   * (DS-205). Пока проверка спрашивала только про наличие кнопки, слот
   * лежал внутри `.ds-tabs__list` — то есть внутри прокручиваемой ленты и
   * внутри `role="tablist"` — и обе беды были ей не видны: замер
   * `scrollWidth > clientWidth`, которым Tabs решает «вкладок больше, чем
   * места», считал начинку слота за вкладку, а на узком кадре кнопка уезжала
   * за экран вместе с лентой (416..551 при правом крае бара 330).
   *
   * Отсюда два утверждения, и они разные: слот НЕ внутри ленты (иначе он
   * снова попадёт в замер переполнения) и слот — ПОСЛЕДНИЙ ребёнок бара
   * (иначе он встанет перед стрелками и «⋯» и будет прыгать по бару, когда
   * те появляются и исчезают).
   */
  it('рендерит trailing последним ребёнком бара и вне ленты вкладок', () => {
    const { container } = render(
      <Tabs
        tabs={[{ id: 'a', label: 'А' }]} selectedId="a"
        trailing={<button type="button">+</button>}
      />,
    )
    const btn = screen.getByRole('button', { name: '+' })
    expect(btn).toBeInTheDocument()

    const slot = container.querySelector('.ds-tabs__trailing')!
    expect(slot).toContainElement(btn)
    expect(slot.closest('[role="tablist"]')).toBeNull()

    const bar = container.querySelector('.ds-tabs')!
    expect(bar.lastElementChild).toBe(slot)
  })
})

describe('Tabs: disabled', () => {
  const tabs = [
    { id: 'a', label: 'А' },
    { id: 'b', label: 'Б', disabled: true },
    { id: 'c', label: 'В' },
  ]

  it('disabled вкладка помечена и не выбирается кликом', async () => {
    const onSelect = vi.fn()
    render(<Tabs tabs={tabs} selectedId="a" onSelect={onSelect} />)
    const b = screen.getByRole('tab', { name: 'Б' })
    expect(b).toHaveAttribute('aria-disabled', 'true')
    expect(b).toHaveAttribute('tabindex', '-1')
    await userEvent.click(b)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('стрелка перепрыгивает disabled вкладку', () => {
    const onSelect = vi.fn()
    const { container } = render(<Tabs tabs={tabs} selectedId="a" onSelect={onSelect} />)
    fireEvent.keyDown(container.querySelector('[role="tablist"]')!, { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenCalledWith('c')
  })

  it('End идёт к последней доступной, а не к disabled', () => {
    const onSelect = vi.fn()
    const withTrailingDisabled = [
      { id: 'a', label: 'А' },
      { id: 'b', label: 'Б' },
      { id: 'z', label: 'Я', disabled: true },
    ]
    const { container } = render(<Tabs tabs={withTrailingDisabled} selectedId="a" onSelect={onSelect} />)
    fireEvent.keyDown(container.querySelector('[role="tablist"]')!, { key: 'End' })
    expect(onSelect).toHaveBeenCalledWith('b')
  })
})

describe('Tabs: позиции и ориентация', () => {
  const tabs = [{ id: 'a', label: 'А' }, { id: 'b', label: 'Б' }]

  it('top (default) — горизонтальный роуминг, без aria-orientation vertical', () => {
    const onSelect = vi.fn()
    const { container } = render(<Tabs tabs={tabs} selectedId="a" onSelect={onSelect} />)
    const list = container.querySelector('[role="tablist"]')!
    expect(list).not.toHaveAttribute('aria-orientation', 'vertical')
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenCalledWith('b')
  })

  it('left — вертикальная ориентация и роуминг по стрелкам вверх/вниз', () => {
    const onSelect = vi.fn()
    const { container } = render(<Tabs tabs={tabs} selectedId="a" position="left" onSelect={onSelect} />)
    const list = container.querySelector('[role="tablist"]')!
    expect(list).toHaveAttribute('aria-orientation', 'vertical')
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(onSelect).toHaveBeenCalledWith('b')
    // Горизонтальная стрелка в вертикали не переключает.
    onSelect.mockClear()
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('data-position проставлен на корне', () => {
    const { container } = render(<Tabs tabs={tabs} selectedId="a" position="bottom" />)
    expect(container.querySelector('.ds-tabs')).toHaveAttribute('data-position', 'bottom')
  })
})

/** Подменяет измерения списка, чтобы включить/выключить переполнение. */
function stubListMetrics(list: Element, { client, scroll, offset = 0 }: { client: number; scroll: number; offset?: number }) {
  Object.defineProperty(list, 'clientWidth', { configurable: true, get: () => client })
  Object.defineProperty(list, 'scrollWidth', { configurable: true, get: () => scroll })
  Object.defineProperty(list, 'clientHeight', { configurable: true, get: () => client })
  Object.defineProperty(list, 'scrollHeight', { configurable: true, get: () => scroll })
  Object.defineProperty(list, 'scrollLeft', { configurable: true, writable: true, value: offset })
  Object.defineProperty(list, 'scrollTop', { configurable: true, writable: true, value: offset })
}

describe('Tabs: overflow — scroll', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, label: `Вкладка ${i}` }))

  /**
   * ОБЕ стрелки и в начале, и в конце (DS-284). Раньше крайняя не
   * рисовалась вовсе, и бар менял ширину от первого же пролистывания: стрелка
   * — flex-сосед ленты, то есть тот, кто отнимает место у слота. Здесь
   * проверяется НАЛИЧИЕ обеих и РАЗЛИЧИМОСТЬ их состояний; что от этого не
   * едет раскладка — предмет кейса `measure` (jsdom раскладки не считает).
   */
  it('при переполнении держит обе стрелки, приглушая ту, чей край достигнут', () => {
    const { container } = render(<Tabs tabs={many} selectedId="t0" overflow="scroll" />)
    const list = container.querySelector('[role="tablist"]')!
    stubListMetrics(list, { client: 200, scroll: 900, offset: 0 })
    act(() => { fireEvent.scroll(list) })
    const toStart = screen.getByRole('button', { name: 'Прокрутить к началу' })
    const toEnd = screen.getByRole('button', { name: 'Прокрутить к концу' })
    // В начале ленты назад ехать некуда — и об этом говорит выключенность, а
    // не отсутствие кнопки.
    expect(toStart).toBeDisabled()
    expect(toEnd).toBeEnabled()

    // В середине живы обе: состояния обязаны быть РАЗЛИЧИМЫ, иначе «выключить
    // обе навсегда» прошло бы этот кейс.
    stubListMetrics(list, { client: 200, scroll: 900, offset: 300 })
    act(() => { fireEvent.scroll(list) })
    expect(toStart).toBeEnabled()
    expect(toEnd).toBeEnabled()

    // В конце зеркально.
    stubListMetrics(list, { client: 200, scroll: 900, offset: 700 })
    act(() => { fireEvent.scroll(list) })
    expect(toStart).toBeEnabled()
    expect(toEnd).toBeDisabled()
  })

  it('без переполнения стрелок нет', () => {
    const { container } = render(<Tabs tabs={many} selectedId="t0" overflow="scroll" />)
    const list = container.querySelector('[role="tablist"]')!
    stubListMetrics(list, { client: 900, scroll: 900, offset: 0 })
    act(() => { fireEvent.scroll(list) })
    expect(screen.queryByRole('button', { name: /Прокрутить/ })).toBeNull()
  })
})

describe('Tabs: доскролл активной вкладки', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, label: `Вкладка ${i}` }))

  /**
   * jsdom не реализует `scrollIntoView` — компонент это знает и проверяет
   * `typeof`. Подменяем не шпионом, а функцией, которая пишет `this`: предмет
   * кейса — не только «звали», но и КАКУЮ вкладку доскроллили.
   */
  let seen: string[] = []
  beforeEach(() => {
    seen = []
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value(this: HTMLElement) { seen.push(this.textContent ?? '') },
    })
  })
  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  })

  it('доскролливает при смене активной вкладки — и только при ней', () => {
    // Список зависимостей эффекта держался на комментарии «scrollTabIntoView
    // стабилен» плюс мёртвой eslint-директиве. Комментарий верен, директива
    // ничего не подавляла (линтера нет) — поведение стережёт этот кейс.
    const { rerender } = render(<Tabs tabs={many} selectedId="t0" overflow="scroll" />)
    expect(seen).toEqual(['Вкладка 0'])

    rerender(<Tabs tabs={many} selectedId="t5" overflow="scroll" />)
    expect(seen).toEqual(['Вкладка 0', 'Вкладка 5'])

    // Рендер без смены активной вкладки не доскролливает: новый массив вкладок
    // — это ровно то, что приходит от потребителя на каждом его рендере.
    rerender(<Tabs tabs={[...many]} selectedId="t5" overflow="scroll" />)
    expect(seen).toEqual(['Вкладка 0', 'Вкладка 5'])
  })
})

describe('Tabs: overflow — menu', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, label: `Вкладка ${i}` }))

  it('при переполнении рисует кнопку «Ещё вкладки», раскрывает список и выбирает пункт', async () => {
    const onSelect = vi.fn()
    const { container } = render(<Tabs tabs={many} selectedId="t0" overflow="menu" onSelect={onSelect} />)
    const list = container.querySelector('[role="tablist"]')!
    stubListMetrics(list, { client: 200, scroll: 900, offset: 0 })
    act(() => { fireEvent.scroll(list) })
    const btn = screen.getByRole('button', { name: 'Ещё вкладки' })
    await userEvent.click(btn)
    const item = screen.getByRole('menuitem', { name: 'Вкладка 9' })
    await userEvent.click(item)
    expect(onSelect).toHaveBeenCalledWith('t9')
  })
})

describe('Tabs: reorder', () => {
  const tabs = [{ id: 'a', label: 'А' }, { id: 'b', label: 'Б' }, { id: 'c', label: 'В' }]

  it('Ctrl+ArrowRight на активной вкладке зовёт onReorder с новым порядком', () => {
    const onReorder = vi.fn()
    const { container } = render(<Tabs tabs={tabs} selectedId="b" onReorder={onReorder} />)
    fireEvent.keyDown(container.querySelector('[role="tablist"]')!, { key: 'ArrowRight', ctrlKey: true })
    expect(onReorder).toHaveBeenCalledWith(['a', 'c', 'b'])
  })

  it('Ctrl+ArrowLeft двигает влево', () => {
    const onReorder = vi.fn()
    const { container } = render(<Tabs tabs={tabs} selectedId="b" onReorder={onReorder} />)
    fireEvent.keyDown(container.querySelector('[role="tablist"]')!, { key: 'ArrowLeft', ctrlKey: true })
    expect(onReorder).toHaveBeenCalledWith(['b', 'a', 'c'])
  })

  it('без onReorder Ctrl+стрелка ничего не двигает (обычный роуминг тоже не трогаем)', () => {
    const onSelect = vi.fn()
    const { container } = render(<Tabs tabs={tabs} selectedId="b" onSelect={onSelect} />)
    fireEvent.keyDown(container.querySelector('[role="tablist"]')!, { key: 'ArrowRight', ctrlKey: true })
    // Ctrl+ArrowRight без onReorder не выбирает соседнюю вкладку.
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('на краю не выходит за границы', () => {
    const onReorder = vi.fn()
    const { container } = render(<Tabs tabs={tabs} selectedId="a" onReorder={onReorder} />)
    fireEvent.keyDown(container.querySelector('[role="tablist"]')!, { key: 'ArrowLeft', ctrlKey: true })
    expect(onReorder).not.toHaveBeenCalled()
  })
})

describe('Tabs: variant', () => {
  const tabs = [{ id: 'a', label: 'А' }, { id: 'b', label: 'Б' }]

  it('plain даёт модификатор на корне, framed (default) — нет', () => {
    const { container, rerender } = render(<Tabs tabs={tabs} selectedId="a" />)
    expect(container.querySelector('.ds-tabs')).not.toHaveClass('ds-tabs--plain')
    rerender(<Tabs tabs={tabs} selectedId="a" variant="plain" />)
    expect(container.querySelector('.ds-tabs')).toHaveClass('ds-tabs--plain')
  })
})
