/**
 * «Заданное / фактическое» в тулбаре — и инвариант, ради которого это писалось:
 * size ТОЛЬКО печатается.
 *
 * Замкнись петля (оболочка подгоняет ширину под пришедший size), верстак
 * начал бы дрожать на любом компоненте шире кадра, а причина выглядела бы как
 * дефект компонента — самый дорогой род ошибки инструмента.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { Shell } from './shell-app.js'
import { frameEl, frameSid, sendUp } from './test-kit.js'

afterEach(cleanup)

const wrapWidth = () => (frameEl().parentElement as HTMLElement).style.width
const actual = () => screen.getByLabelText('Фактический размер').textContent

describe('фактический размер', () => {
  it('печатается рядом с заданным', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'size', w: 720, h: 214, cw: 708, bar: 0 })

    expect(screen.getByLabelText('Заданная ширина').textContent).toBe('768')
    expect(actual()).toBe('720×214')
  })

  it('ширина контейнера печатается, полоса — только когда она есть (DS-314)', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'size', w: 285, h: 900, cw: 693, bar: 15 })
    expect(screen.getByLabelText('Ширина контейнера').textContent).toBe('контейнер 693')
    expect(screen.getByLabelText('Полоса прокрутки кадра').textContent).toBe('полоса −15')

    // Сосед: без полосы пометки нет. Без этой половины случай проходит и на
    // оболочке, которая печатает пометку всегда.
    sendUp(frameSid(), { type: 'size', w: 285, h: 200, cw: 708, bar: 0 })
    expect(screen.getByLabelText('Ширина контейнера').textContent).toBe('контейнер 708')
    expect(screen.queryByLabelText('Полоса прокрутки кадра')).toBeNull()
  })

  it('НЕ меняет размер кадра, даже если пришло невозможное число', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'size', w: 9999, h: 9999, cw: 9999, bar: 0 })

    expect(wrapWidth()).toBe('768px')
  })

  it('размер мёртвой сессии не печатается, а размер живой — печатается', () => {
    render(<Shell />)
    const stale = frameSid()
    sendUp(stale, { type: 'size', w: 720, h: 214, cw: 708, bar: 0 })
    expect(actual()).toBe('720×214')

    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Компоненты' })).getByRole('button', {
        name: 'Badge',
      }),
    )
    // У нового кадра фактического размера ещё нет; старое число рядом с новым
    // компонентом читалось бы как его.
    expect(actual()).toBe('—')

    sendUp(stale, { type: 'size', w: 111, h: 222, cw: 111, bar: 0 })
    expect(actual()).toBe('—')

    // Вторая половина: без неё случай проходит и на оболочке, которая не
    // слушает `size` вообще.
    sendUp(frameSid(), { type: 'size', w: 300, h: 24, cw: 708, bar: 0 })
    expect(actual()).toBe('300×24')
  })
})
