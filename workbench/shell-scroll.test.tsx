/**
 * Прокрутка порта в тулбаре (JIG-42, decisions 1.7): группа «прокрутка»
 * ТОЛЬКО печатает (`Up 'scroll'`), в адрес живая позиция не пишется никогда
 * — по тому же уговору, что у «заданное/фактическое» (`shell-size.test.tsx`).
 * `sx`/`sy` в адресе — ПРОСЬБА (`pin`), заморожена с загрузки до смены
 * случая/компонента; ссылку с ТЕКУЩЕЙ позицией даёт `CopyChip`, явным
 * действием, а не молчаливое зеркало.
 *
 * БЕЗ «рука» (decisions 1.7 отменяет варианты B/C спецификации, hand снят
 * из протокола целиком) — соответствующий случай спецификации 3.9 снят.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent, within } from '@testing-library/react'
import { Shell } from './shell-app.js'
import { downSpy, frameQuery, frameSid, sendUp } from './test-kit.js'
import { parseFrameUrl } from './frame-url.js'
import { MIRROR_DELAY_MS } from './mirror-url.js'
import type { Down, Envelope, FixtureMeta } from './protocol.js'

const openAt = (search: string): void => {
  window.history.pushState(null, '', `/${search}`)
}

beforeEach(() => {
  window.history.pushState(null, '', '/')
})

afterEach(cleanup)

const group = () => screen.queryByRole('group', { name: 'Прокрутка порта' })
const dock = () => screen.getByRole('region', { name: 'Панель' })
const cases = () => within(dock()).getByRole('group', { name: 'Случаи' })

const META: FixtureMeta = {
  name: 'DataTable',
  group: 'Данные',
  cases: [
    { id: 'base', title: 'base', values: {}, slots: {} },
    { id: 'many', title: 'many', values: {}, slots: {} },
  ],
  controls: {},
  unexpressed: [],
  data: [],
  slots: {},
}

describe('прокрутка порта в тулбаре', () => {
  it('адрес кадра прокрутку не несёт', () => {
    openAt('?c=DataTable&sx=151')
    render(<Shell />)
    expect(frameQuery().get('sx')).toBeNull()
  })

  it('прокрутка печатается по осям с ходом; ось без хода не печатается', () => {
    openAt('?c=DataTable')
    render(<Shell />)
    act(() => sendUp(frameSid(), {
      type: 'scroll',
      port: { x: 151.4, xMax: 152, y: 480, yMax: 960 },
      applied: true,
    }))

    expect(screen.getByLabelText('Прокрутка вбок').textContent).toBe('x 151 / 152')
    expect(screen.getByLabelText('Прокрутка вниз').textContent).toBe('y 480 / 960')

    act(() => sendUp(frameSid(), {
      type: 'scroll',
      port: { x: 40, xMax: 152, y: 0, yMax: 0 },
    }))
    expect(screen.getByLabelText('Прокрутка вбок').textContent).toBe('x 40 / 152')
    expect(screen.queryByLabelText('Прокрутка вниз')).toBeNull()
  })

  // JIG-42, приёмка: слепой вопрос владельцу показал, что «x 151 / 312» само
  // по себе не читается — подпись обязана назвать, что значат числа.
  it('подпись группы называет, что значат числа', () => {
    openAt('?c=DataTable')
    render(<Shell />)
    act(() => sendUp(frameSid(), {
      type: 'scroll',
      port: { x: 151, xMax: 312, y: 0, yMax: 0 },
      applied: true,
    }))

    expect(within(group()!).getByText('прокрутка · сейчас / макс., px')).toBeTruthy()
  })

  // М8' (decisions 1.7): живая прокрутка НИКОГДА не пишется в адрес — даже
  // без единой явной просьбы sx/sy.
  it('живая прокрутка в адрес не попадает', () => {
    vi.useFakeTimers()
    try {
      openAt('?c=DataTable')
      render(<Shell />)
      act(() => vi.advanceTimersByTime(MIRROR_DELAY_MS))

      act(() => sendUp(frameSid(), {
        type: 'scroll',
        port: { x: 160, xMax: 312, y: 0, yMax: 0 },
      }))
      act(() => vi.advanceTimersByTime(MIRROR_DELAY_MS))

      expect(screen.getByLabelText('Прокрутка вбок').textContent).toBe('x 160 / 312')
      expect(parseFrameUrl(window.location.search).sx).toBeNull()
      expect(window.location.search).not.toContain('sx=')
    } finally {
      vi.useRealTimers()
    }
  })

  it('упор назван; адрес держит ПРОСЬБУ, а не то, что реально встало', () => {
    vi.useFakeTimers()
    try {
      openAt('?c=DataTable&sx=600')
      render(<Shell />)
      act(() => vi.advanceTimersByTime(MIRROR_DELAY_MS))

      act(() => sendUp(frameSid(), {
        type: 'scroll',
        port: { x: 152, xMax: 152, y: 0, yMax: 0 },
        applied: true,
      }))
      act(() => vi.advanceTimersByTime(MIRROR_DELAY_MS))

      expect(screen.getByLabelText('Упор прокрутки').textContent).toBe('упор x: просили 600, максимум 152')
      // Decisions 1.7 (расхождение со спецификацией 3.9): адрес — ПРОСЬБА,
      // не то, что реально встало под упором. Прежняя форма («адрес после
      // MIRROR_DELAY_MS → sx=152») отменена — она молча переписывала бы
      // просьбу человека тем, что вернул компонент.
      expect(parseFrameUrl(window.location.search).sx).toBe(600)
    } finally {
      vi.useRealTimers()
    }
  })

  it('нет роли port — довод назван; decisions 1.7: адрес держит ПРОСЬБУ и не теряет её', () => {
    openAt('?c=DataTable&sx=151')
    render(<Shell />)
    act(() => sendUp(frameSid(), { type: 'scroll', port: null, why: 'у случая нет роли port' }))

    expect(screen.getByLabelText('Прокрутка не применена').textContent).toBe('sx/sy: у случая нет роли port')
    expect(parseFrameUrl(window.location.search).sx).toBe(151)
  })

  it('смена случая гасит всё: группа пропадает, адрес и src нового кадра без sx, новому кадру scroll-to не уходит', () => {
    vi.useFakeTimers()
    try {
      openAt('?c=DataTable&sx=151')
      render(<Shell />)
      act(() => sendUp(frameSid(), { type: 'ready', meta: META }))
      act(() => sendUp(frameSid(), {
        type: 'scroll',
        port: { x: 151, xMax: 312, y: 0, yMax: 0 },
        applied: true,
      }))
      expect(group()).not.toBeNull()

      act(() => fireEvent.click(within(cases()).getByRole('button', { name: 'many' })))
      act(() => vi.advanceTimersByTime(MIRROR_DELAY_MS))

      expect(group()).toBeNull()
      expect(parseFrameUrl(window.location.search).sx).toBeNull()
      expect(frameQuery().get('sx')).toBeNull()

      // Новому кадру scroll-to не уходит: у него нет просьбы (pin сброшен).
      const spy = downSpy()
      act(() => sendUp(frameSid(), { type: 'ready', meta: META }))
      expect(spy.mock.calls.map(([m]) => (m as Envelope<Down>).body.type)).not.toContain('scroll-to')
      spy.mockRestore()
    } finally {
      vi.useRealTimers()
    }
  })

  it('в сетке группы нет', () => {
    openAt('?c=DataTable&mode=grid&sx=151')
    render(<Shell />)
    expect(screen.queryByRole('group', { name: 'Прокрутка порта' })).toBeNull()
  })

  // М14' (decisions 1.7): чип копирует ЖИВУЮ прокрутку из последнего
  // Up 'scroll', а не число из адреса (`pin`/просьба).
  it('CopyChip «ссылка с прокруткой» копирует ЖИВУЮ позицию, не просьбу', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    openAt('?c=DataTable&sx=600')
    render(<Shell />)
    act(() => sendUp(frameSid(), {
      type: 'scroll',
      port: { x: 151, xMax: 312, y: 0, yMax: 0 },
      applied: true,
    }))

    const chip = within(group()!).getByRole('button', { name: 'ссылка с прокруткой' })
    await act(async () => {
      fireEvent.click(chip)
    })

    expect(writeText).toHaveBeenCalledTimes(1)
    const copied = writeText.mock.calls[0]![0] as string
    expect(copied).toContain('sx=151')
    expect(copied).not.toContain('sx=600')
  })
})
