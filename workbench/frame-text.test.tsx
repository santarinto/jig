/**
 * Псевдолокаль в кадре (DS-139, приёмка): три санитара.
 *
 * 1. Санитар доставки: с `text=pseudo` провайдер накрывает ФИКСТУРУ, а не
 *    только хром кадра. Проверяется тем, что компонент внутри фикстуры зовёт
 *    `useDsText` и получает маркер ключа.
 *
 * 2. Санитар умолчания: без `text` в адресе кадр говорит русским умолчанием
 *    словаря. Провайдер при этом ВСЁ РАВНО стоит — с пустыми
 *    переопределениями (см. `TEXT_BY_MODE` в `frame-app.tsx`); утверждается не
 *    его отсутствие, а ТЕКСТ. Путь «вообще без провайдера» проверяют
 *    `wiring.test.tsx` и каждый юнит-тест пакета, где провайдера нет ни
 *    одного, — и проверяют лучше, чем это мог бы кадр.
 *
 * 3. Санитар живого состояния: переключение набора — ПАТЧ, а не перезагрузка,
 *    и живое состояние компонента обязано пережить его. Довод не теоретический:
 *    ключи разглядывают в развёрнутом меню и в открытой строке, то есть ровно
 *    в том состоянии, которое перезагрузка бы уронила.
 *
 *    ЭТОТ САНИТАР УЖЕ СРАБОТАЛ, и потому стоит первым в списке причин не
 *    трогать `TEXT_BY_MODE`. Первая редакция оборачивала кадр в `<DsText>`
 *    УСЛОВНО, только при `pseudo`, — и появление узла меняло форму дерева,
 *    из-за чего React перемонтировал всё под ним. Оба текста при этом
 *    отрисовывались верно: санитары 1 и 2 были зелены, а счётчик обнулялся.
 *    Держится он именно счётчиком внутри фикстуры.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { Frame } from './frame-app.js'
import { loadFixture } from './registry.js'
import { pack } from './protocol.js'
import { useDsText } from '../src/dictionary/index.js'
import type { AnyFixture } from '../src/internal/fixture.js'

vi.mock('./registry.js', () => ({
  fixtureNames: () => ['Speaker'],
  loadFixture: vi.fn(),
}))

/**
 * Фикстура, которая ГОВОРИТ из словаря — и одновременно держит живое
 * состояние. Два свойства в одном компоненте намеренно: санитар 3 обязан
 * утверждать, что состояние пережило смену набора, а смену набора видно только
 * по тому же тексту.
 */
function Speaker() {
  const t = useDsText()
  const [n, setN] = useState(0)
  return (
    <div>
      <span data-testid="said">{t['modal.close']}</span>
      <span data-testid="said-fn">{t['dataTable.selectRow']('42')}</span>
      <button type="button" onClick={() => setN((v) => v + 1)}>
        щёлк
      </button>
      <span data-testid="alive">{n}</span>
    </div>
  )
}

const SPEAKER: AnyFixture = {
  name: 'Speaker',
  group: 'G',
  props: {},
  controls: {},
  cases: [{ id: 'base', title: 'B' }],
  render: () => <Speaker />,
}

class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.mocked(loadFixture).mockImplementation(async (name: string) =>
    name === 'Speaker' ? SPEAKER : null,
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.mocked(loadFixture).mockReset()
})

const patchText = (sid: number, text: 'ru' | 'pseudo'): void => {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: pack(sid, { type: 'patch', text }),
        origin: window.location.origin,
        source: window.parent,
      }),
    )
  })
}

describe('псевдолокаль в кадре', () => {
  it('с text=pseudo фикстура говорит маркерами ключей, а не по-русски', async () => {
    window.history.pushState({}, '', '/frame.html?c=Speaker&sid=1&text=pseudo')
    render(<Frame />)

    expect((await screen.findByTestId('said')).textContent).toBe('⟦modal.close⟧')
    // Функциональный ключ — с аргументом: значение, доехавшее до строки, видно
    // именно здесь, и подмена функции константой была бы тут заметна.
    expect(screen.getByTestId('said-fn').textContent).toBe('⟦dataTable.selectRow:42⟧')
  })

  it('без text в адресе говорит русское умолчание словаря', async () => {
    window.history.pushState({}, '', '/frame.html?c=Speaker&sid=2')
    render(<Frame />)

    expect((await screen.findByTestId('said')).textContent).toBe('Закрыть')
    expect(screen.getByTestId('said-fn').textContent).toBe('Выбрать строку 42')
  })

  it('патч переключает набор ТУДА И ОБРАТНО, не роняя живое состояние', async () => {
    window.history.pushState({}, '', '/frame.html?c=Speaker&sid=3')
    render(<Frame />)
    await screen.findByTestId('said')

    // Живое состояние, которое перезагрузка документа уронила бы.
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'щёлк' }))
    })
    expect(screen.getByTestId('alive').textContent).toBe('1')

    patchText(3, 'pseudo')
    expect(screen.getByTestId('said').textContent).toBe('⟦modal.close⟧')
    expect(screen.getByTestId('alive').textContent).toBe('1')

    // ОБРАТНО тоже: набор, который умеет только включаться, читался бы как
    // сломанный кадр — вернуть русский можно было бы лишь перезагрузкой.
    patchText(3, 'ru')
    expect(screen.getByTestId('said').textContent).toBe('Закрыть')
    expect(screen.getByTestId('alive').textContent).toBe('1')
  })
})
