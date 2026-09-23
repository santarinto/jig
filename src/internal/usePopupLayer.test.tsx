import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { usePopupLayer } from './usePopupLayer.js'
import { Popover } from '../components/Popover/Popover.js'
import { Combobox } from '../components/Combobox/Combobox.js'

function Popup({ open, id }: { open: boolean; id: string }) {
  const zIndex = usePopupLayer(open)
  return open ? <div data-testid={id} style={{ zIndex }} /> : null
}

/** Надбавка N из `calc(var(--ds-z-popup) + N)`; NaN, если формы нет. */
const layer = (el: HTMLElement) => {
  const m = el.style.zIndex.match(/^calc\(var\(--ds-z-popup\) \+ (\d+)\)$/)
  return m ? +m[1] : NaN
}

describe('usePopupLayer', () => {
  it('позже открытый попап получает больший слой', () => {
    const { rerender } = render(<><Popup open id="a" /><Popup open={false} id="b" /></>)
    rerender(<><Popup open id="a" /><Popup open id="b" /></>)
    expect(layer(screen.getByTestId('b'))).toBeGreaterThan(layer(screen.getByTestId('a')))
  })

  it('когда открытых не осталось — счётчик сбрасывается, слои не растут за сессию', () => {
    const first = render(<Popup open id="a" />)
    expect(layer(screen.getByTestId('a'))).toBe(1)
    first.unmount()
    render(<Popup open id="b" />)
    expect(layer(screen.getByTestId('b'))).toBe(1)
  })

  it('список Combobox, открытый позже панели Popover-соседа, лежит выше', async () => {
    const { container } = render(
      <>
        {/* Popover — контролируемый и «приколот» открытым: клик по соседнему
            Combobox — pointerdown вне корня Popover, и его собственный
            useDismiss (не трогаем) обычно закрыл бы панель. В реальном
            приложении потребитель, которому нужно держать несколько
            оверлеев открытыми одновременно, игнорирует onOpenChange —
            это ровно та обвязка. */}
        <Popover trigger={<button>Фильтр</button>} open onOpenChange={() => {}}>панель</Popover>
        <Combobox options={[{ value: '1', label: 'Ромашка ООО' }]} />
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Выберите/ }))
    const panel = container.querySelector<HTMLElement>('.ds-popover__panel')!
    const list = container.querySelector<HTMLElement>('.ds-combobox__popover')!
    expect(layer(list)).toBeGreaterThan(layer(panel))
  })
})
