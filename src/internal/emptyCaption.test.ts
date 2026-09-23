import { describe, it, expect } from 'vitest'
import { emptyCaptionY } from './emptyCaption.js'

describe('emptyCaptionY', () => {
  it('нечётное число линий: центр поля на средней линии — подпись уходит в соседний промежуток', () => {
    const lines = [10, 60, 110, 160, 210]
    const y = emptyCaptionY(lines, 10, 210)
    expect(lines).not.toContain(y)
    expect(y === 85 || y === 135).toBe(true)
  })

  it('чётное число линий: промежуток, содержащий центр', () => {
    expect(emptyCaptionY([0, 100, 200, 300], 0, 300)).toBe(150)
  })

  it('меньше двух линий — центр поля', () => {
    expect(emptyCaptionY([], 0, 200)).toBe(100)
    expect(emptyCaptionY([50], 0, 200)).toBe(100)
  })

  it('линии за пределами поля не считаются', () => {
    expect(emptyCaptionY([-50, 0, 100, 400], 0, 100)).toBe(50)
  })
})
