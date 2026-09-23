import { render, screen, fireEvent } from '@testing-library/react'
import { useRef, useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { useDismiss, type DismissReason } from './useDismiss.js'

function Host({ enabled = true, onDismiss }: {
  enabled?: boolean
  onDismiss: (r: DismissReason) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss({ enabled, ref, onDismiss })
  return (
    <div>
      <div ref={ref}><button>внутри</button></div>
      <button>снаружи</button>
    </div>
  )
}

describe('useDismiss', () => {
  it('pointerdown мимо корня → onDismiss("outside")', () => {
    const spy = vi.fn()
    render(<Host onDismiss={spy} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'снаружи' }))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('outside')
  })

  it('pointerdown внутри корня — молчит', () => {
    const spy = vi.fn()
    render(<Host onDismiss={spy} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'внутри' }))
    expect(spy).not.toHaveBeenCalled()
  })

  it('Esc на документе → onDismiss("escape"), даже когда фокус вне корня', () => {
    const spy = vi.fn()
    render(<Host onDismiss={spy} />)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('escape')
  })

  it('другие клавиши не закрывают', () => {
    const spy = vi.fn()
    render(<Host onDismiss={spy} />)
    fireEvent.keyDown(document.body, { key: 'Enter' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('enabled: false — слушателей нет вообще', () => {
    const spy = vi.fn()
    render(<Host enabled={false} onDismiss={spy} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'снаружи' }))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('колбэк не протухает: срабатывает версия текущего рендера', () => {
    const first = vi.fn()
    const second = vi.fn()
    function Switcher() {
      const ref = useRef<HTMLDivElement>(null)
      const [swapped, setSwapped] = useState(false)
      useDismiss({ enabled: true, ref, onDismiss: swapped ? second : first })
      return (
        <div>
          <div ref={ref} />
          <button onClick={() => setSwapped(true)}>поменять</button>
        </div>
      )
    }
    render(<Switcher />)
    fireEvent.click(screen.getByRole('button', { name: 'поменять' }))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('escape')
  })

  it('enabled: true → false по ререндеру — слушатели снимаются', () => {
    const spy = vi.fn()
    const { rerender } = render(<Host enabled onDismiss={spy} />)
    rerender(<Host enabled={false} onDismiss={spy} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'снаружи' }))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('после unmount слушатели документа реально сняты', () => {
    const spy = vi.fn()
    const { unmount } = render(<Host onDismiss={spy} />)
    unmount()
    fireEvent.pointerDown(document.body)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(spy).not.toHaveBeenCalled()
  })
})
