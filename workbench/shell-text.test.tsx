/**
 * Переключатель набора текста в тулбаре (DS-139, приёмка).
 *
 * Предмет — не «кнопка есть», а три её свойства, каждое из которых при
 * возврате в прежний вид выглядело бы как работающая кнопка:
 *
 * 1. Набор едет ВНИЗ ПАТЧОМ, а не перезагрузкой кадра. Перезагрузка роняет
 *    живое состояние компонента, а ключи разглядывают в развёрнутом меню и в
 *    открытой строке — то есть ровно в том состоянии, которое она бы уронила.
 *    Наблюдаемый след того же утверждения — сессия: новая означала бы новый
 *    документ.
 *
 * 2. Переключается ТУДА И ОБРАТНО. Кнопка, умеющая только включить
 *    псевдолокаль, читалась бы как сломанный верстак: вернуть русский можно
 *    было бы только перезагрузкой страницы.
 *
 * 3. Умолчание — `ru`. Верстак, открывающийся в псевдолокали, показывал бы
 *    маркеры человеку, который пришёл смотреть на компонент, а не на ключи.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { Shell } from './shell-app.js'
import { downSpy, frameSid, sendUp } from './test-kit.js'
import type { Envelope } from './protocol.js'

afterEach(cleanup)

const group = () => within(screen.getByRole('group', { name: 'Текст кадра' }))
const patches = (spy: ReturnType<typeof downSpy>) =>
  spy.mock.calls
    .map(([m]) => m as Envelope<{ type: string; text?: string }>)
    .filter((m) => m.body.type === 'patch')

describe('переключатель набора текста', () => {
  it('умолчание — ru, и оно нажато', () => {
    render(<Shell />)
    expect(group().getByRole('button', { name: 'ru' })).toHaveAttribute('aria-pressed', 'true')
    expect(group().getByRole('button', { name: 'ключи' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('щелчок шлёт патч с набором, а не заводит новую сессию', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: null })
    const before = frameSid()
    const spy = downSpy()

    fireEvent.click(group().getByRole('button', { name: 'ключи' }))

    expect(patches(spy).some((m) => m.body.text === 'pseudo')).toBe(true)
    expect(frameSid()).toBe(before)
    spy.mockRestore()
  })

  it('переключается обратно на ru', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: null })
    fireEvent.click(group().getByRole('button', { name: 'ключи' }))

    const spy = downSpy()
    fireEvent.click(group().getByRole('button', { name: 'ru' }))

    expect(patches(spy).some((m) => m.body.text === 'ru')).toBe(true)
    expect(group().getByRole('button', { name: 'ru' })).toHaveAttribute('aria-pressed', 'true')
    spy.mockRestore()
  })

  it('повторный щелчок по текущему набору патча не шлёт', () => {
    // Иначе каждый промах мимо кнопки стоил бы кадру перерисовки всех
    // потребителей контекста — `DsText` мержит по ссылке `value`.
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: null })
    const spy = downSpy()

    fireEvent.click(group().getByRole('button', { name: 'ru' }))

    expect(patches(spy).some((m) => m.body.text !== undefined)).toBe(false)
    spy.mockRestore()
  })
})
