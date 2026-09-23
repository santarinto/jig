import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { Shell } from './shell-app.js'
import { downSpy, frameSid, sendUp } from './test-kit.js'
import type { Envelope } from './protocol.js'

afterEach(cleanup)

const scales = () => within(screen.getByRole('group', { name: 'Масштаб' }))

describe('масштаб', () => {
  /**
   * НАБОР — ТЕ ШКАЛЫ, НА КОТОРЫХ ЖИВУТ ПОТРЕБИТЕЛИ (DS-164), а не
   * круглые числа. Было `1 / 1.25 / 1.5`: 1.25 не стоит ни у кого (у
   * потребителя 1.15, плотный режим — 0.875), и верстак показывал компонент
   * на шкале, которой нет в жизни, пропуская обе настоящие.
   *
   * Список — ЛИТЕРАЛОМ, а не чтением `SCALE_PRESETS` (docs/writing-checks.md,
   * пункт 7): счёт, снятый с того же списка, что строит чипы, согласен сам с
   * собой и остаётся зелёным при любом наборе.
   */
  it('набор ровно 0.875 / 1 / 1.15 / 1.5, в этом порядке', () => {
    render(<Shell />)
    expect(scales().getAllByRole('button').map((b) => b.textContent)).toEqual([
      '0.875×',
      '1×',
      '1.15×',
      '1.5×',
    ])
  })

  // Было: единица масштаба проверялась по её отсутствию в адресе кадра, а
  // 1.25 — по её присутствию там же. С патчем вниз (DS-62) адрес
  // замирает на монтировании, и масштаб в него больше не попадает. Предмет —
  // «масштаб уезжает вниз, а единица не уезжает» — тот же самый, только едет
  // теперь патчем, а не адресом: единица в патч НЕ уходит вовсе (pickScale
  // ранний выход при `s === scale`), 1.15 — уходит.
  it('единица в патч не уходит, а 1.15 уходит', () => {
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: null })
    const spy = downSpy()

    // Масштаб уже 1× по умолчанию — щелчок по уже действующему значению не
    // должен слать патч вовсе (pickScale выходит раньше при `s === scale`).
    fireEvent.click(scales().getByRole('button', { name: '1×' }))
    expect(spy).not.toHaveBeenCalled()

    fireEvent.click(scales().getByRole('button', { name: '1.15×' }))

    const sent = spy.mock.calls.map(([m]) => m as Envelope<{ type: string; scale?: number }>)
    expect(sent.some((m) => m.body.type === 'patch' && m.body.scale === 1.15)).toBe(true)
    spy.mockRestore()
  })

  it('масштаб не трогает ширину кадра: заданное остаётся заданным', () => {
    render(<Shell />)
    const before = screen.getByLabelText('Заданная ширина').textContent

    fireEvent.click(scales().getByRole('button', { name: '1.5×' }))

    expect(screen.getByLabelText('Заданная ширина').textContent).toBe(before)
  })
})
