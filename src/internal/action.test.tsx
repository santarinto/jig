import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Card } from '../components/Form/Form.js'
import { DataTable } from '../components/DataTable/DataTable.js'
import { DropdownMenu } from '../components/DropdownMenu/DropdownMenu.js'
import { CommandBar } from '../components/CommandBar/CommandBar.js'
import type { ActionBase, CardTool, CommandAction, DropdownAction, RowAction } from './action.js'
import type { Column } from './columns.js'

/**
 * СТАРАЯ ФОРМА ДЕЙСТВИЯ — ОШИБКА ТИПА И БРОСОК (DS-358).
 *
 * До 4.3.x одно и то же было объявлено четырьмя наборами полей: `ariaLabel` у
 * `CardTool`, `onClick` у `CardTool` и `RowAction`, `id` — только у двоих.
 * Правило CLAUDE.md («Deprecated API») не знает периода совместимости: старый
 * вызов обязан ЛОМАТЬ КОМПИЛЯЦИЮ, а там, где типа у потребителя нет (`any` на
 * пути), — БРОСАТЬ.
 *
 * ПОЧЕМУ `@ts-expect-error` ЗДЕСЬ И ЕСТЬ ПРОВЕРКА. Директива краснеет в обе
 * стороны: перестань строка быть ошибкой — `tsc` ругается на неиспользованную
 * директиву (плюс гейт `no-dead-suppressions`). То есть вернуть отменённое поле
 * в тип молча нельзя.
 *
 * КАЖДЫЙ СЛУЧАЙ РАЗЛИЧАЮЩИЙ, и это не педантизм (ловушка 2 из
 * `docs/writing-checks.md` — утверждение, нацеленное на выдуманную причину).
 * Литерал несёт ВСЕ обязательные поля, чтобы единственной ошибкой в нём
 * осталась ровно та, ради которой он написан. Забудь здесь `label` — строка
 * осталась бы красной и с вернувшимся `ariaLabel`, то есть красноту давала бы
 * не та причина, которая названа, мутация выжила бы, а тест остался бы зелёным.
 */
describe('ActionBase · старая форма ломает компиляцию', () => {
  it('`CardTool`: `ariaLabel`, `onClick`, пропущенный `id`, чужой `href`', () => {
    // @ts-expect-error — подпись зовётся `label`, поле `ariaLabel` отменено
    const withAriaLabel: CardTool = { id: 'x', icon: null, label: 'Обновить', ariaLabel: 'Обновить' }
    // @ts-expect-error — обработчик зовётся `onSelect`, поле `onClick` отменено
    const withOnClick: CardTool = { id: 'x', icon: null, label: 'Обновить', onClick: () => {} }
    // @ts-expect-error — `id` обязателен: им действие различается при свёртке
    const withoutId: CardTool = { icon: null, label: 'Обновить', onSelect: () => {} }
    // @ts-expect-error — `href` живёт только у `CommandAction`: тихим ничем он быть не может
    const withHref: CardTool = { id: 'x', icon: null, label: 'Обновить', href: '/reports' }
    // @ts-expect-error — `icon` у инструмента обязателен: рисовать больше нечего
    const withoutIcon: CardTool = { id: 'x', label: 'Обновить', onSelect: () => {} }
    // @ts-expect-error — `tone` ОТРЕЗАН от ядра: красная иконка без слова — цвет единственным носителем
    const withTone: CardTool = { id: 'x', icon: null, label: 'Удалить', tone: 'error', onSelect: () => {} }
    // @ts-expect-error — `onSelect` у инструмента ОБЯЗАТЕЛЕН: второго способа что-то сделать у него нет
    const withoutHandler: CardTool = { id: 'x', icon: null, label: 'Обновить' }
    expect([withAriaLabel, withOnClick, withoutId, withHref, withoutIcon, withTone, withoutHandler])
      .toHaveLength(7)
  })

  it('`RowAction`: `onClick`, пропущенный `id`, `ReactNode` в подписи, чужой `group`', () => {
    // @ts-expect-error — обработчик зовётся `onSelect`
    const withOnClick: RowAction = { id: 'del', icon: null, label: 'Удалить', onClick: () => {} }
    // @ts-expect-error — `id` обязателен
    const withoutId: RowAction = { icon: null, label: 'Удалить', onSelect: () => {} }
    // @ts-expect-error — подпись уезжает в `aria-label`, куда `ReactNode` не кладётся
    const nodeLabel: RowAction = { id: 'del', icon: null, label: <b>Удалить</b>, onSelect: () => {} }
    // @ts-expect-error — `group` умеет только полоса команд
    const withGroup: RowAction = { id: 'del', icon: null, label: 'Удалить', group: 'doc' }
    // @ts-expect-error — `onSelect` обязателен: в 4.2.6 `onClick` был обязательным, переименование не повод ослаблять
    const withoutHandler: RowAction = { id: 'del', icon: null, label: 'Удалить' }
    expect([withOnClick, withoutId, nodeLabel, withGroup, withoutHandler]).toHaveLength(5)
  })

  it('`DropdownAction`: пропущенный `id`', () => {
    // @ts-expect-error — `id` обязателен и у пункта меню
    const withoutId: DropdownAction = { label: 'Удалить', tone: 'error', onSelect: () => {} }
    expect(withoutId).toBeTruthy()
  })

  it('`ActionTone`: словаря `BadgeTone` у действия нет', () => {
    // @ts-expect-error — у действия два тона, `warning` среди них нет
    const warned: ActionBase = { id: 'x', label: 'Провести', tone: 'warning' }
    // @ts-expect-error — `danger` не тон ни у кого в системе
    const danger: ActionBase = { id: 'x', label: 'Удалить', tone: 'danger' }
    expect([warned, danger]).toHaveLength(2)
  })

  /**
   * Различающая половина: новая форма обязана КОМПИЛИРОВАТЬСЯ. Без неё весь
   * блок выше проходил бы и на типе, запрещающем вообще всё (ловушка 3 —
   * неопровержимое утверждение).
   */
  it('новая форма компилируется у всех четырёх', () => {
    const tool: CardTool = { id: 'refresh', icon: null, label: 'Обновить', onSelect: () => {} }
    const row: RowAction = { id: 'del', icon: null, label: 'Удалить', tone: 'error', onSelect: () => {} }
    const item: DropdownAction = { id: 'del', label: 'Удалить', tone: 'error', onSelect: () => {} }
    const cmd: CommandAction = { id: 'post', label: 'Провести', variant: 'primary', group: 'doc', href: '/post' }
    expect([tool, row, item, cmd].map((a) => a.id)).toEqual(['refresh', 'del', 'del', 'post'])
  })
})

/**
 * БРОСОК — ДЛЯ ПОТРЕБИТЕЛЯ С `any` НА ПУТИ, где типа уже нет.
 *
 * Без него старый вызов деградировал бы молча и правдоподобно: ряд кнопок без
 * имён, которые ничего не делают по нажатию, и ни одной ошибки ни в консоли, ни
 * в сборке. Ровно класс дефектов эпика DS-248.
 *
 * Сообщение проверяется по НОВОМУ имени поля, а не по факту броска: потребитель
 * обязан прочитать, во что переименовать, не открывая CHANGELOG.
 */
describe('ActionBase · старая форма бросает под `any`', () => {
  const silence = () => vi.spyOn(console, 'error').mockImplementation(() => {})

  it('`Card tools` с `ariaLabel` — бросок, называющий `label`', () => {
    const spy = silence()
    const old = [{ id: 'x', icon: '↻', ariaLabel: 'Обновить', onClick: () => {} }] as unknown as CardTool[]
    expect(() => render(<Card title="П" tools={old}>тело</Card>)).toThrow(/ariaLabel.*label/s)
    spy.mockRestore()
  })

  it('`Card tools` с `onClick` — бросок, называющий `onSelect`', () => {
    const spy = silence()
    const old = [{ id: 'x', icon: '↻', label: 'Обновить', onClick: () => {} }] as unknown as CardTool[]
    expect(() => render(<Card title="П" tools={old}>тело</Card>)).toThrow(/onClick.*onSelect/s)
    spy.mockRestore()
  })

  it('`ActionColumn.actions` со старым действием — бросок', () => {
    const spy = silence()
    type R = { id: string; name: string }
    const rows: R[] = [{ id: '1', name: 'Присед' }]
    const cols = [
      { key: 'name' as const, header: 'Упражнение' },
      { id: 'act', actions: () => [{ icon: '×', label: 'Удалить', onClick: () => {} }] },
    ] as unknown as Column<R>[]
    expect(() => render(<DataTable columns={cols} rows={rows} getRowId={(r) => r.id} />))
      .toThrow(/onClick.*onSelect/s)
    spy.mockRestore()
  })

  it('`DropdownMenu items` без `id` — бросок, разделитель при этом законен', () => {
    const spy = silence()
    const old = [{ separator: true }, { label: 'Удалить', onSelect: () => {} }] as unknown as DropdownAction[]
    expect(() => render(<DropdownMenu items={old} />)).toThrow(/id/)
    spy.mockRestore()
  })

  /**
   * Различающая половина броска: новая форма РИСУЕТСЯ и РАБОТАЕТ. Проверка
   * только на бросок зеленела бы и на компоненте, который бросает всегда.
   */
  it('новая форма рисуется и зовёт `onSelect` во всех четырёх местах', async () => {
    const calls: string[] = []
    const rows = [{ id: '1', name: 'Присед' }]

    // По рендеру на место: `CommandBar` держит СВОЁ меню «Ещё», и общий рендер
    // дал бы два `role="menu"` в одном документе — запрос по роли стал бы
    // неоднозначным, а тест — про разметку теста, а не про компоненты.
    const { unmount: u1 } = render(
      <Card title="П" tools={[{ id: 't', icon: '↻', label: 'Обновить', onSelect: () => calls.push('tool') }]}>
        тело
      </Card>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Обновить' }))
    u1()

    const { unmount: u2 } = render(
      <DataTable
        columns={[
          { key: 'name', header: 'Упражнение' },
          { id: 'act', actions: () => [{ id: 'del', icon: '×', label: 'Удалить', onSelect: () => calls.push('row') }] },
        ]}
        rows={rows}
        getRowId={(r) => r.id}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }))
    u2()

    const { unmount: u3 } = render(
      <DropdownMenu
        ariaLabel="Ещё"
        defaultOpen
        items={[{ separator: true }, { id: 'arc', label: 'В архив', onSelect: () => calls.push('item') }]}
      />,
    )
    await userEvent.click(screen.getByRole('menuitem', { name: 'В архив' }))
    u3()

    render(<CommandBar aria-label="Команды" actions={[{ id: 'post', label: 'Провести', onSelect: () => calls.push('cmd') }]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Провести' }))

    expect(calls).toEqual(['tool', 'row', 'item', 'cmd'])
  })

  /**
   * ПОЛЕ ЯДРА, КОТОРОЕ СУЖЕНИЕ УНАСЛЕДОВАЛО, ОБЯЗАНО ЧИТАТЬСЯ (DS-358).
   *
   * `CardTool` втянул из `ActionBase` `disabled` и `tone`, и до этой проверки не
   * читал ни того, ни другого: оба компилировались и молчали — ровно класс
   * дефектов эпика DS-248, против которого вся задача. `tone` отрезан
   * `Omit`-ом (случай выше, в типовом блоке), `disabled` разведён до кнопки, и
   * вот его проверка.
   *
   * Утверждение РАЗЛИЧАЮЩЕЕ: один и тот же инструмент во включённом и
   * выключенном виде. Проверка только выключенного зеленела бы и на кнопке,
   * выключенной всегда.
   */
  it('`CardTool.disabled` доезжает до кнопки: атрибут стоит и `onSelect` молчит', async () => {
    const calls: string[] = []
    const tool = (disabled: boolean) => ({
      id: 't', icon: '↻', label: 'Обновить', disabled, onSelect: () => calls.push('hit'),
    })

    const { unmount } = render(<Card title="П" tools={[tool(false)]}>тело</Card>)
    const live = screen.getByRole('button', { name: 'Обновить' })
    expect(live).toBeEnabled()
    await userEvent.click(live)
    expect(calls).toEqual(['hit'])
    unmount()

    render(<Card title="П" tools={[tool(true)]}>тело</Card>)
    const off = screen.getByRole('button', { name: 'Обновить' })
    expect(off).toBeDisabled()
    await userEvent.click(off)
    expect(calls, 'выключенный инструмент позвал обработчик').toEqual(['hit'])
  })
})
