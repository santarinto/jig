import { describe, it, expect } from 'vitest'
import { truncateEnd, textWidth, FALLBACK_GLYPH_EM } from './textWidth.js'

/** Моноширинная мера: символ = 1. */
const mono = (s: string) => Array.from(s).length

describe('truncateEnd', () => {
  it('строку, что влезает, не трогает', () => {
    expect(truncateEnd('Юг', 2, mono)).toBe('Юг')
  })

  it('режет С КОНЦА и оставляет самый длинный влезающий префикс', () => {
    // 5 символов + многоточие = 6.
    expect(truncateEnd('Автопарк-Север', 6, mono)).toBe('Автоп…')
  })

  it('пробел перед многоточием не остаётся висеть', () => {
    expect(truncateEnd('Восточная колонна', 11, mono)).toBe('Восточная…')
  })

  it('когда не влезает даже символ — одно многоточие', () => {
    expect(truncateEnd('Север', 1, mono)).toBe('…')
  })
})

describe('textWidth без канвы', () => {
  it('оценка: символы × 0.6 × размер — и это оценка, а не замер', () => {
    expect(textWidth('Центр', null, 10)).toBe(5 * FALLBACK_GLYPH_EM * 10)
  })
})
