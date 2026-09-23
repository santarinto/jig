import { describe, it, expect } from 'vitest'
import { clampWidth, MIN_WIDTH, MAX_WIDTH } from './frame-width.js'

describe('clampWidth', () => {
  it('держит нижний предел', () => {
    expect(clampWidth(10)).toBe(MIN_WIDTH)
  })

  it('держит верхний предел', () => {
    expect(clampWidth(99999)).toBe(MAX_WIDTH)
  })

  it('округляет — дробная ширина iframe даёт дробный вьюпорт и дрожащие замеры', () => {
    expect(clampWidth(767.4)).toBe(767)
  })

  it('не пускает NaN: при потере указателя разница координат бывает NaN', () => {
    expect(clampWidth(Number.NaN)).toBe(MIN_WIDTH)
  })
})
