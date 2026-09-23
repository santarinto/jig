import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeMirror, MIRROR_DELAY_MS } from './mirror-url.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('зеркалирование адреса', () => {
  it('серия нажатий даёт ОДНУ запись, и записывается последнее', () => {
    const write = vi.fn()
    const m = makeMirror(write)
    for (const s of ['?a=1', '?a=12', '?a=123']) m.push(s)
    vi.advanceTimersByTime(MIRROR_DELAY_MS)

    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('?a=123')
  })

  it('удержание клавиши три секунды не даёт больше 4 записей в секунду', () => {
    const write = vi.fn()
    const m = makeMirror(write)
    // 3 секунды по нажатию каждые 30 мс — сто нажатий.
    for (let i = 0; i < 100; i += 1) {
      m.push(`?a=${i}`)
      vi.advanceTimersByTime(30)
    }
    vi.advanceTimersByTime(MIRROR_DELAY_MS)

    expect(write.mock.calls.length).toBeLessThanOrEqual(3 * 4)
    expect(write).toHaveBeenLastCalledWith('?a=99')
  })

  it('stop отменяет отложенную запись', () => {
    const write = vi.fn()
    const m = makeMirror(write)
    m.push('?a=1')
    m.stop()
    vi.advanceTimersByTime(MIRROR_DELAY_MS * 4)

    expect(write).not.toHaveBeenCalled()
  })
})
