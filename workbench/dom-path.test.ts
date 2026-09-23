import { describe, it, expect } from 'vitest'
import { pathOf, nodeAt } from './dom-path.js'

const tree = (html: string): Element => {
  const t = document.createElement('template')
  t.innerHTML = html
  return t.content.firstElementChild!
}

const COPY = `
  <div class="box">
    <table><tbody>
      <tr id="r1"><td id="c1">a</td><td>b</td></tr>
      <tr id="r2"><td>c</td><td id="c2">d</td></tr>
    </tbody></table>
  </div>`

describe('pathOf / nodeAt', () => {
  it('путь из одной копии находит ТОТ ЖЕ узел в другой', () => {
    // Ради этого модуль и существует: копии режима «Состояния» рисуют одно
    // дерево, и тон надо снять с одного и того же узла в каждой.
    const a = tree(COPY)
    const b = tree(COPY)
    const path = pathOf(a, a.querySelector('#c2')!)
    expect(path).not.toBeNull()
    expect(nodeAt(b, path!)).toBe(b.querySelector('#c2'))
  })

  it('вторая строка не подменяется первой', () => {
    // Селектор по классам находил бы первую подходящую — в таблице это
    // означало бы «всегда первая строка, какую бы ни выбрали».
    const a = tree(COPY)
    const b = tree(COPY)
    const path = pathOf(a, a.querySelector('#r2')!)!
    expect(nodeAt(b, path)).toBe(b.querySelector('#r2'))
    expect(nodeAt(b, path)).not.toBe(b.querySelector('#r1'))
  })

  it('сам корень — пустой путь, а не отказ', () => {
    const a = tree(COPY)
    expect(pathOf(a, a)).toEqual([])
    expect(nodeAt(a, [])).toBe(a)
  })

  it('узел вне корня даёт null, а не путь наугад', () => {
    const a = tree(COPY)
    const outside = tree('<div><span id="x"></span></div>')
    expect(pathOf(a, outside.querySelector('#x')!)).toBeNull()
  })

  it('разошедшееся дерево даёт null, а не соседа', () => {
    // Молчаливая подмена соседом дала бы полосу, сравнивающую РАЗНЫЕ узлы и
    // уверенно печатающую «= покой».
    const a = tree(COPY)
    const short = tree('<div class="box"><table><tbody><tr><td>a</td></tr></tbody></table></div>')
    const path = pathOf(a, a.querySelector('#c2')!)!
    expect(nodeAt(short, path)).toBeNull()
  })
})
