/**
 * Санитар: кадр и валидатор судят о совместимости одной функцией. Плюс —
 * разбор ссылки на начинку и слоистость кейс → адрес (Задача 3).
 */

import { describe, it, expect } from 'vitest'
import { fitsSlot as fromValidator } from '../src/internal/fixture-validate.js'
import { parseFill, fitsSlot, fillsOf } from './slot-fill.js'
import type { AnyFixture } from '../src/internal/fixture.js'
import type { FrameState } from './frame-url.js'

describe('slot-fill', () => {
  it('кадр и валидатор судят о совместимости ОДНОЙ функцией, а не копиями', () => {
    // Сравнение по ссылке, не по поведению: таблица одинаковых ответов зазеленеет
    // и на двух копиях, пока они не разъехались. Сравнение по ссылке проверит
    // именно тот момент, когда проверять нечего.
    expect(fitsSlot).toBe(fromValidator)
  })
})

describe('parseFill', () => {
  it('читает имя и кейс', () => {
    expect(parseFill('Badge:dot')).toEqual({ c: 'Badge', case: 'dot' })
  })

  it('читает имя без кейса', () => {
    expect(parseFill('Badge')).toEqual({ c: 'Badge' })
  })

  it('пустую строку и мусор отвергает, а не выдумывает', () => {
    expect(parseFill('')).toBeNull()
    expect(parseFill(':dot')).toBeNull()
  })
})

describe('fitsSlot', () => {
  it('any принимает всё, и всё принимает any', () => {
    expect(fitsSlot('any', 'block')).toBe(true)
    expect(fitsSlot('inline', 'any')).toBe(true)
  })

  it('inline не принимает block', () => {
    expect(fitsSlot('inline', 'block')).toBe(false)
  })

  it('фикстура без kind годится куда угодно — она не объявляла ограничений', () => {
    expect(fitsSlot('inline', undefined)).toBe(true)
  })
})

/** Минимальная фикстура — шапка, без которой ни одно поле fillsOf не трогает. */
const base: AnyFixture = {
  name: 'X',
  group: 'G',
  props: {},
  controls: {},
  cases: [{ id: 'base', title: 'B' }],
}

/** Адрес кадра с точечными переопределениями — как parseFrameUrl, но без URL. */
const state = (over: Partial<FrameState>): FrameState => ({
  c: '',
  caseId: '',
  sid: 0,
  w: null,
  theme: 'light',
  mode: 'frame',
  text: 'ru',
  aim: false,
  scale: 1,
  data: null,
  force: null,
  layers: [],
  props: {},
  slots: {},
  ...over,
})

describe('fillsOf — слоистость кейс → адрес', () => {
  const fx: AnyFixture = {
    ...base,
    slots: { cell: { title: 'Я', accepts: 'inline' } },
    cases: [{ id: 'actions', title: 'Действия', slots: { cell: { c: 'Badge', case: 'dot' } } }],
  }

  it('начинку кейса видно БЕЗ единого параметра в адресе', () => {
    expect(fillsOf(fx, state({ caseId: 'actions', slots: {} }))).toEqual({ cell: 'Badge:dot' })
  })

  it('адрес перекрывает кейс, а не складывается с ним', () => {
    expect(fillsOf(fx, state({ caseId: 'actions', slots: { cell: 'Badge:base' } })))
      .toEqual({ cell: 'Badge:base' })
  })

  it('позиции, которых кейс не трогал, приезжают из адреса', () => {
    expect(fillsOf(fx, state({ caseId: 'actions', slots: { zzz: 'Badge' } })))
      .toEqual({ cell: 'Badge:dot', zzz: 'Badge' })
  })
})
