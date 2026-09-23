import { describe, it, expect, afterEach } from 'vitest'
import { accessibleName } from './accname.js'

/**
 * Узлы В ДОКУМЕНТЕ, а не в `<template>`: расчёт спрашивает `getElementById`
 * для `aria-labelledby` и `label[for]`, а оба ищут по документу. Оторванное
 * дерево дало бы зелёное «имени нет» на разметке, где имя есть.
 */
const mount = (html: string): Element => {
  document.body.innerHTML = `<div id="root">${html}</div>`
  return document.getElementById('root')!.firstElementChild!
}
afterEach(() => { document.body.innerHTML = '' })

describe('accessibleName', () => {
  /**
   * Случай, ради которого задача заведена (DS-211). Крестик у вкладки
   * `FormTabs` убран из имени намеренно, а слой подписывал стоп ВМЕСТЕ с ним:
   * «Реализация ТК-00417×». Прибор показывал ровно то, чего мы добивались не
   * показывать.
   */
  it('aria-hidden-потомок в имя НЕ входит — а в textContent входит', () => {
    const el = mount('<button>Реализация ТК-00417<span aria-hidden="true">×</span></button>')
    expect(el.textContent).toBe('Реализация ТК-00417×')
    expect(accessibleName(el)).toBe('Реализация ТК-00417')
  })

  it('[hidden]-потомок тоже не входит', () => {
    const el = mount('<button>Провести<span hidden>черновик</span></button>')
    expect(accessibleName(el)).toBe('Провести')
  })

  it('aria-label важнее текста: диктору читают его', () => {
    expect(accessibleName(mount('<button aria-label="Закрыть окно">×</button>'))).toBe('Закрыть окно')
  })

  it('aria-labelledby важнее собственного aria-label', () => {
    document.body.innerHTML =
      '<span id="t">Документы по рейсу</span>'
      + '<div id="root"><button aria-labelledby="t" aria-label="не это">×</button></div>'
    const el = document.getElementById('root')!.firstElementChild!
    expect(accessibleName(el)).toBe('Документы по рейсу')
  })

  it('aria-labelledby на несколько узлов склеивается пробелом', () => {
    document.body.innerHTML =
      '<span id="a">Сумма</span><span id="b">за июль</span>'
      + '<div id="root"><input id="f" aria-labelledby="a b"></div>'
    expect(accessibleName(document.getElementById('f')!)).toBe('Сумма за июль')
  })

  /**
   * Взаимная ссылка вешала бы кадр, а не давала неверное имя, — то есть
   * дефект был бы не «подпись не та», а «верстак не отвечает».
   */
  it('циклический aria-labelledby не зацикливается', () => {
    document.body.innerHTML =
      '<div id="root"><button id="x" aria-labelledby="y">A</button>'
      + '<button id="y" aria-labelledby="x">B</button></div>'
    expect(accessibleName(document.getElementById('x')!)).toBe('B')
  })

  it('поле именуется своей подписью — и через for, и обёрткой', () => {
    document.body.innerHTML = '<label for="f">Гос. номер</label><input id="f">'
    expect(accessibleName(document.getElementById('f')!)).toBe('Гос. номер')
    document.body.innerHTML = '<label>Пробег<input id="g"></label>'
    expect(accessibleName(document.getElementById('g')!)).toBe('Пробег')
  })

  it('placeholder — только когда подписи нет', () => {
    document.body.innerHTML = '<label for="f">Гос. номер</label><input id="f" placeholder="А123ВС77">'
    expect(accessibleName(document.getElementById('f')!)).toBe('Гос. номер')
    document.body.innerHTML = '<input id="g" placeholder="А123ВС77">'
    expect(accessibleName(document.getElementById('g')!)).toBe('А123ВС77')
  })

  it('title — последнее средство, а не первое', () => {
    expect(accessibleName(mount('<button title="Подсказка">Провести</button>'))).toBe('Провести')
    expect(accessibleName(mount('<button title="Подсказка"></button>'))).toBe('Подсказка')
  })

  /**
   * Замер DS-211, попарный: `Dashboard` даёт «Заказов за смену184»
   * (дети — `<span>`), `LedgerList` — «01.08.2026 ООО «Ромашка»» (дети —
   * `<div>`). Одно правило на оба случая соврало бы на одном из них, и первая
   * версия соврала: она спрашивала `getComputedStyle`, а плитка `Dashboard` —
   * это `<span>` с `display: block` из CSS.
   */
  it('строчные дети склеиваются БЕЗ пробела, блочные — С пробелом', () => {
    const inline = mount('<button><span>Заказов за смену</span><span>184</span></button>')
    expect(accessibleName(inline)).toBe('Заказов за смену184')
    const block = mount('<summary><div>01.08.2026</div><div>ООО «Ромашка»</div></summary>')
    expect(accessibleName(block)).toBe('01.08.2026 ООО «Ромашка»')
  })

  it('пробелы разметки схлопываются', () => {
    expect(accessibleName(mount('<button>  Сохранить\n  и закрыть </button>'))).toBe('Сохранить и закрыть')
  })

  /**
   * `<pre tabindex="0" role="group">` без `aria-label` — таб-стоп, у которого
   * ИМЕНИ НЕТ: роль `group` содержимым не именуется. Подпись первыми тридцатью
   * символами кода прятала бы настоящий дефект — область прокрутки без имени.
   */
  it('роль, не именуемая содержимым, даёт ПУСТОЕ имя, а не текст', () => {
    const el = mount('<pre tabindex="0" role="group">curl -sS https://api.example</pre>')
    expect(el.textContent).not.toBe('')
    expect(accessibleName(el)).toBe('')
  })

  it('та же роль с aria-label имя имеет', () => {
    const el = mount('<pre tabindex="0" role="group" aria-label="Запрос">curl</pre>')
    expect(accessibleName(el)).toBe('Запрос')
  })

  /**
   * Обратная сторона предыдущего, и без неё запрет был бы катастрофой:
   * ограничение по роли действует ТОЛЬКО на верхний узел. `<span>` внутри
   * кнопки роли не имеет — и обязан отдавать текст, иначе имени лишится
   * каждая кнопка системы.
   */
  it('ограничение по роли не спускается в потомков', () => {
    const el = mount('<button><span><span>Провести</span></span></button>')
    expect(accessibleName(el)).toBe('Провести')
  })

  it('роль перебивает родную: <button role="group"> содержимым не именуется', () => {
    expect(accessibleName(mount('<button role="group">Текст</button>'))).toBe('')
  })

  it('img в имя входит своим alt', () => {
    expect(accessibleName(mount('<button><img alt="Печать" src="x.png"></button>'))).toBe('Печать')
  })

  it('input-кнопка именуется value', () => {
    expect(accessibleName(mount('<input type="submit" value="Провести">'))).toBe('Провести')
  })

  /**
   * Санитар: `id` приходит из чужих рук, и невалидный селектор ронял бы
   * расчёт ИСКЛЮЧЕНИЕМ, то есть валил бы весь слой, а не одну подпись.
   */
  it('id с пробелом не роняет расчёт', () => {
    document.body.innerHTML = '<input id="a b">'
    expect(() => accessibleName(document.querySelector('input')!)).not.toThrow()
  })
})
