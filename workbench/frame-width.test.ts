import { describe, it, expect } from 'vitest'
import { clampWidth, MIN_WIDTH, MAX_WIDTH } from './frame-width.js'
import { WIDTH_FLOOR } from '../scripts/width-surface.mjs'

describe('MIN_WIDTH: зажим кадра держит тот же пол, что и ось ширины матрицы', () => {
  // MIN_WIDTH — литерал (докблок объясняет, почему не импорт: узел в браузерном
  // бандле верстака). Разойдись число с WIDTH_FLOOR — это красное, а не докблок,
  // который никто не перечитывает.
  it('MIN_WIDTH === WIDTH_FLOOR', () => {
    expect(MIN_WIDTH).toBe(WIDTH_FLOOR)
  })
})

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
