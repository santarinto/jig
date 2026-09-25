/**
 * Мост `Frame → jig` (JIG-40, решение спецификации п.2б): `env().params.fixture`
 * читает случай/крутилки ТЕКУЩЕГО кадра через `bindJigFrame`, а не через
 * собственный разбор адреса — второй разбор разошёлся бы с тем, что кадр
 * реально применил.
 *
 * По образцу `frame-slots.test.tsx`: `vi.mock('./registry.js')`, фикстура
 * `Host` с одним случаем и одной крутилкой.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Frame } from './frame-app.js'
import { loadFixture } from './registry.js'
import { makeFrameJig } from './jig.js'
import type { AnyFixture } from '../src/internal/fixture.js'

vi.mock('./registry.js', () => ({
  fixtureNames: () => ['Host'],
  loadFixture: vi.fn(),
}))

const HOST: AnyFixture = {
  name: 'Host',
  group: 'G',
  props: { size: 'sm' },
  controls: { size: { kind: 'enum', values: ['sm', 'md'], prop: true } },
  cases: [{ id: 'base', title: 'B' }],
  render: () => <div data-testid="host" />,
}

// `Frame` наблюдает размер хоста через ResizeObserver (frame-size.ts), а
// jsdom его не знает вовсе — тот же приём, что у `frame-slots.test.tsx`.
class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.mocked(loadFixture).mockReset()
  window.history.pushState(null, '', '/')
})

describe('мост Frame → jig', () => {
  it('env().params.fixture отвечает про случай и крутилки текущего кадра', async () => {
    vi.mocked(loadFixture).mockImplementation(async (name: string) => (name === 'Host' ? HOST : null))
    window.history.pushState({}, '', '/frame.html?c=Host&case=nope&p.sise=sm')
    render(<Frame />)
    await screen.findByTestId('host')

    const jig = makeFrameJig(window, { loadSearch: window.location.search })
    expect(jig.env().params.fixture).toEqual({
      c: 'Host',
      case: { asked: 'nope', used: 'base' },
      data: null,
      props: [{ key: 'sise', asked: 'sm', why: 'нет такой крутилки' }],
    })
  })

  it('после cleanup() отвязка сработала — fixture снова null', async () => {
    vi.mocked(loadFixture).mockImplementation(async (name: string) => (name === 'Host' ? HOST : null))
    window.history.pushState({}, '', '/frame.html?c=Host&case=base')
    render(<Frame />)
    await screen.findByTestId('host')

    cleanup()

    const jig = makeFrameJig(window, { loadSearch: window.location.search })
    expect(jig.env().params.fixture).toBeNull()
  })
})
