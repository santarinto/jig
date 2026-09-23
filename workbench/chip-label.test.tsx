/**
 * РЕЗЕРВ ШИРИНЫ ПОД ЖИРНЫЙ ДЕРЖИТСЯ НА `data-label` (DS-289).
 *
 * Нажатый чип жирный, и до резерва он был шире свободного: выбор значения
 * перекладывал ряды чипов под курсором (`Badge/tone` на окне 1024: 3 ряда → 2).
 * Резерв — невидимый жирный дубль подписи в `::after { content: attr(data-label) }`
 * (`shell.css`, `.wb__chip[data-label]`). Дубль в CSS, а не в разметке: второй
 * текстовый узел попал бы в `textContent` чипа, а по нему гейты и тесты чипы и
 * ищут.
 *
 * Слабое место механизма — атрибут: забытый `data-label` не ломает ничего
 * заметного, резерва просто нет, и чип снова прыгает. Разошедшийся с подписью
 * — хуже: ширина зарезервирована под ДРУГОЙ текст. Поэтому здесь: у КАЖДОГО
 * переключаемого чипа хрома (`button.wb__chip[aria-pressed]` — ровно те, что
 * бывают `is-current`) `data-label` равен `textContent`. Что резерв при этом
 * действительно держит ширину, мерит браузер: `make dock-floor` (enum дока) и
 * `make shell-rhythm` (группа «Масштаб»); jsdom раскладки не считает.
 *
 * Площадь названа литералом (writing-checks, п. 7): шапка и док разом, и
 * чипов не меньше MIN_CHIPS — счёт, прочитанный из того же рендера, согласился
 * бы сам с собой и остался бы зелёным на одном чипе.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent, within } from '@testing-library/react'
import { Shell } from './shell-app.js'
import { frameSid, sendUp } from './test-kit.js'
import type { FixtureMeta } from './protocol.js'

afterEach(cleanup)
beforeEach(() => {
  window.history.pushState(null, '', '/')
})

const META: FixtureMeta = {
  name: 'DataTable',
  group: 'Data',
  cases: [{ id: 'base', title: 'base', values: { tone: 'neutral' }, slots: {} }],
  controls: { tone: { kind: 'enum', values: ['neutral', 'error', 'warning'], prop: true } },
  unexpressed: [],
  data: ['long-cell', 'empty'],
  slots: { cell: { title: 'Ячейка', accepts: 'inline' } },
}

/** Шапка: ширина 3+, масштаб 4, тема 2, текст 2, слои 2, прицел 1, вид 4. Док: enum 3, данные 3, форс 4, начинки 2. */
const MIN_CHIPS = 30

describe('чипы хрома — подпись резерва', () => {
  it('у каждого переключаемого чипа шапки и дока data-label равен подписи', () => {
    render(<Shell />)
    act(() => sendUp(frameSid(), { type: 'ready', meta: META }))
    const dock = screen.getByRole('region', { name: 'Панель' })
    // Список начинок открыт и приехал — его чипы тоже переключаемые, и в
    // одном из них подпись составная («· вид не прочитан»).
    fireEvent.click(within(within(dock).getByRole('group', { name: 'Позиции' })).getByRole('button', { name: 'пусто' }))
    act(() =>
      sendUp(frameSid(), {
        type: 'kinds',
        list: [
          { name: 'Badge', kind: 'inline' },
          { name: 'Chip', unread: true },
        ],
      }),
    )

    const chips = [...document.querySelectorAll<HTMLButtonElement>('button.wb__chip[aria-pressed]')]
    const inDock = chips.filter((b) => dock.contains(b))
    expect(chips.length).toBeGreaterThanOrEqual(MIN_CHIPS)
    expect(inDock.length).toBeGreaterThan(0)
    expect(chips.length - inDock.length).toBeGreaterThan(0)
    // Составная подпись действительно на экране — иначе её случай не проверен.
    expect(chips.some((b) => b.textContent === 'Chip · вид не прочитан')).toBe(true)
    const off = chips
      .filter((b) => b.getAttribute('data-label') !== b.textContent)
      .map((b) => `«${b.textContent}» data-label=${JSON.stringify(b.getAttribute('data-label'))}`)
    expect(off).toEqual([])
  })
})
