import { describe, it, expect } from 'vitest'
import { sameAsBefore, toneLabel, isTransparent, effectiveTone } from './state-tones.js'

const LABELS = ['покой', ':hover', ':focus-visible', ':active']

describe('sameAsBefore', () => {
  it('совпавшая копия названа именем первой такой же', () => {
    // Ровно случай из CLAUDE.md: фокус неотличим от наведения. Глаз на такое
    // не отвечает, совпадение строк — отвечает.
    const same = sameAsBefore(
      ['rgb(1, 1, 1)', 'rgb(2, 2, 2)', 'rgb(2, 2, 2)', 'rgb(3, 3, 3)'],
      LABELS,
    )
    expect(same).toEqual([null, null, ':hover', null])
  })

  it('цепочка совпадений ссылается на ПЕРВУЮ, а не на соседа', () => {
    // Иначе «покой = hover = focus» читалось бы как разговор соседей по кругу
    // вместо трёх ссылок на один тон.
    const same = sameAsBefore(
      ['rgb(1, 1, 1)', 'rgb(1, 1, 1)', 'rgb(1, 1, 1)', 'rgb(9, 9, 9)'],
      LABELS,
    )
    expect(same).toEqual([null, 'покой', 'покой', null])
  })

  it('все четыре разные — ни одной пометки', () => {
    const tones = ['rgb(1, 1, 1)', 'rgb(2, 2, 2)', 'rgb(3, 3, 3)', 'rgb(4, 4, 4)']
    expect(sameAsBefore(tones, LABELS)).toEqual([null, null, null, null])
  })

  it('первая копия не сравнивается ни с чем — сравнивать не с чем', () => {
    expect(sameAsBefore(['rgb(1, 1, 1)'], LABELS)).toEqual([null])
  })
})

describe('toneLabel', () => {
  it('прозрачный называется словом, а не rgba(0, 0, 0, 0)', () => {
    // Числовая форма прозрачности читается как чёрный: «rgb(0,0,0)» с
    // альфой в конце, которую глаз пропускает.
    expect(toneLabel('rgba(0, 0, 0, 0)')).toBe('прозрачно')
    expect(isTransparent('rgba(0, 0, 0, 0)')).toBe(true)
  })

  it('чёрный остаётся числом и не путается с прозрачным', () => {
    expect(toneLabel('rgb(0, 0, 0)')).toBe('rgb(0, 0, 0)')
    expect(isTransparent('rgb(0, 0, 0)')).toBe(false)
  })
})

describe('effectiveTone', () => {
  /** Дерево `div.box > table > tbody > tr > td` — как у DataTable под прицелом. */
  const tree = (): { root: Element; tr: Element; td: Element } => {
    const t = document.createElement('template')
    t.innerHTML = '<div class="box"><table><tbody><tr><td>a</td></tr></tbody></table></div>'
    const root = t.content.firstElementChild!
    return { root, tr: root.querySelector('tr')!, td: root.querySelector('td')! }
  }

  it('прозрачный узел отдаёт тон предка и НАЗЫВАЕТ его', () => {
    // Живой случай: прицел попадает в `td`, фон наведения живёт на `tr`.
    // Молча подменить — значит превратить «фон этого узла» в «фон чего-то
    // выше» и снова оставить «= покой» загадкой.
    const { root, tr, td } = tree()
    const read = (e: Element) => (e === tr ? 'rgb(7, 7, 7)' : 'rgba(0, 0, 0, 0)')
    const tone = effectiveTone(td, root, read)
    expect([tone.value, tone.own, tone.from]).toEqual(['rgb(7, 7, 7)', false, tr])
  })

  it('непрозрачный узел отвечает за себя сам', () => {
    const { root, tr, td } = tree()
    const read = (e: Element) => (e === td ? 'rgb(1, 1, 1)' : 'rgb(7, 7, 7)')
    const tone = effectiveTone(td, root, read)
    expect([tone.value, tone.own]).toEqual(['rgb(1, 1, 1)', true])
    expect(tone.from).toBe(td)
    // Соседний узел с заведомо известным значением: если бы обход начинался
    // не с самого узла, сюда приехал бы тон `tr`.
    expect(read(tr)).toBe('rgb(7, 7, 7)')
  })

  it('всё прозрачно до корня — тон прозрачный и от имени самого узла', () => {
    const { root, td } = tree()
    const tone = effectiveTone(td, root, () => 'rgba(0, 0, 0, 0)')
    expect([tone.value, tone.own]).toEqual(['rgba(0, 0, 0, 0)', true])
    expect(tone.from).toBe(td)
  })

  it('выше корня копии обход не уходит', () => {
    // Иначе тон приехал бы с подложки кадра — одинаковый у всех четырёх копий
    // по построению, то есть «= покой» всегда и ни о чём.
    const { root, td } = tree()
    const outer = document.createElement('div')
    outer.appendChild(root)
    const read = (e: Element) => (e === outer ? 'rgb(9, 9, 9)' : 'rgba(0, 0, 0, 0)')
    expect(effectiveTone(td, root, read).value).toBe('rgba(0, 0, 0, 0)')
  })
})
