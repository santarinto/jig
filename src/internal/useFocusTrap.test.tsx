import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from './useFocusTrap.js'
import { useOverlayIsolation } from './useOverlayIsolation.js'

function Trap({ enabled, children }: { enabled: boolean; children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap({ enabled, ref })
  return enabled ? <div ref={ref} tabIndex={-1} data-testid="trap">{children}</div> : null
}

// Мини-Modal: ловушка + изоляция вместе, оверлей — портал в document.body
// (как у настоящих Modal/Drawer), опенер — обычный узел внутри RTL-контейнера.
// Это существенно: изоляция инертит детей document.body, поэтому только
// портал по-настоящему разносит опенер и оверлей на разные ветки body.
function OverlayHarness() {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  useFocusTrap({ enabled: open, ref: dialogRef })
  useOverlayIsolation({ enabled: open, ref: overlayRef })
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Открыть</button>
      {open && createPortal(
        <div ref={overlayRef}>
          <div ref={dialogRef} tabIndex={-1}>
            <button type="button" onClick={() => setOpen(false)}>Закрыть</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

describe('useFocusTrap', () => {
  it('переносит фокус на первый доступный контрол, минуя disabled', () => {
    render(
      <Trap enabled>
        <button type="button" disabled>Недоступно</button>
        <button type="button">Записать</button>
      </Trap>,
    )
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Записать' }))
  })

  it('пустой контейнер берёт фокус сам, Tab не выпускает', async () => {
    render(<Trap enabled>текст без контролов</Trap>)
    expect(document.activeElement).toBe(screen.getByTestId('trap'))
    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByTestId('trap'))
  })

  it('Tab с последнего идёт на первый, Shift+Tab с первого — на последний', async () => {
    render(
      <Trap enabled>
        <button type="button">Первый</button>
        <button type="button">Последний</button>
      </Trap>,
    )
    screen.getByRole('button', { name: 'Последний' }).focus()
    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Первый' }))
    await userEvent.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Последний' }))
  })

  it('возвращает фокус туда, где он был, — и при выключении, и при размонтировании', async () => {
    function Harness() {
      const [on, setOn] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOn(true)}>Открыть</button>
          <Trap enabled={on}><button type="button" onClick={() => setOn(false)}>Закрыть</button></Trap>
        </>
      )
    }
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Открыть' })
    opener.focus()
    await userEvent.click(opener)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Закрыть' }))
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(document.activeElement).toBe(opener)
  })

  it('restore не зовёт focus() на опенере, пока его предок ещё [inert] (стык с useOverlayIsolation)', async () => {
    const originalFocus = HTMLElement.prototype.focus
    const inertAtCall: boolean[] = []
    render(<OverlayHarness />)
    const opener = screen.getByRole('button', { name: 'Открыть' })

    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement) {
      if (this === opener) inertAtCall.push(this.closest('[inert]') != null)
      return originalFocus.call(this)
    })

    opener.focus()
    await userEvent.click(opener)
    expect(screen.getByRole('button', { name: 'Закрыть' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    // Restore отложен в микротаску — даём очереди микротасков прогнаться.
    await Promise.resolve()
    await Promise.resolve()

    focusSpy.mockRestore()

    expect(inertAtCall.length).toBeGreaterThan(0)
    expect(inertAtCall).not.toContain(true)
    expect(document.activeElement).toBe(opener)
  })
})
