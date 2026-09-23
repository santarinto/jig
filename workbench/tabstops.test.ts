import { describe, it, expect } from 'vitest'
import { tabStops, stopLabel } from './tabstops.js'

const tree = (html: string): Element => {
  const t = document.createElement('template')
  t.innerHTML = `<div>${html}</div>`
  return t.content.firstElementChild!
}

const ids = (...roots: Element[]): string[] => tabStops(roots).map((el) => el.id)

describe('tabStops', () => {
  it('портальная ссылка с кнопкой внутри даёт ДВА стопа на один пункт', () => {
    // Живой дефект системы (CLAUDE.md): глазами пункт один, клавиатурой два.
    // Ради него слой и заведён, поэтому случай стоит первым.
    const root = tree('<a href="#" id="link"><button id="btn">Открыть</button></a>')
    expect(ids(root)).toEqual(['link', 'btn'])
  })

  it('положительный tabindex идёт ПЕРВЫМ и по возрастанию, а не в порядке разметки', () => {
    // Слой, показывающий порядок разметки, врал бы ровно там, где порядок —
    // и есть предмет вопроса.
    const root = tree(`
      <button id="a"></button>
      <button id="b" tabindex="2"></button>
      <button id="c" tabindex="1"></button>
      <button id="d"></button>`)
    expect(ids(root)).toEqual(['c', 'b', 'a', 'd'])
  })

  it('tabindex="-1" не стоп: программный фокус — не клавиатурный', () => {
    const root = tree('<button id="a"></button><div id="b" tabindex="-1"></div>')
    expect(ids(root)).toEqual(['a'])
  })

  it('выключенное не стоп — ни нативно, ни через aria', () => {
    // `aria-disabled` носит ссылка (у неё нет нативного disabled) — и она
    // остаётся в обходе браузера, но для человека выключена. Считаем её
    // невыключенной — значит показали бы номер там, где действия нет.
    const root = tree(`
      <button id="a" disabled></button>
      <a href="#" id="b" aria-disabled="true"></a>
      <button id="c"></button>`)
    expect(ids(root)).toEqual(['c'])
  })

  it('ссылка без href не стоп, а с href — стоп', () => {
    const root = tree('<a id="a">якорь</a><a href="#" id="b">ссылка</a>')
    expect(ids(root)).toEqual(['b'])
  })

  it('внутри [inert] стопов нет', () => {
    const root = tree('<div inert><button id="a"></button></div><button id="b"></button>')
    expect(ids(root)).toEqual(['b'])
  })

  it('порядок разметки внутри одного значения tabindex сохраняется', () => {
    const root = tree(`
      <button id="a" tabindex="1"></button>
      <button id="b" tabindex="1"></button>`)
    expect(ids(root)).toEqual(['a', 'b'])
  })
})

describe('stopLabel', () => {
  it('текст стопа схлопывает пробелы — иначе вёрстка ломает подпись', () => {
    const root = tree('<button id="a">  Сохранить\n  и закрыть </button>')
    expect(stopLabel(root.firstElementChild!)).toBe('Сохранить и закрыть')
  })

  it('aria-label важнее текста: диктору читают его', () => {
    const root = tree('<button aria-label="Закрыть окно">×</button>')
    expect(stopLabel(root.firstElementChild!)).toBe('Закрыть окно')
  })

  /**
   * ПРОВОД, А НЕ РАСЧЁТ (DS-211). Само доступное имя проверяет
   * `accname.test.ts`, и оно оставалось зелёным, когда `stopLabel` вернули к
   * `textContent`: тесты расчёта про подпись не знают. Это утверждение и есть
   * то, что краснеет на такой подмене, — а «aria-label важнее текста» выше не
   * краснеет, потому что верно в ОБОИХ вариантах.
   *
   * Живой случай: `FormTabs/many`, где крестик убран из имени `aria-hidden`, а
   * док печатал «Реализация ТК-00417×».
   */
  it('подпись — ДОСТУПНОЕ ИМЯ: aria-hidden-потомок в неё не входит', () => {
    const root = tree('<button>Реализация ТК-00417<span aria-hidden="true">×</span></button>')
    const el = root.firstElementChild!
    expect(el.textContent).toBe('Реализация ТК-00417×')
    expect(stopLabel(el)).toBe('Реализация ТК-00417')
  })

  it('длинная подпись обрезана, и обрезание видно', () => {
    const root = tree(`<button>${'я'.repeat(50)}</button>`)
    const label = stopLabel(root.firstElementChild!)
    expect(label.endsWith('…')).toBe(true)
    expect(label.length).toBe(32)
  })

  it('корней несколько — стопы едут из всех, в порядке корней', () => {
    // DS-163: оверлей Modal — прямой ребёнок `body` кадра, и слой от
    // одного хоста печатал на открытом окне НОЛЬ стопов. Пустой список
    // читается как «клавиатура сюда не доходит», то есть ложь бодрая: внутри
    // окна их три.
    const host = tree('<button id="host-btn">Фон</button>')
    const overlay = tree('<button id="close">×</button><button id="ok">Провести</button>')
    expect(ids(host, overlay)).toEqual(['host-btn', 'close', 'ok'])
  })

  it('положительный tabindex поднимается НАД корнями, а не внутри своего', () => {
    // В браузере положительный `tabindex` глобален по документу. Слой,
    // сортирующий внутри корня, показал бы порядок, которого не бывает.
    const host = tree('<button id="a">a</button>')
    const overlay = tree('<button id="b" tabindex="1">b</button>')
    expect(ids(host, overlay)).toEqual(['b', 'a'])
  })

  it('фон под открытым оверлеем выпадает сам — по `inert`, который вешает изоляция', () => {
    // Вторая половина того, почему на открытом окне номера верны: корни дают
    // оверлей, а `inert` от `useOverlayIsolation` убирает фон. Обе половины
    // нужны, и обе проверяются: без этой список стал бы суммой двух областей
    // — номера пошли бы по узлам, до которых Tab не доходит.
    const host = tree('<button id="host-btn">Фон</button>')
    host.setAttribute('inert', '')
    const overlay = tree('<button id="ok">Провести</button>')
    expect(ids(host, overlay)).toEqual(['ok'])
  })
})
