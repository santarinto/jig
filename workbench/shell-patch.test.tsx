/**
 * Патч вместо перезагрузки.
 *
 * Утверждается различимость: смена темы НЕ трогает адрес и сессию (значит
 * документ не перезагружается), но патч действительно уходит вниз. Первое без
 * второго — оболочка, которая просто ничего не делает.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { Shell } from './shell-app.js'
import { downSpy, frameSrc, frameSid, sendUp } from './test-kit.js'
import type { Envelope } from './protocol.js'

afterEach(cleanup)

describe('патч вниз', () => {
  it('смена темы кадра не перезагружает его и уходит патчем', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: null })
    const before = frameSrc()
    const spy = downSpy()

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Тема кадра' })).getByRole('button', { name: 'тьма' }),
    )

    expect(frameSrc()).toBe(before)
    const sent = spy.mock.calls.map(([m]) => m as Envelope<{ type: string; theme?: string }>)
    expect(sent.some((m) => m.body.type === 'patch' && m.body.theme === 'dark')).toBe(true)
    spy.mockRestore()
  })

  it('до ready патч вниз не уходит: слушателя в кадре ещё нет', () => {
    render(<Shell />)
    const spy = downSpy()

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Тема кадра' })).getByRole('button', { name: 'тьма' }),
    )

    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
