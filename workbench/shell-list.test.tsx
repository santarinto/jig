/**
 * Список компонентов: состав, выбор, сессия.
 *
 * Проверяется не «класс проставился», а то, чем список вообще является:
 * что от щелчка по имени в кадр уезжает ДРУГОЙ компонент и НОВАЯ сессия.
 *
 * Случаи ушли из этого списка в док панели (shell-panel.test.tsx) вместе с
 * разметкой `.wb__cases` — здесь остаётся только состав имён и переключение
 * компонента.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { Shell } from './shell-app.js'
import { frameQuery, frameSid } from './test-kit.js'

afterEach(cleanup)

const list = () => screen.getByRole('navigation', { name: 'Компоненты' })

describe('список компонентов', () => {
  it('показывает имена всех фикстур репозитория', () => {
    render(<Shell />)
    expect(within(list()).getByRole('button', { name: 'DataTable' })).toBeTruthy()
    expect(within(list()).getByRole('button', { name: 'Badge' })).toBeTruthy()
  })

  it('щелчок по имени меняет компонент в адресе кадра и заводит новую сессию', () => {
    render(<Shell />)
    expect(frameQuery().get('c')).toBe('DataTable')
    const before = frameSid()

    fireEvent.click(within(list()).getByRole('button', { name: 'Badge' }))

    expect(frameQuery().get('c')).toBe('Badge')
    expect(frameSid()).toBeGreaterThan(before)
  })
})

/**
 * DS-152. Список компонентов: группы и поиск.
 *
 * ПРОВЕРЯЕТСЯ РАЗЛИЧЕНИЕМ, как требует задача, и различаются ЧИСЛА, а не
 * ощущения. Утверждение задачи — «число шагов до первого и до последнего
 * компонента алфавита отличается на весь список» — здесь снимается тем, сколько
 * строк остаётся видно: до поиска и первый, и последний требовали пройти все
 * 41, после поиска обоим остаётся одна и та же единица.
 */
describe('список компонентов (DS-152)', () => {
  const nav = () => screen.getByRole('navigation', { name: 'Компоненты' })
  const rows = () => within(nav()).queryAllByRole('button').map((b) => b.textContent ?? '')
  const search = () => within(nav()).getByRole('searchbox', { name: 'Поиск компонента' })

  it('группы взяты из шапок фикстур, а не из второго списка', () => {
    render(<Shell />)
    // Имена групп никакой список в верстаке не объявляет: они приезжают
    // разбором фикстур. Санитар потому и сверяет их с ФАЙЛАМИ каталога.
    const heads = within(nav())
      .getAllByRole('heading')
      .map((h) => h.textContent ?? '')
    expect(heads.length).toBeGreaterThan(1)
    expect(heads).toContain('Данные')
    expect(heads).toContain('Управление')
  })

  it('каждый компонент лежит ровно в одной группе, и ни один не потерян', () => {
    render(<Shell />)
    const all = rows()
    // Ни одного дубля: компонент, попавший в две группы, — это и есть второй
    // источник правды, от которого задача и предостерегает.
    expect(new Set(all).size).toBe(all.length)
    expect(all).toContain('Badge')
    expect(all).toContain('ToggleGroup')
  })

  it('поиск уравнивает путь до первого и до последнего по алфавиту', () => {
    render(<Shell />)
    const all = rows()
    const first = [...all].sort((a, b) => a.localeCompare(b))[0]!
    const last = [...all].sort((a, b) => a.localeCompare(b)).pop()!
    expect(first).not.toBe(last)

    // ДО поиска оба стоят в одном списке из всех имён — путь до последнего
    // отличается на весь список, и это ровно то, что задача назвала дефектом.
    expect(all.length).toBeGreaterThan(20)

    fireEvent.change(search(), { target: { value: first } })
    const afterFirst = rows()

    fireEvent.change(search(), { target: { value: last } })
    const afterLast = rows()

    expect(afterFirst).toEqual([first])
    expect(afterLast).toEqual([last])
    // Равенство длин — и есть измеримое «шагов поровну».
    expect(afterFirst.length).toBe(afterLast.length)
  })

  it('поиск без регистра и подстрокой', () => {
    render(<Shell />)
    fireEvent.change(search(), { target: { value: 'badg' } })
    expect(rows()).toContain('Badge')
    fireEvent.change(search(), { target: { value: 'BADG' } })
    expect(rows()).toContain('Badge')
  })

  it('пустой результат говорит словами, а не пустотой', () => {
    render(<Shell />)
    fireEvent.change(search(), { target: { value: 'такогонет' } })

    expect(rows()).toEqual([])
    expect(within(nav()).getByText(/ничего нет/)).toBeTruthy()
  })

  it('пустой запрос возвращает группы, а не пустой список', () => {
    render(<Shell />)
    const before = rows().length
    // Имя, не входящее подстрокой ни в какое другое: «Badge» дало бы ещё и
    // OrgBadge, и единица в ожидании была бы не про поиск, а про каталог.
    fireEvent.change(search(), { target: { value: 'ToggleGroup' } })
    expect(rows()).toHaveLength(1)

    fireEvent.change(search(), { target: { value: '   ' } })

    expect(rows()).toHaveLength(before)
    expect(within(nav()).getAllByRole('heading').length).toBeGreaterThan(1)
  })
})
