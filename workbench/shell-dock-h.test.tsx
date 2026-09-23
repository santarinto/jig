/**
 * Высота дока в живой оболочке: клавиатура, границы, память.
 *
 * ЧТО ЗДЕСЬ НЕ ПРОВЕРЯЕТСЯ — тяга мышью. jsdom не считает раскладку и не
 * реализует pointer capture; тест на `pointermove` проверял бы, что вызвался
 * обработчик, и оставался бы зелёным при любой ошибке в геометрии. Тяга
 * проверяется на живом верстаке — `scripts/smoke-workbench.mjs`.
 *
 * ЧТО ПРОВЕРЯЕТСЯ ИМЕННО ЗДЕСЬ — что разделитель СУЩЕСТВУЕТ ДЛЯ КЛАВИАТУРЫ.
 * Разделитель, отвечающий только на мышь, для клавиатуры не существует, и
 * отказ этот тихий: картинка правдоподобна, мышью всё работает.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { Shell } from './shell-app.js'
import { DOCK_H_DEFAULT, DOCK_H_KEY, DOCK_MIN_H, DOCK_STEP } from './dock-height.js'

afterEach(cleanup)
beforeEach(() => localStorage.clear())

const grip = () => screen.getByRole('separator', { name: 'Высота панели' })
const wrap = () => document.querySelector<HTMLElement>('.wb__dock-wrap')!
const wrapH = () => wrap().style.blockSize
const now = () => Number(grip().getAttribute('aria-valuenow'))

describe('разделитель дока', () => {
  it('есть в разметке и говорит, где стоит', () => {
    render(<Shell />)

    expect(grip()).toHaveAttribute('aria-orientation', 'horizontal')
    expect(now()).toBe(DOCK_H_DEFAULT)
    expect(grip().getAttribute('aria-valuemin')).toBe(String(DOCK_MIN_H))
    expect(wrapH()).toBe(`${DOCK_H_DEFAULT}px`)
  })

  /**
   * Фокусируемость — половина работы, и утверждать её надо ОТДЕЛЬНО от
   * реакции на клавиши. `fireEvent.keyDown` бьёт по узлу напрямую и проходит
   * даже на узле, до которого табом не дойти: без этого теста рукоятка могла
   * бы остаться `tabindex`-ом «−1» и все проверки ниже остались бы зелёными.
   */
  it('до него доходит клавиатура', () => {
    render(<Shell />)

    expect(grip()).toHaveAttribute('tabindex', '0')
    grip().focus()
    expect(document.activeElement).toBe(grip())
  })

  it('стрелка вверх растит док, вниз — уменьшает, шагом сетки', () => {
    render(<Shell />)

    fireEvent.keyDown(grip(), { key: 'ArrowUp' })
    expect(now()).toBe(DOCK_H_DEFAULT + DOCK_STEP)
    expect(wrapH()).toBe(`${DOCK_H_DEFAULT + DOCK_STEP}px`)

    fireEvent.keyDown(grip(), { key: 'ArrowDown' })
    fireEvent.keyDown(grip(), { key: 'ArrowDown' })
    expect(now()).toBe(DOCK_H_DEFAULT - DOCK_STEP)
  })

  it('Home уводит в пол, End — в потолок', () => {
    render(<Shell />)
    const max = Number(grip().getAttribute('aria-valuemax'))

    fireEvent.keyDown(grip(), { key: 'Home' })
    expect(now()).toBe(DOCK_MIN_H)

    fireEvent.keyDown(grip(), { key: 'End' })
    expect(now()).toBe(max)
    // Потолок обязан быть ВЫШЕ пола и НИЖЕ бесконечности: `aria-valuemax`,
    // приехавший из незамеренной области, не сказал бы ничего, а выглядел бы
    // как заполненный атрибут.
    expect(max).toBeGreaterThan(DOCK_MIN_H)
    expect(Number.isFinite(max)).toBe(true)
  })

  /**
   * Пол держит не только Home. Стрелка вниз из пола — тот путь, на котором
   * ограничение проверяется по-настоящему: `Math.max` в обработчике легко
   * потерять, и док уехал бы в отрицательную высоту по одному нажатию.
   */
  it('из пола вниз уже некуда', () => {
    render(<Shell />)

    fireEvent.keyDown(grip(), { key: 'Home' })
    fireEvent.keyDown(grip(), { key: 'ArrowDown' })
    fireEvent.keyDown(grip(), { key: 'ArrowDown' })

    expect(now()).toBe(DOCK_MIN_H)
  })

  it('чужая клавиша высоту не трогает', () => {
    render(<Shell />)

    fireEvent.keyDown(grip(), { key: 'a' })
    fireEvent.keyDown(grip(), { key: 'ArrowLeft' })

    expect(now()).toBe(DOCK_H_DEFAULT)
  })
})

describe('память высоты', () => {
  it('высота переживает перезагрузку', () => {
    render(<Shell />)
    fireEvent.keyDown(grip(), { key: 'ArrowUp' })
    const kept = now()
    cleanup()

    render(<Shell />)

    expect(now()).toBe(kept)
    expect(wrapH()).toBe(`${kept}px`)
  })

  it('высота НЕ уезжает в адрес — там предмет, а не рабочее место', () => {
    render(<Shell />)

    fireEvent.keyDown(grip(), { key: 'ArrowUp' })

    expect(window.location.search).not.toContain('dock')
    const src = document.querySelector('iframe.wb__frame')?.getAttribute('src') ?? ''
    expect(src).not.toContain('dock')
  })

  it.each([
    ['мусор', 'abc'],
    ['отрицательное', '-500'],
    ['выше окна', '99999'],
  ])('%s в хранилище даёт умолчание, а не нулевой док', (_, raw) => {
    localStorage.setItem(DOCK_H_KEY, raw)

    render(<Shell />)

    expect(now()).toBe(DOCK_H_DEFAULT)
    expect(wrapH()).toBe(`${DOCK_H_DEFAULT}px`)
  })
})
