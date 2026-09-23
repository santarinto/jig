import { render } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayIsolation, exemptFromIsolation } from './useOverlayIsolation.js'

function Overlay({ open, container }: { open: boolean; container?: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null)
  useOverlayIsolation({ enabled: open, ref, container })
  if (!open) return null
  return createPortal(<div ref={ref} data-overlay />, container ?? document.body)
}

// Мини-Toaster: узел-исключение, который регистрирует себя сам через
// exemptFromIsolation на маунте (а не через useOverlayIsolation, как
// оверлеи) и отписывается на анмаунте — тот же контракт, что у Toaster.
function Exempt() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    return exemptFromIsolation(el)
  }, [])
  return createPortal(<div ref={ref} data-exempt />, document.body)
}

let page: HTMLElement
beforeEach(() => {
  document.body.style.overflow = ''
  page = document.createElement('main')
  document.body.appendChild(page)
  return () => page.remove()
})

describe('useOverlayIsolation', () => {
  it('открытие лочит скролл и делает фон inert; закрытие возвращает всё', () => {
    const { rerender } = render(<Overlay open />)
    expect(document.body.style.overflow).toBe('hidden')
    expect(page.hasAttribute('inert')).toBe(true)
    expect(document.querySelector('[data-overlay]')!.hasAttribute('inert')).toBe(false)
    rerender(<Overlay open={false} />)
    expect(document.body.style.overflow).toBe('')
    expect(page.hasAttribute('inert')).toBe(false)
  })

  it('размонтирование без закрытия тоже возвращает всё', () => {
    const { unmount } = render(<Overlay open />)
    unmount()
    expect(document.body.style.overflow).toBe('')
    expect(page.hasAttribute('inert')).toBe(false)
  })

  it('два оверлея: изоляция снимается только с последним, узлы оверлеев не inert-ятся', () => {
    const { rerender } = render(<><Overlay open /><Overlay open /></>)
    const overlays = document.querySelectorAll('[data-overlay]')
    expect(overlays.length).toBe(2)
    overlays.forEach((o) => expect(o.hasAttribute('inert')).toBe(false))
    rerender(<><Overlay open /><Overlay open={false} /></>)
    expect(page.hasAttribute('inert')).toBe(true)
    rerender(<><Overlay open={false} /><Overlay open={false} /></>)
    expect(page.hasAttribute('inert')).toBe(false)
    expect(document.body.style.overflow).toBe('')
  })

  it('кастомный container выключает изоляцию', () => {
    render(<Overlay open container={page} />)
    expect(document.body.style.overflow).toBe('')
    expect(page.hasAttribute('inert')).toBe(false)
  })

  describe('exemptFromIsolation', () => {
    it('узел из того же коммита, что открывшийся оверлей, не остаётся inert (ветка отката applyInert)', () => {
      // Overlay объявлен раньше Exempt — его эффект (applyInert) отработает
      // первым и успеет проинертить ещё незарегистрированный узел Exempt,
      // раз оба смонтировались одним коммитом. Экспортируемая функция должна
      // откатить эту чужую ошибку в собственном эффекте регистрации.
      render(<><Overlay open /><Exempt /></>)
      const exempt = document.querySelector('[data-exempt]') as HTMLElement
      expect(exempt.hasAttribute('inert')).toBe(false)
      expect(page.hasAttribute('inert')).toBe(true)
    })

    it('отписка при анмаунте не ломает восстановление изоляции для остальных', () => {
      const { rerender } = render(<><Overlay open /><Exempt /></>)
      expect(document.querySelector('[data-exempt]')).not.toBeNull()

      // Exempt размонтировался раньше Overlay — изоляция должна остаться
      // рабочей для всех остальных: lockCount/inerted не должны пострадать
      // от отписки чужого исключения.
      rerender(<Overlay open />)
      expect(document.querySelector('[data-exempt]')).toBeNull()
      expect(page.hasAttribute('inert')).toBe(true)
      expect(document.body.style.overflow).toBe('hidden')

      rerender(<Overlay open={false} />)
      expect(page.hasAttribute('inert')).toBe(false)
      expect(document.body.style.overflow).toBe('')
    })
  })
})
