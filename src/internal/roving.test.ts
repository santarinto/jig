import { describe, it, expect } from 'vitest'
import { rovingEntry, rovingTarget, nextEnabled, firstEnabled } from './roving.js'

/**
 * Про два «никуда». Мутация «вернуть -1 вместо null на чужой клавише» пережила
 * все компонентные тесты: они спрашивают, куда уехал выбор, и молчат о том,
 * что полоса при этом сделала с событием. А сделала бы она `preventDefault` на
 * каждое нажатие — то есть съела бы Tab и ввод текста внутри себя.
 */
const items = [{ id: 'a' }, { id: 'b', disabled: true }, { id: 'c' }]

describe('roving', () => {
  it('чужая клавиша — null, край полосы — -1: это разные ответы', () => {
    expect(rovingTarget(items, 0, 'Tab')).toBeNull()
    expect(rovingTarget(items, 0, 'a')).toBeNull()
    expect(rovingTarget(items, 0, 'ArrowLeft')).toBe(-1)
    expect(rovingTarget(items, 2, 'ArrowRight')).toBe(-1)
  })

  it('стрелка перешагивает выключенный', () => {
    expect(rovingTarget(items, 0, 'ArrowRight')).toBe(2)
    expect(rovingTarget(items, 2, 'ArrowLeft')).toBe(0)
  })

  it('ориентация решает, какая пара стрелок наша', () => {
    expect(rovingTarget(items, 0, 'ArrowDown', 'vertical')).toBe(2)
    expect(rovingTarget(items, 0, 'ArrowDown', 'horizontal')).toBeNull()
    expect(rovingTarget(items, 0, 'ArrowRight', 'vertical')).toBeNull()
  })

  it('Home и End идут к доступному краю', () => {
    const edges = [{ id: 'a', disabled: true }, { id: 'b' }, { id: 'c', disabled: true }]
    expect(rovingTarget(edges, 1, 'Home')).toBe(1)
    expect(rovingTarget(edges, 1, 'End')).toBe(1)
    expect(firstEnabled(edges, 1)).toBe(1)
    expect(firstEnabled(edges, -1)).toBe(1)
  })

  it('полоса из одних выключенных не даёт никуда идти', () => {
    const none = [{ id: 'a', disabled: true }, { id: 'b', disabled: true }]
    expect(nextEnabled(none, 0, 1)).toBe(-1)
    expect(firstEnabled(none, 1)).toBe(-1)
    expect(rovingTarget(none, 0, 'End')).toBe(-1)
  })
})

describe('rovingEntry: вход в полосу', () => {
  // Тип назван явно: `RovingItem` — это `{ disabled?: boolean }`, и голый
  // `{ id }` с ним не пересекается ни одним полем, то есть не присваивается.
  const enabled: { id: string; disabled?: boolean }[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('активный элемент и есть вход', () => {
    expect(rovingEntry(enabled, 1)).toBe(1)
  })

  /**
   * Дефект DS-221 целиком. Формула `active && !disabled` не давала
   * `tabIndex 0` НИКОМУ, и `Tab` перепрыгивал полосу: клавиатурой она не
   * существовала.
   */
  it('активный ВЫКЛЮЧЕН — всё равно вход: выключена вкладка, а не полоса', () => {
    const items = [{ id: 'a' }, { id: 'b', disabled: true }, { id: 'c' }]
    expect(rovingEntry(items, 1)).toBe(1)
  })

  it('выключены ВСЕ — вход всё равно есть', () => {
    const none = [{ id: 'a', disabled: true }, { id: 'b', disabled: true }]
    expect(rovingEntry(none, 0)).toBe(0)
    // И когда активного нет вовсе: ноль входов — это недостижимая полоса.
    expect(rovingEntry(none, -1)).toBe(0)
  })

  it('активного нет — первый ДОСТУПНЫЙ, а не просто первый', () => {
    const items: { id: string; disabled?: boolean }[] =
      [{ id: 'a', disabled: true }, { id: 'b' }, { id: 'c' }]
    expect(rovingEntry(items, -1)).toBe(1)
  })

  it('активный за границами списка считается отсутствующим', () => {
    // `findIndex` у потребителя вернёт -1 на неизвестном id, но передать могут
    // и мусор: вход обязан остаться ровно одним, а не уехать за конец.
    expect(rovingEntry(enabled, 99)).toBe(0)
  })

  /**
   * Пустая полоса — единственный случай, где входа нет, и он честный: нечему
   * его давать. Отличается от «есть элементы, но вход не достался никому» —
   * ровно того дефекта, ради которого функция написана.
   */
  it('пустая полоса — входа нет, и это единственный такой случай', () => {
    expect(rovingEntry([], 0)).toBe(-1)
    expect(rovingEntry([], -1)).toBe(-1)
  })

  it('вход ровно один при любом раскладе — два хуже нуля', () => {
    const cases: [{ id: string; disabled?: boolean }[], number][] = [
      [enabled, 0], [enabled, 2], [enabled, -1],
      [[{ id: 'a', disabled: true }, { id: 'b' }], -1],
      [[{ id: 'a', disabled: true }, { id: 'b', disabled: true }], 1],
    ]
    for (const [items, active] of cases) {
      const e = rovingEntry(items, active)
      expect(items.filter((_, i) => i === e)).toHaveLength(1)
    }
  })
})
