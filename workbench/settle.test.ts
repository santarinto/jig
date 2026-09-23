import { describe, it, expect } from 'vitest'
import { settle } from './settle.js'

/**
 * Поддельный мир: подпись — по номеру кадра из списка, каждый кадр — 16 мс.
 * Подпись за последним элементом списка держится.
 */
const world = (sigs: string[], msPerFrame = 16) => {
  let f = 0
  let t = 0
  return {
    sample: () => sigs[Math.min(f, sigs.length - 1)]!,
    nextFrame: async () => { f++; t += msPerFrame },
    now: () => t,
    frame: () => f,
  }
}

describe('отстаивание кадра по своему предмету', () => {
  it('уже установившееся — один кадр, и хватит', async () => {
    const w = world(['a'])
    expect(await settle(w.sample, w.nextFrame, 600, w.now)).toEqual({ settled: true, frames: 1 })
  })

  it('ждёт, пока ДВА КАДРА ПОДРЯД не совпадут, — а не первого повтора чего-нибудь', async () => {
    // a → b → a → c → c: «a» встречается дважды, но не подряд; установилось на c.
    const w = world(['a', 'b', 'a', 'c', 'c'])
    const s = await settle(w.sample, w.nextFrame, 600, w.now)
    expect(s).toEqual({ settled: true, frames: 4 })
    expect(w.sample()).toBe('c')
  })

  it('не установилось за окно — settled: false, и окно не растягивается', async () => {
    const sigs = Array.from({ length: 100 }, (_, i) => String(i))
    const w = world(sigs)
    const s = await settle(w.sample, w.nextFrame, 160, w.now)
    expect(s.settled).toBe(false)
    expect(w.now()).toBeGreaterThanOrEqual(160)
    expect(w.now()).toBeLessThan(160 + 16 * 2)
  })

  it('ответ не зависит от того, сколько кадр ждал до этого', async () => {
    // Одна и та же раскладка, увиденная с разного места своей истории, —
    // тот же итог: так `--row targets` и полный обход обязаны сойтись.
    const history = ['a', 'b', 'c', 'd', 'd']
    const early = world(history)
    await settle(early.sample, early.nextFrame, 600, early.now)
    const late = world(history.slice(2))
    await settle(late.sample, late.nextFrame, 600, late.now)
    expect(early.sample()).toBe(late.sample())
  })
})
