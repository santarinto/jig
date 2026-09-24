/**
 * Ширина меняет РАЗМЕР кадра и не трогает его АДРЕС.
 *
 * Это главное утверждение фазы 2 про геометрию: кадр не перезагружается от
 * ресайза, потому что вьюпорт меняется сам. Живое состояние компонента
 * (прокрутка на 500 строках, открытый список) при смене ширины не теряется —
 * иначе ширину невозможно подбирать, а её подбирают.
 *
 * С DS-345 к этому добавлена вторая половина: ширина живёт в адресе
 * ОБОЛОЧКИ. Утверждения не спорят и держатся здесь ВМЕСТЕ намеренно — первое
 * без второго читается как «ширина нигде не сохраняется», второе без первого
 * как «ширина поехала в адрес», и каждое порознь уже один раз так и прочли.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within, act } from '@testing-library/react'
import { Shell } from './shell-app.js'
import { frameEl, frameSrc } from './test-kit.js'
import { MIRROR_DELAY_MS } from './mirror-url.js'

afterEach(() => {
  cleanup()
  window.history.pushState(null, '', '/')
})

const widths = () => within(screen.getByRole('group', { name: 'Ширина кадра' }))
const wrapWidth = () => (frameEl().parentElement as HTMLElement).style.width

describe('ширина кадра', () => {
  it('пресет меняет размер кадра', () => {
    render(<Shell />)
    expect(wrapWidth()).toBe('768px')

    fireEvent.click(widths().getByRole('button', { name: '440' }))

    expect(wrapWidth()).toBe('440px')
  })

  it('пресет НЕ трогает адрес кадра — ни ширины в нём, ни новой сессии', () => {
    render(<Shell />)
    const before = frameSrc()

    fireEvent.click(widths().getByRole('button', { name: '1440' }))

    expect(frameSrc()).toBe(before)
    expect(before).not.toContain('w=')
  })

  it('тулбар печатает заданную ширину', () => {
    render(<Shell />)
    fireEvent.click(widths().getByRole('button', { name: '1024' }))

    expect(screen.getByLabelText('Заданная ширина').textContent).toBe('1024')
  })

  /**
   * Ширина в адресе ОБОЛОЧКИ (DS-345).
   *
   * Приёмка 328/334: чип сбрасывался на 768 при каждой загрузке, и условия, в
   * которых смотрел человек, по ссылке не воспроизводились вовсе. Человек
   * смотрел EventCalendar/week ПЕРЕХОДОМ 768 → 360 (порт на понедельнике,
   * sl 0), браузерный агент — ПРЯМОЙ ЗАГРУЗКОЙ 360 (порт на среде, sl 160).
   * Оба числа верны; расхождение нашлось только потому, что человек ответил
   * первым.
   *
   * Отсюда предмет: прямая загрузка обязана ДОХОДИТЬ ДО КАДРА, а не только до
   * чипа. Проверка одного чипа зеленела бы на оболочке, которая прочла ширину
   * и не отдала её кадру, — схлопнутое состояние, о котором говорит шапка
   * shell-url.test.tsx.
   */
  describe('ширина в адресе оболочки (DS-345)', () => {
    it('прямая загрузка `?w=440` доезжает и до чипа, и до кадра', () => {
      window.history.pushState(null, '', '/?c=Badge&w=440')
      render(<Shell />)

      expect(wrapWidth()).toBe('440px')
      expect(screen.getByLabelText('Заданная ширина').textContent).toBe('440')
    })

    it('непресетная ширина из адреса восстанавливается как есть', () => {
      // Ширину задают не только чипами — её тянут за край (`clampWidth` на
      // перетаскивании). Пресетами адрес не ограничен, иначе ссылка на
      // подобранную вручную ширину теряла бы ровно то, ради чего её копируют.
      window.history.pushState(null, '', '/?c=Badge&w=520')
      render(<Shell />)

      expect(wrapWidth()).toBe('520px')
    })

    it('ширина вне пределов прижимается при загрузке, а не рисует кадр в 99999', () => {
      window.history.pushState(null, '', '/?c=Badge&w=99999')
      render(<Shell />)

      expect(wrapWidth()).toBe('2560px')
    })

    it('нажатый пресет переписывает адрес ОБОЛОЧКИ после дебаунса', () => {
      vi.useFakeTimers()
      try {
        window.history.pushState(null, '', '/?c=Badge')
        render(<Shell />)
        act(() => vi.advanceTimersByTime(MIRROR_DELAY_MS)) // начальная запись зеркала

        act(() => fireEvent.click(widths().getByRole('button', { name: '440' })))
        act(() => vi.advanceTimersByTime(MIRROR_DELAY_MS))

        expect(new URLSearchParams(window.location.search).get('w')).toBe('440')
      } finally {
        vi.useRealTimers()
      }
    })

    it('возврат к умолчанию УБИРАЕТ `w` из адреса, а не пишет w=768', () => {
      // Пара к предыдущему. Иначе ссылка на обычный кадр несла бы поле, которое
      // ничего не меняет, — и `?w=768` стало бы отличаться от `?` на вид, но не
      // по делу.
      vi.useFakeTimers()
      try {
        window.history.pushState(null, '', '/?c=Badge&w=440')
        render(<Shell />)
        act(() => vi.advanceTimersByTime(MIRROR_DELAY_MS))

        act(() => fireEvent.click(widths().getByRole('button', { name: '768' })))
        act(() => vi.advanceTimersByTime(MIRROR_DELAY_MS))

        expect(new URLSearchParams(window.location.search).get('w')).toBeNull()
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
