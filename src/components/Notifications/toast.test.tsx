import { render, screen, within, act, fireEvent } from '@testing-library/react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { toast, Toaster, clearToasts } from './toast.js'
import { Toast } from './Notifications.js'
import { Modal } from '../Modal/Modal.js'

afterEach(() => { act(() => clearToasts()) })

describe('toast / Toaster', () => {
  it('renders a success toast fired imperatively', () => {
    render(<Toaster />)
    act(() => { toast.success('Сохранено') })
    const msg = screen.getByText('Сохранено')
    expect(msg).toBeInTheDocument()
    expect(msg.closest('.ds-toast')).toHaveClass('ds-toast--success')
  })

  it('dismiss removes a toast by id', () => {
    render(<Toaster />)
    let id = ''
    act(() => { id = toast.error('Ошибка') })
    expect(screen.getByText('Ошибка')).toBeInTheDocument()
    act(() => { toast.dismiss(id) })
    expect(screen.queryByText('Ошибка')).toBeNull()
  })

  it('auto-dismisses after the duration', () => {
    vi.useFakeTimers()
    try {
      render(<Toaster />)
      act(() => { toast.info('Инфо', { duration: 1000 }) })
      expect(screen.getByText('Инфо')).toBeInTheDocument()
      act(() => { vi.advanceTimersByTime(1000) })
      expect(screen.queryByText('Инфо')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stacks multiple toasts', () => {
    render(<Toaster />)
    act(() => { toast.success('A'); toast.warning('B') })
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B').closest('.ds-toast')).toHaveClass('ds-toast--warning')
  })

  // Замена по id (add: items.filter(t => t.id !== id)) не покрывалась
  // (DS-12): повтор с тем же id обновляет тост, а не плодит второй.
  it('повтор с тем же id заменяет тост, а не добавляет второй', () => {
    render(<Toaster />)
    act(() => { toast.info('Первое', { id: 'x' }) })
    act(() => { toast.info('Второе', { id: 'x' }) })
    expect(screen.queryByText('Первое')).toBeNull()
    expect(screen.getByText('Второе')).toBeInTheDocument()
    expect(document.querySelectorAll('.ds-toast')).toHaveLength(1)
  })
})

/**
 * Живая область обязана существовать в DOM **до** вставки текста.
 *
 * Прежде `role="status"` висел на самой карточке тоста — то есть область
 * появлялась вместе со своим содержимым. NVDA и VoiceOver такие вставки
 * стабильно молчат: объявляется изменение внутри уже наблюдаемой области, а не
 * появление новой. Практически это значит, что `toast.success('Сохранено')` для
 * пользователя скринридера **не происходил вовсе** — при том, что визуально всё
 * работало, и потому никто не жаловался.
 *
 * jsdom не умеет объявлять — проверяем то, от чего объявление зависит: область
 * есть при пустой очереди, она одна, и карточка внутри неё второй не заводит.
 */
describe('Toaster · живая область', () => {
  it('корень тостера — живая область и он в DOM ещё до первого тоста', () => {
    render(<Toaster />)
    const root = document.querySelector('.ds-toaster') as HTMLElement
    expect(root).toBeTruthy()
    expect(root.children).toHaveLength(0)
    expect(root).toHaveAttribute('role', 'status')
    expect(root).toHaveAttribute('aria-live', 'polite')
  })

  it('карточка тоста не заводит вторую живую область внутри первой', () => {
    render(<Toaster />)
    act(() => { toast.success('Сохранено') })
    const root = document.querySelector('.ds-toaster') as HTMLElement
    const card = screen.getByText('Сохранено').closest('.ds-toast') as HTMLElement
    expect(root.contains(card)).toBe(true)
    expect(card.hasAttribute('role')).toBe(false)
    expect(card.hasAttribute('aria-live')).toBe(false)
    // Счётчик рядом с утверждением: «областей ровно одна» на пустом дереве
    // верно само по себе и ничего не значит.
    expect(root.querySelectorAll('[aria-live], [role="status"], [role="alert"]')).toHaveLength(0)
  })

  it('standalone Toast объявляет себя сам — вне тостера чужой области нет', () => {
    render(<Toast tone="error">Не удалось сохранить</Toast>)
    const card = screen.getByText('Не удалось сохранить').closest('.ds-toast')!
    // Роль зависит от ТОНА (DS-157): ошибка и предупреждение получают
    // `alert`, остальные — `status`. Проверяются обе ветки, иначе утверждение
    // «роль зависит от тона» держалось бы на одном значении и прошло бы у
    // компонента, который её вообще не выбирает.
    expect(card).toHaveAttribute('role', 'alert')
  })

  it('роль выбирается тоном: у сообщения она вежливая, у ошибки срочная', () => {
    render(<><Toast tone="info">Готово</Toast><Toast tone="warning">Проверьте</Toast></>)
    expect(screen.getByText('Готово').closest('.ds-toast')).toHaveAttribute('role', 'status')
    expect(screen.getByText('Проверьте').closest('.ds-toast')).toHaveAttribute('role', 'alert')
  })
})

/**
 * WCAG 2.2.1: у движущегося/исчезающего содержимого должна быть возможность его
 * остановить. Тост с кнопкой «Отменить» гас через 4 секунды **посреди** Tab к
 * нему — то есть добраться до действия клавиатурой было нельзя в принципе, а
 * мышью — только если успел.
 *
 * Пауза на hover и на фокусе внутри; после ухода отсчёт продолжается с остатка,
 * а не начинается заново — иначе курсор, случайно прошедший над стопкой,
 * продлевал бы жизнь тоста на полную длительность.
 */
describe('Toaster · пауза автоскрытия', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  const card = () => screen.getByText('Инфо').closest('.ds-toast') as HTMLElement

  it('наведение мышью останавливает отсчёт', () => {
    render(<Toaster />)
    act(() => { toast.info('Инфо', { duration: 1000 }) })
    act(() => { vi.advanceTimersByTime(400) })
    fireEvent.mouseEnter(card())
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.queryByText('Инфо')).toBeInTheDocument()
  })

  it('фокус внутри тоста останавливает отсчёт', () => {
    render(<Toaster />)
    act(() => { toast.info('Инфо', { duration: 1000 }) })
    fireEvent.focusIn(within(card()).getByRole('button', { name: 'Закрыть' }))
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.queryByText('Инфо')).toBeInTheDocument()
  })

  it('после ухода курсора отсчёт продолжается с остатка, а не с начала', () => {
    render(<Toaster />)
    act(() => { toast.info('Инфо', { duration: 1000 }) })
    act(() => { vi.advanceTimersByTime(900) })
    fireEvent.mouseEnter(card())
    act(() => { vi.advanceTimersByTime(5000) })
    fireEvent.mouseLeave(card())
    // Остаток 100мс: на 99 тост ещё жив, на 101 — уже нет. Проверка «просто
    // исчезнет когда-нибудь» пережила бы перезапуск с полной длительности.
    act(() => { vi.advanceTimersByTime(99) })
    expect(screen.queryByText('Инфо')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(2) })
    expect(screen.queryByText('Инфо')).toBeNull()
  })

  it('уход фокуса возобновляет отсчёт', () => {
    render(<Toaster />)
    act(() => { toast.info('Инфо', { duration: 1000 }) })
    const closeBtn = within(card()).getByRole('button', { name: 'Закрыть' })
    fireEvent.focusIn(closeBtn)
    act(() => { vi.advanceTimersByTime(5000) })
    fireEvent.focusOut(closeBtn)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.queryByText('Инфо')).toBeNull()
  })

  it('duration=0 — тост не гаснет сам, и пауза тут ни при чём', () => {
    render(<Toaster />)
    act(() => { toast.info('Инфо', { duration: 0 }) })
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(screen.queryByText('Инфо')).toBeInTheDocument()
  })
})

// Флагманский сценарий волны «слои и оверлеи»: диалог сообщает об ошибке
// сохранения тостом поверх себя. Toaster порталится в document.body (как
// Modal/Drawer) и должен остаться кликабельным и видимым для скринридера,
// пока useOverlayIsolation инертит фон под открытым Modal.
describe('Toaster поверх открытого Modal (изоляция фона)', () => {
  let page: HTMLElement
  beforeEach(() => {
    document.body.style.overflow = ''
    page = document.createElement('main')
    document.body.appendChild(page)
  })
  afterEach(() => { page.remove() })

  it('тост не inert и кликабелен при открытом Modal, фон — inert (Modal и Toaster в одном коммите)', () => {
    render(
      <>
        <Modal open onClose={() => {}} title="Диалог">Контент</Modal>
        <Toaster />
      </>,
    )
    act(() => { toast.error('Не удалось сохранить', { id: 't1' }) })

    const toasterRoot = document.querySelector('.ds-toaster') as HTMLElement
    expect(toasterRoot).toBeTruthy()
    // Ключевая проверка находки: ни сам корень тостера, ни кто-то из его
    // предков не должен быть [inert] — jsdom не блокирует события у [inert]
    // потомков (не реализует семантику, см. useFocusTrap.test.tsx), поэтому
    // hasAttribute на самом узле ничего не доказывает, если он висит внутри
    // проинерченного узла приложения — проверяем всю цепочку предков.
    expect(toasterRoot.closest('[inert]')).toBeNull()
    expect(page.hasAttribute('inert')).toBe(true)

    const closeBtn = within(toasterRoot).getByRole('button', { name: 'Закрыть' })
    fireEvent.click(closeBtn)
    expect(screen.queryByText('Не удалось сохранить')).toBeNull()
  })

  it('порядок «Toaster смонтирован → Modal открылся»: тост остаётся не-inert', () => {
    const { rerender } = render(<Toaster />)
    act(() => { toast.error('Ошибка сети', { id: 't2' }) })
    const toasterRoot = document.querySelector('.ds-toaster') as HTMLElement
    expect(toasterRoot.closest('[inert]')).toBeNull()

    rerender(
      <>
        <Toaster />
        <Modal open onClose={() => {}} title="Диалог">Контент</Modal>
      </>,
    )
    expect(toasterRoot.closest('[inert]')).toBeNull()
    expect(page.hasAttribute('inert')).toBe(true)
  })

  it('порядок «Modal открыт → Toaster смонтировался позже»: тост не-inert (ветка регистрации/отката)', () => {
    const { rerender } = render(<Modal open onClose={() => {}} title="Диалог">Контент</Modal>)
    expect(page.hasAttribute('inert')).toBe(true)

    rerender(
      <>
        <Modal open onClose={() => {}} title="Диалог">Контент</Modal>
        <Toaster />
      </>,
    )
    act(() => { toast.error('Ошибка после открытия', { id: 't3' }) })
    const toasterRoot = document.querySelector('.ds-toaster') as HTMLElement
    expect(toasterRoot).toBeTruthy()
    expect(toasterRoot.closest('[inert]')).toBeNull()
  })

  it('закрытие Modal снимает inert со всех; отписка тостера при анмаунте не ломает восстановление', () => {
    const { rerender, unmount } = render(
      <>
        <Modal open onClose={() => {}} title="Диалог">Контент</Modal>
        <Toaster />
      </>,
    )
    act(() => { toast.error('Ошибка', { id: 't4' }) })
    expect(page.hasAttribute('inert')).toBe(true)

    // Тостер размонтировался раньше Modal (например, сам тост уже закрылся
    // и второй Toaster в дереве не смонтирован) — фон должен остаться под
    // изоляцией, пока Modal открыт: отписка exemptFromIsolation не должна
    // случайно снять чужой lockCount/inert.
    rerender(<Modal open onClose={() => {}} title="Диалог">Контент</Modal>)
    expect(page.hasAttribute('inert')).toBe(true)
    expect(document.querySelector('.ds-toaster')).toBeNull()

    rerender(<Modal open={false} onClose={() => {}} title="Диалог">Контент</Modal>)
    expect(page.hasAttribute('inert')).toBe(false)
    expect(document.body.style.overflow).toBe('')

    unmount()
  })
})
