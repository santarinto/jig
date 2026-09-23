import { describe, it, expect } from 'vitest'
import { readablePath } from './culprit-path.js'

const dom = (html: string): HTMLElement => {
  const host = document.createElement('div')
  host.className = 'wbf-host'
  host.innerHTML = html
  document.body.append(host)
  return host
}

describe('читаемый путь до узла', () => {
  it('идёт от хоста и предпочитает класс ds-*', () => {
    const host = dom('<div class="ds-tabs x"><span class="ds-tabs__slot"><b class="y">t</b></span></div>')
    const leaf = host.querySelector('b')!
    expect(readablePath(leaf, host)).toBe('div.ds-tabs > span.ds-tabs__slot > b.y')
  })

  it('без классов берёт тег', () => {
    const host = dom('<section><p>t</p></section>')
    expect(readablePath(host.querySelector('p')!, host)).toBe('section > p')
  })

  it('сам хост даёт пустой путь, а не «wbf-host»', () => {
    const host = dom('<i>t</i>')
    expect(readablePath(host, host)).toBe('')
  })

  it('без стоп-узла доходит до body и его не включает', () => {
    const host = dom('<div class="ds-a"><i>t</i></div>')
    expect(readablePath(host.querySelector('i')!, null)).toBe('div.wbf-host > div.ds-a > i')
  })

  it('останавливается на теле СВОЕГО документа, а не внешнего', () => {
    // Модуль работает внутри кадра. Глобальный `document` там чужой, и обход по
    // нему не остановится на границе кадра вовсе. В jsdom это видно только на
    // втором документе: в одном `document === el.ownerDocument`, и дефект
    // невидим (ловушка 4 из docs/writing-checks.md — «верное, но не о том»).
    const other = document.implementation.createHTMLDocument('кадр')
    other.body.innerHTML = '<div class="ds-a"><i>t</i></div>'
    const leaf = other.querySelector('i')!
    expect(readablePath(leaf, null)).toBe('div.ds-a > i')
  })

  it('среди нескольких ds-* берёт первый по порядку атрибута', () => {
    const host = dom('<div class="ds-tabs ds-tabs--active is-open"><i>t</i></div>')
    expect(readablePath(host.querySelector('i')!, host)).toBe('div.ds-tabs > i')
  })
})
